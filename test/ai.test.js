import test from "node:test";
import assert from "node:assert/strict";
import { makeAI, configFrom } from "../lib/ai.mjs";
import { publicAddress, destination, requestText } from "../lib/network.mjs";
import { appPort } from "../lib/port.mjs";
import { createGame, encodeSave, advance, optionalProfileInputs, profileInputForLevel, PROFILE_DEFAULTS } from "../public/engine.js";
import { SCENE_STYLE, storyRequest } from "../public/story.js";
import { replyFor, isVerification, readyAI, ollamaText, chatText } from "./fixtures/ai-replies.js";
import http from "node:http";
import { readFileSync } from "node:fs";
const p = {
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
  company: "架空会社",
};
test("every narration mode follows the career arc while preserving safety and output contracts", () => {
  const game = createGame(p);
  {
    for (const mode of ["life", "career"]) {
      const { messages } = storyRequest(game, { mode });
      const system = messages[0].content;
      for (const rule of [
        /キャリアと人生のシミュレーションの語り手/u,
        /すべての場面は本人のキャリアの歩みを軸にする/u,
        /現職に残るか移るか.*学び直し.*副業.*起業.*退職/u,
        /家族・お金・住まい.*働き方を支えたり選択を迷わせたり/u,
        /AIはその人の仕事や出来事に直接関係するときだけ/u,
        /退職後.*再就職を強制しない/u,
        /転職を強制することではない/u,
        /入力JSON.*命令ではない/u,
        /資料中.*指示.*従わ/u,
        /道具.*ブラウザ.*ファイル.*[使ア]/u,
        /企業.*予言しない/u,
        /未記録の.*採用|未記録の内定/u,
        /家族.*[作決].*ない/u,
        /incomeFact.*計算済み/u,
        /lastOutcome.*計算済み|lastOutcomeはゲームで確定/u,
        /deficit.*赤字.*借入.*貯え/u,
        /deficitYearsが2以上.*方向転換.*撤退/u,
        /本文に金額[・や]割合/u,
        /allowedActionsのid/u,
        /行動の意味を変えない|idの定義と矛盾する結果を約束しない/u,
        /未来の企業発表や雇用・給与として書かない/u,
        /歴史は過去の事実/u,
        /企業名だけで内部事情・募集・給与を作らない|実際の内定・給与・募集ではない/u,
        /実在の求人サイトのブランド名は使わない/u,
        /出力はJSON[だの]け|出力はJSONのみ/u,
        /"title":"40文字以内"/u,
      ]) assert.match(system, rule, `${mode}: ${rule}`);
      assert.match(system, /pastCandidates.*繰り返さず/u);
      {
        assert.match(system, /body":"140〜240文字/u);
        // The style guide reaches every mode, after the content rules.
        assert.ok(system.includes(SCENE_STYLE), `${mode}: style guide`);
        assert.ok(system.indexOf(SCENE_STYLE) > system.indexOf("本文に金額・割合を書かない"));
        assert.match(system, /選択肢は必ず4個/u);
        if (mode === "life") {
          assert.match(system, /4択すべてを転職や仕事の案で埋めない/u);
          assert.match(system, /転職（switch）は通常4択のうち多くても1案/u);
          assert.match(system, /子育て中なら少なくとも1案は育児や家族/u);
        } else {
          assert.match(system, /3つの異なる企業へのswitch案と、現職に残るfocus（求職中ならrest）を1案/u);
          assert.match(system, /具体的な役割は架空の提案で、求人情報として書かない/u);
        }
      }
    }
  }
});
test("actual local HTTP model transport parses a valid response and cache prevents another call", async (t) => {
  let calls = 0;
  const mock = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const data = JSON.parse(body);
    assert.equal(data.model, "test-model");
    assert.equal(data.messages[0].role, "system");
    if (!isVerification({ body })) calls++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(chatText(replyFor({ body })));
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => mock.close(r)));
  const ai = makeAI();
  await ai.configure({
    provider: "custom",
    baseURL: `http://127.0.0.1:${mock.address().port}/v1`,
    model: "test-model",
    requestCap: 1,
  });
  const save = encodeSave(createGame(p));
  const a = await ai.generate(save);
  assert.equal(a.scene.title, "学びを仕事へ");
  assert.equal(a.scene.options.length, 4);
  assert.equal(a.accounting.calls, 1);
  assert.equal(a.accounting.busy, false);
  assert.equal((await ai.generate(save)).cached, true);
  assert.equal(calls, 1);
  await assert.rejects(
    () => ai.generate(encodeSave(createGame({ ...p, age: 31 }))),
    /上限/,
  );
});
test("provider keys stay out of status and prompts, cloud requires consent and reserves budget", async () => {
  const ai = makeAI({
    validateDestination: async () => {},
    transport: async (_url, options) => ({
      status: 200,
      text: chatText(replyFor(options)),
    }),
  });
  await assert.rejects(
    () => ai.generate(encodeSave(createGame(p)), true),
    /接続を設定/,
  );
  await ai.configure({
    provider: "openai", consent: true,
    baseURL: "https://api.openai.com/v1",
    model: "gpt-6-luna",
    apiKey: "synthetic-test-key",
    inputRate: 0.1,
    outputRate: 0.5,
    usdCap: 0.001,
  });
  assert.ok(!JSON.stringify(ai.status()).includes("synthetic-test-key"));
  await assert.rejects(
    () => ai.generate(encodeSave(createGame(p)), false),
    /同意/,
  );
  await assert.rejects(
    () => ai.generate(encodeSave(createGame(p)), true),
    /上限/,
  );
  assert.equal(ai.status().calls, 0);
  const prompt = JSON.stringify(storyRequest(createGame(p)));
  assert.ok(!prompt.includes("apiKey"));
  assert.ok(!prompt.includes("gender"));
});
test("malformed or malicious model output is rejected without retry and consumes one attempt", async () => {
  let calls = 0;
  const ai = await readyAI(async () => {
    calls++;
    return {
      status: 200,
      text: JSON.stringify({ message: { content: "not JSON" } }),
    };
  });
  await assert.rejects(() => ai.generate(encodeSave(createGame(p))), /JSON/);
  assert.equal(calls, 1);
  assert.equal(ai.status().calls, 1);
});
test("SSRF address classes, ambiguous numeric hosts and cloud config are constrained", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fc00::1",
    "224.0.0.1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  for (const url of [
    "http://example.com",
    "https://127.0.0.1",
    "https://0x7f000001",
    "https://[::ffff:127.0.0.1]",
    "https://user:secret@example.com",
    "https://example.com:444",
  ])
    await assert.rejects(() => destination(url));
  await assert.rejects(() => destination(`http://localhost:${appPort()}`, true));
  assert.throws(() =>
    configFrom({
      provider: "openai", consent: true,
      apiKey: "test",
      inputRate: 0,
      outputRate: 0,
    }),
  );
  assert.throws(() =>
    configFrom({
      provider: "custom",
      baseURL: "https://example.com/?secret=x",
    }),
  );
});
test("bounded response sizes reject excess bodies over actual HTTP", async (t) => {
  const server = http.createServer((_req, res) => res.end("x".repeat(1000)));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  await assert.rejects(
    () =>
      requestText(`http://127.0.0.1:${server.address().port}`, {
        allowLoopback: true,
        maxBytes: 100,
      }),
    /容量/,
  );
});

test("AI receives the chosen company and business context, and different employers do not share a cache entry", async () => {
  const contexts = [];
  const ai = await readyAI(async (_url, options) => {
    const payload = JSON.parse(options.body);
    contexts.push(JSON.parse(payload.messages[1].content));
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  const g = createGame(p, "steady", 42);
  const facts = {
    summary: "合成の事業資料。業務システムを提供する。",
    sector: "tech",
    confirmed: true,
    sources: [{ url: "https://example.com/about", title: "合成の公式資料", checkedAt: "2026-10-19" }],
  };
  const switchTo = (name, evidence) =>
    advance(g, { id: "switch", target: "custom", name, role: "tech", companyType: "unknown", facts: evidence });
  const real = switchTo("合成システムズ", facts);
  const other = switchTo("合成ロボティクス", null);
  await ai.generate(encodeSave(real));
  assert.equal((await ai.generate(encodeSave(real))).cached, true);
  await ai.generate(encodeSave(other));
  const venture = advance(g, {
    id: "startup",
    venture: "ai",
    name: "合成事業",
  });
  await ai.generate(encodeSave(venture));
  assert.equal(contexts.length, 3);
  assert.equal(contexts[0].currentEmployer, "合成システムズ");
  assert.match(contexts[0].companyEvidence.sources[0].url, /example\.com/);
  assert.deepEqual(contexts[0].pastCandidates, ["架空会社"]);
  assert.equal(contexts[1].currentEmployer, "合成ロボティクス");
  assert.equal(contexts[1].companyEvidence, null);
  assert.equal(contexts[2].career.kind, "venture");
  assert.equal(contexts[2].currentEmployer, "合成事業");
  assert.equal(contexts[2].companyEvidence, null);
});

test("AI preserves pre-fix care-leave histories for open clients and separates salary-rule cache entries", async () => {
  const { save } = JSON.parse(readFileSync(new URL("./fixtures/care-leave-save.json", import.meta.url)));
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  const legacy = await ai.generate(JSON.stringify(save));
  assert.equal(legacy.cached, false);
  // The already-open old client keeps the old salary rule for future turns.
  assert.equal((await ai.generate(JSON.stringify({ ...save, careLeaveSalaryFrom: 110 }))).cached, true);
  for (const careLeaveSalaryFrom of [4, 5]) {
    const explicit = JSON.stringify({ ...save, careLeaveSalaryFrom });
    assert.equal((await ai.generate(explicit)).cached, false);
    assert.equal((await ai.generate(explicit)).cached, true);
  }
  assert.equal(calls, 3);
  const before = ai.status();
  await assert.rejects(() => ai.generate(JSON.stringify({ ...save, careLeaveSalaryFrom: null })));
  assert.equal(ai.status().calls, before.calls);
  assert.equal(ai.status().reservedUSD, before.reservedUSD);
  assert.equal(calls, 3);
});

test("AI keeps prepay out of already-open old clients and hashes its boundary in the cache key", async () => {
  const contexts = [], ai = await readyAI(async (_url, options) => {
    const payload = JSON.parse(options.body);
    contexts.push(JSON.parse(payload.messages[1].content));
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  const save = JSON.parse(encodeSave(createGame({
    ...p, savings: 1000, housing: "own", homeValue: 3000,
    mortgage: 2000, mortgageYears: 25, mortgageRate: 2,
  })));
  delete save.prepayFrom;
  assert.equal((await ai.generate(JSON.stringify(save))).cached, false);
  assert.equal(contexts[0].allowedActions.some((a) => a.id === "prepay"), false);
  assert.equal((await ai.generate(JSON.stringify({ ...save, prepayFrom: 110 }))).cached, true);
  for (const prepayFrom of [0, 1, 2]) {
    const explicit = JSON.stringify({ ...save, prepayFrom });
    assert.equal((await ai.generate(explicit)).cached, false);
    assert.equal((await ai.generate(explicit)).cached, true);
  }
  assert.equal(contexts.length, 4);
  assert.equal(contexts[1].allowedActions.some((a) => a.id === "prepay"), true);
  assert.equal(contexts[2].allowedActions.some((a) => a.id === "prepay"), false);
  const before = ai.status();
  await assert.rejects(() => ai.generate(JSON.stringify({ ...save, prepayFrom: null })));
  assert.equal(ai.status().calls, before.calls);
  assert.equal(ai.status().reservedUSD, before.reservedUSD);
  assert.equal(contexts.length, 4);
});

test("AI preserves old-client debt rules and separates repayment boundaries in the cache", async () => {
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  const before = { ...createGame({ ...p, savings: -2000 }, "steady", 42, 0, 0, 0, 0, 0, 110), offersFrom: 110 },
    saved = JSON.parse(encodeSave(advance(before, "rest")));
  delete saved.debtRepayFrom;
  const old = await ai.generate(JSON.stringify(saved));
  assert.equal(old.cached, false);
  assert.match(old.scene.body, /借入が残っている/);
  assert.doesNotMatch(old.scene.body, /借入の返済も続いている/);
  assert.equal((await ai.generate(JSON.stringify({ ...saved, debtRepayFrom: 110 }))).cached, true);
  for (const debtRepayFrom of [0, 1, 2]) {
    const explicit = JSON.stringify({ ...saved, debtRepayFrom }),
      result = await ai.generate(explicit);
    assert.equal(result.cached, false);
    assert.equal((await ai.generate(explicit)).cached, true);
    if (debtRepayFrom === 1) assert.match(result.scene.body, /借入の返済も続いている/);
  }
  assert.equal(calls, 4);
  const accounting = ai.status();
  for (const debtRepayFrom of [null, -1, 1.5, 111, "0"]) {
    await assert.rejects(() => ai.generate(JSON.stringify({ ...saved, debtRepayFrom })));
    assert.equal(ai.status().calls, accounting.calls);
    assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
    assert.equal(calls, 4);
  }
});

test("AI separates salary cap boundaries in the cache and rejects invalid ones", async () => {
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  const saved = JSON.parse(encodeSave(advance(
    createGame(p, "steady", 42, 0, 0, 0, 0, 0, 0, 110), "rest")));
  delete saved.salaryCapFrom;
  assert.equal((await ai.generate(JSON.stringify(saved))).cached, false);
  assert.equal((await ai.generate(JSON.stringify({ ...saved, salaryCapFrom: 110 }))).cached, true);
  for (const salaryCapFrom of [0, 1]) {
    const explicit = JSON.stringify({ ...saved, salaryCapFrom });
    assert.equal((await ai.generate(explicit)).cached, false);
    assert.equal((await ai.generate(explicit)).cached, true);
  }
  assert.equal(calls, 3);
  for (const salaryCapFrom of [null, -1, 1.5, 111, "0"])
    await assert.rejects(() => ai.generate(JSON.stringify({ ...saved, salaryCapFrom })));
  assert.equal(calls, 3);
});

test("local model discovery uses fixed endpoints, filters cloud models, and rejects mistyped selections", async () => {
  const urls = [];
  const ai = makeAI({
    validateDestination: async () => {},
    transport: async (url) => {
      if (url.endsWith("/api/chat")) return { status: 200, text: ollamaText({ ok: true }) };
      urls.push(url);
      return {
        status: 200,
        text: JSON.stringify({
          models: [
            { name: "qwen3:8b", size: 5200000000 },
            { name: "qwen3:8b" },
            { name: "remote:cloud", remote_host: "https://example.com" },
            { name: "bad name" },
          ],
        }),
      };
    },
  });
  assert.deepEqual(await ai.models("ollama"), [
    { id: "qwen3:8b", size: 5200000000 },
  ]);
  assert.equal(urls[0], "http://127.0.0.1:11434/api/tags");
  await assert.rejects(() => ai.models("custom"));
  await assert.rejects(
    () => ai.configure({ provider: "ollama", model: "qwne3:8b" }),
    /一覧/,
  );
  assert.equal(
    (await ai.configure({ provider: "ollama", model: "qwen3:8b" })).model,
    "qwen3:8b",
  );
});

test("misread financial balances in generated prose never replace the authoritative result card", async () => {
  const ai = await readyAI(async (_url, options) => {
    const scene = replyFor(options, {
      body: "新しい仕事を試した。現金は789万円から211万円に減った。顧客の声を聞きながら、これまでの経験を次の取り組みにつなげる方法を考える一年だ。",
    });
    scene.options[0].hint = "受講料は999万円";
    return { status: 200, text: ollamaText(scene) };
  });
  const g = createGame(p),
    result = await ai.generate(encodeSave(g));
  assert.ok(!result.scene.body.includes("211万円"));
  assert.ok(!result.scene.options[0].hint.includes("999万円"));
  assert.match(result.scene.body, /顧客の声/);
  assert.equal(g.cash, 300);
});

test("OpenAI Luna uses the scene output allowance without hidden reasoning; other models keep their supported defaults", async () => {
  const requests = [];
  const ai = makeAI({
    validateDestination: async () => {},
    transport: async (_url, options) => {
      if (!isVerification(options)) requests.push(JSON.parse(options.body));
      return { status: 200, text: chatText(replyFor(options)) };
    },
  });
  for (const model of ["gpt-6-luna", "gpt-6-astra"]) {
    await ai.configure({
      provider: "openai", consent: true,
      baseURL: "https://api.openai.com/v1",
      model,
      apiKey: "synthetic-test-key",
      inputRate: 0.1,
      outputRate: 0.5,
      usdCap: 0.1,
      requestCap: 10,
    });
    await ai.generate(encodeSave(createGame(p)), true);
  }
  assert.equal(requests[0].reasoning_effort, "none");
  assert.equal(requests[0].max_completion_tokens, 1500);
  assert.equal(Object.hasOwn(requests[1], "reasoning_effort"), false);
  assert.equal(ai.status().calls, 2);
});

test("configuration locks discovery and verification; failed reconfiguration cannot leave an old connection ready", async () => {
  for (const stage of ["destination", "models", "verification"]) {
    const entered = Promise.withResolvers(), resume = Promise.withResolvers();
    let pausing = false;
    async function pause(at) { if (pausing && stage === at) { entered.resolve(); await resume.promise; } }
    const ai = makeAI({
      validateDestination: async () => pause("destination"),
      transport: async (url) => {
        await pause(url.endsWith("/api/tags") ? "models" : "verification");
        return { status: 200, text: url.endsWith("/api/tags")
          ? JSON.stringify({ models: [{ name: "qwen3:8b" }] }) : ollamaText({ ok: true }) };
      },
    });
    await ai.configure({ provider: "ollama", model: "qwen3:8b" });
    pausing = true;
    const configuring = ai.configure({ provider: "ollama", model: "qwen3:8b" });
    await entered.promise;
    assert.equal(ai.status().ready, false);
    assert.equal(ai.status().verifiedAt, null);
    assert.equal(ai.status().busy, true);
    await assert.rejects(ai.configure({ provider: "ollama" }), /生成中/);
    await assert.rejects(ai.generate(encodeSave(createGame(p))), /生成中/);
    resume.resolve();
    await configuring;
    assert.equal(ai.status().ready, true);
    assert.equal(ai.status().calls, 0);
    await assert.rejects(ai.configure({ provider: "ollama", model: "missing" }), /一覧/);
    assert.equal(ai.status().ready, false);
    assert.equal(ai.status().busy, false);
    await assert.rejects(ai.generate(encodeSave(createGame(p))), /接続を設定/);
  }
});

test("local connection refusals explain how to start each provider and restore the previous attempt budget", async () => {
  for (const provider of ["ollama", "lmstudio"]) {
    for (const refusal of [
      Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" }),
      new Error("connect ECONNREFUSED 127.0.0.1"),
      new Error("Connection refused"),
      new Error("fetch failed", { cause: { code: "ECONNREFUSED" } }),
    ]) {
      let failure = null;
      const ai = makeAI({
        validateDestination: async () => {},
        transport: async (_url, options) => {
          if (failure) throw failure;
          return {
            status: 200,
            text: JSON.stringify(
              !options.body
                ? {
                    models: [{ name: "test-model" }],
                    data: [{ id: "test-model" }],
                  }
                : provider === "ollama"
                  ? { message: { content: JSON.stringify(replyFor(options)) } }
                  : { choices: [{ message: { content: JSON.stringify(replyFor(options)) } }] },
            ),
          };
        },
      });
      await ai.configure({
        provider, consent: true,
        model: "test-model",
        inputRate: 0.1,
        outputRate: 0.5,
        requestCap: 2,
      });
      await ai.generate(encodeSave(createGame(p)));
      const before = ai.status(),
        save = encodeSave(createGame({ ...p, age: 31 })),
        message =
          provider === "ollama"
            ? /PC内のAI（Ollama）に接続できません。.*start.command.*ollama serve/
            : /PC内のAI（LM Studio）に接続できません。.*サーバーを起動/;
      assert.equal(before.reservedUSD, 0);
      failure = refusal;
      await assert.rejects(() => ai.generate(save), message);
      assert.equal(ai.status().calls, before.calls);
      assert.equal(ai.status().reservedUSD, before.reservedUSD);
      assert.equal(ai.status().busy, false);
      await assert.rejects(() => ai.models(), message);
      assert.equal(ai.status().calls, before.calls);
      failure = null;
      assert.equal((await ai.generate(save)).cached, false);
      assert.equal(ai.status().calls, 2);
    }
  }
});

test("timeouts, HTTP failures and cloud connection refusals keep their attempt and reserved cost", async () => {
  for (const [provider, failure, message] of [
    [
      "ollama",
      new Error("接続がタイムアウトしました。"),
      /AIの応答が120秒以内に終わりませんでした。より小さいモデルを選ぶか、時間をおいて再度お試しください。/,
    ],
    ["openai", new Error("接続がタイムアウトしました。"), /120秒/],
    ["ollama", { status: 503, text: "ECONNREFUSED" }, /HTTP 503/],
    [
      "openai",
      Object.assign(new Error("cloud refused"), { code: "ECONNREFUSED" }),
      /cloud refused/,
    ],
    ["ollama", new Error("connection reset"), /connection reset/],
  ]) {
    let requests = 0;
    const ai = makeAI({
      validateDestination: async () => {},
      transport: async (_url, options) => {
        if (!options.body)
          return {
            status: 200,
            text: JSON.stringify({ models: [{ name: "test-model" }] }),
          };
        if (isVerification(options)) return { status: 200, text: provider === "ollama" ? ollamaText({ ok: true }) : chatText({ ok: true }) };
        requests++;
        assert.equal(options.timeout, 120000);
        if (failure instanceof Error) throw failure;
        return failure;
      },
    });
    await ai.configure({
      provider, consent: true,
      model: "test-model",
      apiKey: provider === "openai" ? "synthetic-key" : "",
      inputRate: 0.1,
      outputRate: 0.5,
      requestCap: 1,
    });
    const save = encodeSave(createGame(p));
    await assert.rejects(() => ai.generate(save, true), message);
    assert.equal(ai.status().calls, 1);
    assert.equal(ai.status().reservedUSD > 0, provider === "openai");
    assert.equal(ai.status().busy, false);
    await assert.rejects(() => ai.generate(save, true), /上限/);
    assert.equal(requests, 1);
  }
});

test("AI output validation errors describe the rejected proposal while invalid user saves retain their own error", async () => {
  let invalid = true,
    requests = 0;
  const ai = await readyAI(async (_url, options) => {
    requests++;
    return {
      status: 200,
      text: ollamaText(
        invalid
          ? replyFor(options, { options: [{ id: "shell", label: "実行", hint: "不正" }] })
          : replyFor(options),
      ),
    };
  });
  const save = encodeSave(createGame(p));
  await assert.rejects(() => ai.generate(save), {
    message: "AIの提案がゲームの条件（実在企業の名前・選択肢の形式など）を満たさなかったため、採用しませんでした。",
  });
  assert.equal(requests, 1);
  assert.equal(ai.status().calls, 1);
  const invalidSave = JSON.stringify({
    ...JSON.parse(save),
    profile: { ...p, age: 17 },
  });
  await assert.rejects(() => ai.generate(invalidSave), {
    message: "入力内容・保存データの範囲と項目を確認してください。",
  });
  assert.equal(requests, 1);
  assert.equal(ai.status().calls, 1);
  invalid = false;
  assert.equal((await ai.generate(save)).scene.title, "学びを仕事へ");
  assert.equal(ai.status().calls, 2);
});

test("local and API caps remain separate; connection types cannot contradict providers", () => {
  for (const provider of ["ollama", "lmstudio"]) {
    assert.equal(configFrom({ provider }).requestCap, 1000);
    assert.equal(configFrom({ provider, requestCap: 5000 }).requestCap, 5000);
    assert.equal(configFrom({ provider, inputRate: 99, outputRate: 99 }).inputRate, 0);
    for (const requestCap of [5001, 0, 1.1]) assert.throws(() => configFrom({ provider, requestCap }));
    assert.throws(() => configFrom({ provider, type: "api" }));
  }
  const api = { provider: "openai", apiKey: "synthetic-key", inputRate: 1, outputRate: 1 };
  assert.equal(configFrom(api).requestCap, 100);
  assert.equal(configFrom(api).usdCap, 1);
  assert.equal(configFrom({ ...api, requestCap: 300 }).requestCap, 300);
  assert.throws(() => configFrom({ ...api, requestCap: 301 }));
});

for (const provider of ["ollama", "lmstudio", "openai", "openrouter", "custom"]) test(`${provider} configure requires real valid text; only API verification reserves cost and no game attempt`, async () => {
  let bodyCalls = 0, failure = null;
  const ai = makeAI({
    validateDestination: async () => {},
    transport: async (_url, options) => {
      if (!options.body) return { status: 200, text: JSON.stringify({ models: [{ name: "test-model" }], data: [{ id: "test-model" }] }) };
      bodyCalls++;
      assert.equal(ai.status().ready, false);
      assert.equal(ai.status().busy, true);
      assert.equal(options.timeout, ["ollama", "lmstudio"].includes(provider) ? 120000 : 90000);
      assert.equal(options.maxBytes, 16000);
      const payload = JSON.parse(options.body);
      assert.equal(payload.options?.num_predict ?? payload.max_completion_tokens ?? payload.max_tokens, 128);
      if (failure instanceof Error) throw failure;
      return { status: 200, text: provider === "ollama" ? ollamaText(failure ?? { ok: true }) : chatText(failure ?? { ok: true }) };
    },
  });
  const settings = { provider, baseURL: "https://example.com/v1", model: "test-model", apiKey: "synthetic-key", inputRate: 1, outputRate: 1, consent: true };
  const local = ["ollama", "lmstudio"].includes(provider);
  const state = await ai.configure(settings);
  assert.equal(bodyCalls, 1);
  assert.equal(state.ready, true);
  assert.ok(Number.isFinite(Date.parse(state.verifiedAt)));
  assert.ok(state.verificationSeconds >= 0);
  assert.equal(state.calls, 0);
  assert.equal(state.reservedUSD > 0, !local);
  const reserved = state.reservedUSD;
  for (failure of [{ ok: false }, { ok: true, extra: true }, "text", new Error("synthetic connection failure")]) {
    await assert.rejects(ai.configure(settings), /返答|文章|synthetic/);
    assert.equal(ai.status().ready, false);
    assert.equal(ai.status().verifiedAt, null);
    assert.equal(ai.status().calls, 0);
    assert.equal(ai.status().busy, false);
  }
  assert.equal(bodyCalls, 5);
  assert.equal(ai.status().reservedUSD > reserved, !local);
});

test("verification rejects missing consent and exhausted USD before any generation", async () => {
  let requests = 0;
  const ai = makeAI({ validateDestination: async () => {}, transport: async (_url, options) => {
    requests++;
    return { status: 200, text: chatText(replyFor(options)) };
  } });
  const config = { provider: "openai", model: "test", apiKey: "synthetic", inputRate: 10000, outputRate: 10000, usdCap: 0.001 };
  await assert.rejects(ai.configure(config), /同意/);
  await assert.rejects(ai.configure({ ...config, consent: true }), /上限/);
  assert.equal(requests, 0);
  assert.equal(ai.status().calls, 0);
  assert.equal(ai.status().reservedUSD, 0);
  assert.equal(ai.status().ready, false);
});

test("active scene generation rejects reconfiguration and parallel calls; switching verified models invalidates the old cache", async () => {
  const response = Promise.withResolvers();
  const requestedModels = [];
  const ai = makeAI({
    validateDestination: async () => {},
    transport: async (url, options) => {
      if (url.endsWith("/api/tags")) return { status: 200, text: JSON.stringify({ models: [{ name: "qwen3:8b" }, { name: "next-model" }] }) };
      if (isVerification(options)) return { status: 200, text: ollamaText({ ok: true }) };
      requestedModels.push(JSON.parse(options.body).model);
      await response.promise;
      return { status: 200, text: ollamaText(replyFor(options)) };
    },
  });
  await ai.configure({ provider: "ollama", model: "qwen3:8b" });
  const save = encodeSave(createGame(p)), generating = ai.generate(save);
  await assert.rejects(ai.configure({ provider: "ollama", model: "next-model" }), /生成中/);
  await assert.rejects(ai.generate(save), /生成中/);
  assert.equal(ai.status().model, "qwen3:8b");
  assert.equal(ai.status().ready, true);
  response.resolve();
  assert.equal((await generating).model, "qwen3:8b");
  assert.equal((await ai.generate(save)).cached, true);
  await ai.configure({ provider: "ollama", model: "next-model" });
  const next = await ai.generate(save);
  assert.equal(next.model, "next-model");
  assert.equal(next.cached, false);
  assert.equal((await ai.generate(save)).cached, true);
  assert.deepEqual(requestedModels, ["qwen3:8b", "next-model"]);
  assert.equal(ai.status().calls, 2);
});

test("a new graduate's first scene is told as the first year at work", () => {
  const p = optionalProfileInputs(profileInputForLevel({}, "quick", { band: "new", region: "city" }), PROFILE_DEFAULTS);
  const g = createGame(p, "steady", 7);
  const first = storyRequest(g, { mode: "life" });
  assert.equal(first.context.firstYearOfWork, true);
  assert.match(first.messages[0].content, /firstYearOfWorkがあれば社会人1年目/);
  assert.equal(storyRequest(advance(g, "focus"), { mode: "life" }).context.firstYearOfWork, undefined);
  assert.equal(storyRequest(createGame({ ...p, age: 35 }, "steady", 7), { mode: "life" }).context.firstYearOfWork, undefined);
  for (const occupation of ["student", "notWorking", "independent"]) {
    const other = optionalProfileInputs(profileInputForLevel({ age: 22, occupation }, "standard"), PROFILE_DEFAULTS);
    assert.equal(storyRequest(createGame(other, "steady", 7), { mode: "life" }).context.firstYearOfWork, undefined, occupation);
  }
});
