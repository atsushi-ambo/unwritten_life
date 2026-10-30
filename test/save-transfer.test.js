import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { File } from "node:buffer";
import { createContext, runInContext } from "node:vm";
import { parse } from "parse5";
import {
  createGame, advance, advanceYears, advanceDirection, previousDirectionStep, optionalProfileInputs, profileInputForLevel,
  encodeSave, decodeSave, availableChoices, decisionId, replay, recordCareerReflection, careerSeenUntil,
} from "../public/engine.js";
import { bookBaseline } from "../public/book.js";
import { careerMilestones, pendingCareerReflection } from "../public/careers.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const saveKey = "unwritten-life:v2";
// Chance incidents are off so multi-year cases are not paused by luck.
const initial = () => createGame(
  optionalProfileInputs({ ...profileInputForLevel({}, "quick"), age: 30 }), "steady", 42,
  0, 0, 0, 0, 0, 0, 0, 110,
);
const file = (raw) => new File([raw], "save.json", { type: "application/json" });

// Execute the real storage, import/export and resume-render functions against
// synthetic saves only. No personal browser data or external requests are used.
function harness({ game = null, remember = false, stored = {} } = {}) {
  const elements = new Map(), downloads = [], revoked = [], timers = [], notices = [];
  const storage = new Map(Object.entries(stored));
  let rendered = 0;
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, checked: false, value: "", files: [], textContent: "",
      listeners: {}, open: false,
      addEventListener(type, handler) { this.listeners[type] = handler; },
      showModal() { this.open = true; },
      close() { this.open = false; this.listeners.close?.(); },
      focus() {},
      scrollIntoView(options) { this.scrolls = [...(this.scrolls ?? []), options]; },
      click() { return this.listeners.click?.(); },
    });
    return elements.get(id);
  };
  $("game").hidden = !game;
  $("remember").checked = remember;
  const context = createContext({
    $, game, remember, savedGame: null, corruptSave: null,
    pendingImportedGame: null, saveImportRevision: 0,
    generating: false, revision: 0, lastJourney: null,
    saveKey, bookSeen: new Set(), bookBaseline, encodeSave, decodeSave, Blob, careerMilestones, pendingCareerReflection, recordCareerReflection,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    URL: {
      createObjectURL: (blob) => { downloads.push({ blob }); return "blob:synthetic"; },
      revokeObjectURL: (url) => revoked.push(url),
    },
    node: () => ({
      click() { Object.assign(downloads.at(-1), { filename: this.download, href: this.href }); },
    }),
    setTimeout: (fn) => timers.push(fn),
    toast: (message) => notices.push(message),
    window: { scrollTo() {} },
    maybeGenerateScene() {},
    aiReady: () => true, hosted: false, serverStale: false, generationError: "",
    moveToStory() {}, resetTimeline() {}, timelineRevealing: () => false, scheduleYear() {},
    renderGame() { rendered++; runInContext("persist()", context); },
  });
  for (const [start, end] of [
    ["function readStoredGame()", "function readProfile()"],
    ["function showGame(", "function stat("],
    ["function downloadSave(", 'if (hosted) {\n  $("ai-form").hidden'],
  ]) runInContext(app.slice(app.indexOf(start), app.indexOf(end)), context);
  return {
    $, context, storage, downloads, revoked, timers, notices,
    get rendered() { return rendered; },
    async importFile(input) {
      $("import-save-file").files = [input];
      $("import-save-file").value = "synthetic-path";
      await $("import-save-file").listeners.change();
      assert.equal($("import-save-file").value, "");
    },
  };
}

test("current and stored saves export JSON and round-trip through the actual file handler with saving off", async () => {
  const game = advanceYears(initial(), "studyDaily", 5).game;
  const source = harness({ game });
  source.$("game-export-save").click();
  const download = source.downloads[0];
  assert.match(download.filename, /^unwritten-life-save-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(download.blob.type, "application/json");
  const raw = await download.blob.text();
  assert.deepEqual(decodeSave(raw), game);
  source.timers.forEach((fn) => fn());
  assert.deepEqual(source.revoked, ["blob:synthetic"]);
  assert.equal(source.storage.size, 0);

  const target = harness();
  await target.importFile(file(raw));
  assert.deepEqual(target.context.game, game);
  assert.equal(target.$("setup").hidden, true);
  assert.equal(target.$("game").hidden, false);
  assert.equal(target.rendered, 1);
  assert.equal(target.storage.size, 0);
  assert.equal(target.context.remember, false);
  assert.match(target.$("save-status").textContent, /保存オフ/);

  const stored = harness({ stored: { [saveKey]: raw } });
  runInContext("readStoredGame()", stored.context);
  stored.$("export-save").click();
  assert.equal(await stored.downloads[0].blob.text(), raw);
});

test("import at a checkpoint does not open a blocking dialog or prevent the next scene", async () => {
  const game = advance(createGame({ ...initial().profile, age: 29 }), "rest");
  const h = harness({ remember: true });
  let requests = 0;
  h.context.maybeGenerateScene = () => { requests++; };
  await h.importFile(file(encodeSave(game)));
  assert.equal(requests, 1);
  assert.equal(h.$("reflection-dialog").open, false);
  assert.deepEqual(decodeSave(h.storage.get(saveKey)), game);
});

test("import persists only with the existing remember option and requires confirmation before replacing a game", async () => {
  const game = initial(), imported = advance(game, "studyDaily");
  const raw = encodeSave(game);
  const h = harness({ game, remember: true, stored: { [saveKey]: raw } });
  await h.importFile(file(encodeSave(imported)));
  assert.equal(h.$("save-import-dialog").open, true);
  assert.match(h.$("save-import-description").textContent, /2027年/);
  assert.equal(h.context.game, game);
  assert.equal(h.storage.get(saveKey), raw);
  assert.equal(h.rendered, 0);
  h.$("save-import-dialog").close();
  h.$("save-import-confirm").click();
  assert.equal(h.context.game, game);
  assert.equal(h.rendered, 0);

  await h.importFile(file(encodeSave(imported)));
  h.$("save-import-confirm").click();
  assert.deepEqual(h.context.game, imported);
  assert.deepEqual(decodeSave(h.storage.get(saveKey)), imported);
  assert.equal(h.$("save-import-dialog").open, false);
  assert.equal(h.rendered, 1);

  const fresh = harness({ remember: true });
  await fresh.importFile(file(encodeSave(imported)));
  assert.deepEqual(decodeSave(fresh.storage.get(saveKey)), imported);
});

test("import with saving off preserves existing stored data even after overwrite confirmation", async () => {
  const game = initial(), raw = encodeSave(game);
  const h = harness({ game, stored: { [saveKey]: raw } });
  await h.importFile(file(encodeSave(advance(game, "rest"))));
  h.$("save-import-confirm").click();
  assert.equal(h.context.game.year, 2027);
  assert.equal(h.storage.get(saveKey), raw);
  assert.equal(h.context.remember, false);
});

const tampered = JSON.parse(encodeSave(initial()));
tampered.decisions = [{ id: "switch", target: "__proto__", role: "tech" }];
for (const [name, input] of [
  ["oversized file", { size: 1024 * 1024 + 1, text() { assert.fail("oversized file must not be read"); } }],
  ["malformed JSON", file('{"version":')],
  ["tampered save", file(JSON.stringify(tampered))],
  ["save above decodeSave's stricter text limit", file(encodeSave(initial()) + " ".repeat(250000))],
]) {
  test(`${name} is rejected without replacing or persisting the game`, async () => {
    const game = initial(), raw = encodeSave(game);
    const h = harness({ game, remember: true, stored: { [saveKey]: raw } });
    await h.importFile(input);
    assert.equal(h.context.game, game);
    assert.equal(h.context.pendingImportedGame, null);
    assert.equal(h.storage.get(saveKey), raw);
    assert.equal(h.rendered, 0);
    assert.equal(h.$("save-import-dialog").open, false);
    assert.match(h.notices.at(-1), /1 MB以下|セーブを読み込めません/);
  });
}

test("a corrupt v2 save still exposes the legacy banner and exports the exact raw string for recovery", async () => {
  const raw = '{"version":2,"壊れたデータ":"<script>そのまま救出</script>"';
  const h = harness({ stored: { [saveKey]: raw, "unwritten-life:v1": '{"old":true}' } });
  runInContext("readStoredGame()", h.context);
  assert.equal(h.context.savedGame, null);
  assert.equal(h.$("resume-banner").hidden, true);
  assert.equal(h.$("legacy-banner").hidden, false);
  assert.equal(h.$("corrupt-save-banner").hidden, false);
  h.$("export-corrupt-save").click();
  assert.equal(await h.downloads[0].blob.text(), raw);
  assert.equal(h.downloads[0].filename, "unwritten-life-save-recovery.json");
  assert.equal(h.storage.get(saveKey), raw);
  h.$("export-legacy").click();
  assert.equal(await h.downloads[1].blob.text(), '{"old":true}');
  runInContext("removeSave()", h.context);
  assert.equal(h.$("corrupt-save-banner").hidden, true);
});

test("a v2 storage read failure does not prevent the independent v1 backup check", () => {
  const h = harness();
  h.context.localStorage.getItem = (key) => {
    if (key === saveKey) throw Error("unavailable");
    return "legacy backup";
  };
  runInContext("readStoredGame()", h.context);
  assert.equal(h.$("legacy-banner").hidden, false);
  assert.equal(h.$("corrupt-save-banner").hidden, true);
});

test("a newer file selection wins over a delayed read", async () => {
  let release;
  const h = harness(), next = advance(initial(), "rest");
  const delayed = h.importFile({ size: 10, text: () => new Promise((resolve) => { release = resolve; }) });
  await h.importFile(file(encodeSave(next)));
  release(encodeSave(initial()));
  await delayed;
  assert.deepEqual(h.context.game, next);
  assert.equal(h.rendered, 1);
});

test("career and ordinary direction choices both advance five years", () => {
  const h = harness();
  Object.assign(h.context, { game: initial(), advanceDirection, availableChoices, decisionId });
  for (const [start, end] of [
    ["function commitChoice(", "function selectCommand("],
    ["function takeCareerDecision(", "function renderCareerOffers()"],
  ]) runInContext(app.slice(app.indexOf(start), app.indexOf(end)), h.context);
  for (const decision of ["rest", { id: "switch", target: "toyota", role: "tech" }]) {
    h.context.game = initial();
    h.context.decision = decision;
    runInContext("takeCareerDecision(decision)", h.context);
    assert.equal(h.context.game.decisions.length, 5);
    assert.equal(h.context.game.age, 35);
  }
  h.context.game = initial();
  runInContext('commitChoice("rest")', h.context);
  assert.equal(h.context.game.decisions.length, 5);
});

test("undo retains the care-leave salary migration boundary and can repeat the recorded investment", async () => {
  const { save } = JSON.parse(await readFile(new URL("./fixtures/care-leave-save.json", import.meta.url), "utf8"));
  const game = decodeSave(JSON.stringify(save));
  const h = harness({ game });
  Object.assign(h.context, { replay, previousDirectionStep, careerSeenUntil, moveToStory() {} });
  runInContext(app.slice(
    app.indexOf('$("undo-button").addEventListener'),
    app.indexOf('$("compare-button").addEventListener'),
  ), h.context);
  h.$("undo-button").click();
  assert.equal(h.context.game.careLeaveSalaryFrom, game.careLeaveSalaryFrom);
  assert.equal(h.context.game.familyFrom, game.familyFrom);
  assert.equal(h.context.game.growthFrom, game.growthFrom);
  assert.equal(h.context.game.cycleFrom, game.cycleFrom);
  assert.equal(h.context.game.spendFrom, game.spendFrom);
  assert.equal(h.context.game.oddsFrom, game.oddsFrom);
  assert.equal(h.context.game.decisions.length, 3);
  assert.ok(h.context.game.cash > 30);
  assert.deepEqual({ ...advance(h.context.game, "invest"), reflections: { ...h.context.game.reflections }, careerSeen: { ...h.context.game.careerSeen } }, game);
});

test("save controls use external event handlers and a JSON file input", async () => {
  const document = parse(await readFile(new URL("../public/index.html", import.meta.url), "utf8"));
  const nodes = [];
  const walk = (n) => { nodes.push(n); for (const c of n.childNodes ?? []) walk(c); };
  walk(document);
  const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value;
  for (const id of ["export-save", "game-export-save", "import-save", "game-import-save", "export-corrupt-save", "save-import-confirm"])
    assert.equal(nodes.find((n) => attr(n, "id") === id)?.tagName, "button");
  const input = nodes.find((n) => attr(n, "id") === "import-save-file");
  assert.equal(attr(input, "type"), "file");
  assert.equal(attr(input, "accept"), "application/json");
  assert.equal(nodes.some((n) => n.attrs?.some((a) => /^on/i.test(a.name))), false);
});

test("resuming a game opens at its latest years; a new game opens at the top", () => {
  const played = advance(initial(), "rest"), h = harness({ game: played });
  runInContext("showGame(true)", h.context);
  assert.equal(JSON.stringify(h.$("timeline").scrolls), JSON.stringify([{ block: "start", behavior: "instant" }]));
  const fresh = harness({ game: initial() });
  runInContext("showGame(true)", fresh.context);
  assert.equal(fresh.$("timeline").scrolls, undefined);
});
