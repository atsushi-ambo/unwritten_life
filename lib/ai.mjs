import { createHash } from "node:crypto";
import {
  decodeSave,
  validateGeneratedScene,
  sceneKey,
  isRetiredAt,
} from "../public/engine.js";
import { storyRequest, sceneSchema, groundScene } from "../public/story.js";
import { destination, requestText } from "./network.mjs";
import { SUBSCRIPTIONS, makeSubscriptionCLI } from "./subscription-ai.mjs";

export const PRESETS = {
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
function localConnectionError(error, provider, baseURL = PRESETS[provider]) {
  if (
    !["ollama", "lmstudio"].includes(provider) ||
    !["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname) ||
    ![error, error.cause].some(
      (e) =>
        e?.code === "ECONNREFUSED" ||
        /ECONNREFUSED|connection refused/i.test(e?.message ?? ""),
    )
  )
    return null;
  return new Error(
    provider === "ollama"
      ? "PC内のAI（Ollama）に接続できません。start.commandで起動するか、ターミナルで ollama serve を実行してから再度お試しください。"
      : "PC内のAI（LM Studio）に接続できません。LM Studioのサーバーを起動してから再度お試しください。",
  );
}
export function configFrom(raw, oldKey = "") {
  if (
    !raw ||
    ![...Object.keys(PRESETS), ...Object.keys(SUBSCRIPTIONS), "custom"].includes(raw.provider)
  )
    throw new Error("AIの接続方式を確認してください。");
  const subscription = Object.hasOwn(SUBSCRIPTIONS, raw.provider);
  const local = ["ollama", "lmstudio"].includes(raw.provider);
  const type = local ? "local" : subscription ? "subscription" : "api";
  if (raw.type !== undefined && raw.type !== type) throw new Error("AIの接続方式を確認してください。");
  const baseURL = SUBSCRIPTIONS[raw.provider]?.url ?? PRESETS[raw.provider] ?? raw.baseURL;
  let url;
  try {
    url = new URL(baseURL);
  } catch {
    throw new Error("AI接続先URLを確認してください。");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("AI接続先URLを確認してください。");
  const model = raw.model ?? SUBSCRIPTIONS[raw.provider]?.model ?? "qwen3:8b";
  if (
    typeof model !== "string" ||
    model.length > 150 ||
    !/^[a-zA-Z0-9_.:/@-]+$/.test(model)
  )
    throw new Error("モデルIDを確認してください。");
  if (subscription && (!SUBSCRIPTIONS[raw.provider].models.includes(model) || raw.apiKey))
    throw new Error("サブスク連携では指定のモデルと公式CLIのログインだけを使います。");
  const apiKey = subscription ? "" : raw.apiKey || oldKey;
  if (
    typeof apiKey !== "string" ||
    apiKey.length > 4096 ||
    /[\r\n]/.test(apiKey)
  )
    throw new Error("APIキーの形式を確認してください。");
  const result = { type, provider: raw.provider, baseURL, model, apiKey, ...(subscription ? { subscription: true } : {}) };
  for (const [key, fallback, min, max] of [
    ["inputRate", 0, 0, 10000],
    ["outputRate", 0, 0, 10000],
    ["usdCap", 1, 0.001, 100],
    ["requestCap", subscription || local ? 1000 : 100, 1, subscription || local ? 5000 : 300],
  ]) {
    const n = raw[key] ?? fallback;
    if (
      typeof n !== "number" ||
      !Number.isFinite(n) ||
      n < min ||
      n > max ||
      (key === "requestCap" && !Number.isInteger(n))
    )
      throw new Error("費用または回数の上限を確認してください。");
    result[key] = n;
  }
  if (subscription || local) result.inputRate = result.outputRate = 0;
  result.cloud = !["127.0.0.1", "localhost"].includes(url.hostname);
  const freeRouter =
    raw.provider === "openrouter" &&
    (model === "openrouter/free" || model.endsWith(":free"));
  if (
    result.cloud && !subscription &&
    (!apiKey ||
      (!freeRouter && (result.inputRate <= 0 || result.outputRate <= 0)))
  )
    throw new Error(
      "クラウド接続にはAPIキーとトークン単価を設定してください。",
    );
  return result;
}
export function makeAI({
  transport = requestText,
  validateDestination = destination,
  subscription = makeSubscriptionCLI(),
} = {}) {
  let config = configFrom({ provider: "ollama", model: "qwen3:8b" });
  // The game needs a verified connection. Until the player configures one in
  // this launch, scenes are not generated (the default is only a form preset).
  let ready = false,
    verifiedAt = null,
    verificationSeconds = null,
    calls = 0,
    reservedUSD = 0,
    busy = false;
  const cache = new Map();
  function status() {
    const { apiKey, ...safe } = config;
    return { ...safe, subscriptionModels: Object.fromEntries(Object.entries(SUBSCRIPTIONS).map(([id, preset]) => [id, preset.models])), hasKey: !!apiKey, ready, verifiedAt, verificationSeconds, calls, reservedUSD, busy };
  }
  async function models(provider = config.provider) {
    if (!["ollama", "lmstudio"].includes(provider))
      throw new Error("モデル一覧はOllama・LM Studioで利用できます。");
    let r;
    try {
      r = await transport(
        PRESETS[provider] + (provider === "ollama" ? "/api/tags" : "/models"),
        { allowLoopback: true, timeout: 10000, maxBytes: 128000 },
      );
    } catch (error) {
      throw localConnectionError(error, provider) ?? error;
    }
    if (r.status !== 200)
      throw new Error(
        "モデル一覧を取得できません。AIサーバーの起動を確認してください。",
      );
    const d = JSON.parse(r.text),
      list = provider === "ollama" ? d.models : d.data;
    if (!Array.isArray(list) || list.length > 200)
      throw new Error("モデル一覧の形式を確認してください。");
    const seen = new Set();
    return list.flatMap((m) => {
      const id = provider === "ollama" ? (m.name ?? m.model) : m.id;
      if (
        typeof id !== "string" ||
        id.length > 150 ||
        !/^[a-zA-Z0-9_.:/@-]+$/.test(id) ||
        seen.has(id)
      )
        return [];
      if (
        provider === "ollama" &&
        (m.remote_host ||
          m.remote_model ||
          /(?:[:.-])cloud(?:$|[-:])/i.test(id))
      )
        return [];
      seen.add(id);
      return [
        { id, size: Number.isFinite(m.size) && m.size > 0 ? m.size : null },
      ];
    });
  }
  async function requestGeneration(current, messages, schema, verification = false) {
    const timeout = verification && current.cloud ? 90000 : 120000;
    const limit = verification ? 128 : 1500;
    if (current.subscription)
      return subscription.generate({ provider: current.provider, model: current.model, messages, schema, verification });
    const ollama = current.provider === "ollama";
    const payload = ollama
      ? { model: current.model, messages, stream: false, think: false, format: schema,
          options: { temperature: verification ? 0 : 0.7, num_predict: limit, num_ctx: 8192 }, keep_alive: "5m" }
      : { model: current.model, messages, stream: false, response_format: { type: "json_object" },
          ...(current.provider === "openai" && /^gpt-6-luna(?:-|$)/.test(current.model) ? { reasoning_effort: "none" } : {}),
          [current.provider === "openai" ? "max_completion_tokens" : "max_tokens"]: limit };
    let response;
    try {
      response = await transport(current.baseURL.replace(/\/$/, "") + (ollama ? "/api/chat" : "/chat/completions"), {
        allowLoopback: true, method: "POST",
        headers: { "Content-Type": "application/json", ...(current.apiKey ? { Authorization: `Bearer ${current.apiKey}` } : {}) },
        body: JSON.stringify(payload), timeout, maxBytes: verification ? 16000 : 128000,
      });
    } catch (error) {
      if (error.message === "接続がタイムアウトしました。")
        throw new Error(`AIの応答が${timeout / 1000}秒以内に終わりませんでした。より小さいモデルを選ぶか、時間をおいて再度お試しください。`);
      throw error;
    }
    if (response.status !== 200)
      throw new Error(`AI接続先がエラーを返しました（HTTP ${response.status}）。モデルID・起動状態・残高を確認してください。`);
    return JSON.parse(response.text);
  }
  function contentJSON(data, provider, maxLength = 18000) {
    const content = provider === "ollama" ? data.message?.content : data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > maxLength)
      throw new Error("AIから有効な文章が返りませんでした。");
    return JSON.parse(content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
  }
  async function configure(raw) {
    if (busy) throw new Error("生成中です。完了後に設定を変更してください。");
    const next = configFrom(raw, raw.provider === config.provider && raw.baseURL === config.baseURL ? config.apiKey : "");
    if (next.cloud && raw.consent !== true) throw new Error("送信先と送信内容への同意が必要です。");
    busy = true;
    ready = false;
    verifiedAt = null;
    verificationSeconds = null;
    cache.clear();
    const started = Date.now();
    try {
      if (!next.subscription) await validateDestination(next.baseURL, true);
      if (["ollama", "lmstudio"].includes(next.provider) && !(await models(next.provider)).some((m) => m.id === next.model))
        throw new Error("一覧にあるダウンロード済みモデルを選んでください。");
      const messages = [{ role: "system", content: '接続確認です。JSONだけを返してください。' },
        { role: "user", content: '{"ok":true} をそのまま返してください。' }];
      const schema = { type: "object", properties: { ok: { type: "boolean", const: true } }, required: ["ok"], additionalProperties: false };
      // Verification uses no game attempt. Only API connections reserve USD.
      const reserve = next.type === "api"
        ? ((Buffer.byteLength(JSON.stringify(messages)) + 1024) * next.inputRate + 128 * next.outputRate) / 1e6 : 0;
      if (next.type === "api" && reservedUSD + reserve > next.usdCap)
        throw new Error("この起動中の見積り費用の上限に達しました。");
      reservedUSD += reserve;
      const data = await requestGeneration(next, messages, schema, true);
      const result = contentJSON(data, next.provider, 1024);
      if (!result || Array.isArray(result) || result.ok !== true || Object.keys(result).length !== 1)
        throw new Error('接続確認の返答が {"ok":true} になりませんでした。モデルを確認してください。');
      config = next;
      verifiedAt = new Date().toISOString();
      verificationSeconds = (Date.now() - started) / 1000;
      ready = true;
      return { ...status(), busy: false };
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("接続確認でAIが正しいJSONを返しませんでした。モデルを確認してください。");
      throw localConnectionError(error, next.provider, next.baseURL) ?? error;
    } finally {
      busy = false;
    }
  }
  async function generate(save, cloudConsent = false, { mode = "life" } = {}) {
    if (!["life", "career"].includes(mode))
      throw new Error("生成する場面の種類を確認してください。");
    if (busy) throw new Error("生成中です。しばらくお待ちください。");
    const current = config;
    if (!ready)
      throw new Error("AIの接続を設定してから始めてください。");
    if (current.cloud && cloudConsent !== true)
      throw new Error("送信先と送信内容への同意が必要です。");
    const game = decodeSave(save),
      saved = JSON.parse(save);
    // Already-open v2 clients only understand the original action identifiers.
    if (!Object.hasOwn(saved, "dynamicFrom")) game.dynamicFrom = 110;
    if (!Object.hasOwn(saved, "worldFrom")) game.worldFrom = 110;
    if (!Object.hasOwn(saved, "retirementFrom"))
      game.retirementFrom = 110;
    if (!Object.hasOwn(saved, "careLeaveSalaryFrom"))
      game.careLeaveSalaryFrom = 110;
    if (!Object.hasOwn(saved, "prepayFrom")) game.prepayFrom = 110;
    if (!Object.hasOwn(saved, "debtRepayFrom")) game.debtRepayFrom = 110;
    if (!Object.hasOwn(saved, "salaryCapFrom")) game.salaryCapFrom = 110;
    if (game.ended) throw new Error("完結した人生の場面は生成できません。");
    if (mode === "career" && isRetiredAt(game))
      throw new Error("退職後は転職の4択を生成できません。");
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          p: game.profile,
          s: game.scenario,
          seed: game.seed,
          choices: game.decisions,
          dynamicFrom: game.dynamicFrom,
          worldFrom: game.worldFrom,
          retirementFrom: game.retirementFrom,
          careLeaveSalaryFrom: game.careLeaveSalaryFrom,
          prepayFrom: game.prepayFrom,
          debtRepayFrom: game.debtRepayFrom,
          salaryCapFrom: game.salaryCapFrom,
          incidentFrom: game.incidentFrom,
          careerPathFrom: game.careerPathFrom,
          careerEndFrom: game.careerEndFrom,
          payRealismFrom: game.payRealismFrom,
          lifeRealismFrom: game.lifeRealismFrom,
          offersFrom: game.offersFrom,
          paceFrom: game.paceFrom,
          reemploymentPayFrom: game.reemploymentPayFrom,
          driftFrom: game.driftFrom,
          familyFrom: game.familyFrom,
          growthFrom: game.growthFrom,
          cycleFrom: game.cycleFrom,
          careerSeen: game.careerSeen,
          directionBlocks: game.directionBlocks,
          mode,
        }),
      )
      .digest("hex");
    if (cache.has(key))
      return { ...cache.get(key), cached: true, accounting: status() };
    const { messages } = storyRequest(game, { mode });
    const upperInputTokens =
      Buffer.byteLength(JSON.stringify(messages), "utf8") + 1024;
    const reserve =
      current.type === "api" ? (upperInputTokens * current.inputRate + 1500 * current.outputRate) / 1e6 : 0;
    if (calls >= current.requestCap || current.type === "api" && reservedUSD + reserve > current.usdCap)
      throw new Error("この起動中の回数または見積り費用の上限に達しました。");
    busy = true;
    calls++;
    const previousReservedUSD = reservedUSD;
    reservedUSD += reserve;
    try {
      let data;
      try {
        data = await requestGeneration(current, messages, sceneSchema(game, { mode }));
      } catch (error) {
        const friendly = localConnectionError(error, current.provider, current.baseURL);
        if (friendly) {
          calls--;
          reservedUSD = previousReservedUSD;
          throw friendly;
        }
        throw error;
      }
      const raw = contentJSON(data, current.provider);
      let scene;
      try {
        const validated = validateGeneratedScene(raw, game, { mode, fresh: true });
        scene = validateGeneratedScene(groundScene(validated, game), game, { mode, fresh: true });
      } catch (error) {
        if (error instanceof SyntaxError) throw error;
        // Which rule refused the reply, for whoever runs the server: only the
        // rule's place in the code, never the reply or the player's data.
        const rule = /(?:engine|story)\.js:\d+/.exec(String(error.stack).split("\n").slice(1).find((l) => /public\/(?:engine|story)\.js/.test(l) && !/\bfail\b/.test(l)) ?? "")?.[0];
        if (rule) console.warn(`scene rejected at ${rule}`);
        throw new Error(
          "AIの提案がゲームの条件（実在企業の名前・選択肢の形式など）を満たさなかったため、採用しませんでした。",
        );
      }
      const result = {
        scene,
        turn: sceneKey(game),
        model: current.model,
        inputTokens:
          data.prompt_eval_count ?? data.usage?.prompt_tokens ?? null,
        outputTokens: data.eval_count ?? data.usage?.completion_tokens ?? null,
      };
      if (config === current) {
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, result);
      }
      return {
        ...result,
        cached: false,
        accounting: { ...status(), busy: false },
      };
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Error(
          "AIの返答が指定のJSON形式になりませんでした。接続やモデルを調整して再度お試しください。",
        );
      throw error;
    } finally {
      busy = false;
    }
  }
  return { status, configure, generate, models };
}
