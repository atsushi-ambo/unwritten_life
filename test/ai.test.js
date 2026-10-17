import test from "node:test";
import assert from "node:assert/strict";
import { makeAI, configFrom } from "../lib/ai.mjs";
import { publicAddress, destination, requestText } from "../lib/network.mjs";
import { createGame, encodeSave, advance } from "../public/engine.js";
import { storyRequest } from "../public/story.js";
import http from "node:http";
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
const scene = {
  title: "学びを仕事へ",
  body: "会社と暮らしを考え、次の一年を選ぶ。",
  insight: "これは仮想の場面。",
  options: ["learn", "rest", "connect"].map((id) => ({
    id,
    label: id,
    hint: "時間の配分",
  })),
};
test("actual local HTTP model transport parses a valid response and cache prevents another call", async (t) => {
  let calls = 0;
  const mock = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const data = JSON.parse(body);
    assert.equal(data.model, "test-model");
    assert.equal(data.messages[0].role, "system");
    calls++;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(scene) } }],
      }),
    );
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
  assert.equal(a.scene.title, scene.title);
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
    transport: async () => ({
      status: 200,
      text: JSON.stringify({
        choices: [{ message: { content: JSON.stringify(scene) } }],
      }),
    }),
  });
  await ai.configure({
    provider: "openai",
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
  const ai = makeAI({
    transport: async () => {
      calls++;
      return {
        status: 200,
        text: JSON.stringify({ message: { content: "not JSON" } }),
      };
    },
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
  await assert.rejects(() => destination("http://localhost:4317", true));
  assert.throws(() =>
    configFrom({
      provider: "openai",
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
  const ai = makeAI({
    transport: async (_url, options) => {
      const payload = JSON.parse(options.body);
      contexts.push(JSON.parse(payload.messages[1].content));
      return {
        status: 200,
        text: JSON.stringify({ message: { content: JSON.stringify(scene) } }),
      };
    },
  });
  const g = createGame(p, "steady", 42);
  const real = advance(g, { id: "switch", target: "microsoft", role: "tech" });
  const other = advance(g, { id: "switch", target: "toyota", role: "tech" });
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
  assert.equal(contexts[0].currentEmployer, "Microsoft");
  assert.match(contexts[0].companyEvidence.sources[0].url, /microsoft/);
  assert.equal(contexts[1].currentEmployer, "トヨタ自動車");
  assert.equal(contexts[2].career.kind, "venture");
  assert.equal(contexts[2].currentEmployer, "合成事業");
  assert.equal(contexts[2].companyEvidence, null);
});

test("local model discovery uses fixed endpoints, filters cloud models, and rejects mistyped selections", async () => {
  const urls = [];
  const ai = makeAI({
    validateDestination: async () => {},
    transport: async (url) => {
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
  const ai = makeAI({
    transport: async () => ({
      status: 200,
      text: JSON.stringify({
        message: {
          content: JSON.stringify({
            ...scene,
            body: "新しい仕事を試した。現金は789万円から211万円に減った。顧客の声を聞きながら、これまでの経験を次の取り組みにつなげる方法を考える一年だ。",
            options: scene.options.map((o, i) =>
              i ? o : { ...o, hint: "受講料は999万円" },
            ),
          }),
        },
      }),
    }),
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
      requests.push(JSON.parse(options.body));
      return {
        status: 200,
        text: JSON.stringify({
          choices: [{ message: { content: JSON.stringify(scene) } }],
        }),
      };
    },
  });
  for (const model of ["gpt-6-luna", "gpt-6-astra"]) {
    await ai.configure({
      provider: "openai",
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

test("configuration rechecks busy after destination and model discovery, preserving the active model and cache", async () => {
  for (const stage of ["destination", "models"]) {
    const validating = Promise.withResolvers(),
      resumeValidation = Promise.withResolvers(),
      inference = Promise.withResolvers(),
      requestedModels = [];
    const ai = makeAI({
      validateDestination: async () => {
        if (stage === "destination") {
          validating.resolve();
          await resumeValidation.promise;
        }
      },
      transport: async (url, options) => {
        if (url.endsWith("/api/tags")) {
          if (stage === "models") {
            validating.resolve();
            await resumeValidation.promise;
          }
          return {
            status: 200,
            text: JSON.stringify({ models: [{ name: "next-model" }] }),
          };
        }
        requestedModels.push(JSON.parse(options.body).model);
        return inference.promise;
      },
    });
    const configuring = ai.configure({ provider: "ollama", model: "next-model" });
    const rejected = assert.rejects(configuring, {
      message: "生成中です。完了後に設定を変更してください。",
    });
    await validating.promise;
    const save = encodeSave(createGame(p));
    const generating = ai.generate(save);
    assert.equal(ai.status().busy, true);
    resumeValidation.resolve();
    await rejected;
    assert.equal(ai.status().model, "qwen3:8b");
    await assert.rejects(
      () => ai.configure({ provider: "disabled" }),
      /生成中です。完了後に設定を変更してください。/,
    );
    inference.resolve({
      status: 200,
      text: JSON.stringify({ message: { content: JSON.stringify(scene) } }),
    });
    const result = await generating;
    assert.equal(result.model, "qwen3:8b");
    assert.equal((await ai.generate(save)).cached, true);
    assert.deepEqual(requestedModels, ["qwen3:8b"]);
    await ai.configure({ provider: "ollama", model: "next-model" });
    const next = await ai.generate(save);
    assert.equal(next.model, "next-model");
    assert.equal(next.cached, false);
    assert.equal((await ai.generate(save)).cached, true);
    assert.deepEqual(requestedModels, ["qwen3:8b", "next-model"]);
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
                  ? { message: { content: JSON.stringify(scene) } }
                  : { choices: [{ message: { content: JSON.stringify(scene) } }] },
            ),
          };
        },
      });
      await ai.configure({
        provider,
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
      assert.ok(before.reservedUSD > 0);
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
        requests++;
        assert.equal(options.timeout, 120000);
        if (failure instanceof Error) throw failure;
        return failure;
      },
    });
    await ai.configure({
      provider,
      model: "test-model",
      apiKey: provider === "openai" ? "synthetic-key" : "",
      inputRate: 0.1,
      outputRate: 0.5,
      requestCap: 1,
    });
    const save = encodeSave(createGame(p));
    await assert.rejects(() => ai.generate(save, true), message);
    assert.equal(ai.status().calls, 1);
    assert.ok(ai.status().reservedUSD > 0);
    assert.equal(ai.status().busy, false);
    await assert.rejects(() => ai.generate(save, true), /上限/);
    assert.equal(requests, 1);
  }
});

test("AI output validation errors describe the rejected proposal while invalid user saves retain their own error", async () => {
  let content = {
      ...scene,
      options: [{ id: "shell", label: "実行", hint: "不正" }],
    },
    requests = 0;
  const ai = makeAI({
    transport: async () => {
      requests++;
      return {
        status: 200,
        text: JSON.stringify({ message: { content: JSON.stringify(content) } }),
      };
    },
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
  content = scene;
  assert.equal((await ai.generate(save)).scene.title, scene.title);
  assert.equal(ai.status().calls, 2);
});
