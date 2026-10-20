import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, advance, advanceDirection, previousDirectionStep, decisionId,
  replay, encodeSave, decodeSave, availableChoices, compareWorlds,
} from "../public/engine.js";
import { readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";
import { storyRequest } from "../public/story.js";

const profile = { age: 28, job: "tech", company: "合成SI社", income: 500,
  savings: 10000, monthlyCost: 12, region: "city", priority: "balance",
  ai: "daily", gender: "undisclosed", household: "solo", companyType: "small" };
const quiet = (p = profile, seed = 42) => createGame(p, "steady", seed, 0, 0, 0, 0, 0, 0, 0, 110);
const replayGame = (g) => replay(g.profile, g.scenario, g.seed, g.decisions, g.scenes, false,
  g.dynamicFrom, g.worldFrom, g.retirementFrom, g.careLeaveSalaryFrom, g.prepayFrom,
  g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom, g.careerEndFrom,
  g.payRealismFrom, g.directionBlocks);

test("a five-year direction preserves every decision, passes a reflection milestone and replays exactly", () => {
  const base = quiet(), snapshot = structuredClone(base);
  const run = advanceDirection(base, { id: "learn", intent: "顧客の設計を学ぶ" });
  assert.equal(run.entries.length, 5);
  assert.equal(run.game.decisions.length, 5);
  assert.equal(run.stopReason, "");
  assert.deepEqual(run.game.decisions.map(decisionId), ["learn", ...Array(4).fill("studyDaily")]);
  assert.deepEqual(run.game.directionBlocks, [[0, 5]]);
  assert.deepEqual(base, snapshot);
  assert.deepEqual(replayGame(run.game), run.game);
  assert.deepEqual(decodeSave(encodeSave(run.game)), run.game);
  for (const compared of compareWorlds(run.game))
    assert.ok(compared.directionBlocks.every(([, end]) => end <= compared.decisions.length));
  assert.equal(previousDirectionStep(run.game), 0);
  assert.throws(() => advanceDirection(base, "focus", { years: 10 }));
  assert.throws(() => advanceDirection(base, "invented"));
});

test("a switch runs once then follows through with four focus years", () => {
  const run = advanceDirection(quiet(), { id: "switch", target: "toyota", role: "tech" });
  assert.deepEqual(run.game.decisions.map(decisionId), ["switch", "focus", "focus", "focus", "focus"]);
  assert.equal(run.game.careerMoves, 1);
  assert.equal(new Set(run.entries.map((h) => h.employer.name)).size, 1);
  assert.deepEqual(replayGame(run.game), run.game);
});

test("a hard incident stops the direction in the year it happened and records the shorter block", () => {
  let observed = false;
  for (let seed = 0; seed < 100; seed++) {
    const base = createGame(profile, "steady", seed);
    const first = advance(base, "focus");
    if (first.history[0].incident?.tone !== "hard") continue;
    const run = advanceDirection(base, "focus");
    assert.equal(run.entries.length, 1);
    assert.match(run.stopReason, /思いがけない出来事/);
    assert.deepEqual(run.game.directionBlocks, [[0, 1]]);
    assert.deepEqual(decodeSave(encodeSave(run.game)), run.game);
    observed = true;
    break;
  }
  assert.ok(observed);
});

test("a direction never repeats purchases, investments, prepayments or moves", () => {
  for (const decision of ["home", "invest", { id: "move", region: "metro", intent: "大都市で暮らす" }, "prepay"]) {
    const base = quiet(decision === "prepay"
      ? { ...profile, housing: "own", homeValue: 3000, mortgage: 1000, mortgageYears: 20 }
      : profile);
    assert.ok(availableChoices(base).includes(decisionId(decision)));
    const run = advanceDirection(base, decision);
    assert.equal(run.entries.length, 5);
    assert.deepEqual(run.game.decisions.map(decisionId), [decisionId(decision), "focus", "focus", "focus", "focus"]);
    assert.equal(run.entries.filter((h) => h.homeTransaction > 0).length, decision === "home" ? 1 : 0);
    assert.deepEqual(decodeSave(encodeSave(run.game)), run.game);
  }
});

test("a venture continues with focus and never closes or expands automatically", () => {
  const run = advanceDirection(quiet(), { id: "startup", venture: "ai", name: "合成事業" });
  assert.equal(run.entries.length, 5);
  assert.deepEqual(run.game.decisions.map(decisionId), ["startup", "focus", "focus", "focus", "focus"]);
  assert.equal(run.game.employer.kind, "venture");
});

test("family and retirement changes still end a direction early", () => {
  const retired = advanceDirection(quiet({ ...profile, age: 63, retirementAge: 65 }), "rest");
  assert.equal(retired.entries.length, 2);
  assert.ok(retired.game.ended);
  assert.match(retired.stopReason, /区切り/);
  let family = false;
  for (let seed = 0; seed < 20; seed++) {
    const run = advanceDirection(quiet({ ...profile, partner: "partner", childrenWish: "one" }, seed), "familyPlan");
    if (!run.game.family.childAges.length) continue;
    assert.equal(run.entries.length, 1);
    assert.match(run.stopReason, /家族/);
    family = true;
    break;
  }
  assert.ok(family);
});

test("block metadata accepts legacy gaps and rejects malformed, overlapping, future or oversized blocks", () => {
  const old = advance(quiet(), "rest");
  assert.equal(previousDirectionStep(decodeSave(encodeSave(old))), 0);
  const run = advanceDirection(old, "rest").game;
  assert.deepEqual(run.directionBlocks, [[1, 6]]);
  assert.equal(previousDirectionStep(decodeSave(encodeSave(run))), 1);
  assert.equal(previousDirectionStep(advance(run, "rest")), 6);
  const save = JSON.parse(encodeSave(run));
  for (const directionBlocks of [null, {}, [[-1, 4]], [[0, 6]], [[1, 7]], [[1, 3], [2, 6]], [[1, 1]], [[1.5, 6]], [[1, 6, 7]]]) {
    assert.throws(() => decodeSave(JSON.stringify({ ...save, directionBlocks })));
    assert.throws(() => encodeSave({ ...run, directionBlocks }));
  }
});

test("the next scene receives every year since the previous direction and keeps all narration safeguards", () => {
  const first = advanceDirection(quiet(), "rest").game;
  const next = advanceDirection(first, "focus").game;
  const request = storyRequest(next);
  assert.equal(request.context.directionYears, 5);
  assert.deepEqual(request.context.yearsSincePreviousDecision.map((h) => h.year), [2031, 2032, 2033, 2034, 2035]);
  assert.match(request.messages[0].content, /yearsSincePreviousDecision.*前回の決断以降/);
  assert.match(request.messages[0].content, /〜を軸にする.*〜を目指す/);
  assert.match(request.messages[0].content, /購入.*毎年繰り返す案にしない/);
});

test("scene caching distinguishes different direction boundaries with the same annual decisions", async () => {
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  const game = advanceDirection(quiet(), "rest").game;
  const first = encodeSave(game);
  const split = encodeSave({ ...game, directionBlocks: [[0, 1], [1, 5]] });
  assert.equal((await ai.generate(first)).cached, false);
  assert.equal((await ai.generate(first)).cached, true);
  assert.equal((await ai.generate(split)).cached, false);
  assert.equal(calls, 2);
  let legacy = quiet();
  for (let i = 0; i < 20; i++) legacy = advance(legacy, "rest");
  assert.equal(storyRequest(legacy).context.yearsSincePreviousDecision.length, 5);
});
