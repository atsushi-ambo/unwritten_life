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
  availableChoices,
  applyScene,
  eventFor,
  mortgagePayment,
  amortizeYear,
  MAX_AGE,
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
  savings: 500,
  stocks: 100,
  monthlyCost: 12,
  rent: 7,
  housing: "rent",
  companyType: "unknown",
  company: "",
  pension: 180,
};
test("profile bounds, identity strings, allocation and mortgage inputs are validated", () => {
  for (const [k, v] of [
    ["age", 17],
    ["age", 101],
    ["age", 20.5],
    ["income", Infinity],
    ["income", "500"],
    ["savings", NaN],
    ["stocks", 501],
    ["job", "__proto__"],
    ["region", "constructor"],
    ["company", "x".repeat(61)],
    ["mortgageYears", 2.5],
    ["mortgageRate", 16],
  ])
    assert.throws(() => validateProfile({ ...profile, [k]: v }), k);
  assert.throws(() =>
    validateProfile({ ...profile, housing: "rent", mortgage: 100 }),
  );
  assert.throws(() => createGame(profile, "__proto__"));
  assert.throws(() => createGame(profile, "steady", -1));
  assert.equal(validateProfile({ ...profile, age: 100 }).age, 100);
});
test("wealth categories are counted once, and yearly cash flow reconciles", () => {
  const g = createGame({
    ...profile,
    housing: "own",
    homeValue: 3000,
    mortgage: 1500,
  });
  assert.equal(g.savings, 2000);
  assert.equal(g.cash, 400);
  const n = advance(g, "learn"),
    h = n.history[0];
  assert.ok(
    Math.abs(n.cash - (g.cash + h.disposable - h.expenses + h.bonus)) < 1e-8,
  );
  assert.ok(
    Math.abs(
      n.savings -
        (g.savings +
          h.disposable -
          h.expenses +
          h.bonus +
          h.investmentGain +
          h.propertyGain +
          h.principal -
          h.debtInterest),
    ) < 1e-8,
  );
});
test("mortgage monthly amortization handles zero interest and a complete payoff", () => {
  assert.equal(mortgagePayment(120, 0, 1), 10);
  const loan = amortizeYear(120, 0, 1);
  assert.equal(loan.balance, 0);
  assert.equal(loan.principal, 120);
  const fixed = amortizeYear(1000, 2, 25);
  assert.ok(Math.abs(fixed.payment - fixed.interest - fixed.principal) < 1e-8);
  assert.ok(fixed.balance < 1000);
  assert.equal(amortizeYear(0, 2, 25).payment, 0);
});
test("all careers and worlds finish a bounded lifetime with finite balances", () => {
  for (const job of Object.keys(JOBS))
    for (const scenario of Object.keys(SCENARIOS))
      for (let seed = 1; seed < 4; seed++) {
        let g = createGame({ ...profile, job }, scenario, seed);
        while (!g.ended) {
          const options = availableChoices(g);
          g = advance(g, options[g.decisions.length % options.length]);
          assert.ok(g.decisions.length <= MAX_AGE - profile.age);
          for (const key of [
            "income",
            "savings",
            "cash",
            "investments",
            "homeValue",
            "mortgage",
            "debt",
          ])
            assert.ok(Number.isFinite(g[key]));
          for (const key of ["health", "connection", "freedom", "skill"])
            assert.ok(g[key] >= 0 && g[key] <= 100);
          assert.ok(g.cash >= 0 && g.investments >= 0 && g.mortgage >= 0);
        }
        assert.ok(g.age <= MAX_AGE);
        assert.throws(() => advance(g, "rest"));
      }
});
test("age and retirement change income and old-age scenes", () => {
  let g = createGame({ ...profile, age: 64, retirementAge: 65 }, "steady", 4);
  g = advance(g, "rest");
  g = advance(g, "rest");
  assert.equal(g.retired, true);
  assert.equal(g.salary, 0);
  assert.equal(g.income, 180);
  assert.match(eventFor(g).title, /仕事の先/);
  const early = advance(
    createGame({ ...profile, age: 50 }, "steady", 10),
    "retire",
  );
  assert.equal(early.income, 0);
  assert.equal(early.retired, true);
});
test("choices change subsequent income, portfolio, region and home ownership", () => {
  const g = createGame({ ...profile, savings: 2000 }, "steady", 12);
  const invested = advance(g, "invest");
  assert.ok(invested.investments > g.investments);
  assert.ok(invested.cash < advance(g, "rest").cash);
  const home = advance(g, "home");
  assert.equal(home.housing, "own");
  assert.ok(home.mortgage > 0);
  assert.ok(home.homeValue > 0);
  assert.ok(!availableChoices(home).includes("home"));
  const moved = advance(g, "move");
  assert.notEqual(moved.region, g.region);
  assert.notEqual(moved.livingCost, g.livingCost);
  const switched = advance(g, "switch");
  assert.equal(switched.careerMoves, 1);
  assert.notEqual(switched.salary, advance(g, "focus").salary);
  assert.match(eventFor(switched).title, /新しい環境/);
});
test("changing assets and housing changes later outcomes even without AI", () => {
  const a = advance(createGame(profile, "steady", 11), "rest");
  const b = advance(
    createGame({ ...profile, stocks: 0 }, "steady", 11),
    "rest",
  );
  assert.notEqual(a.savings, b.savings);
  const owned = advance(
    createGame(
      { ...profile, housing: "own", homeValue: 3000, mortgage: 1000, rent: 0 },
      "steady",
      11,
    ),
    "rest",
  );
  assert.notEqual(a.history[0].expenses, owned.history[0].expenses);
});
test("seeded replay, scene cache and undo reproduce a branch exactly", () => {
  let g = createGame(profile, "steady", 567);
  const scene = {
    title: "自分の仕事を見つめる",
    body: "前の学びを振り返る。\n次の選択を考える。",
    insight: "仮想の場面",
    options: ["learn", "rest", "connect"].map((id) => ({
      id,
      label: id,
      hint: "時間の配分",
    })),
  };
  g = applyScene(g, scene);
  g = advance(g, "learn");
  g = advance(g, "connect");
  assert.deepEqual(decodeSave(encodeSave(g)), g);
  const undone = replay(profile, "steady", 567, ["learn"], g.scenes);
  assert.deepEqual(advance(undone, "connect"), g);
  assert.notDeepEqual(advance(undone, "rest").history, g.history);
});
test("AI cannot create arbitrary actions, numeric rewards, duplicate actions or unlimited text", () => {
  const g = createGame(profile),
    valid = {
      title: "一年",
      body: "物語",
      options: ["learn", "rest", "connect"].map((id) => ({
        id,
        label: id,
        hint: "選択",
      })),
    };
  for (const patch of [
    { title: "x".repeat(101) },
    {
      options: [
        { id: "__proto__", label: "x", hint: "x" },
        ...valid.options.slice(1),
      ],
    },
    { options: [valid.options[0], valid.options[0], valid.options[1]] },
    {
      options: [
        { id: "home", label: "x", hint: "x" },
        ...valid.options.slice(1),
      ],
    },
  ])
    assert.throws(() => applyScene(g, { ...valid, ...patch }));
  const safe = applyScene(g, {
    ...valid,
    income: 999999,
    options: valid.options.map((o) => ({ ...o, reward: 99999 })),
  });
  assert.equal(safe.income, g.income);
  assert.equal(Object.hasOwn(eventFor(safe).options[0], "reward"), false);
});
test("world comparisons hold the random shocks and starting profile constant", () => {
  const g = replay(profile, "steady", 987, Array(10).fill("learn"));
  const worlds = compareWorlds(g);
  for (const w of worlds) {
    assert.deepEqual(w.profile, g.profile);
    assert.deepEqual(
      w.history.map((h) => h.volatility),
      g.history.slice(0, w.history.length).map((h) => h.volatility),
    );
  }
  assert.notEqual(worlds[0].income, worlds[2].income);
});
test("untrusted saved state is recomputed and incompatible versions are rejected", () => {
  const raw = JSON.parse(encodeSave(createGame(profile)));
  for (const patch of [
    { version: 1 },
    { decisions: Array(111).fill("rest") },
    { decisions: ["bad"] },
    { decisions: "rest" },
    { seed: 1.1 },
    { profile: null },
  ])
    assert.throws(() => decodeSave(JSON.stringify({ ...raw, ...patch })));
  assert.throws(() => decodeSave("x".repeat(250001)));
  const restored = decodeSave(
    JSON.stringify({
      ...raw,
      income: 999999,
      profile: { ...raw.profile, secret: "ignored" },
    }),
  );
  assert.equal(restored.income, 500);
  assert.equal(Object.hasOwn(restored.profile, "secret"), false);
});
test("company information affects the model only after explicit confirmation; gender and names do not dictate wealth", () => {
  const fact = {
    summary: "IT services",
    sector: "tech",
    confirmed: false,
    sources: [
      {
        url: "https://example.com/about",
        title: "About",
        checkedAt: "2026-10-17",
      },
    ],
  };
  const original = advance(createGame(profile, "steady", 4), "learn");
  const nameOnly = advance(
    createGame(
      { ...profile, company: "<img src=x onerror=alert(1)>", gender: "woman" },
      "steady",
      4,
    ),
    "learn",
  );
  assert.equal(original.savings, nameOnly.savings);
  const unconfirmed = advance(
    createGame({ ...profile, companyFacts: fact }, "steady", 4),
    "learn",
  );
  assert.equal(original.income, unconfirmed.income);
  const confirmed = advance(
    createGame(
      {
        ...profile,
        companyFacts: { ...fact, sector: "physical", confirmed: true },
      },
      "steady",
      4,
    ),
    "learn",
  );
  assert.notEqual(original.income, confirmed.income);
});
