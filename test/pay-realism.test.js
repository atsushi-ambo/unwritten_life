import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, advance, availableChoices, switchRanks, salaryCeiling,
  optionalProfileInputs, profileInputForLevel, PROFILE_DEFAULTS, MAX_AGE,
} from "../public/engine.js";

// The reported case: 30, IT, regional city, 500万円, at a large company.
const profile = (extra = {}) => optionalProfileInputs({
  ...profileInputForLevel({}, "standard"), age: 30, region: "city", income: 500,
  companyType: "large", ...extra,
}, PROFILE_DEFAULTS);
const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
// Salaries by age over many seeds; `pick` returns this year's decision.
function salariesAt(p, pick, seeds = 60) {
  const at = {};
  for (let seed = 1; seed <= seeds; seed++) {
    let g = createGame(p, "steady", seed * 7919);
    for (let y = 0; y < 32 && !g.ended; y++) {
      g = advance(g, pick(g, y));
      (at[g.age] ??= []).push(g.salary);
    }
  }
  return at;
}
const hop = (g, y) => y % 2 === 0 && availableChoices(g).includes("switch")
  ? { id: "switch", target: "custom", role: "tech", name: `合成転職先${y}`, companyType: "large", rank: switchRanks(g).at(-1), intent: "条件の良い会社へ" }
  : "focus";

test("staying put keeps pay near the start, with a small seniority rise", () => {
  const at = salariesAt(profile(), () => "focus");
  assert.ok(median(at[50]) > 480 && median(at[50]) < 650, `${median(at[50])}`);
});

test("an active job-hopper reaches a realistic line, peaks in the mid-50s and is rehired lower at 60", () => {
  const at = salariesAt(profile(), hop);
  const m = (age) => median(at[age]);
  assert.ok(m(50) > 700 && m(50) < 1050, `50: ${m(50)}`);
  assert.ok(m(55) < m(50) * 1.15, `55: ${m(55)} vs 50: ${m(50)}`);
  assert.ok(m(60) < m(59) * 0.85, `60: ${m(60)} vs 59: ${m(59)}`);
  // Big-city pay is higher, not a different order of magnitude.
  const metro = salariesAt(profile({ region: "metro" }), hop);
  assert.ok(median(metro[50]) > m(50) && median(metro[50]) < m(50) * 1.35);
});

test("the self-employed are not rehired at 60", () => {
  let g = createGame(profile({ age: 58, companyType: "self" }), "steady", 11);
  g = advance(g, "focus");
  const before = g.salary;
  g = advance(g, "focus");
  assert.equal(g.age, 60);
  assert.ok(g.salary > before * 0.9, `${before} -> ${g.salary}`);
});

test("realistic ceilings sit below the former ones and keep role and region order", () => {
  // A low start income, so the floor (start income) does not hide the order.
  const start = createGame(profile({ income: 300 })),
    g = { ...start, employer: { ...start.employer, role: "tech" } };
  const old = { ...g, payRealismFrom: MAX_AGE };
  assert.ok(salaryCeiling(g) < salaryCeiling(old));
  assert.ok(salaryCeiling({ ...g, region: "metro" }) > salaryCeiling(g));
  assert.ok(salaryCeiling({ ...g, employer: { ...g.employer, role: "care" } }) < salaryCeiling(g));
  // Never below the starting income.
  assert.ok(salaryCeiling(createGame(profile({ income: 3000 }))) >= 3000);
});
