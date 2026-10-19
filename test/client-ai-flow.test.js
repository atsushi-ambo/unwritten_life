import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { createGame, advance, recordCareerReflection, encodeSave, isRetiredAt, applyScene, sceneKey, validateGeneratedScene } from "../public/engine.js";
import { groundScene } from "../public/story.js";

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
      $, game, aiState, isRetiredAt, encodeSave, generating: false, revision: 1,
      standalone: false, hosted, apiToken: "synthetic-csrf",
      crypto: { randomUUID: () => "synthetic-request-id" },
      needsCareerServerUpdate: () => false, needsChoiceServerUpdate: () => false,
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
  }
});

test("saving AI connection settings clears life and career cloud consent", async () => {
  const $ = elements(), updatedAI = { provider: "custom", model: "synthetic" };
  $("cloud-consent").checked = true;
  $("career-consent").checked = true;
  $("ai-provider").value = "custom";
  $("ai-model").value = "synthetic";
  let requests = 0, renders = 0, prevented = false;
  const context = createContext({
    $, aiState: { provider: "ollama" },
    api: async (path, settings) => {
      requests++;
      assert.equal(path, "/api/ai/config");
      assert.equal(settings.provider, "custom");
      return { ai: updatedAI };
    },
    renderAI() { renders++; }, toast() {},
  });
  loadHandler(context, '$("ai-form").addEventListener', "function openExchange(");
  await $("ai-form").submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(requests, 1);
  assert.equal(context.aiState, updatedAI);
  assert.equal(renders, 1);
  assert.equal($("ai-error").textContent, "");
  assert.equal($("ai-dialog").closed, true);
  assert.equal($("cloud-consent").checked, false);
  assert.equal($("career-consent").checked, false);
});

const ordinary = (id) => ({
  id, label: "資産9999万円を目指す", hint: "費用9999万円を考える",
  reason: "現在の経験と暮らしを踏まえて考える",
  decision: { id, intent: "経験と暮らしを大切にする" },
});

for (const mode of ["life", "career"]) {
  test(`manual ${mode} import grounds fabricated figures before storing the scene`, () => {
    const game = createGame({
      age: 32, region: "city", job: "tech", ai: "daily", priority: "balance",
      gender: "undisclosed", household: "solo", companyType: "small",
      company: "合成自社サービス社", workModel: "product",
    });
    const raw = {
      title: "資産9999万円の暮らし",
      body: "資産は9999万円になった。今の仕事で積み重ねてきた経験を振り返り、家族との時間や健康を大切にしながら、これからの働き方と暮らしを考える。",
      insight: "資産9999万円を確認する",
      options: mode === "life"
        ? ["studyDaily", "connect", "rest", "focus"].map(ordinary)
        : [
            ...["合成SaaS候補A", "合成銀行候補B", "合成研究候補C"].map((name) => ({
              ...ordinary("switch"),
              decision: {
                id: "switch", target: "custom", name, role: "tech",
                companyType: "unknown", candidateKind: "real", workModel: "product",
                proposal: "利用者と現場をつなぐサービスの改善を考える。",
                intent: "開発の経験を生かす",
              },
            })),
            ordinary("focus"),
          ],
    };
    const validated = validateGeneratedScene(raw, game, { personalized: true, mode });
    assert.match(validated.body, /9999万円/);
    const $ = elements();
    $("exchange-result").value = JSON.stringify(raw);
    let renders = 0, careerRenders = 0;
    const context = createContext({
      $, game, exchangeMode: mode, exchangeRevision: 7, revision: 7,
      careerDraft: null, validateGeneratedScene, groundScene, applyScene,
      renderCareerOffers() { careerRenders++; },
      renderGame() { renders++; }, toast() {},
    });
    loadHandler(context, '$("import-scene").addEventListener', "function downloadSave(");
    $("import-scene").click();
    assert.equal($("exchange-error").textContent, "");
    assert.equal($("exchange-dialog").closed, true);
    assert.equal(renders, 1);
    assert.equal(careerRenders, Number(mode === "career"));
    const imported = mode === "career"
      ? context.careerDraft.scene
      : context.game.scenes[sceneKey(game)];
    assert.ok(imported);
    assert.doesNotMatch(JSON.stringify(imported), /9999万円/);
    assert.deepEqual(JSON.parse(JSON.stringify(imported)), groundScene(validated, game));
    assert.match(imported.body, /今の仕事で積み重ねてきた経験/);
    if (mode === "career") assert.equal(context.careerDraft.revision, 7);
  });
}
