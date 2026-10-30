import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, encodeSave, decodeSave, replay, compareWorlds, MAX_AGE, onMentalLeave,
} from "../public/engine.js";
import { worldAt } from "../public/world.js";
import { curveProfile } from "../scripts/simulate-pay-curve.mjs";
import { measureCycles } from "../scripts/simulate-pay-cycles.mjs";
import { readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const replayGame = (g, length = g.decisions.length) => replay(
  g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
  Object.fromEntries(Object.entries(g.scenes).filter(([step]) => Number(step) <= length)),
  false, g.dynamicFrom, g.worldFrom, g.retirementFrom, g.careLeaveSalaryFrom,
  g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom,
  g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom, g.offersFrom, g.paceFrom,
  g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom, g.cycleFrom, g.spendFrom, g.oddsFrom, g.lifeEventsFrom,
);

test("downturns no longer leave a quarter of stayers far below their own peak", () => {
  const after = measureCycles({ seeds: 300 }), before = measureCycles({ seeds: 300, from: MAX_AGE });
  assert.ok(before.dropOver25 > 0.15, `${before.dropOver25}`);
  assert.ok(after.dropOver25 < 0.03, `${after.dropOver25}`);
  // The median curve still rises into the 50s; outcomes still differ.
  const s = after.spread;
  assert.ok(s[30][1] < s[40][1] && s[40][1] < s[50][1], JSON.stringify(s));
  assert.ok(s[50][2] > s[50][0] * 1.15, JSON.stringify(s));
});

test("a year's economy and company conditions move pay by their change from the year before", () => {
  // Find a stayer year whose conditions change, with no incident or outcome.
  let found = 0;
  for (let seed = 1; seed <= 400 && found < 5; seed++) {
    const g = { ...createGame(curveProfile("care", "30s"), "steady", seed), salary: 100, health: 80, incidentFrom: MAX_AGE };
    for (let year = 2029; year < 2060; year += 3) {
      const at = { ...g, year };
      const change = worldAt(at).growth - worldAt({ ...at, year: year - 1 }).growth;
      if (Math.abs(change) < 0.02) continue;
      const now = advance(at, "rest").salary, flat = advance({ ...at, cycleFrom: MAX_AGE }, "rest").salary;
      const level = worldAt(at).growth, mean = -0.0072;
      // The old rule adds the level (minus its mean); the new one adds the change.
      // A low salary keeps the ceiling damping out of the comparison.
      assert.ok(Math.abs((now - flat) / 100 - (change - (level - mean))) < 0.002, `${seed} ${year}: ${now} ${flat}`);
      found++;
      break;
    }
  }
  assert.ok(found >= 3);
});

test("cycleFrom preserves recorded pay and current scenes through replay, undo and comparison", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/pay-cycle-saves.json", import.meta.url)));
  for (const { id, save, historyHash, salary, savings } of fixtures) {
    assert.ok(!Object.hasOwn(save, "cycleFrom"));
    const g = decodeSave(JSON.stringify(save));
    const boundary = save.decisions.length + (save.scenes[String(save.decisions.length)] ? 1 : 0);
    assert.equal(g.cycleFrom, boundary);
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash, id);
    assert.equal(g.salary, salary);
    assert.equal(g.savings, savings);
    assert.deepEqual(g.scenes, save.scenes);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, 0).cycleFrom, boundary);
    for (const world of compareWorlds(g)) assert.equal(world.cycleFrom, boundary);
    const action = onMentalLeave(g) ? "rest" : "focus";
    const next = advance(g, action), old = advance({ ...g, cycleFrom: MAX_AGE }, action);
    if (id.includes("current-scene")) assert.deepEqual(next.history, old.history);
    else assert.notDeepEqual(next.history, old.history);
    assert.deepEqual(replayGame(next, g.decisions.length).history, g.history);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
  }
});

test("cycleFrom validates all entry points before AI accounting and partitions scene caches", async () => {
  const g = createGame(curveProfile()), saved = JSON.parse(encodeSave(g));
  assert.equal(g.cycleFrom, 0);
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  for (const cycleFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, cycleFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const accounting = ai.status();
  for (const value of [null, -1, 0.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(18).fill(0), value));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(18).fill(0), value));
    assert.throws(() => encodeSave({ ...g, cycleFrom: value }));
    const save = JSON.stringify({ ...saved, cycleFrom: value });
    assert.throws(() => decodeSave(save));
    await assert.rejects(() => ai.generate(save));
  }
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, accounting.calls);
  assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
});
