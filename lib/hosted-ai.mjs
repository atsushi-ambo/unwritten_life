import {
  decodeSave,
  validateGeneratedScene,
  sceneKey,
  isRetiredAt,
} from "../public/engine.js";
import { storyRequest, groundScene } from "../public/story.js";

// Private hosted trial only. No browser-provided provider, endpoint, price or cap.
// Standard Luna prices checked 2026-10-17; reserve 2x the published token rates.
export const HOSTED_LIMITS = Object.freeze({
  model: "gpt-6-luna",
  usdCap: 5,
  requestCap: 2000,
  inputRate: 0.2,
  outputRate: 1,
  outputTokens: 1500,
});
const COOKIE = "__Host-unwritten-csrf";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;
const enc = new TextEncoder();
class Denied extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function deny(status, message) {
  throw new Denied(status, message);
}
function json(body, status = 200, extra = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}
async function boundedText(body, max) {
  if (!body) deny(400, "空のデータです。");
  const reader = body.getReader(),
    chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        deny(413, "データが大きすぎます。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function cookieToken(request) {
  const parts = (request.headers.get("cookie") ?? "").split(";");
  const value = parts
    .map((p) => p.trim())
    .find((p) => p.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  return TOKEN.test(value ?? "") ? value : null;
}
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}

// One D1 batch is a transaction. A reservation and its idempotency record either
// both commit or neither does. An accepted attempt is never refunded, even if the
// Worker dies or the upstream response is invalid. Do not delete this ledger.
export async function reserveHosted(db, requestId, microUSD, now) {
  const result = await db.batch([
    db.prepare(
      "INSERT INTO ai_budget (id) VALUES ('lifetime') ON CONFLICT DO NOTHING",
    ),
    db
      .prepare(
        `INSERT INTO ai_attempts (request_id, status, started_at)
      SELECT ?, 'reserved', ? FROM ai_budget
      WHERE id = 'lifetime' AND calls < ? AND reserved_micro + ? <= ? AND lock_until <= ?
      ON CONFLICT DO NOTHING`,
      )
      .bind(requestId, now, HOSTED_LIMITS.requestCap, microUSD, Math.round(HOSTED_LIMITS.usdCap * 1e6), now),
    db
      .prepare(
        `UPDATE ai_budget SET calls = calls + 1,
      reserved_micro = reserved_micro + ?, lock_until = ?, lock_request = ?
      WHERE id = 'lifetime' AND EXISTS (
        SELECT 1 FROM ai_attempts WHERE request_id = ? AND status = 'reserved'
      ) RETURNING calls, reserved_micro`,
      )
      .bind(microUSD, now + 120000, requestId, requestId),
    db
      .prepare(
        "UPDATE ai_attempts SET status = 'started' WHERE request_id = ? AND status = 'reserved'",
      )
      .bind(requestId),
  ]);
  if (!result[2]?.results?.length)
    deny(
      429,
      "生成中・同じリクエストの再送、または累計の回数・費用上限です。自動再試行はしません。",
    );
}
async function finishHosted(db, requestId) {
  await db.batch([
    db
      .prepare(
        "UPDATE ai_attempts SET status = 'finished' WHERE request_id = ?",
      )
      .bind(requestId),
    db
      .prepare(
        "UPDATE ai_budget SET lock_until = 0, lock_request = '' WHERE id = 'lifetime' AND lock_request = ?",
      )
      .bind(requestId),
  ]);
}
export function makeHostedAPI({
  db,
  apiKey,
  origin,
  fetchAI = fetch,
  now = Date.now,
}) {
  const expectedOrigin = new URL(origin).origin;
  function guard(request, user) {
    // user must come from Sites' dispatch-owned identity headers on the server. This app is
    // hosted owner-private; sign-in alone must not authorize a future public app.
    if (!user?.userId || !user?.email) deny(401, "サインインが必要です。");
    if (new URL(request.url).origin !== expectedOrigin)
      deny(403, "送信先が一致しません。");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      deny(403, "別サイトからは操作できません。");
    if (!db)
      deny(503, "利用上限の保存先が未設定です。AI生成は停止しています。");
  }
  async function accounting() {
    const row = await db
      .prepare(
        "SELECT calls, reserved_micro, lock_until FROM ai_budget WHERE id = 'lifetime'",
      )
      .first();
    return {
      ...HOSTED_LIMITS,
      provider: "openai",
      ready: !!apiKey,
      hasKey: !!apiKey,
      cloud: true,
      baseURL: "https://api.openai.com/v1",
      calls: row?.calls ?? 0,
      reservedUSD: (row?.reserved_micro ?? 0) / 1e6,
      busy: (row?.lock_until ?? 0) > now(),
      scope: "lifetime",
    };
  }
  async function status(request, user) {
    try {
      guard(request, user);
      if (request.method !== "GET") deny(405, "GETを使ってください。");
      const token = cookieToken(request) ?? randomToken();
      return json(
        {
          token,
          engineRevision: "career-offers-v1",
          choicesRevision: "personalized-four-v1",
          profileRevision: "profile-details-v1",
          ai: await accounting(),
        },
        200,
        {
          "Set-Cookie": `${COOKIE}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
        },
      );
    } catch (error) {
      return failure(error);
    }
  }
  async function scene(request, user) {
    try {
      guard(request, user);
      if (request.method !== "POST") deny(405, "POSTを使ってください。");
      if (request.headers.get("origin") !== expectedOrigin)
        deny(403, "送信元が一致しません。");
      const token = cookieToken(request);
      if (!token || request.headers.get("x-unwritten-token") !== token)
        deny(403, "画面を再読み込みしてください。");
      if (
        request.headers.get("content-type")?.split(";")[0].trim() !==
        "application/json"
      )
        deny(415, "JSON形式が必要です。");
      if (!apiKey)
        deny(503, "OpenAIの接続準備中です。しばらくしてから再度お試しください。");
      let body, game;
      try {
        body = JSON.parse(await boundedText(request.body, 1048576));
        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          Object.keys(body).some(
            (k) =>
              ![
                "save",
                "cloudConsent",
                "requestId",
                "mode",
                "choiceVersion",
              ].includes(k),
          ) ||
          typeof body.save !== "string" ||
          !UUID.test(body.requestId ?? "")
        )
          deny(400, "入力形式を確認してください。");
        // decodeSave validates oddsFrom (and earlier boundaries) before attempts or budget reservation.
        // Hosted generation has no scene cache; each request uses these boundaries.
        game = decodeSave(body.save);
        // Already-open older clients cannot run actions added after their load.
        const saved = JSON.parse(body.save);
        if (!Object.hasOwn(saved, "careLeaveSalaryFrom"))
          game.careLeaveSalaryFrom = 110;
        if (!Object.hasOwn(saved, "prepayFrom")) game.prepayFrom = 110;
        if (!Object.hasOwn(saved, "debtRepayFrom")) game.debtRepayFrom = 110;
        if (!Object.hasOwn(saved, "salaryCapFrom")) game.salaryCapFrom = 110;
      } catch (error) {
        if (error instanceof Denied) throw error;
        deny(400, "保存データの形式を確認してください。");
      }
      if (body.cloudConsent !== true)
        deny(400, "OpenAIへ送る情報を確認し、同意を入れてください。");
      if (game.ended) deny(400, "完結した人生の場面は生成できません。");
      const mode = body.mode ?? "life";
      if (
        body.choiceVersion !== 1 ||
        !["life", "career"].includes(mode) ||
        (mode === "career" && isRetiredAt(game))
      )
        deny(400, "生成する場面の種類を確認してください。");
      const { messages } = storyRequest(game, { mode });
      const inputBytes = enc.encode(JSON.stringify(messages)).byteLength;
      if (inputBytes > 50000) deny(413, "AIへ送る情報が大きすぎます。");
      const reserve = Math.ceil(
        (inputBytes + 1024) * HOSTED_LIMITS.inputRate +
          HOSTED_LIMITS.outputTokens * HOSTED_LIMITS.outputRate,
      );
      await reserveHosted(db, body.requestId, reserve, now());
      try {
        const response = await fetchAI(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            // Workers supports manual/follow only. Reject 3xx below without
            // forwarding the Authorization header to another destination.
            redirect: "manual",
            signal: AbortSignal.timeout(90000),
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: HOSTED_LIMITS.model,
              messages,
              stream: false,
              store: false,
              response_format: { type: "json_object" },
              reasoning_effort: "none",
              max_completion_tokens: HOSTED_LIMITS.outputTokens,
              service_tier: "default",
            }),
          },
        );
        if (!response.ok)
          deny(
            502,
            `OpenAIがエラーを返しました（HTTP ${response.status}）。残高・モデルの利用権限を確認してください。自動再試行はしません。`,
          );
        let data, generated;
        try {
          data = JSON.parse(await boundedText(response.body, 128000));
          const content = data.choices?.[0]?.message?.content;
          if (typeof content !== "string" || content.length > 18000)
            throw Error();
          generated = groundScene(
            validateGeneratedScene(
              JSON.parse(
                content
                  .replace(/^\s*```(?:json)?\s*/i, "")
                  .replace(/\s*```\s*$/, ""),
              ),
              game,
              { mode, fresh: true },
            ),
            game,
          );
          generated = validateGeneratedScene(generated, game, { mode, fresh: true });
        } catch {
          deny(
            502,
            "AIの返答を安全に取り込めませんでした。自動再試行はしません。",
          );
        }
        // No prompts, profiles or responses are persisted in D1 or application logs.
        return json({
          scene: generated,
          turn: sceneKey(game),
          model: HOSTED_LIMITS.model,
          cached: false,
          accounting: { ...(await accounting()), busy: false },
        });
      } finally {
        await finishHosted(db, body.requestId);
      }
    } catch (error) {
      return failure(error);
    }
  }
  function failure(error) {
    return error instanceof Denied
      ? json({ error: error.message }, error.status)
      : json(
          {
            error:
              "AI生成を完了できませんでした。自動再試行はしません。AIなしでは続けられます。",
          },
          503,
        );
  }
  return { status, scene };
}
