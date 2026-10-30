import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, encodeSave, decodeSave, replay, compareWorlds,
  MAX_AGE, WORLD_GROWTH_MEAN, onMentalLeave,
} from "../public/engine.js";
import { curveProfile, measureCurve, worldGrowthMean } from "../scripts/simulate-pay-curve.mjs";
import { readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const replayGame = (g, length = g.decisions.length) => replay(
  g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
  Object.fromEntries(Object.entries(g.scenes).filter(([step]) => Number(step) <= length)),
  false, g.dynamicFrom, g.worldFrom, g.retirementFrom, g.careLeaveSalaryFrom,
  g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom,
  g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom, g.offersFrom, g.paceFrom,
  g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom, g.cycleFrom, g.spendFrom, g.oddsFrom,
);

test("stayers' pay rises into the early 50s and 55–59 stays near that peak until the rehire cut", () => {
  const after = measureCurve({ seeds: 300 }), before = measureCurve({ seeds: 300, from: MAX_AGE });
  const s = after.stayerPay;
  assert.ok(s[30] < s[40] && s[40] < s[50], JSON.stringify(s));
  assert.ok(s[55] >= s[50] * 0.9, JSON.stringify(s));
  // The 60 rehire cut is unchanged.
  assert.ok(s[62] < s[55] * 0.8, JSON.stringify(s));
  // Previously AI and economy drags cut pay every year from the 40s.
  assert.ok(before.stayerPay[55] < before.stayerPay[40] * 0.8, JSON.stringify(before.stayerPay));
  // Pay stays realistic: an office new graduate is under twice the start at 50.
  assert.ok(s[50] < curveProfile().income * 2, JSON.stringify(s));
});

test("always-working new graduates rarely end at 65 in debt and do no worse than people starting at 35", () => {
  // Pay only: spending that grows with pay (spendFrom) is measured separately.
  const grad = measureCurve({ seeds: 300, spendFrom: MAX_AGE }), mid = measureCurve({ seeds: 300, band: "30s", spendFrom: MAX_AGE });
  assert.ok(grad.debtAt65 < 0.15, `${grad.debtAt65}`);
  assert.ok(measureCurve({ seeds: 300, from: MAX_AGE }).debtAt65 > 0.2);
  assert.ok(grad.netWorthAt65 > mid.netWorthAt65 * 0.8, `${grad.netWorthAt65} vs ${mid.netWorthAt65}`);
});

test("the removed world mean matches the simulated economy, company and shock terms", () => {
  assert.ok(Math.abs(worldGrowthMean(1000) - WORLD_GROWTH_MEAN) < 0.001);
});

test("the AI transition cost follows the yearly rise in adoption and stops once it has arrived", () => {
  const quiet = (job, year) => {
    const g = createGame(curveProfile(job, "30s"), "steady", 11);
    return { ...g, year, salary: 300, health: 80, incidentFrom: MAX_AGE };
  };
  // Late in the century adoption has plateaued: exposed and sheltered jobs
  // get the same yearly change on rest years.
  const late = (job) => advance(quiet(job, 2090), "rest").salary;
  assert.ok(Math.abs(late("office") - late("care")) < 0.5, `${late("office")} vs ${late("care")}`);
  // While adoption rises, the exposed job pays a small cost, under 1% a year.
  const early = (job) => advance(quiet(job, 2034), "rest").salary;
  assert.ok(early("office") < early("care"));
  assert.ok(early("care") - early("office") < 3);
  // The old rule charged the level every year.
  const old = (job) => advance({ ...quiet(job, 2090), growthFrom: MAX_AGE }, "rest").salary;
  assert.ok(old("care") - old("office") > 5);
});

test("a worn-down year slows pay by 1.5% instead of cutting 3.5%", () => {
  const g = { ...createGame(curveProfile("care", "30s"), "steady", 11), salary: 300, incidentFrom: MAX_AGE };
  const at = (health, from = 0) => advance({ ...g, health, growthFrom: from }, "rest").salary;
  assert.ok(Math.abs((at(31) - at(29)) / 300 - 0.015) < 0.002, `${at(31)} ${at(29)}`);
  assert.ok(Math.abs((at(31, MAX_AGE) - at(29, MAX_AGE)) / 300 - 0.035) < 0.002);
});

test("growthFrom preserves recorded pay and current scenes through replay, undo and comparison", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/pay-curve-saves.json", import.meta.url)));
  for (const { id, save, historyHash, salary, savings } of fixtures) {
    assert.ok(!Object.hasOwn(save, "growthFrom"));
    const g = decodeSave(JSON.stringify(save));
    const boundary = save.decisions.length + (save.scenes[String(save.decisions.length)] ? 1 : 0);
    assert.equal(g.growthFrom, boundary);
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash, id);
    assert.equal(g.salary, salary);
    assert.equal(g.savings, savings);
    assert.deepEqual(g.scenes, save.scenes);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, 0).growthFrom, boundary);
    for (const world of compareWorlds(g)) assert.equal(world.growthFrom, boundary);
    const action = onMentalLeave(g) ? "rest" : "focus";
    const next = advance(g, action), old = advance({ ...g, growthFrom: MAX_AGE }, action);
    if (id.includes("current-scene")) assert.deepEqual(next.history, old.history);
    else assert.notDeepEqual(next.history, old.history);
    assert.deepEqual(replayGame(next, g.decisions.length).history, g.history);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
  }
});

test("growthFrom validates all entry points before AI accounting and partitions scene caches", async () => {
  const g = createGame(curveProfile()), saved = JSON.parse(encodeSave(g));
  assert.equal(g.growthFrom, 0);
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  for (const growthFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, growthFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const accounting = ai.status();
  for (const value of [null, -1, 0.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(17).fill(0), value));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(17).fill(0), value));
    assert.throws(() => encodeSave({ ...g, growthFrom: value }));
    const save = JSON.stringify({ ...saved, growthFrom: value });
    assert.throws(() => decodeSave(save));
    await assert.rejects(() => ai.generate(save));
  }
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, accounting.calls);
  assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
});
