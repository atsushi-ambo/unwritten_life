import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, encodeSave, decodeSave, replay, compareWorlds,
  profileInputForLevel, onMentalLeave, MAX_AGE,
} from "../public/engine.js";
import { readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const profile = (extra = {}) => ({
  ...profileInputForLevel({}, "quick", { band: "new", region: "city" }),
  children: 1, savings: 1500, ...extra,
});
const replayGame = (g, length = g.decisions.length) => replay(
  g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
  Object.fromEntries(Object.entries(g.scenes).filter(([step]) => Number(step) <= length)),
  false, g.dynamicFrom, g.worldFrom, g.retirementFrom, g.careLeaveSalaryFrom,
  g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom,
  g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom, g.offersFrom, g.paceFrom,
  g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom, g.cycleFrom, g.spendFrom, g.oddsFrom,
);
function hire(g) {
  for (let i = 0; i < 10 && g.employer.kind === "seeking" && !g.ended; i++) g = advance(g, "connect");
  assert.equal(g.history.at(-1).outcome.kind, "reemployed");
  return g;
}

test("layoff captures ordinary pay after care leave or illness; a new job applies its pay factor just once", () => {
  for (const { seed, action, reduction, extra } of [
    { seed: 167, action: "careLeave", reduction: 0.85 },
    { seed: 9207, action: "focus", reduction: 0.9 },
    // The age-60 rehire cut stays in the baseline; only leave is restored.
    { seed: 167, action: "careLeave", reduction: 0.85, extra: { age: 59 } },
  ]) {
    const before = advance(createGame(profile(extra), "steady", seed), action);
    if (action === "focus") assert.equal(before.history.at(-1).incident.id, "illness");
    const lost = advance(before, "focus");
    assert.equal(lost.history.at(-1).incident.id, "layoff");
    assert.equal(lost.salary, 0);
    assert.ok(Math.abs(lost.employer.lastSalary - before.salary / reduction) < 1e-9);
    const hired = hire(lost), factor = hired.history.at(-1).outcome.salaryFactor;
    assert.ok(factor >= 0.8 && factor <= 1);
    assert.equal(hired.salary, lost.employer.lastSalary * factor);
    assert.deepEqual(decodeSave(encodeSave(hired)), hired);
    assert.deepEqual(replayGame(hired), hired);
    assert.deepEqual(replayGame(hired, before.decisions.length), before);
    const old = advance({ ...before, reemploymentPayFrom: MAX_AGE }, "focus");
    assert.equal(old.employer.lastSalary, before.salary);
    assert.ok(Math.abs(hire(old).salary - hired.salary * reduction) < 1e-9);
  }
});

test("a business started after care leave retains ordinary employee pay when it closes", () => {
  const before = advance(createGame(profile({ savings: 3000 }), "steady", 167), "careLeave");
  let business = advance(before, { id: "startup", venture: "ai", name: "合成事業" });
  assert.ok(Math.abs(business.employer.lastSalary - before.salary / 0.85) < 1e-9);
  if (business.employer.kind === "venture") business = advance(business, "closeBusiness");
  assert.equal(business.employer.kind, "seeking");
  assert.ok(Math.abs(business.employer.lastSalary - before.salary / 0.85) < 1e-9);
  const hired = hire(business);
  assert.ok(hired.salary >= before.salary / 0.85 * 0.8);
  assert.deepEqual(decodeSave(encodeSave(hired)), hired);
});

test("pre-fix histories keep salaries, debt and the saved current scene through migration and undo", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/reemployment-pay-saves.json", import.meta.url)));
  for (const { id, save, historyHash, salary, debt } of fixtures) {
    assert.ok(!Object.hasOwn(save, "reemploymentPayFrom"));
    const g = decodeSave(JSON.stringify(save));
    const boundary = save.decisions.length + (save.scenes[String(save.decisions.length)] ? 1 : 0);
    assert.equal(g.reemploymentPayFrom, boundary, id);
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash, id);
    assert.equal(g.salary, salary, id);
    assert.equal(g.debt, debt, id);
    assert.deepEqual(g.scenes, save.scenes, id);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, 0).reemploymentPayFrom, boundary);
    for (const world of compareWorlds(g)) assert.equal(world.reemploymentPayFrom, boundary);
    if (id === "current-scene") {
      assert.equal(advance(g, "focus").employer.lastSalary, g.salary);
      assert.equal(advance({ ...g, reemploymentPayFrom: g.decisions.length }, "focus").employer.lastSalary, g.salary / 0.85);
    }
  }
});

test("pay boundaries validate before AI accounting and partition the scene cache", async () => {
  const g = createGame(profile()), saved = JSON.parse(encodeSave(g));
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  for (const reemploymentPayFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, reemploymentPayFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const accounting = ai.status();
  for (const value of [null, -1, 0.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(14).fill(0), value));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(14).fill(0), value));
    assert.throws(() => encodeSave({ ...g, reemploymentPayFrom: value }));
    const save = JSON.stringify({ ...saved, reemploymentPayFrom: value });
    assert.throws(() => decodeSave(save));
    await assert.rejects(() => ai.generate(save));
  }
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, accounting.calls);
  assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
});

test("a low-paid graduate's layoff and re-employment can create debt without stacked leave cuts", () => {
  // Search seeds for a layoff followed by re-employment, rather than pin one
  // seed whose events shift whenever the incident odds are tuned.
  let checked = 0, withDebt = 0;
  for (let seed = 1; seed <= 600 && checked < 20; seed++) {
    let g = createGame(profile({ children: 0, savings: 30 }), "steady", seed), seen = false;
    for (let year = 0; year < 16 && !g.ended; year++) {
      const before = g;
      g = advance(g, onMentalLeave(g) ? "rest" : ["focus", "focus", "learn", "focus", "connect", "focus", "explore"][year % 7]);
      if (g.history.at(-1).outcome?.kind === "reemployed") {
        // Pay restarts from the last full salary, never a cut taken on leave.
        // An incident in the same year (illness, for example) applies once on top.
        const h = g.history.at(-1);
        assert.equal(g.salary, before.employer.lastSalary * h.outcome.salaryFactor * (h.incident?.effects.salaryFactor ?? 1));
        seen = true;
      }
    }
    if (!seen) continue;
    checked++;
    if (g.debt > 0) withDebt++;
    assert.deepEqual(decodeSave(encodeSave(g)), g);
  }
  assert.ok(checked >= 3, `only ${checked} re-employed careers found`);
  assert.ok(withDebt >= 1, "a low-paid layoff can leave debt");
});

