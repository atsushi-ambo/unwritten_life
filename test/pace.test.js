import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, advanceDirection, decisionId, replay, compareWorlds,
  encodeSave, decodeSave, MAX_AGE, onMentalLeave, incidentAt, salaryCeiling,
  workSuccessChance, availableChoices,
} from "../public/engine.js";
import { measurePace, paceProfile } from "../scripts/simulate-pace.mjs";
import { readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const start = (seed = 42, extra = {}) => createGame(paceProfile(extra), "steady", seed);
const quiet = (seed = 42, extra = {}) => ({ ...start(seed, extra), incidentFrom: MAX_AGE });
const replayGame = (g, decisions = g.decisions, scenes = g.scenes) => replay(
  g.profile, g.scenario, g.seed, decisions, scenes, false, g.dynamicFrom, g.worldFrom,
  g.retirementFrom, g.careLeaveSalaryFrom, g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom,
  g.incidentFrom, g.careerPathFrom, g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom,
  g.offersFrom, g.paceFrom, g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom, g.cycleFrom, g.spendFrom, g.oddsFrom, decisions.length === g.decisions.length ? g.directionBlocks : undefined);
const within = (n, lo, hi, label) => assert.ok(n >= lo && n <= hi, `${label}: ${n}`);

test("2,000 focus careers retain modest pay growth and occasional recognition", () => {
  for (const studyFirst of [false, true]) {
    const c = measurePace({ studyFirst });
    within(c.pay37, 700, 760, "pay at 37");
    within(c.pay45, 780, 880, "pay at 45");
    within(c.peak, 850, 950, "median lifetime peak");
    within(c.successShare, 0.30, 0.45, "success among assessed focus years");
    within(c.allFocusSuccessShare, 0.30, 0.45, "success among all focus years");
    assert.ok(c.reached45 > 1900);
  }
});

test("employed rest, connect and explore directions use the chosen first year then focus, keeping intent", () => {
  for (const id of ["rest", "connect", "explore"]) {
    const run = advanceDirection(quiet(), { id, intent: "暮らしにも時間を使う" });
    assert.deepEqual(run.game.decisions.map(decisionId), [id, ...Array(4).fill("focus")]);
    assert.ok(run.entries.every((h) => h.intention === "暮らしにも時間を使う"));
    assert.deepEqual(replayGame(run.game), run.game);
    assert.deepEqual(decodeSave(encodeSave(run.game)), run.game);
    const old = advanceDirection({ ...quiet(), paceFrom: MAX_AGE }, id);
    assert.deepEqual(old.game.decisions.map(decisionId), Array(5).fill(id));
  }
  const crossing = advanceDirection({ ...quiet(), paceFrom: 2 }, "rest");
  assert.deepEqual(crossing.game.decisions.map(decisionId), ["rest", "rest", "focus", "focus", "focus"]);
});

test("rest remains rest during mental leave, retirement and job seeking", () => {
  const retired = advance(quiet(42, { age: 65 }), "rest");
  const retiredRun = advanceDirection({ ...retired, careerEndFrom: MAX_AGE }, "rest");
  assert.ok(retiredRun.game.decisions.every((d) => decisionId(d) === "rest"));
  const seeking = { ...quiet(), salary: 0, employer: { kind: "seeking", id: "seeking",
    name: "次の仕事を探している", role: "tech", companyType: "unknown", facts: null } };
  const seekingRun = advanceDirection(seeking, "rest");
  assert.equal(seekingRun.entries.length, 1);
  assert.equal(seekingRun.entries[0].choice, "rest");
  let leave;
  for (let seed = 1; seed < 20000 && !leave; seed++) {
    const g = start(seed);
    if (incidentAt(g, "focus")?.effects.mentalLeave) leave = advance(g, "focus");
  }
  assert.ok(leave);
  const run = advanceDirection(leave, "rest");
  let before = leave;
  for (const action of run.game.decisions.slice(leave.decisions.length)) {
    assert.equal(decisionId(action), onMentalLeave(before) ? "rest" : "focus");
    before = advance(before, action);
  }
});

test("focus and rest titles vary deterministically without adjacent duplicate titles", () => {
  for (const action of ["focus", "rest"]) {
    let g = quiet();
    for (let y = 0; y < 25; y++) g = advance(g, action);
    const titles = g.history.map((h) => h.outcome.title);
    assert.ok(new Set(titles).size >= 3);
    for (let i = 1; i < titles.length; i++) {
      assert.notEqual(titles[i], titles[i - 1]);
      assert.notEqual(g.history[i].episode.title, g.history[i - 1].episode.title);
    }
    assert.deepEqual(replayGame(g), g);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
  }
});

test("paceFrom keeps old recorded histories and shown scenes unchanged through save, replay, undo and comparisons", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/pace-saves.json", import.meta.url)));
  for (const { id, save, historyHash } of fixtures) {
    assert.ok(!Object.hasOwn(save, "paceFrom"));
    const g = decodeSave(JSON.stringify(save));
    assert.equal(g.paceFrom, save.decisions.length + (save.scenes[String(save.decisions.length)] ? 1 : 0));
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash, id);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, [], {}).paceFrom, g.paceFrom);
    for (const world of compareWorlds(g)) assert.equal(world.paceFrom, g.paceFrom);
    if (id === "current-scene") {
      assert.deepEqual(g.scenes, save.scenes);
      const next = advance(g, "focus"), old = advance({ ...g, paceFrom: MAX_AGE }, "focus");
      assert.deepEqual(next.history, old.history);
      assert.notDeepEqual(advance(next, "focus").history, advance({ ...old, paceFrom: MAX_AGE }, "focus").history);
    }
  }
  const g = quiet(), old = { ...g, paceFrom: MAX_AGE };
  assert.equal(salaryCeiling(g), salaryCeiling(old));
  assert.ok(workSuccessChance(g) < workSuccessChance(old));
  assert.equal(workSuccessChance(g, g.employer, "promote"), workSuccessChance(old, old.employer, "promote"));
  assert.deepEqual(availableChoices(g), availableChoices(old));
});

test("paceFrom validates all entry points and partitions local scene caches before any AI accounting", async () => {
  const g = start(), saved = JSON.parse(encodeSave(g));
  assert.equal(g.paceFrom, 0);
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  for (const paceFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, paceFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const accounting = ai.status();
  for (const paceFrom of [null, -1, 1.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(13).fill(0), paceFrom));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(13).fill(0), paceFrom));
    assert.throws(() => encodeSave({ ...g, paceFrom }));
    const save = JSON.stringify({ ...saved, paceFrom });
    assert.throws(() => decodeSave(save));
    await assert.rejects(() => ai.generate(save));
  }
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, accounting.calls);
  assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
});
