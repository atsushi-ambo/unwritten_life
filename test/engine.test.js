import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  advance,
  replay,
  compareWorlds,
  encodeSave,
  decodeSave,
  validateProfile,
  SCENARIOS,
  JOBS,
  CHOICES,
  YEARS,
} from "../public/engine.js";
const profile = {
  age: 30,
  region: "city",
  job: "tech",
  income: 500,
  ai: "sometimes",
  priority: "balance",
  gender: "undisclosed",
  household: "solo",
  savings: 300,
  monthlyCost: 17,
  companyType: "unknown",
  company: "",
};

test("invalid and boundary inputs are rejected without losing legitimate zero/negative balances", () => {
  for (const [key, value] of [
    ["age", 17],
    ["age", 81],
    ["age", 20.5],
    ["income", -1],
    ["income", Infinity],
    ["income", "500"],
    ["savings", NaN],
    ["monthlyCost", -1],
    ["job", "__proto__"],
    ["region", "constructor"],
    ["ai", "nope"],
    ["company", "a".repeat(61)],
    ["company", "\u0000"],
  ])
    assert.throws(() => validateProfile({ ...profile, [key]: value }), key);
  assert.throws(() => createGame(profile, "__proto__"));
  assert.throws(() => createGame(profile, "steady", -1));
  assert.equal(
    validateProfile({ ...profile, income: 0, savings: -100 }).income,
    0,
  );
  assert.equal(validateProfile({ ...profile, age: 80 }).age, 80);
});
test("one choice advances one year and the balance follows the documented cash flow", () => {
  const g = createGame(profile, "steady", 4),
    next = advance(g, "learn"),
    h = next.history[0];
  assert.equal(g.decisions.length, 0);
  assert.equal(next.year, 2027);
  assert.equal(next.age, 31);
  assert.equal(
    next.savings,
    profile.savings + h.disposable - h.expenses + h.bonus,
  );
  assert.equal(h.expenses, 17 * 12 + CHOICES.learn.cost);
  assert.equal(h.disposable, next.income * 0.76);
});
test("all jobs, scenarios and choices remain finite and bounded through a complete story", () => {
  for (const job of Object.keys(JOBS))
    for (const scenario of Object.keys(SCENARIOS))
      for (const choice of Object.keys(CHOICES)) {
        const g = replay(
          { ...profile, job },
          scenario,
          123,
          Array(YEARS).fill(choice),
        );
        assert.equal(g.year, 2046);
        assert.equal(g.decisions.length, YEARS);
        for (const record of g.history) {
          for (const key of [
            "income",
            "savings",
            "health",
            "connection",
            "freedom",
            "skill",
          ])
            assert.ok(Number.isFinite(record[key]));
          for (const key of ["health", "connection", "freedom", "skill"])
            assert.ok(record[key] >= 0 && record[key] <= 100);
        }
        assert.throws(() => advance(g, choice));
      }
});
test("replay, undo and saved continuation reproduce the same branch exactly", () => {
  const decisions = ["learn", "rest", "connect", "explore", "focus"];
  const g = replay(profile, "fast", 567, decisions);
  assert.deepEqual(decodeSave(encodeSave(g)), g);
  const undone = replay(profile, "fast", 567, decisions.slice(0, -1));
  assert.deepEqual(advance(undone, "focus"), g);
  assert.notDeepEqual(advance(undone, "rest"), g);
});
test("comparison holds starting point, decisions and random shocks constant", () => {
  const g = replay(profile, "steady", 987, Array(10).fill("learn"));
  const worlds = compareWorlds(g);
  for (const world of worlds) {
    assert.deepEqual(world.decisions, g.decisions);
    assert.equal(world.seed, g.seed);
    assert.deepEqual(
      world.history.map((h) => h.volatility),
      g.history.map((h) => h.volatility),
    );
  }
  assert.notEqual(worlds[0].income, worlds[2].income);
  assert.deepEqual(worlds[1], g);
});
test("sensitive identity labels do not change economic outcomes", () => {
  const base = replay(profile, "steady", 10, Array(20).fill("focus"));
  const changed = replay(
    { ...profile, gender: "woman", company: "<img src=x onerror=alert(1)>" },
    "steady",
    10,
    Array(20).fill("focus"),
  );
  assert.deepEqual(base.history, changed.history);
});
test("untrusted saved data cannot inject computed state, extra fields, invalid choices or unbounded replay", () => {
  const base = JSON.parse(encodeSave(createGame(profile)));
  for (const patch of [
    { version: 999 },
    { decisions: Array(21).fill("learn") },
    { decisions: ["__proto__"] },
    { decisions: "learn" },
    { seed: 1.1 },
    { profile: null },
  ])
    assert.throws(() => decodeSave(JSON.stringify({ ...base, ...patch })));
  assert.throws(() => decodeSave("x".repeat(12001)));
  const restored = decodeSave(
    JSON.stringify({
      ...base,
      income: 999999,
      profile: { ...profile, secret: "extra" },
    }),
  );
  assert.equal(restored.income, 500);
  assert.equal(Object.hasOwn(restored.profile, "secret"), false);
});
test("zero income, zero cost and negative savings do not create imaginary income", () => {
  const g = replay(
    { ...profile, income: 0, savings: -300, monthlyCost: 0 },
    "fast",
    51,
    Array(20).fill("rest"),
  );
  assert.equal(g.income, 0);
  assert.equal(g.savings, -400);
});
