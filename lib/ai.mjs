import { createHash } from "node:crypto";
import {
  decodeSave,
  validateGeneratedScene,
  sceneKey,
} from "../public/engine.js";
import { storyRequest, sceneSchema, groundScene } from "../public/story.js";
import { destination, requestText } from "./network.mjs";

export const PRESETS = {
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234/v1",
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
export function configFrom(raw, oldKey = "") {
  if (
    !raw ||
    !["disabled", ...Object.keys(PRESETS), "custom"].includes(raw.provider)
  )
    throw new Error("AIの接続方式を確認してください。");
  const baseURL = PRESETS[raw.provider] ?? raw.baseURL;
  if (raw.provider !== "disabled") {
    const url = new URL(baseURL);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["http:", "https:"].includes(url.protocol)
    )
      throw new Error("AI接続先URLを確認してください。");
  }
  const model = raw.model ?? "qwen3:8b";
  if (
    typeof model !== "string" ||
    model.length > 150 ||
    !/^[a-zA-Z0-9_.:/@-]+$/.test(model)
  )
    throw new Error("モデルIDを確認してください。");
  const apiKey = raw.apiKey || oldKey;
  if (
    typeof apiKey !== "string" ||
    apiKey.length > 4096 ||
    /[\r\n]/.test(apiKey)
  )
    throw new Error("APIキーの形式を確認してください。");
  const result = { provider: raw.provider, baseURL, model, apiKey };
  for (const [key, fallback, min, max] of [
    ["inputRate", 0, 0, 10000],
    ["outputRate", 0, 0, 10000],
    ["usdCap", 1, 0.001, 100],
    ["requestCap", 100, 1, 300],
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
  const url = raw.provider === "disabled" ? null : new URL(baseURL);
  result.cloud = !!url && !["127.0.0.1", "localhost"].includes(url.hostname);
  const freeRouter =
    raw.provider === "openrouter" &&
    (model === "openrouter/free" || model.endsWith(":free"));
  if (
    result.cloud &&
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
} = {}) {
  let config = configFrom({ provider: "ollama", model: "qwen3:8b" });
  let calls = 0,
    reservedUSD = 0,
    busy = false;
  const cache = new Map();
  function status() {
    const { apiKey, ...safe } = config;
    return { ...safe, hasKey: !!apiKey, calls, reservedUSD, busy };
  }
  async function models(provider = config.provider) {
    if (!["ollama", "lmstudio"].includes(provider))
      throw new Error("モデル一覧はOllama・LM Studioで利用できます。");
    const r = await transport(
      PRESETS[provider] + (provider === "ollama" ? "/api/tags" : "/models"),
      { allowLoopback: true, timeout: 10000, maxBytes: 128000 },
    );
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
  async function configure(raw) {
    if (busy) throw new Error("生成中です。完了後に設定を変更してください。");
    const next = configFrom(
      raw,
      raw.provider === config.provider && raw.baseURL === config.baseURL
        ? config.apiKey
        : "",
    );
    if (next.provider !== "disabled")
      await validateDestination(next.baseURL, true);
    if (
      ["ollama", "lmstudio"].includes(next.provider) &&
      !(await models(next.provider)).some((m) => m.id === next.model)
    )
      throw new Error("一覧にあるダウンロード済みモデルを選んでください。");
    config = next;
    cache.clear();
    return status();
  }
  async function generate(
    save,
    cloudConsent = false,
    { personalized = false, mode = "life" } = {},
  ) {
    if (
      typeof personalized !== "boolean" ||
      !["life", "career"].includes(mode) ||
      (mode === "career" && !personalized)
    )
      throw new Error("生成する場面の種類を確認してください。");
    if (busy) throw new Error("生成中です。しばらくお待ちください。");
    if (config.provider === "disabled")
      throw new Error("AIを接続するか、外部AIとの交換を使ってください。");
    if (config.cloud && cloudConsent !== true)
      throw new Error("送信先と送信内容への同意が必要です。");
    const game = decodeSave(save);
    // Already-open v2 clients only understand the original action identifiers.
    if (!Object.hasOwn(JSON.parse(save), "dynamicFrom")) game.dynamicFrom = 110;
    if (!Object.hasOwn(JSON.parse(save), "worldFrom")) game.worldFrom = 110;
    if (game.ended) throw new Error("完結した人生の場面は生成できません。");
    if (mode === "career" && game.retired)
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
          personalized,
          mode,
        }),
      )
      .digest("hex");
    if (cache.has(key))
      return { ...cache.get(key), cached: true, accounting: status() };
    const { messages } = storyRequest(game, { personalized, mode });
    const upperInputTokens =
      Buffer.byteLength(JSON.stringify(messages), "utf8") + 1024;
    const reserve =
      (upperInputTokens * config.inputRate + 1500 * config.outputRate) / 1e6;
    if (calls >= config.requestCap || reservedUSD + reserve > config.usdCap)
      throw new Error("この起動中の回数または見積り費用の上限に達しました。");
    busy = true;
    calls++;
    reservedUSD += reserve;
    try {
      const ollama = config.provider === "ollama";
      const endpoint =
        config.baseURL.replace(/\/$/, "") +
        (ollama ? "/api/chat" : "/chat/completions");
      const payload = ollama
        ? {
            model: config.model,
            messages,
            stream: false,
            think: false,
            format: sceneSchema(game, { personalized, mode }),
            options: { temperature: 0.7, num_predict: 1500, num_ctx: 8192 },
            keep_alive: "5m",
          }
        : {
            model: config.model,
            messages,
            stream: false,
            response_format: { type: "json_object" },
            // Luna supports non-reasoning generation. Keep the small scene
            // output allowance for the JSON, rather than hidden reasoning.
            ...(config.provider === "openai" &&
            /^gpt-6-luna(?:-|$)/.test(config.model)
              ? { reasoning_effort: "none" }
              : {}),
            [config.provider === "openai"
              ? "max_completion_tokens"
              : "max_tokens"]: 1500,
          };
      const response = await transport(endpoint, {
        allowLoopback: true,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey
            ? { Authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify(payload),
        timeout: 120000,
        maxBytes: 128000,
      });
      if (response.status !== 200)
        throw new Error(
          `AI接続先がエラーを返しました（HTTP ${response.status}）。モデルID・起動状態・残高を確認してください。`,
        );
      const data = JSON.parse(response.text),
        content = ollama
          ? data.message?.content
          : data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length > 18000)
        throw new Error("AIから有効な文章が返りませんでした。");
      const clean = content
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "");
      const scene = groundScene(
        validateGeneratedScene(JSON.parse(clean), game, { personalized, mode }),
        game,
      );
      const result = {
        scene,
        turn: sceneKey(game),
        model: config.model,
        inputTokens:
          data.prompt_eval_count ?? data.usage?.prompt_tokens ?? null,
        outputTokens: data.eval_count ?? data.usage?.completion_tokens ?? null,
      };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, result);
      return {
        ...result,
        cached: false,
        accounting: { ...status(), busy: false },
      };
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new Error(
          "AIの返答が指定のJSON形式になりませんでした。自動再試行はしません。接続やモデルを調整して再度お試しください。",
        );
      throw error;
    } finally {
      busy = false;
    }
  }
  return { status, configure, generate, models };
}
