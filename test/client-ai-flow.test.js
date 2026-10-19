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

test("direct life and career requests omit private reflections and preserve the local record", async () => {
  const initial = createGame({
    age: 29, region: "city", job: "tech", ai: "daily", priority: "balance",
    gender: "undisclosed", household: "solo", companyType: "small",
  });
  const game = recordCareerReflection(advance(initial, "rest"), "age-30", "PRIVATE_REFLECTION");
  for (const mode of ["life", "career"]) {
    const $ = elements();
    const aiState = { provider: "ollama", cloud: false };
    let requests = 0;
    const context = createContext({
      $, game, aiState, isRetiredAt, encodeSave, recordCareerSeen, generating: false, revision: 1,
      aiReady: () => true, generationError: "", careerError: "", persist() {},
      performance: { now: () => 0 }, setInterval: () => 0, clearInterval() {},
      connectionKey: () => "synthetic", document: { querySelectorAll: () => [] },
      renderAI() {}, renderGame() {}, renderCareerOffers() {}, renderAITiming() {}, toast() {}, status: async () => {},
      api: async (path, body) => {
        requests++;
        assert.equal(path, "/api/scene");
        assert.equal(body.mode, mode);
        assert.deepEqual(JSON.parse(body.save).reflections, {});
        assert.doesNotMatch(JSON.stringify(body), /PRIVATE_REFLECTION/);
        throw Error("Synthetic provider failure");
      },
    });
    if (mode === "life") loadHandler(context, "async function generateScene()", "function openComparison()");
    else loadHandler(context, "async function generateCareerChoices()", '$("career-generate").addEventListener');
    await runInContext(mode === "life" ? "generateScene()" : "generateCareerChoices()", context);
    assert.equal(requests, 1);
    assert.equal(context.game.reflections["age-30"], "PRIVATE_REFLECTION");
    // A failed generation is shown with a retry; nothing falls back to rule options.
    assert.match(context[mode === "life" ? "generationError" : "careerError"], /Synthetic provider failure/);
  }
});

test("cloud AI needs consent; a connected AI is remembered without its key and resumes the pending start", async () => {
  const $ = elements(), stored = new Map();
  $("ai-provider").value = "openai";
  $("ai-model").value = "synthetic";
  $("ai-key").value = "synthetic-test-key";
  let requests = 0, started = 0, prevented = false;
  const context = createContext({
    $, aiState: { provider: "ollama", ready: false }, cloudConsented: false,
    pendingStart: () => started++, game: null,
    localStorage: { setItem: (k, v) => stored.set(k, v) },
    aiSettingsKey: "unwritten-life:ai", URL,
    api: async (path, settings) => {
      requests++;
      assert.equal(path, "/api/ai/config");
      assert.equal(settings.apiKey, "synthetic-test-key");
      return { ai: { provider: "openai", model: "synthetic", cloud: true, ready: true } };
    },
    renderAI() {}, toast() {},
  });
  loadHandler(context, "function cloudChoice()", "function renderConsent()");
  loadHandler(context, "async function configureAI(", "// Local AI and subscription CLIs");
  await $("ai-form").submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(requests, 0);
  assert.match($("ai-error").textContent, /同意/);
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
