import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { makeHostedAPI, reserveHosted } from "../lib/hosted-ai.mjs";
import { createGame, encodeSave } from "../public/engine.js";

// Real SQLite executes the same statements as D1; no real keys or network.
function database(t) {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    readFileSync(
      new URL("../hosted/drizzle/0000_nostalgic_ogun.sql", import.meta.url),
      "utf8",
    ),
  );
  t.after(() => sql.close());
  const db = {
    prepare(query) {
      const values = [];
      return {
        bind(...v) {
          values.push(...v);
          return this;
        },
        first: async () => sql.prepare(query).get(...values) ?? null,
        execute: () => ({
          success: true,
          results: sql.prepare(query).all(...values),
        }),
      };
    },
    async batch(statements) {
      sql.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.map((s) => s.execute());
        sql.exec("COMMIT");
        return result;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { db, sql };
}
const origin = "https://synthetic.example";
const user = { userId: "synthetic-user", email: "synthetic@example.invalid" };
const profile = {
  age: 30,
  region: "city",
  job: "tech",
  income: 500,
  ai: "sometimes",
  priority: "balance",
  gender: "undisclosed",
  household: "solo",
  savings: 300,
  monthlyCost: 12,
  companyType: "unknown",
  company: "合成企業",
};
const save = () => encodeSave(createGame(profile));
const validScene = {
  title: "次の一年を考える",
  body: "今の仕事と暮らしから、次の一歩を選びます。",
  insight: "これはゲーム内の架空の場面です。",
  options: ["learn", "rest", "connect"].map((id) => ({
    id,
    label: id,
    hint: "時間を配分する",
  })),
};
async function session(api) {
  const res = await api.status(new Request(origin + "/api/status"), user);
  assert.equal(res.status, 200);
  const { token } = await res.json();
  const cookie = res.headers.get("set-cookie").split(";")[0];
  assert.match(
    res.headers.get("set-cookie"),
    /Secure; HttpOnly; SameSite=Strict/,
  );
  return { token, cookie };
}
function request(auth, body = {}, headers = {}) {
  return new Request(origin + "/api/scene", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Unwritten-Token": auth.token,
      Cookie: auth.cookie,
      ...headers,
    },
    body: JSON.stringify({
      requestId: randomUUID(),
      save: save(),
      cloudConsent: true,
      ...body,
    }),
  });
}
test("hosted generation validates identity, CSRF, origin, consent and input before any reservation or network", async (t) => {
  const { db, sql } = database(t);
  let calls = 0;
  const api = makeHostedAPI({
    db,
    apiKey: "synthetic-key",
    origin,
    fetchAI: () => {
      calls++;
      throw Error();
    },
  });
  const auth = await session(api);
  for (const [body, headers, who, code] of [
    [{}, {}, null, 401],
    [{}, { Origin: "https://other.example" }, user, 403],
    [{}, { "X-Unwritten-Token": "wrong" }, user, 403],
    [{}, { Cookie: "" }, user, 403],
    [{}, { "Sec-Fetch-Site": "cross-site" }, user, 403],
    [{}, { "Content-Type": "text/plain" }, user, 415],
    [{ cloudConsent: false }, {}, user, 400],
    [{ save: "{}" }, {}, user, 400],
    [{ requestId: "malformed" }, {}, user, 400],
    [{ usdCap: 50 }, {}, user, 400],
    [{ save: "x".repeat(1048577) }, {}, user, 413],
  ])
    assert.equal(
      (await api.scene(request(auth, body, headers), who)).status,
      code,
    );
  assert.equal(calls, 0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM ai_attempts").get().n, 0);
  const disabled = makeHostedAPI({ db, origin });
  assert.equal((await disabled.scene(request(auth), user)).status, 503);
  const noDB = makeHostedAPI({ origin, apiKey: "synthetic-key" });
  assert.equal((await noDB.scene(request(auth), user)).status, 503);
});
test("successful hosted request uses fixed standard endpoint/model, returns a validated scene, and never exposes or stores key/profile", async (t) => {
  const { db, sql } = database(t);
  let calls = 0;
  const api = makeHostedAPI({
    db,
    origin,
    apiKey: "synthetic-secret-key",
    fetchAI: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/chat/completions");
      assert.equal(options.redirect, "error");
      assert.equal(
        options.headers.Authorization,
        "Bearer synthetic-secret-key",
      );
      const payload = JSON.parse(options.body);
      assert.equal(payload.store, false);
      assert.equal(payload.service_tier, "default");
      assert.equal(payload.model, "gpt-6-luna");
      assert.equal(payload.max_completion_tokens, 1500);
      assert.equal(payload.reasoning_effort, "none");
      assert.equal(payload.tools, undefined);
      return Response.json({
        choices: [{ message: { content: JSON.stringify(validScene) } }],
      });
    },
  });
  const auth = await session(api),
    id = randomUUID();
  const response = await api.scene(request(auth, { requestId: id }), user);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.scene.title, validScene.title);
  assert.equal(result.accounting.calls, 1);
  assert.equal(result.accounting.busy, false);
  assert.ok(result.accounting.reservedUSD > 0);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-secret-key/);
  assert.equal(
    (await api.scene(request(auth, { requestId: id }), user)).status,
    429,
  );
  assert.equal(calls, 1);
  assert.deepEqual(
    Object.keys(sql.prepare("SELECT * FROM ai_attempts").get()),
    ["request_id", "status", "started_at"],
  );
  const status = await api.status(new Request(origin + "/api/status"), user);
  assert.doesNotMatch(await status.text(), /synthetic-secret-key|合成企業/);
});
test("durable reservation refuses duplicate/concurrent/cap-exceeding work and survives handler recreation or a crashed Worker", async (t) => {
  const { db, sql } = database(t);
  const id = randomUUID();
  await reserveHosted(db, id, 4000, 1000);
  const outcomes = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      reserveHosted(db, randomUUID(), 4000, 1001),
    ),
  );
  assert.ok(outcomes.every((v) => v.status === "rejected"));
  await assert.rejects(() => reserveHosted(db, id, 4000, 200000));
  const second = randomUUID();
  await reserveHosted(db, second, 4000, 200000);
  const api = makeHostedAPI({
    db,
    origin,
    apiKey: "synthetic-key",
    now: () => 200001,
  });
  const status = await (
    await api.status(new Request(origin + "/api/status"), user)
  ).json();
  assert.equal(status.ai.calls, 2);
  assert.equal(status.ai.reservedUSD, 0.008);
  assert.equal(status.ai.busy, true);
  sql.exec("UPDATE ai_budget SET reserved_micro = 99000, lock_until = 0");
  await reserveHosted(db, randomUUID(), 1000, 500000);
  await assert.rejects(() => reserveHosted(db, randomUUID(), 1, 700000));
  assert.equal(
    sql.prepare("SELECT reserved_micro FROM ai_budget").get().reserved_micro,
    100000,
  );
  sql.exec(
    "UPDATE ai_budget SET reserved_micro = 0, calls = 100, lock_until = 0",
  );
  await assert.rejects(() => reserveHosted(db, randomUUID(), 1000, 900000));
});
test("invalid, oversized and failed upstream responses consume one reservation, hide upstream secrets, and never retry", async (t) => {
  const { db, sql } = database(t);
  for (const reply of [
    () =>
      Response.json({ choices: [{ message: { content: "invalid json" } }] }),
    () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...validScene,
                options: [{ id: "shell", label: "execute", hint: "bad" }],
              }),
            },
          },
        ],
      }),
    () => new Response("synthetic-secret-error", { status: 429 }),
    () => new Response("x".repeat(128001)),
    () => {
      throw Error("synthetic-secret-error");
    },
  ]) {
    let calls = 0;
    const api = makeHostedAPI({
      db,
      origin,
      apiKey: "synthetic-key",
      fetchAI: async () => {
        calls++;
        return reply();
      },
    });
    const auth = await session(api);
    const response = await api.scene(request(auth), user);
    assert.ok(response.status >= 500);
    assert.doesNotMatch(await response.text(), /synthetic-secret-error/);
    assert.equal(calls, 1);
  }
  assert.equal(sql.prepare("SELECT calls FROM ai_budget").get().calls, 5);
});
