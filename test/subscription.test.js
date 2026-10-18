import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { makeSubscriptionCLI, subscriptionEnvironment, subscriptionArgs, parseSubscriptionReply, runSubscriptionProcess } from "../lib/subscription-ai.mjs";
import { makeAI, configFrom } from "../lib/ai.mjs";
import { createGame, encodeSave } from "../public/engine.js";

const claude = (patch = {}) => JSON.stringify({ subtype: "success", is_error: false, num_turns: 1, permission_denials: [], result: "完成", usage: { input_tokens: 10, output_tokens: 20 }, ...patch });
const codex = (items = [{ type: "agent_message", text: "完成" }]) => [...items.map((item) => ({ type: "item.completed", item })), { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 20 } }].map(JSON.stringify).join("\n");

test("CLI environment drops paid credentials, endpoints and startup injection; arguments are fixed", () => {
  const env = subscriptionEnvironment({ HOME: "/home/example", PATH: "/bin", OPENAI_API_KEY: "secret", ANTHROPIC_API_KEY: "secret", ANTHROPIC_AUTH_TOKEN: "secret", ANTHROPIC_BASE_URL: "https://example.invalid", NODE_OPTIONS: "--require=evil", CODEX_HOME: "/other", CLAUDE_CONFIG_DIR: "/other" });
  assert.equal(env.HOME, "/home/example");
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "NODE_OPTIONS", "CODEX_HOME", "CLAUDE_CONFIG_DIR"]) assert.equal(env[key], undefined);
  const c = subscriptionArgs("codex-cli"), a = subscriptionArgs("claude-cli");
  for (const arg of ["--ignore-user-config", "--ignore-rules", "--ephemeral", "read-only", 'forced_login_method="chatgpt"', 'web_search="disabled"']) assert.ok(c.includes(arg), arg);
  assert.equal(a[a.indexOf("--tools") + 1], "");
  assert.equal(a[a.indexOf("--max-turns") + 1], "1");
  assert.equal(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, "4096");
  assert.equal(env.CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK, "1");
  assert.ok(a.includes("--strict-mcp-config"));
  assert.ok(a.includes('{"disableAllHooks":true}'));
  assert.throws(() => subscriptionArgs("arbitrary-command"));
});

test("only completed text replies are accepted; tool operations and partial or repeated turns are rejected", () => {
  assert.equal(parseSubscriptionReply("claude-cli", claude()).content, "完成");
  assert.equal(parseSubscriptionReply("codex-cli", codex()).outputTokens, 20);
  for (const patch of [{ is_error: true }, { num_turns: 2 }, { permission_denials: [{}] }, { subtype: "error_max_budget_usd" }]) assert.throws(() => parseSubscriptionReply("claude-cli", claude(patch)));
  assert.throws(() => parseSubscriptionReply("codex-cli", codex([{ type: "command_execution", command: "bad" }])));
  assert.throws(() => parseSubscriptionReply("codex-cli", codex() + '\n{"type":"turn.failed"}'));
  assert.throws(() => parseSubscriptionReply("codex-cli", codex() + '\n{"type":"turn.completed"}'));
});

test("official subscription login is required before inference, stdin is data, isolated workspace is removed", async () => {
  for (const provider of ["codex-cli", "claude-cli"]) {
    let cwd, calls = 0;
    const cli = makeSubscriptionCLI({ run: async (_exe, args, options) => {
      cwd = options.cwd;
      await access(cwd);
      calls++;
      if (calls === 1) return provider === "codex-cli" ? "Logged in using ChatGPT" : JSON.stringify({ loggedIn: true, authMethod: "claude.ai", subscriptionType: "pro" });
      assert.equal(args.join(" ").includes("$(touch"), false);
      assert.ok(options.input.includes("$(touch imaginary)"));
      return provider === "codex-cli" ? codex() : claude();
    } });
    const result = await cli.generate({ provider, model: provider === "codex-cli" ? "gpt-6.1-sol" : "haiku", messages: [{ content: "$(touch imaginary)" }], schema: {} });
    assert.equal(result.choices[0].message.content, "完成");
    assert.equal(calls, 2);
    await assert.rejects(access(cwd), { code: "ENOENT" });
    let rejectedCalls = 0;
    const denied = makeSubscriptionCLI({ run: async () => { rejectedCalls++; return provider === "codex-cli" ? "Logged in using an API key" : JSON.stringify({ loggedIn: true, authMethod: "api_key", subscriptionType: "pro" }); } });
    await assert.rejects(denied.generate({ provider, model: provider === "codex-cli" ? "gpt-6.1-sol" : "haiku", messages: [], schema: {} }), /ログイン/);
    assert.equal(rejectedCalls, 1);
  }
});

test("real child process transport bounds output and runtime, hides failures and preserves UTF-8", async () => {
  assert.equal(await runSubscriptionProcess(process.execPath, ["-e", 'process.stdin.resume();process.stdout.write("文章")'], { input: "data" }), "文章");
  await assert.rejects(runSubscriptionProcess(process.execPath, ["-e", 'process.stdout.write("x".repeat(2000))'], { maxBytes: 100 }), /容量/);
  await assert.rejects(runSubscriptionProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeout: 80 }), /制限時間/);
  await assert.rejects(runSubscriptionProcess(process.execPath, ["-e", 'process.stderr.write("secret");process.exit(1)']), (e) => !e.message.includes("secret") && /切り替えません/.test(e.message));
});

const profile = { age: 30, region: "city", job: "tech", income: 500, ai: "sometimes", priority: "balance", gender: "undisclosed", household: "solo", savings: 300, monthlyCost: 12, companyType: "unknown", company: "架空会社" };
const scene = { title: "学びを仕事へ", body: "会社と暮らしを考え、次の一年を選ぶ。", insight: "これは仮想の場面。", options: ["learn", "rest", "connect"].map((id) => ({ id, label: id, hint: "時間の配分" })) };
test("CLI shares consent, cache and attempt limits with AI; no HTTP fallback and no key carryover", async () => {
  for (const provider of ["codex-cli", "claude-cli"]) {
    let checks = 0, inference = 0;
    const ai = makeAI({
      transport: () => assert.fail("must not call API"), validateDestination: () => assert.fail("must not validate an API destination"),
      subscription: { check: async () => { checks++; }, generate: async () => { inference++; return { choices: [{ message: { content: JSON.stringify(scene) } }] }; } },
    });
    assert.equal(configFrom({ provider, requestCap: 200 }, "old-api-key").apiKey, "");
    assert.equal(configFrom({ provider, requestCap: 200 }).requestCap, 20);
    assert.throws(() => configFrom({ provider, apiKey: "key" }));
    assert.throws(() => configFrom({ provider, model: "other" }));
    await ai.configure({ provider, requestCap: 1 });
    assert.equal(checks, 1);
    const save = encodeSave(createGame(profile));
    await assert.rejects(ai.generate(save), /同意/);
    assert.equal(inference, 0);
    assert.equal(ai.status().calls, 0);
    await ai.generate(save, true);
    assert.equal((await ai.generate(save, true)).cached, true);
    await assert.rejects(ai.generate(encodeSave(createGame({ ...profile, age: 31 })), true), /上限/);
    assert.equal(inference, 1);
    assert.equal(ai.status().reservedUSD, 0);
  }
});

test("failed CLI generation consumes an attempt, does not retry and releases busy", async () => {
  let calls = 0;
  const ai = makeAI({ transport: () => assert.fail("no HTTP fallback"), subscription: { check: async () => {}, generate: async () => { calls++; throw Error("CLI unavailable"); } } });
  await ai.configure({ provider: "codex-cli", requestCap: 1 });
  const save = encodeSave(createGame(profile));
  await assert.rejects(ai.generate(save, true), /CLI unavailable/);
  await assert.rejects(ai.generate(save, true), /上限/);
  assert.equal(calls, 1);
  assert.equal(ai.status().busy, false);
});
