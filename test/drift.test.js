import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, encodeSave, decodeSave, replay, compareWorlds,
  MAX_AGE, salaryCeiling, onMentalLeave, advanceDirection, availableChoices,
  optionalProfileInputs, profileInputForLevel, PROFILE_DEFAULTS,
} from "../public/engine.js";
import { paceProfile } from "../scripts/simulate-pace.mjs";
import { careProfile, measureDrift } from "../scripts/simulate-drift.mjs";
import { readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const start = (seed = 5819, extra = {}) => createGame(paceProfile(extra), "steady", seed);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);
const replayGame = (g, length = g.decisions.length) => replay(
  g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
  Object.fromEntries(Object.entries(g.scenes).filter(([step]) => Number(step) <= length)),
  false, g.dynamicFrom, g.worldFrom, g.retirementFrom, g.careLeaveSalaryFrom,
  g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom,
  g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom, g.offersFrom, g.paceFrom,
  g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom, g.cycleFrom, g.spendFrom, g.oddsFrom,
);

test("yearly noise has the same slope on both sides of zero near the ceiling, with no negative mean drift", () => {
  const initial = createGame(careProfile());
  const g = { ...initial, salary: salaryCeiling(initial) * 1.2, health: 80,
    dynamicFrom: MAX_AGE, worldFrom: MAX_AGE, incidentFrom: MAX_AGE };
  const damp = Math.exp(-3 * (g.salary / salaryCeiling(g) - 0.5));
  let base, sum = 0, noiseSum = 0, positive = 0, negative = 0;
  for (let seed = 1; seed <= 10000; seed++) {
    const next = advance({ ...g, seed }, "focus"), noise = next.history[0].volatility;
    const intercept = next.salary - g.salary * noise * damp;
    base ??= intercept;
    close(intercept, base);
    if (noise > 0) positive++; else negative++;
    sum += next.salary;
    noiseSum += noise;
  }
  assert.ok(positive > 4500 && negative > 4500);
  assert.ok(sum / 10000 >= g.salary);
  close(sum / 10000, base + g.salary * noiseSum / 10000 * damp);
  // A genuine negative growth factor still applies in full, even well
  // above the ceiling. Only the zero-mean noise is damped.
  const flat = { ...g, age: 52, health: 29, skill: 100 };
  let cutBase;
  for (let seed = 1; seed <= 1000; seed++) {
    const n = advance({ ...flat, seed }, "focus"), noise = n.history[0].volatility;
    const intercept = n.salary / (1 + noise * damp * 0.5);
    cutBase ??= intercept;
    close(intercept, cutBase);
  }
  assert.ok(cutBase < flat.salary);
});

test("2,000 healthy care/rural stayers retain flat to slightly rising median pay from 40 to 55", () => {
  const c = measureDrift({ healthy: true });
  assert.ok(c.stayers > 1000);
  assert.ok(c.stayerPay[55] >= c.stayerPay[40]);
  // From cycleFrom downturns no longer leave permanent cuts; care pay in the
  // wage survey still rises only a little from the early 40s to the mid 50s.
  assert.ok(c.stayerPay[55] < c.stayerPay[40] * 1.1, JSON.stringify(c.stayerPay));
});

test("mental leave pays a separate untaxed allowance for one year plus half a year, then zero", () => {
  let g = advance(start(), "focus");
  const basis = g.history[0].leaveSalary;
  assert.ok(onMentalLeave(g));
  for (const share of [1, 0.5, 0, 0]) {
    const h = g.history.at(-1);
    assert.equal(h.salary, 0);
    close(h.leaveSalary, basis);
    close(h.income, basis * 2 / 3 * share);
    close(h.budget.sicknessAllowance, h.income);
    assert.equal(h.budget.income, 0);
    assert.equal(h.budget.pension, 0);
    close(h.disposable, h.income);
    close(Object.entries(h.budget).filter(([k]) => k !== "net").reduce((sum, [, n]) => sum + n, 0), h.budget.net);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    g = advance(g, "rest");
  }
  while (onMentalLeave(g) && !g.ended) g = advance(g, "rest");
  assert.equal(g.history.at(-1).incident.id, "returnToWork");
  assert.ok(g.salary > basis * 0.9 && g.salary < basis * 1.15);
  assert.equal(g.history.at(-1).budget.sicknessAllowance, 0);
});

test("allowance never becomes salary, a raise base or the salary retained for re-employment", () => {
  const leave = advance(start(), "focus"), h = leave.history[0];
  assert.equal(advance(leave, "rest").salary, 0);
  assert.equal(advance(leave, "rest").history.at(-1).leaveSalary, h.leaveSalary);
  // After recovery, a later layoff records actual restored pay, not benefits.
  let g = leave, lost;
  while (onMentalLeave(g) && !g.ended) g = advance(g, "rest");
  assert.ok(g.salary > h.income);
  for (let seed = 1; seed <= 20000 && !lost; seed++) {
    const before = { ...g, seed }, next = advance(before, "focus");
    if (next.employer.kind === "seeking") {
      assert.equal(next.employer.lastSalary, before.salary);
      lost = next;
    }
  }
  assert.ok(lost);
});

test("self-employed, independent workers, business owners and retirees receive no allowance", () => {
  for (const extra of [{ companyType: "self" }, { occupation: "independent" }, { age: 65 }]) {
    const g = start(5819, extra), next = advance(g, "rest");
    assert.equal(next.history.at(-1).budget.sicknessAllowance, 0);
  }
  const g = start(5819, { savings: 3000 });
  const business = advance(g, { id: "startup", venture: "ai", name: "合成事業" });
  assert.equal(business.history.at(-1).budget.sicknessAllowance, 0);
});

test("55-year damping and the 60-year employee rehire cut remain in force", () => {
  const quiet = (age, companyType = "large") => ({ ...start(11, { age, companyType }),
    dynamicFrom: MAX_AGE, worldFrom: MAX_AGE, incidentFrom: MAX_AGE });
  const a54 = quiet(54), a55 = quiet(55);
  close((advance(a55, "focus").salary / a55.salary - 1) /
    (advance(a54, "focus").salary / a54.salary - 1), 0.15 / 0.5);
  const g = quiet(59), previous = quiet(58);
  close(advance(g, "focus").salary, advance(previous, "focus").salary * 0.75);
  const self = quiet(59, "self"), earlier = quiet(58, "self");
  close(advance(self, "focus").salary, advance(earlier, "focus").salary);
});

test("driftFrom preserves pre-change salaries, budgets and current scenes through replay, undo and comparison", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/drift-saves.json", import.meta.url)));
  for (const { id, save, historyHash, salary, savings } of fixtures) {
    assert.ok(!Object.hasOwn(save, "driftFrom"));
    const g = decodeSave(JSON.stringify(save));
    const boundary = save.decisions.length + (save.scenes[String(save.decisions.length)] ? 1 : 0);
    assert.equal(g.driftFrom, boundary);
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash, id);
    assert.equal(g.salary, salary);
    assert.equal(g.savings, savings);
    assert.deepEqual(g.scenes, save.scenes);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, 0).driftFrom, boundary);
    for (const world of compareWorlds(g)) assert.equal(world.driftFrom, boundary);
    const action = onMentalLeave(g) ? "rest" : "focus";
    const next = advance(g, action), old = advance({ ...g, driftFrom: MAX_AGE }, action);
    if (id.includes("current-scene")) assert.deepEqual(next.history, old.history);
    else assert.notDeepEqual(next.history, old.history);
    assert.deepEqual(replayGame(next, g.decisions.length).history, g.history);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
    if (id === "leave-current-scene") {
      const continued = advance(next, "rest");
      assert.ok(onMentalLeave(continued));
      assert.equal(continued.salary, 0);
      assert.equal(continued.history.at(-1).budget.sicknessAllowance, 0);
    }
  }
});

test("driftFrom validates all entry points before AI accounting and partitions scene caches", async () => {
  const g = start(), saved = JSON.parse(encodeSave(g));
  assert.equal(g.driftFrom, 0);
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  for (const driftFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, driftFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const accounting = ai.status();
  for (const value of [null, -1, 0.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(15).fill(0), value));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(15).fill(0), value));
    assert.throws(() => encodeSave({ ...g, driftFrom: value }));
    const save = JSON.stringify({ ...saved, driftFrom: value });
    assert.throws(() => decodeSave(save));
    await assert.rejects(() => ai.generate(save));
  }
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, accounting.calls);
  assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
});

test("the same setback rarely repeats within three years", () => {
  const p = optionalProfileInputs(profileInputForLevel({ job: "care" }, "quick", { band: "new", region: "rural" }), PROFILE_DEFAULTS);
  let repeats = 0, careers = 0;
  for (let seed = 1; seed <= 120; seed++) {
    let g = createGame(p, "steady", seed * 7919);
    while (!g.ended) g = advanceDirection(g, availableChoices(g).includes("focus") ? "focus" : "rest").game;
    const ids = g.history.map((h) => h.incident?.id);
    repeats += ids.filter((x, i) => x === "difficultBoss" && ids.slice(Math.max(0, i - 3), i).includes("difficultBoss")).length;
    careers++;
  }
  assert.ok(repeats / careers < 0.35, `${repeats / careers} repeats per career`);
});
