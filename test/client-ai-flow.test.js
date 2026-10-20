import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { createGame, advance, recordCareerReflection, recordCareerSeen, encodeSave, isRetiredAt } from "../public/engine.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

function elements() {
  const entries = new Map();
  return (id) => {
    if (!entries.has(id)) entries.set(id, {
      value: "", checked: false, textContent: "", closed: false,
      addEventListener(type, handler) { this[type] = handler; },
      close() { this.closed = true; },
    });
    return entries.get(id);
  };
}

function loadHandler(context, start, end) {
  const from = app.indexOf(start), to = app.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  runInContext(app.slice(from, to), context);
}

for (const hosted of [false, true]) test(`${hosted ? "hosted" : "PC"} life and career HTTP saves omit private reflections and preserve the local record`, async () => {
  const initial = createGame({
    age: 29, region: "city", job: "tech", ai: "daily", priority: "balance",
    gender: "undisclosed", household: "solo", companyType: "small",
  });
  const game = recordCareerReflection(advance(initial, "rest"), "age-30", "PRIVATE_REFLECTION");
  for (const mode of ["life", "career"]) {
    const $ = elements();
    const aiState = { provider: hosted ? "openai" : "ollama", cloud: hosted };
    $("cloud-consent").checked = true;
    $("career-consent").checked = true;
    const requests = [];
    const context = createContext({
      $, game, aiState, serverStale: false, isRetiredAt, encodeSave, recordCareerSeen, generating: false, revision: 1,
      hosted, apiToken: "synthetic-csrf",
      crypto: { randomUUID: () => "synthetic-request-id" },
      aiReady: () => true, generationError: "", careerError: "", persist() {},
      performance: { now: () => 0 }, setInterval: () => 0, clearInterval() {},
      connectionKey: () => "synthetic", document: { querySelectorAll: () => [] },
      renderAI() {}, renderGame() {}, renderCareerOffers() {}, renderAITiming() {}, toast() {}, status: async () => {},
      fetch: async (path, options) => {
        requests.push({ path, options });
        throw Error("Synthetic provider failure");
      },
    });
    loadHandler(context, "async function api(", "function readStoredGame(");
    if (mode === "life") loadHandler(context, "async function generateScene()", "function openComparison()");
    else loadHandler(context, "async function generateCareerChoices()", '$("career-generate").addEventListener');
    await runInContext(mode === "life" ? "generateScene()" : "generateCareerChoices()", context);
    assert.equal(requests.length, 1);
    const { path, options } = requests[0], body = JSON.parse(options.body);
    assert.equal(path, "/api/scene");
    assert.equal(options.headers["X-Unwritten-Token"], "synthetic-csrf");
    assert.equal(body.requestId, hosted ? "synthetic-request-id" : undefined);
    assert.equal(body.cloudConsent, true);
    assert.equal(body.mode, mode);
    assert.deepEqual(JSON.parse(body.save).reflections, {});
    assert.doesNotMatch(options.body, /PRIVATE_REFLECTION/);
    assert.equal(context.game.reflections["age-30"], "PRIVATE_REFLECTION");
    // A failed generation is shown with a retry; nothing falls back to rule options.
    assert.match(context[mode === "life" ? "generationError" : "careerError"], /Synthetic provider failure/);
  }
});

test("AI requires a connection type and cloud consent; a connected AI is remembered without its key and resumes the pending start", async () => {
  const $ = elements(), stored = new Map();
  $("ai-provider").value = "openai";
  $("ai-model").value = "synthetic";
  $("ai-key").value = "synthetic-test-key";
  $("ai-request-cap").value = "100";
  let requests = 0, started = 0, prevented = false;
  const context = createContext({
    $, aiState: { provider: "ollama", ready: false }, cloudConsented: false,
    pendingStart: () => started++, game: null, aiTesting: false, serverStale: false,
    status: async () => {},
    localStorage: { setItem: (k, v) => stored.set(k, v) },
    aiSettingsKey: "unwritten-life:ai", URL,
    api: async (path, settings) => {
      requests++;
      assert.equal(path, "/api/ai/config");
      assert.equal(settings.apiKey, "synthetic-test-key");
      return { ai: { provider: "openai", model: "synthetic", cloud: true, ready: true, verifiedAt: "2026-10-19T00:00:00.000Z", verificationSeconds: 0.25 } };
    },
    renderAI() {}, toast() {},
  });
  loadHandler(context, "const providerChoices =", "function readAISettings()");
  loadHandler(context, "function cloudChoice()", "function renderConsent()");
  loadHandler(context, "async function configureAI(", "// Local AI and subscription CLIs");
  await $("ai-form").submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(requests, 0);
  assert.match($("ai-error").textContent, /接続方式/);
  $("ai-type-api").checked = true;
  await $("ai-form").submit({ preventDefault() {} });
  assert.equal(requests, 0);
  assert.match($("ai-error").textContent, /同意/);
  $("ai-key").value = "synthetic-test-key";
  $("ai-consent").checked = true;
  await $("ai-form").submit({ preventDefault() {} });
  assert.equal(requests, 1);
  assert.equal(context.cloudConsented, true);
  assert.equal($("ai-dialog").closed, true);
  assert.equal(started, 1);
  const remembered = stored.get("unwritten-life:ai");
  assert.doesNotMatch(remembered, /synthetic-test-key/);
  assert.equal(JSON.parse(remembered).consent, true);
  assert.equal($("ai-key").value, "");
});

test("type selection filters providers and never selects a type for a new user", () => {
  const $ = elements();
  for (const id of ["ai-provider", "ai-subscription-model"]) {
    $(id).children = [];
    $(id).replaceChildren = function () { this.children = []; };
    $(id).append = function (option) { this.children.push(option); };
  }
  const context = createContext({ $, node: (_tag, textContent) => ({ textContent }), renderConsent() {}, refreshModels() {} });
  loadHandler(context, "const providerChoices =", "function readAISettings()");
  runInContext('selectConnectionType("")', context);
  assert.equal(runInContext("selectedConnectionType()", context), "");
  assert.equal($("ai-provider").disabled, true);
  for (const [type, expected] of [["local", ["ollama", "lmstudio"]], ["subscription", ["codex-cli", "claude-cli"]], ["api", ["openai", "openrouter", "custom"]]]) {
    runInContext(`selectConnectionType(${JSON.stringify(type)})`, context);
    assert.equal(runInContext("selectedConnectionType()", context), type);
    assert.deepEqual($("ai-provider").children.map((o) => o.value), ["", ...expected]);
    assert.equal($("ai-provider").value, "");
    assert.equal($("ai-provider").disabled, false);
  }
});

test("verification shows progress, disables repeat submits, and resumes only after success; failures keep the dialog open", async () => {
  for (const success of [true, false]) {
    const $ = elements(), response = Promise.withResolvers();
    let started = 0, requests = 0;
    $("ai-type-local").checked = true;
    $("ai-provider").value = "ollama";
    $("ai-local-model").value = "synthetic";
    $("ai-request-cap").value = "1000";
    const context = createContext({
      $, aiState: { ready: false }, aiTesting: false, serverStale: false, cloudConsented: false,
      pendingStart: () => started++, game: null, status: async () => {},
      api: async () => { requests++; return response.promise; },
      localStorage: { setItem() {} }, aiSettingsKey: "synthetic", URL, renderAI() {}, toast() {},
    });
    loadHandler(context, "const providerChoices =", "function readAISettings()");
    loadHandler(context, "function cloudChoice()", "function renderConsent()");
    loadHandler(context, "async function configureAI(", "// Local AI and subscription CLIs");
    const submitting = $("ai-form").submit({ preventDefault() {} });
    await Promise.resolve();
    assert.equal($("ai-submit").disabled, true);
    assert.match($("ai-test-status").textContent, /接続を確認しています…AIに短い文章/);
    assert.equal(started, 0);
    await $("ai-form").submit({ preventDefault() {} });
    assert.equal(requests, 1);
    if (success) response.resolve({ ai: { ready: true, verifiedAt: "2026-10-19", model: "synthetic", verificationSeconds: 1.25 } });
    else response.reject(new Error("synthetic model unavailable"));
    await submitting;
    assert.equal(started, Number(success));
    assert.equal($("ai-submit").disabled, false);
    assert.equal($("ai-dialog").closed, success);
    if (success) assert.match($("ai-test-status").textContent, /synthetic.*1.3秒/);
    else assert.match($("ai-error").textContent, /synthetic model unavailable/);
  }
});

test("stale status blocks game start and all PC API calls while hosted status needs no serverRevision", async () => {
  for (const hosted of [false, true]) {
    const $ = elements();
    let requests = 0, settings = 0;
    const context = createContext({
      $, hosted, serverStale: false, apiToken: "", aiState: null, staleNotice: "アプリが更新されています。", renderAI() {},
      fetch: async () => { requests++; return { ok: true, json: async () => ({ token: "synthetic", ai: { ready: true }, stale: true }) }; },
      toast() {}, aiReady: () => true, openAISettings: () => { settings++; },
    });
    loadHandler(context, "async function status()", "function readStoredGame()");
    await runInContext("status()", context);
    assert.equal(context.serverStale, !hosted);
    assert.equal($("server-update-notice").hidden, hosted);
    if (!hosted) {
      await assert.rejects(runInContext('api("/api/scene", {})', context), /アプリが更新/);
      loadHandler(context, "function showGame(", "function stat(");
      runInContext("showGame()", context);
      assert.equal(settings, 0);
      assert.equal(requests, 1);
    }
  }
});

test("restoreAI reruns generation verification even when the server is already ready", async () => {
  for (const provider of ["ollama", "claude-cli", "openai"]) {
    let configured = 0;
    const saved = { provider, model: "synthetic", baseURL: "https://example.com/v1", consent: true };
    const context = createContext({
      $: elements(), hosted: false, serverStale: false, aiState: { ...saved, ready: true, cloud: true },
      readAISettings: () => saved, renderAI() {},
      configureAI: async (settings) => { assert.equal(settings.provider, provider); assert.equal(settings.apiKey ?? "", ""); configured++; },
    });
    loadHandler(context, "async function restoreAI()", "function downloadSave(");
    await runInContext("restoreAI()", context);
    assert.equal(configured, 1);
  }
});

test("legacy forced subscription cap is raised while explicit new preferences are preserved", () => {
  for (const [saved, expected] of [
    [{ provider: "claude-cli", requestCap: 20 }, 1000],
    [{ provider: "codex-cli", requestCap: 20 }, 1000],
    [{ provider: "claude-cli", type: "subscription", requestCap: 20 }, 20],
    [{ provider: "openai", requestCap: 20 }, 20],
  ]) {
    const context = createContext({ aiSettingsKey: "synthetic", localStorage: { getItem: () => JSON.stringify(saved) } });
    loadHandler(context, "function readAISettings()", "function cloudChoice()");
    assert.equal(runInContext("readAISettings().requestCap", context), expected);
  }
});
