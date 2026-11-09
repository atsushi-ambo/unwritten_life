import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, encodeSave, decodeSave, replay, compareWorlds, MAX_AGE, onMentalLeave,
} from "../public/engine.js";
import { curveProfile } from "../scripts/simulate-pay-curve.mjs";
import { measureSpending } from "../scripts/simulate-spending.mjs";
import { measureFamily } from "../scripts/simulate-family.mjs";
import { readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const replayGame = (g, length = g.decisions.length) => replay(
  g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
  Object.fromEntries(Object.entries(g.scenes).filter(([step]) => Number(step) <= length)),
  false, g.dynamicFrom, g.worldFrom, g.retirementFrom, g.careLeaveSalaryFrom,
  g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom,
  g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom, g.offersFrom, g.paceFrom,
  g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom, g.cycleFrom, g.spendFrom, g.oddsFrom, g.lifeEventsFrom, undefined, g.era, g.payTypeFrom,
);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);
// A single person whose take-home has risen well above the start, with savings.
const raised = (extra = {}) => ({ ...createGame(curveProfile("office", "30s"), "steady", 11),
  salary: 800, cash: 2000, incidentFrom: MAX_AGE, ...extra });

test("spending moves 30% toward half of the take-home rise and shows as its own budget line", () => {
  const g = raised(), next = advance(g, "rest"), h = next.history.at(-1);
  const target = 0.5 * Math.max(0, h.disposable - g.profile.income * 0.76) / 12;
  close(next.lifestyle, target * 0.3);
  const shock = 1 + (h.world?.shock?.costs ?? 0);
  close(h.budget.lifestyle, -next.lifestyle * 12 * shock);
  close(Object.entries(h.budget).filter(([k]) => k !== "net").reduce((s, [, n]) => s + n, 0), h.budget.net);
  // It keeps moving toward the target in later years.
  const later = advance(next, "rest");
  assert.ok(later.lifestyle > next.lifestyle);
  // Reviewing spending halves that year's level (recover is offered when tired).
  const tired = { ...next, health: 35 };
  close(advance(tired, "recover").lifestyle, advance(tired, "rest").lifestyle * 0.5);
});

test("spending does not grow while raising children, in debt or with under six months saved", () => {
  const withKid = { ...raised(), family: { ...raised().family, childAges: [10] } };
  for (const g of [withKid, raised({ debt: 50 }), raised({ cash: 10 })])
    assert.equal(advance(g, "rest").lifestyle, 0);
  // An existing level eases back toward zero instead of jumping.
  const g = raised({ lifestyle: 10, debt: 50 });
  close(advance(g, "rest").lifestyle, 7);
});

test("single workers keep a realistic share of take-home; families with children are barely changed", () => {
  const office = measureSpending({ seeds: 300 }), before = measureSpending({ seeds: 300, from: MAX_AGE });
  assert.ok(office.savedShareAt50 > 0.15 && office.savedShareAt50 < 0.3, `${office.savedShareAt50}`);
  assert.ok(before.savedShareAt50 > 0.35, `${before.savedShareAt50}`);
  assert.ok(office.netWorthAt65 < before.netWorthAt65 * 0.75);
  assert.ok(office.debtAt65 < 0.05);
  const family = measureFamily({ seeds: 200 }), oldFamily = measureFamily({ seeds: 200, spendFrom: MAX_AGE });
  assert.ok(family.debtEndShare - oldFamily.debtEndShare < 0.08, `${family.debtEndShare} vs ${oldFamily.debtEndShare}`);
  assert.equal(family.netWorth[45], oldFamily.netWorth[45]);
});

test("spendFrom preserves recorded budgets and current scenes through replay, undo and comparison", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/spending-saves.json", import.meta.url)));
  for (const { id, save, historyHash, salary, savings } of fixtures) {
    assert.ok(!Object.hasOwn(save, "spendFrom"));
    const g = decodeSave(JSON.stringify(save));
    const boundary = save.decisions.length + (save.scenes[String(save.decisions.length)] ? 1 : 0);
    assert.equal(g.spendFrom, boundary);
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash, id);
    assert.equal(g.salary, salary);
    assert.equal(g.savings, savings);
    assert.equal(g.lifestyle, 0);
    assert.deepEqual(g.scenes, save.scenes);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, 0).spendFrom, boundary);
    for (const world of compareWorlds(g)) assert.equal(world.spendFrom, boundary);
    const action = onMentalLeave(g) ? "rest" : "focus";
    const next = advance(g, action), old = advance({ ...g, spendFrom: MAX_AGE }, action);
    if (id.includes("current-scene")) assert.deepEqual(next.history, old.history);
    else assert.notDeepEqual(next.history, old.history);
    assert.deepEqual(replayGame(next, g.decisions.length).history, g.history);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
  }
});

test("spendFrom validates all entry points before AI accounting and partitions scene caches", async () => {
  const g = createGame(curveProfile()), saved = JSON.parse(encodeSave(g));
  assert.equal(g.spendFrom, 0);
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  for (const spendFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, spendFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const accounting = ai.status();
  for (const value of [null, -1, 0.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(19).fill(0), value));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(19).fill(0), value));
    assert.throws(() => encodeSave({ ...g, spendFrom: value }));
    const save = JSON.stringify({ ...saved, spendFrom: value });
    assert.throws(() => decodeSave(save));
    await assert.rejects(() => ai.generate(save));
  }
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, accounting.calls);
  assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
});
