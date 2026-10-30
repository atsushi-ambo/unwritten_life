import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createContext, runInContext } from "node:vm";
import {
  createGame, advance, advanceDirection, applyScene, encodeSave, decodeSave, replay, compareWorlds,
  validateGeneratedScene, choiceForecast, displayIntention, displayEpisode, randomAt,
  availableChoices, CHOICES, MAX_AGE,
} from "../public/engine.js";
import { storyRequest } from "../public/story.js";
import { fourReply, readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const profile = { age: 32, region: "city", job: "tech", ai: "daily", priority: "balance",
  gender: "undisclosed", household: "solo", companyType: "small", rank: "staff", savings: 2000 };
const base = (seed = 42) => ({ ...createGame(profile, "steady", seed), payRealismFrom: MAX_AGE, incidentFrom: MAX_AGE });
const move = { id: "switch", target: "custom", name: "合成テスト社", role: "tech", companyType: "unknown",
  candidateKind: "real", workModel: "product", proposal: "経験を生かす", rank: "lead", intent: "上の役割を目指す" };
const boundaries = ["dynamicFrom", "worldFrom", "retirementFrom", "careLeaveSalaryFrom", "prepayFrom", "debtRepayFrom",
  "salaryCapFrom", "incidentFrom", "careerPathFrom", "careerEndFrom", "payRealismFrom", "lifeRealismFrom", "offersFrom",
  "paceFrom", "reemploymentPayFrom", "driftFrom", "familyFrom", "growthFrom", "cycleFrom", "spendFrom", "oddsFrom"];
const replayGame = (g, length = g.decisions.length) => replay(g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
  Object.fromEntries(Object.entries(g.scenes).filter(([step]) => Number(step) <= length)), false,
  ...boundaries.map((key) => g[key]), g.directionBlocks?.filter(([, end]) => end <= length));
const hash = (g) => createHash("sha256").update(JSON.stringify(g.history)).digest("hex");

test("each displayed work probability is the actual draw threshold and recorded chance, including raised-role moves", () => {
  let changedRecords = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const g = base(seed), snapshot = structuredClone(g);
    for (const decision of ["focus", "learn", "studyDaily", "explore", move, { ...move, rank: "staff" }, "promote",
      { id: "transfer", unit: "合成部", intent: "仕事の幅を広げる" },
      { id: "internalVenture", unit: "合成事業", intent: "新事業を試す" }]) {
      const f = choiceForecast(g, decision), h = advance(g, decision).history.at(-1);
      assert.equal(f.chance, h.outcome.chance);
      assert.match(f.successText, new RegExp((h.outcome.chance * 100).toFixed(1).replace('.', '\\.')));
      if (decision !== "promote") assert.equal(h.outcome.kind === "success", randomAt(g.seed, 0, 31) < f.chance);
    }
    const newYear = advance(g, move).history[0], oldYear = advance({ ...g, oddsFrom: MAX_AGE }, move).history[0];
    assert.equal(newYear.outcome.chance, oldYear.outcome.chance * 0.75);
    assert.deepEqual({ ...newYear, outcome: { ...newYear.outcome, chance: oldYear.outcome.chance } }, oldYear);
    changedRecords++;
    assert.deepEqual(g, snapshot);
  }
  assert.equal(changedRecords, 1000);
});

test("old history and saved current scenes retain pre-edit hashes, while future years use the boundary", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/visible-odds-saves.json", import.meta.url)));
  for (const { save, historyHash, nextHash } of fixtures) {
    const g = decodeSave(JSON.stringify(save));
    assert.equal(g.oddsFrom, save.decisions.length + (nextHash ? 1 : 0));
    assert.equal(hash(g), historyHash);
    assert.deepEqual(g.scenes, save.scenes);
    assert.equal(g.history[0].intention, "newSkill");
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, 0).oddsFrom, g.oddsFrom);
    for (const w of compareWorlds(g)) assert.equal(w.oddsFrom, g.oddsFrom);
    if (nextHash) {
      const next = advance(g, g.scenes[1].options[0].decision);
      assert.equal(hash(next), nextHash);
      const d = { ...move, name: "合成別社", rank: "director" };
      assert.equal(advance(next, d).history.at(-1).outcome.chance, choiceForecast(next, d).chance);
    } else {
      const d = { ...move, name: "合成別社", rank: "manager" };
      assert.equal(advance(g, d).history.at(-1).outcome.chance, choiceForecast(g, d).chance);
    }
  }
});

test("new generated bare IDs are rejected; Japanese intentions and old saves remain accepted", () => {
  const g = base(), raw = fourReply(storyRequest(g).context);
  assert.doesNotThrow(() => validateGeneratedScene(raw, g));
  for (const intent of ["newSkill", "focus", "study_daily", "newSkill2", "  newSkill  "]) {
    const invalid = structuredClone(raw); invalid.options[0].decision.intent = intent;
    assert.throws(() => validateGeneratedScene(invalid, g));
    // Persistence uses validateScene/validateDecision, not fresh-generation rules.
    const old = applyScene(g, invalid), next = advance(old, old.scenes[0].options[0].decision);
    assert.equal(decodeSave(encodeSave(next)).history[0].intention, intent.trim());
  }
  raw.options[0].decision.intent = "AIの運用を学ぶ";
  assert.doesNotThrow(() => validateGeneratedScene(raw, g));
  const h = { choice: "learn", intention: "newSkill", choiceLabel: "設計を学ぶ", episode: { body: "日々の学び。選んだ方針は「newSkill」。" } };
  assert.equal(displayIntention(h), "設計を学ぶ");
  assert.equal(displayEpisode(h), "日々の学び。選んだ方針は「設計を学ぶ」。");
  assert.equal(displayIntention({ ...h, choiceLabel: "learn" }), CHOICES.learn.label);
  assert.equal(h.episode.body, "日々の学び。選んだ方針は「newSkill」。");
});

test("low-health learning follow-through rests only after the new boundary", () => {
  for (const id of ["learn", "studyDaily"]) {
    const g = { ...base(), health: 29 };
    const updated = advanceDirection(g, { id, intent: "設計を学ぶ" }, { years: 2 });
    const legacy = advanceDirection({ ...g, oddsFrom: MAX_AGE }, { id, intent: "設計を学ぶ" }, { years: 2 });
    assert.equal(updated.entries[0].choice, id);
    assert.equal(updated.entries[1].choice, "rest");
    assert.equal(legacy.entries[1].choice, "focus");
    assert.ok(updated.game.health > legacy.game.health);
  }
});

test("rest has no invented success rate; re-employment and promotion are clearly separate", () => {
  const g = base();
  for (const id of ["rest", "connect", "invest"]) {
    assert.equal(choiceForecast(g, id).chance, null);
    assert.match(choiceForecast(g, id).successText, /成否の抽選なし/);
  }
  assert.match(choiceForecast(g, "promote").label, /席の空きと評価/);
  const seeker = { ...g, employer: { kind: "seeking", name: "次の仕事を探している", role: "other", companyType: "unknown", lastRole: "tech", lastSalary: 500 } };
  const forecast = choiceForecast(seeker, "learn");
  assert.equal(forecast.reemployment, 0.65);
  assert.match(forecast.successText, /再就職抽選が不成立の場合/);
  assert.equal(choiceForecast(seeker, "rest").reemployment, 0);
  assert.match(choiceForecast(seeker, "rest").riskText, /仕事探しを休む/);
  for (let seed = 1; seed <= 100; seed++) {
    const current = { ...seeker, seed }, f = choiceForecast(current, "learn"), h = advance(current, "learn").history[0];
    assert.equal(h.outcome.kind === "reemployed", randomAt(seed, 0, 171) < f.reemployment);
    if (h.outcome.kind !== "reemployed") assert.equal(h.outcome.chance, f.chance);
  }
});

test("boundary rejects invalid values before AI calls and separates local caches", async () => {
  const g = createGame(profile), saved = JSON.parse(encodeSave(g));
  let calls = 0;
  const ai = await readyAI(async (_url, options) => { calls++; return { status: 200, text: ollamaText(replyFor(options)) }; });
  for (const oddsFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, oddsFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const before = ai.status();
  for (const value of [null, -1, 0.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(profile, "steady", 42, ...Array(20).fill(0), value));
    assert.throws(() => replay(profile, "steady", 42, [], {}, false, ...Array(20).fill(0), value));
    assert.throws(() => encodeSave({ ...g, oddsFrom: value }));
    const save = JSON.stringify({ ...saved, oddsFrom: value });
    assert.throws(() => decodeSave(save));
    await assert.rejects(() => ai.generate(save));
  }
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, before.calls);
  assert.equal(ai.status().reservedUSD, before.reservedUSD);
});

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
test("actual card and permanent command handlers work without AI and respect disabled states", () => {
  class Element {
    constructor(tag, text = "", className = "") { Object.assign(this, { tag, text, className, children: [], dataset: {}, handlers: {}, isConnected: true }); }
    append(...children) { this.children.push(...children); }
    setAttribute() {}
    addEventListener(type, fn) { this.handlers[type] = fn; }
  }
  const container = new Element("div"), chosen = [], node = (...args) => new Element(...args);
  const context = createContext({ game: { ...base(), health: 9 }, node, $: () => container, availableChoices, CHOICES,
    choiceForecast, generating: false, timelineRevealing: () => false,
    openCareer: (id) => chosen.push(id), commitChoice: (id) => chosen.push(id) });
  runInContext(app.slice(app.indexOf("function appendChoiceForecast("), app.indexOf("function renderGame()")), context);
  for (const decision of ["focus", "learn", "rest", move]) {
    const card = new Element("span"); context.card = card; context.decision = decision;
    runInContext("appendChoiceForecast(card, decision)", context);
    assert.equal(card.children[0].text, choiceForecast(context.game, decision).successText);
    assert.equal(card.children[0].dataset.probability, choiceForecast(context.game, decision).chance === null ? undefined : String(choiceForecast(context.game, decision).chance));
    assert.match(card.children[1].text, /リスク・負担/);
  }
  runInContext("renderCareActions()", context);
  assert.match(container.children[0].text, /とても少なく/);
  assert.doesNotMatch(container.children[0].text, /倒れ/);
  for (const button of container.children[1].children) button.handlers.click();
  assert.deepEqual(chosen, ["rest", "connect", "switch"]);
  context.generating = true; container.children = [];
  runInContext("renderCareActions()", context);
  for (const button of container.children[1].children) { assert.equal(button.disabled, true); button.handlers.click(); }
  assert.equal(chosen.length, 3);
});

test("venture success excludes early closure and setbacks, family draws and retirement keep their own meaning", () => {
  let expected = 0, successes = 0, expectedRisk = 0, setbacks = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const g = base(seed), d = { id: "startup", venture: "studio", name: "合成スタジオ" };
    const f = choiceForecast(g, d), h = advance(g, d).history[0];
    assert.ok(f.chance > 0 && f.chance < 1);
    assert.ok(f.setback > 0 && f.setback + f.chance <= 1);
    assert.match(f.label, /黒字の確率ではありません/);
    assert.match(f.riskText, /開業費100万円・年間運営費36万円/);
    expected += f.chance; successes += Number(h.outcome.kind === "success");
    expectedRisk += f.setback; setbacks += Number(["setback", "failure"].includes(h.outcome.kind));
    const single = { ...g, family: { ...g.family, partner: false } };
    const meet = choiceForecast(single, "meet");
    assert.equal(advance(single, "meet").family.partner, randomAt(seed, 0, 74) < meet.chance);
    const family = { ...g, family: { ...g.family, partner: true, desired: 1 } };
    const plan = choiceForecast(family, "familyPlan");
    assert.equal(advance(family, "familyPlan").family.childAges.length > 0, randomAt(seed, 0, 74) < plan.chance);
  }
  assert.ok(Math.abs(successes - expected) < 90, `${successes} / expected ${expected}`);
  assert.ok(Math.abs(setbacks - expectedRisk) < 90, `${setbacks} / expected ${expectedRisk}`);
  const retired = { ...base(), age: 65, retired: true };
  assert.equal(choiceForecast(retired, "focus").chance, null);
  const legacyRetirement = { ...base(), age: 65, retirementFrom: MAX_AGE };
  assert.equal(choiceForecast(legacyRetirement, "focus").chance, null);
  assert.equal(advance(legacyRetirement, "focus").history[0].outcome, null);
});
