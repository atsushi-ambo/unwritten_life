import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { makeHostedAPI, reserveHosted, HOSTED_LIMITS } from "../lib/hosted-ai.mjs";
import { createGame, encodeSave, advance } from "../public/engine.js";
import { replyFor } from "./fixtures/ai-replies.js";
// Play past retirement as under the rules before the career ending.
const pastRetirement = (profile, scenario = "steady", seed = 2026, ...from) =>
  createGame(profile, scenario, seed, ...[0, 0, 0, 0, 0, 0, 0, 0, 0].map((d, i) => from[i] ?? d), 110);

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
      choiceVersion: 1,
      ...body,
    }),
  });
}
test("hosted status advertises detailed profile and choice capabilities only to an authenticated user", async (t) => {
  const { db } = database(t);
  const api = makeHostedAPI({ db, origin, apiKey: "synthetic-key" });
  const request = new Request(origin + "/api/status");
  const status = await (await api.status(request, user)).json();
  assert.equal(status.engineRevision, "career-offers-v1");
  assert.equal(status.choicesRevision, "personalized-four-v1");
  assert.equal(status.profileRevision, "profile-details-v1");
  const denied = await api.status(request, null);
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).profileRevision, undefined);
});

test("hosted generation decodes pre-fix care-leave histories and rejects invalid migration markers before reservation", async (t) => {
  const { db, sql } = database(t);
  const { save } = JSON.parse(readFileSync(new URL("./fixtures/care-leave-save.json", import.meta.url)));
  let calls = 0;
  const api = makeHostedAPI({
    db, origin, apiKey: "synthetic-key", now: () => 1000,
    fetchAI: async (_url, options) => {
      calls++;
      return Response.json({ choices: [{ message: { content: JSON.stringify(replyFor(options)) } }] });
    },
  });
  const auth = await session(api);
  const invalid = await api.scene(request(auth, {
    save: JSON.stringify({ ...save, careLeaveSalaryFrom: null }),
  }), user);
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM ai_attempts").get().n, 0);
  const response = await api.scene(request(auth, { save: JSON.stringify(save) }), user);
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal((await response.json()).turn, String(save.decisions.length));
});
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
    [{ choiceVersion: 2 }, {}, user, 400],
    [{ choiceVersion: undefined }, {}, user, 400],
    [{ mode: "shell", choiceVersion: 1 }, {}, user, 400],
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
test("hosted personalized requests enforce four executable choices before returning a scene", async (t) => {
  const { db } = database(t);
  let calls = 0;
  const api = makeHostedAPI({
    db,
    origin,
    apiKey: "synthetic-key",
    fetchAI: async (_url, options) => {
      calls++;
      const payload = JSON.parse(options.body);
      assert.equal(
        JSON.parse(payload.messages[1].content).generationMode,
        "life",
      );
      assert.equal(
        JSON.parse(payload.messages[1].content).life.municipality,
        "合成市",
      );
      assert.equal(JSON.parse(payload.messages[1].content).careerInterests, "外資SaaS");
      assert.match(payload.messages[0].content, /関心を能力・適性・採用の根拠にしない/);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...validScene,
                options: ["learn", "focus", "rest", "connect"].map((id) => ({
                  id,
                  label: id,
                  hint: "時間の使い方を選ぶ",
                  reason: "現在の暮らしとの接点",
                  decision: { id, intent: `現在の暮らしで${id}を大切にする` },
                })),
              }),
            },
          },
        ],
      });
    },
  });
  const auth = await session(api);
  const response = await api.scene(
    request(auth, {
      mode: "life",
      choiceVersion: 1,
      save: encodeSave(
        createGame({
          ...profile,
          occupation: "infrastructure",
          municipality: "合成市",
          industry: "finance",
          jobDetail: "銀行のクラウド運用",
          careerInterests: "外資SaaS",
        }),
      ),
    }),
    user,
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.scene.options.length, 4);
  assert.equal(result.scene.options[0].decision.id, "learn");
  assert.equal(result.accounting.calls, 1);
  assert.equal(calls, 1);
});
test("hosted career generation rejects retirement before reserving a call or cost and accepts working and legacy states", async (t) => {
  const { db, sql } = database(t);
  const scene = {
    ...validScene,
    options: [
      ...["合成商事", "合成ソフト", "合成ロジ"].map((name) => ({
        id: "switch",
        label: `${name}で経験を生かす`,
        hint: "新しい仕事に慣れる時間を使う",
        reason: "これまでの技術の経験を使う",
        decision: {
          id: "switch", target: "custom", name, role: "tech", companyType: "unknown",
          candidateKind: "real", workModel: "services", proposal: "経験を生かす架空の役割",
          intent: "技術の経験を生かす",
        },
      })),
      {
        id: "focus",
        label: "現職を深める",
        hint: "新しい機会は見送る",
        reason: "経験を積み重ねる",
      },
    ],
  };
  let calls = 0;
  const api = makeHostedAPI({
    db,
    origin,
    apiKey: "synthetic-key",
    now: () => 1000,
    fetchAI: async () => {
      calls++;
      return Response.json({
        choices: [{ message: { content: JSON.stringify(scene) } }],
      });
    },
  });
  const auth = await session(api),
    before = pastRetirement({ ...profile, age: 64, retirementAge: 65 }, "steady", 4),
    boundary = advance(before, "rest");
  assert.equal(boundary.retired, false);
  for (const game of [
    boundary,
    advance(boundary, "rest"),
    advance(before, "retire"),
  ]) {
    const res = await api.scene(
      request(auth, { save: encodeSave(game), mode: "career", choiceVersion: 1 }),
      user,
    );
    assert.equal(res.status, 400);
    assert.equal(calls, 0);
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM ai_attempts").get().n, 0);
    const status = await (
      await api.status(new Request(origin + "/api/status"), user)
    ).json();
    assert.equal(status.ai.calls, 0);
    assert.equal(status.ai.reservedUSD, 0);
    assert.equal(status.ai.busy, false);
  }
  const legacy = JSON.parse(encodeSave(boundary));
  delete legacy.retirementFrom;
  for (const save of [encodeSave(before), JSON.stringify(legacy)]) {
    const res = await api.scene(
      request(auth, { save, mode: "career", choiceVersion: 1 }),
      user,
    );
    assert.equal(res.status, 200, await res.text());
  }
  assert.equal(calls, 2);
  assert.equal(sql.prepare("SELECT calls FROM ai_budget").get().calls, 2);
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
      assert.equal(options.redirect, "manual");
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
        choices: [{ message: { content: JSON.stringify(replyFor(options)) } }],
      });
    },
  });
  const auth = await session(api),
    id = randomUUID();
  const response = await api.scene(request(auth, { requestId: id }), user);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.scene.title, "学びを仕事へ");
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
  // The owner's lifetime cap: $5 of reserved cost, or the call limit.
  assert.equal(HOSTED_LIMITS.usdCap, 5);
  sql.exec("UPDATE ai_budget SET reserved_micro = 4999000, lock_until = 0");
  await reserveHosted(db, randomUUID(), 1000, 500000);
  await assert.rejects(() => reserveHosted(db, randomUUID(), 1, 700000));
  assert.equal(
    sql.prepare("SELECT reserved_micro FROM ai_budget").get().reserved_micro,
    5000000,
  );
  sql.exec(
    `UPDATE ai_budget SET reserved_micro = 0, calls = ${HOSTED_LIMITS.requestCap}, lock_until = 0`,
  );
  await assert.rejects(() => reserveHosted(db, randomUUID(), 1000, 900000));
});
test("redirected, invalid, oversized and failed upstream responses consume one reservation, hide upstream secrets, and never retry", async (t) => {
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
    () => new Response("synthetic-secret-error", {
      status: 307,
      headers: { Location: "https://other.example/collect" },
    }),
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
      fetchAI: async (url, options) => {
        assert.equal(url, "https://api.openai.com/v1/chat/completions");
        assert.equal(options.redirect, "manual");
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
  assert.equal(sql.prepare("SELECT calls FROM ai_budget").get().calls, 6);
});
test("hosted generation keeps prepayment out of saves from clients opened before it existed", async (t) => {
  const { db } = database(t);
  const scene = {
    ...validScene,
    options: ["prepay", "rest", "learn", "focus"].map((id) => ({
      id,
      label: id,
      hint: "暮らしのお金を見直す",
      reason: "住宅ローンのある暮らし",
      decision: { id, intent: "暮らしのお金を見直す" },
    })),
  };
  const api = makeHostedAPI({
    db,
    origin,
    apiKey: "synthetic-key",
    fetchAI: async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(scene) } }],
      }),
  });
  const auth = await session(api);
  const owner = createGame({
    ...profile,
    savings: 1500,
    housing: "own",
    homeValue: 3000,
    mortgage: 2000,
    mortgageYears: 25,
    mortgageRate: 2,
  });
  const current = await api.scene(request(auth, { save: encodeSave(owner) }), user);
  assert.equal(current.status, 200);
  assert.equal((await current.json()).scene.options[0].id, "prepay");
  const legacy = JSON.parse(encodeSave(owner));
  delete legacy.prepayFrom;
  const old = await api.scene(
    request(auth, { save: JSON.stringify(legacy) }),
    user,
  );
  assert.equal(old.status, 502);
});

test("hosted generation preserves old-client debt rules and rejects invalid boundaries before reservation", async (t) => {
  const { db, sql } = database(t);
  let calls = 0;
  const api = makeHostedAPI({
    db, origin, apiKey: "synthetic-key", now: () => 1000,
    fetchAI: async (_url, options) => {
      calls++;
      return Response.json({ choices: [{ message: { content: JSON.stringify(replyFor(options)) } }] });
    },
  });
  const auth = await session(api),
    before = { ...createGame({ ...profile, savings: -2000 }, "steady", 42, 0, 0, 0, 0, 0, 110), offersFrom: 110 },
    saved = JSON.parse(encodeSave(advance(before, "rest")));
  for (const debtRepayFrom of [null, -1, 1.5, 111, "0"]) {
    const invalid = await api.scene(request(auth, {
      save: JSON.stringify({ ...saved, debtRepayFrom }),
    }), user);
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM ai_attempts").get().n, 0);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM ai_budget").get().n, 0);
  }
  delete saved.debtRepayFrom;
  for (const debtRepayFrom of [undefined, 110, 1]) {
    const response = await api.scene(request(auth, {
      save: JSON.stringify({ ...saved, ...(debtRepayFrom === undefined ? {} : { debtRepayFrom }) }),
    }), user);
    assert.equal(response.status, 200);
    const { scene } = await response.json();
    if (debtRepayFrom === 1) assert.match(scene.body, /借入の返済も続いている/);
    else {
      assert.match(scene.body, /借入が残っている/);
      assert.doesNotMatch(scene.body, /借入の返済も続いている/);
    }
  }
  assert.equal(calls, 3);
});

test("hosted generation accepts saves without a salary cap boundary and rejects invalid ones before reservation", async (t) => {
  const { db, sql } = database(t);
  let calls = 0;
  const api = makeHostedAPI({
    db, origin, apiKey: "synthetic-key", now: () => 1000,
    fetchAI: async (_url, options) => {
      calls++;
      return Response.json({ choices: [{ message: { content: JSON.stringify(replyFor(options)) } }] });
    },
  });
  const auth = await session(api),
    saved = JSON.parse(encodeSave(advance(
      createGame(profile, "steady", 42, 0, 0, 0, 0, 0, 0, 110), "rest")));
  for (const salaryCapFrom of [null, -1, 1.5, 111, "0"]) {
    const invalid = await api.scene(request(auth, {
      save: JSON.stringify({ ...saved, salaryCapFrom }),
    }), user);
    assert.equal(invalid.status, 400);
    assert.equal(calls, 0);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM ai_attempts").get().n, 0);
  }
  delete saved.salaryCapFrom;
  for (const salaryCapFrom of [undefined, 110, 1]) {
    const response = await api.scene(request(auth, {
      save: JSON.stringify({ ...saved, ...(salaryCapFrom === undefined ? {} : { salaryCapFrom }) }),
    }), user);
    assert.equal(response.status, 200);
  }
  assert.equal(calls, 3);
});

test("hosted offer, pace and pay boundaries validate before requests, attempt records or budget reservations", async (t) => {
  const { db, sql } = database(t);
  let calls = 0;
  const api = makeHostedAPI({
    db, origin, apiKey: "synthetic-key", now: () => 1000,
    fetchAI: async (_url, options) => {
      calls++;
      return Response.json({ choices: [{ message: { content: JSON.stringify(replyFor(options)) } }] });
    },
  });
  const auth = await session(api), saved = JSON.parse(encodeSave(createGame(profile)));
  for (const field of ["offersFrom", "paceFrom", "reemploymentPayFrom"]) for (const value of [null, -1, 1.5, 111, "0"]) {
    const response = await api.scene(request(auth, { save: JSON.stringify({ ...saved, [field]: value }) }), user);
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM ai_attempts").get().n, 0);
    assert.equal(sql.prepare("SELECT count(*) AS n FROM ai_budget").get().n, 0);
  }
  for (const field of ["offersFrom", "paceFrom", "reemploymentPayFrom"]) for (const value of [0, 1, 110]) {
    const response = await api.scene(request(auth, { save: JSON.stringify({ ...saved, [field]: value }) }), user);
    assert.equal(response.status, 200);
  }
  assert.equal(calls, 9);
});
