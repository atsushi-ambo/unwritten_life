import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, advance, availableChoices, encodeSave, decodeSave, replay,
  compareWorlds, profileInputForLevel, salaryCeiling, MAX_AGE, JOBS, SCENARIOS,
} from "../public/engine.js";

const quick = (band = "30s", job = "tech") =>
  ({ ...profileInputForLevel({}, "quick", { band, region: "city" }), job });
// The playtest pattern: study daily and deepen work, take every raise offered.
function grind(g, years) {
  for (let k = 0; k < years && !g.ended && g.age < g.profile.retirementAge; k++) {
    const ids = availableChoices(g);
    g = advance(g, ["negotiate", "studyDaily", "focus"].find((id) => ids.includes(id)));
  }
  return g;
}
// Salary rules are compared between action paths, so chance incidents (which
// depend on the action) are off here.
const capAt = (from, payRealismFrom = MAX_AGE, lifeRealismFrom = 0, driftFrom = 0) => (profile, scenario, seed) =>
  createGame(profile, scenario, seed, 0, 0, 0, 0, 0, 0, from, MAX_AGE, 0, 0, payRealismFrom, lifeRealismFrom, 0, 0, 0, driftFrom);
function replayAt(g, length) {
  return replay(g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
    {}, false, g.dynamicFrom, g.worldFrom, g.retirementFrom,
    g.careLeaveSalaryFrom, g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom, g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom, g.offersFrom, g.paceFrom, g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom);
}

test("long-run salaries level off near a job and region ceiling but keep variance", () => {
  for (const job of Object.keys(JOBS)) {
    for (const band of ["30s", "20s", "40s"]) {
      for (const scenario of Object.keys(SCENARIOS)) {
        const peaks = [];
        for (let seed = 0; seed < 8; seed++) {
          let g = capAt(0)(quick(band, job), scenario, seed);
          const ceiling = salaryCeiling(g);
          let peak = 0;
          while (!g.ended && g.age < g.profile.retirementAge) {
            const before = g.salary;
            g = grind(g, 1);
            if (before > ceiling)
              assert.ok(g.salary - before <= before * 0.1, `${job} ${seed} ${before}->${g.salary}`);
            peak = Math.max(peak, g.salary);
          }
          assert.ok(peak <= ceiling * 1.6, `${job} ${band} ${scenario} ${seed}: ${peak} > ${ceiling}`);
          peaks.push(Math.round(peak));
        }
        assert.ok(new Set(peaks).size > 4, `${job} ${band} ${scenario}: ${peaks}`);
      }
    }
  }
});

test("the reported IT career stays plausible while high earners remain possible", () => {
  const peaks = [], before = [];
  const reported = { ...quick(), age: 30, income: 500, savings: 300, monthlyCost: 12 };
  for (let seed = 0; seed < 30; seed++) {
    peaks.push(grind(capAt(0)(reported, "steady", seed), 34).salary);
    before.push(grind(capAt(MAX_AGE)(reported, "steady", seed), 34).salary);
  }
  const median = (v) => [...v].sort((a, b) => a - b)[15];
  // Without the boundary the same choices compound to several thousand 万円.
  assert.ok(median(before) > 2500);
  assert.ok(median(peaks) < 1800, `${median(peaks)}`);
  assert.ok(Math.max(...peaks) > 1200);
  assert.ok(Math.max(...peaks) - Math.min(...peaks) > 200);
  // Ceilings follow role, region and employer type, never below a start income.
  const g = capAt(0)(quick(), "steady", 2026);
  assert.equal(salaryCeiling(g), 1400);
  assert.ok(salaryCeiling({ ...g, region: "metro" }) > salaryCeiling(g));
  assert.ok(salaryCeiling({ ...g, employer: { ...g.employer, role: "care" } }) < salaryCeiling(g));
  assert.equal(salaryCeiling(capAt(0)({ ...quick(), income: 3000 }, "steady", 2026)), 3900);
});

test("salary cap migration replays old saves exactly and applies from the next decision", () => {
  const old = grind(capAt(MAX_AGE)(quick(), "steady", 3), 25);
  const saved = JSON.parse(encodeSave(old));
  delete saved.salaryCapFrom;
  const migrated = decodeSave(JSON.stringify(saved)), n = old.decisions.length;
  assert.equal(migrated.salaryCapFrom, n);
  assert.deepEqual(migrated, { ...old, salaryCapFrom: n });
  assert.deepEqual(decodeSave(encodeSave(migrated)), migrated);
  for (let i = 0; i <= n; i += 5)
    assert.deepEqual(replayAt(migrated, i).history, replayAt(old, i).history);
  const uncapped = advance(old, "focus"), capped = advance(migrated, "focus");
  assert.ok(capped.salary < uncapped.salary);
  assert.deepEqual(capped.history.slice(0, n), old.history);
  assert.deepEqual(replayAt(capped, n), migrated);
  assert.deepEqual(advance(replayAt(capped, n), "focus"), capped);
  assert.deepEqual(decodeSave(encodeSave(capped)), capped);
  for (const world of compareWorlds(capped)) assert.equal(world.salaryCapFrom, n);
});

test("salary cap boundaries are validated by create, replay, encode and decode", () => {
  const profile = quick(), g = createGame(profile), saved = JSON.parse(encodeSave(g));
  assert.equal(g.salaryCapFrom, 0);
  assert.equal(saved.salaryCapFrom, 0);
  for (const salaryCapFrom of [null, -1, 1.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(profile, "steady", 42, 0, 0, 0, 0, 0, 0, salaryCapFrom));
    assert.throws(() => replay(profile, "steady", 42, [], {}, false, 0, 0, 0, 0, 0, 0, salaryCapFrom));
    assert.throws(() => encodeSave({ ...g, salaryCapFrom }));
    assert.throws(() => decodeSave(JSON.stringify({ ...saved, salaryCapFrom })));
  }
  for (const salaryCapFrom of [0, 1, MAX_AGE]) {
    const bounded = createGame(profile, "steady", 42, 0, 0, 0, 0, 0, 0, salaryCapFrom);
    assert.deepEqual(decodeSave(encodeSave(bounded)), bounded);
  }
});

test("legacy consecutive care leave cannot cancel its cut and bypass the salary cap", () => {
  const profile = {
    ...quick(), income: 900, children: 2, childStage: "young",
    household: "shared", partner: "partner",
  };
  let damped = 0;
  for (const scenario of Object.keys(SCENARIOS)) {
    for (let seed = 0; seed < 6; seed++) {
      // The legacy inequality includes asymmetric downside noise. New
      // symmetric noise can make capped downside smaller than uncapped.
      let g = advance(capAt(0, MAX_AGE, 0, MAX_AGE)(profile, scenario, seed), "careLeave");
      for (let k = 0; k < 12; k++) {
        // Same state and choice, with and without the cap for this year.
        const capped = advance(g, "careLeave"),
          uncapped = advance({ ...g, salaryCapFrom: MAX_AGE }, "careLeave");
        assert.ok(capped.salary <= uncapped.salary + 1e-9);
        if (capped.salary < uncapped.salary - 1e-6) damped++;
        g = capped;
      }
    }
  }
  assert.ok(damped > 20, `${damped}`);
});

test("far above the ceiling a raise cannot offset negative growth", () => {
  let checked = 0;
  for (const scenario of Object.keys(SCENARIOS)) {
    for (let seed = 0; seed < 40; seed++) {
      const g = { ...capAt(0)(quick(), scenario, seed), salary: 5000 },
        rest = advance(g, "rest"), study = advance(g, "studyDaily");
      if (study.history.at(-1).outcome.kind !== "success") continue;
      // Damping is ~0 here, so the success multiplier adds almost nothing.
      assert.ok(Math.abs(study.salary - rest.salary) < 5, `${scenario} ${seed}`);
      if (rest.salary < 5000) checked++;
    }
  }
  assert.ok(checked > 5, `${checked}`);
});

test("a care leave year does not leave a permanent bonus after restoration", () => {
  const profile = {
    ...quick(), income: 1400, children: 1, childStage: "young",
    household: "shared", partner: "partner",
  };
  for (const scenario of Object.keys(SCENARIOS)) {
    for (let seed = 0; seed < 10; seed++) {
      for (const from of [0, MAX_AGE]) {
        const g = capAt(from)(profile, scenario, seed),
          steady = advance(advance(g, "rest"), "rest"),
          leave = advance(advance(g, "careLeave"), "rest");
        assert.ok(Math.abs(steady.salary - leave.salary) < 1e-6,
          `${from} ${scenario} ${seed}: ${steady.salary} ${leave.salary}`);
      }
    }
  }
});
