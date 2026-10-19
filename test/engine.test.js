import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  decisionId,
  isRetiredAt,
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
test("tiny positive mortgage rates stay finite and repay only the scheduled principal", () => {
  for (const rate of [1e-14, 1e-10, 0]) {
    const monthly = mortgagePayment(1200, rate, 25),
      loan = amortizeYear(1200, rate, 25);
    assert.ok(Number.isFinite(monthly));
    assert.ok(Math.abs(monthly - 4) < 1e-8);
    assert.ok(Math.abs(loan.balance - 1152) < 1e-7);
    assert.ok(Math.abs(loan.principal - 48) < 1e-7);
    assert.ok(Math.abs(loan.payment - loan.interest - loan.principal) < 1e-8);
  }
  const base = createGame({
    ...profile, housing: "own", homeValue: 3000,
    mortgage: 1200, mortgageRate: 1e-14, mortgageYears: 25,
  }, "steady", 42);
  const next = advance(base, "rest");
  assert.ok(Math.abs(next.mortgage - 1152) < 1e-7);
  assert.deepEqual(decodeSave(encodeSave(next)), next);
});
test("ordinary mortgage rates retain exactly the original payment arithmetic for saved histories", () => {
  for (const rate of [1.2e-6, 0.01, 0.1, 1.5, 2, 15]) {
    for (const years of [1, 25, 40]) {
      const r = rate / 100 / 12, n = years * 12;
      assert.equal(mortgagePayment(1500, rate, years),
        (1500 * r) / (1 - (1 + r) ** -n));
    }
  }
});

test("pre-fix care-leave histories keep their salary, cash and recorded investment when migrated", () => {
  const { save, expected } = JSON.parse(readFileSync(
    new URL("./fixtures/care-leave-save.json", import.meta.url),
  ));
  assert.equal(Object.hasOwn(save, "careLeaveSalaryFrom"), false);
  const restored = decodeSave(JSON.stringify(save));
  assert.equal(restored.careLeaveSalaryFrom, save.decisions.length);
  assert.equal(restored.cash, expected.cash);
  assert.equal(restored.salary, expected.salary);
  assert.equal(restored.investments, expected.investments);
  assert.deepEqual(restored.history.map((h) => ({
    income: h.income, savings: h.savings, outcome: h.outcome.kind,
  })), expected.history);
  assert.deepEqual(decodeSave(encodeSave(restored)), restored);
  assert.deepEqual(replay(restored.profile, restored.scenario, restored.seed,
    restored.decisions, restored.scenes, false, restored.dynamicFrom,
    restored.worldFrom, restored.retirementFrom, restored.careLeaveSalaryFrom,
    restored.prepayFrom, restored.debtRepayFrom, restored.salaryCapFrom, restored.incidentFrom, restored.careerPathFrom), restored);
  const beforeInvestment = replay(restored.profile, restored.scenario, restored.seed,
    restored.decisions.slice(0, -1), {}, false, restored.dynamicFrom,
    restored.worldFrom, restored.retirementFrom, restored.careLeaveSalaryFrom,
    restored.prepayFrom, restored.debtRepayFrom, restored.salaryCapFrom, restored.incidentFrom, restored.careerPathFrom);
  assert.ok(beforeInvestment.cash > 30);
  assert.deepEqual(advance(beforeInvestment, "invest"), restored);
  const currentMath = replay(restored.profile, restored.scenario, restored.seed,
    restored.decisions.slice(0, -1));
  assert.ok(currentMath.cash < 30);
  assert.throws(() => decodeSave(JSON.stringify({ ...save, careLeaveSalaryFrom: 0 })));
  for (const other of compareWorlds(restored))
    assert.equal(other.careLeaveSalaryFrom, restored.careLeaveSalaryFrom);
  assert.deepEqual(decodeSave(encodeSave(advance(restored, "rest"))), advance(restored, "rest"));
});

test("care-leave salary migration markers are bounded integers and activate only at the boundary", () => {
  const before = createGame({ ...profile, children: 1 }, "steady", 70),
    save = JSON.parse(encodeSave(before));
  assert.equal(before.careLeaveSalaryFrom, 0);
  assert.equal(save.careLeaveSalaryFrom, 0);
  for (const careLeaveSalaryFrom of [null, -1, 0.5, "2", MAX_AGE + 1]) {
    assert.throws(() => decodeSave(JSON.stringify({ ...save, careLeaveSalaryFrom })));
    assert.throws(() => createGame(before.profile, "steady", 70, 0, 0, 0, careLeaveSalaryFrom));
  }
  let g = createGame(before.profile, "steady", 70, 0, 0, 0, 3);
  for (const d of [{ id: "startup", venture: "ai", name: "合成事業" }, "careLeave"])
    g = advance(g, d);
  assert.equal(g.salary, 0);
  const decision = { id: "switch", target: "toyota", role: "tech" };
  const oldMath = advance(g, decision);
  const fixedMath = advance({ ...g, careLeaveSalaryFrom: 2 }, decision);
  assert.ok(Math.abs(oldMath.salary * 0.85 - fixedMath.salary) < 1e-10);
  assert.deepEqual(decodeSave(encodeSave(oldMath)), oldMath);
  assert.deepEqual(decodeSave(encodeSave(fixedMath)), fixedMath);
});
test("all careers and worlds finish a bounded lifetime with finite balances", () => {
  for (const job of Object.keys(JOBS))
    for (const scenario of Object.keys(SCENARIOS))
      for (let seed = 1; seed < 4; seed++) {
        let g = createGame({ ...profile, job }, scenario, seed);
        while (!g.ended) {
          const options = availableChoices(g);
          const id = options[g.decisions.length % options.length];
          g = advance(
            g,
            id === "startup"
              ? { id, venture: "ai", name: "合成テスト事業" }
              : id,
          );
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
  assert.match(eventFor(g).title, /仕事で得たもの.*その先/u);
  const early = advance(
    createGame({ ...profile, age: 50 }, "steady", 10),
    "retire",
  );
  assert.equal(early.income, 0);
  assert.equal(early.retired, true);
});
test("work choices stop at the configured retirement age before the retired flag updates, and saves still replay", () => {
  const switchJob = { id: "switch", target: "toyota", role: "tech" },
    startup = { id: "startup", venture: "ai", name: "合成事業" };
  for (const retirementAge of [60, 65, 70]) {
    const before = createGame(
      {
        ...profile,
        age: retirementAge - 1,
        retirementAge,
        savings: 4000,
        children: 1,
        childStage: "young",
      },
      "steady",
      4,
    );
    for (const id of ["switch", "startup", "home", "careLeave", "retire"])
      assert.ok(availableChoices(before).includes(id), id);
    assert.ok(advance(before, switchJob).salary > 0);
    assert.ok(advance(before, startup).salary > 0);
    const at = advance(before, "learn");
    assert.equal(at.age, retirementAge);
    assert.equal(at.retired, false);
    assert.deepEqual(decodeSave(encodeSave(at)), at);
    for (const game of [at, { ...at, age: retirementAge + 1 }]) {
      for (const id of [
        "switch",
        "startup",
        "home",
        "pilot",
        "negotiate",
        "mentor",
        "careLeave",
        "opportunity",
        "retire",
      ])
        assert.ok(!availableChoices(game).includes(id), id);
      assert.throws(() => advance(game, switchJob));
      assert.throws(() => advance(game, startup));
    }
    const next = advance(at, "rest");
    assert.equal(next.retired, true);
    assert.equal(next.salary, 0);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
  }
  const early = advance(
    createGame({ ...profile, age: 50, retirementAge: 70 }, "steady", 4),
    "retire",
  );
  assert.ok(!availableChoices(early).includes("switch"));
  assert.ok(!availableChoices(early).includes("startup"));
  assert.deepEqual(decodeSave(encodeSave(early)), early);
});
test("venture expansion, pivot and closure are unavailable at the retirement boundary", () => {
  const venture = advance(
    createGame({ ...profile, age: 63, savings: 4000 }, "steady", 4),
    { id: "startup", venture: "ai", name: "合成事業" },
  );
  for (const [businessStage, id] of [
    ["growing", "expand"],
    ["setback", "pivot"],
  ]) {
    const before = { ...venture, businessStage };
    assert.ok(availableChoices(before).includes(id));
    assert.ok(availableChoices(before).includes("closeBusiness"));
    const at = { ...before, age: 65, retired: false };
    assert.ok(!availableChoices(at).includes(id));
    assert.ok(!availableChoices(at).includes("closeBusiness"));
    assert.throws(() => advance(at, id));
    assert.throws(() => advance(at, "closeBusiness"));
  }
});
test("pre-change retirement saves preserve boundary work history and the current switch scene exactly", () => {
  const fixtures = JSON.parse(
    readFileSync(new URL("./fixtures/retirement-saves.json", import.meta.url)),
  );
  for (const { id, save, expected } of fixtures) {
    assert.ok(!Object.hasOwn(save, "retirementFrom"));
    const restored = decodeSave(JSON.stringify(save));
    const { retirementFrom, careLeaveSalaryFrom, prepayFrom, debtRepayFrom, salaryCapFrom, incidentFrom, careerPathFrom, position, reflections, careerSeen, ...state } = restored;
    assert.equal(incidentFrom, save.decisions.length);
    assert.equal(careerPathFrom, save.decisions.length);
    assert.equal(position.rank, "unspecified");
    assert.deepEqual(reflections, {});
    assert.deepEqual(careerSeen, {});
    assert.equal(retirementFrom, save.decisions.length + 1);
    assert.equal(careLeaveSalaryFrom, save.decisions.length);
    assert.equal(prepayFrom, save.decisions.length);
    assert.equal(debtRepayFrom, save.decisions.length);
    assert.equal(salaryCapFrom, save.decisions.length);
    assert.equal(state.profile.careerInterests, "");
    assert.equal(state.profile.rank, "unspecified");
    state.profile = { ...state.profile };
    delete state.profile.careerInterests;
    delete state.profile.rank;
    state.history = state.history.map(({ budget, debtRepayment, ...entry }) => entry);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), expected, id);
    assert.deepEqual(decodeSave(encodeSave(restored)), restored, id);
    assert.deepEqual(
      replay(
        restored.profile,
        restored.scenario,
        restored.seed,
        restored.decisions,
        restored.scenes,
        false,
        restored.dynamicFrom,
        restored.worldFrom,
        restored.retirementFrom,
        restored.careLeaveSalaryFrom,
        restored.prepayFrom,
        restored.debtRepayFrom,
        restored.salaryCapFrom,
        restored.incidentFrom,
        restored.careerPathFrom,
      ),
      restored,
    );
    for (const other of compareWorlds(restored)) {
      assert.equal(other.retirementFrom, retirementFrom);
      assert.deepEqual(other.decisions, restored.decisions);
    }
    if (id === "current-switch-scene") {
      assert.equal(restored.retired, false);
      assert.equal(isRetiredAt(restored), false);
      assert.ok(availableChoices(restored).includes("switch"));
      assert.ok(restored.scenes["1"].options.some((o) => o.id === "switch"));
      const next = advance(restored, "switch");
      assert.equal(next.retired, true);
      assert.equal(isRetiredAt(next), true);
      assert.ok(!availableChoices(next).includes("switch"));
      assert.deepEqual(decodeSave(encodeSave(next)), next);
    }
    assert.throws(() => decodeSave(JSON.stringify({ ...save, retirementFrom: 0 })));
  }
});
test("retirement migration markers are bounded and cannot override the old retired-state validation", () => {
  const before = createGame({ ...profile, age: 64, retirementAge: 65 }, "steady", 4),
    boundary = advance(before, "rest"),
    save = JSON.parse(encodeSave(boundary));
  assert.equal(before.retirementFrom, 0);
  assert.equal(isRetiredAt(before), false);
  assert.equal(isRetiredAt(boundary), true);
  assert.equal(save.retirementFrom, 0);
  assert.ok(!availableChoices(boundary).includes("switch"));
  assert.ok(!availableChoices(boundary).includes("startup"));
  const oldBefore = JSON.parse(encodeSave(before));
  delete oldBefore.retirementFrom;
  const resumed = decodeSave(JSON.stringify(oldBefore));
  assert.equal(resumed.retirementFrom, 1);
  const next = advance(resumed, "rest");
  assert.equal(next.retired, false);
  assert.equal(isRetiredAt(next), true);
  assert.ok(!availableChoices(next).includes("switch"));
  assert.deepEqual(decodeSave(encodeSave(next)), next);
  for (const retirementFrom of [null, -1, 0.5, "2", MAX_AGE + 1])
    assert.throws(() => decodeSave(JSON.stringify({ ...save, retirementFrom })));
  assert.throws(() => decodeSave(JSON.stringify({
    ...save, decisions: ["rest", "switch"],
  })));
  const legacy = decodeSave(JSON.stringify({ ...save, retirementFrom: MAX_AGE }));
  assert.ok(availableChoices(legacy).includes("switch"));
  const retired = advance(legacy, "switch");
  assert.equal(retired.retired, true);
  assert.throws(() => advance(retired, "switch"));
  assert.throws(() => advance(retired, {
    id: "startup", venture: "ai", name: "合成事業",
  }));
  assert.throws(() => decodeSave(JSON.stringify({
    ...save,
    retirementFrom: MAX_AGE,
    decisions: ["rest", "switch", "switch"],
    retired: false,
  })));
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
  assert.throws(
    () =>
      encodeSave({ ...createGame(profile), scenes: { 0: "x".repeat(250001) } }),
    /上限/,
  );
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

test("chosen employer and role change future outcomes and survive saving, replay and undo", () => {
  const g = createGame(profile, "steady", 42);
  const ms = advance(g, { id: "switch", target: "microsoft", role: "tech" });
  const toyota = advance(g, {
    id: "switch",
    target: "toyota",
    role: "physical",
  });
  assert.equal(ms.employer.name, "Microsoft");
  assert.equal(toyota.employer.role, "physical");
  assert.notEqual(ms.income, toyota.income);
  assert.match(eventFor(ms).body, /Microsoft/);
  assert.match(eventFor(toyota).body, /自動車/);
  const n = advance(ms, "learn");
  assert.equal(n.employer.id, "microsoft");
  assert.notEqual(n.income, advance(toyota, "learn").income);
  assert.deepEqual(decodeSave(encodeSave(n)), n);
  const undone = replay(profile, "steady", 42, n.decisions.slice(0, -1));
  assert.deepEqual(advance(undone, "learn"), n);
  assert.deepEqual(replay(profile, "steady", 42, []).employer, g.employer);
  for (const w of compareWorlds(n)) assert.equal(w.employer.name, "Microsoft");
  // Same role in different business sectors also changes the model.
  assert.notEqual(
    ms.income,
    advance(g, { id: "switch", target: "toyota", role: "tech" }).income,
  );
});
test("legacy saves keep dated evidence and the founding year of earlier fictional employers", () => {
  const g = createGame(profile, "steady", 42);
  assert.throws(() =>
    advance(g, { id: "switch", target: "machi", role: "care" }),
  );
  let future = replay(profile, "steady", 42, Array(10).fill("rest"));
  future = advance(future, { id: "switch", target: "machi", role: "care" });
  assert.equal(future.employer.kind, "fictional");
  assert.equal(future.employer.facts, null);
  assert.match(future.employer.summary, /架空/);
  const real = advance(g, {
    id: "switch",
    target: "nintendo",
    role: "creative",
  });
  assert.equal(real.employer.facts.sources[0].checkedAt, "2026-10-17");
  assert.match(real.employer.facts.sources[0].url, /nintendo.co.jp/);
});
test("starting a business pays setup once, ongoing costs yearly, and stops costs when leaving", () => {
  const g = createGame(profile, "steady", 42);
  const action = { id: "startup", venture: "ai", name: "ひかりの仕事場" };
  const business = advance(g, action),
    h = business.history[0];
  assert.equal(business.employer.kind, "venture");
  assert.equal(business.employer.name, action.name);
  assert.equal(h.businessSetup, 60);
  assert.equal(h.businessOverhead, 24);
  assert.equal(decisionId(business.decisions[0]), "startup");
  assert.ok(
    Math.abs(business.cash - (g.cash + h.disposable - h.expenses + h.bonus)) <
      1e-8,
  );
  const second = advance(business, "focus");
  assert.equal(second.history[1].businessSetup, 0);
  assert.equal(second.history[1].businessOverhead, 24);
  assert.match(eventFor(second).body, /ひかりの仕事場/);
  assert.deepEqual(decodeSave(encodeSave(second)), second);
  assert.deepEqual(
    advance(replay(profile, "steady", 42, []), action),
    business,
  );
  const employed = advance(second, {
    id: "switch",
    target: "layerx",
    role: "people",
  });
  assert.equal(employed.history[2].businessOverhead, 0);
  assert.equal(employed.employer.kind, "real");
  const older = createGame({ ...profile, age: 50 }, "steady", 42);
  const retired = advance(advance(older, action), "retire");
  assert.equal(retired.history[1].businessOverhead, 0);
  assert.equal(retired.salary, 0);
  assert.throws(() =>
    advance(createGame({ ...profile, savings: 59, stocks: 0 }), action),
  );
  const emptyIncome = advance(
    createGame({ ...profile, income: 0 }, "steady", 42),
    action,
  );
  assert.ok(emptyIncome.income > 0);
});
test("career inputs reject impossible choices and unconfirmed facts; saved derived values cannot override them", () => {
  const g = createGame(profile, "steady", 42);
  for (const a of [
    { id: "switch", target: "__proto__", role: "tech" },
    { id: "switch", target: "microsoft", role: "__proto__" },
    { id: "switch", target: "microsoft", role: "other" },
    { id: "startup", venture: "constructor", name: "x" },
    { id: "startup", venture: "ai", name: "x".repeat(61) },
    { id: "startup", venture: "community", name: "" },
    {
      id: "switch",
      target: "custom",
      name: "x",
      role: "tech",
      companyType: "large",
      facts: { summary: "x", sector: "tech", confirmed: false, sources: [] },
    },
  ])
    assert.throws(() => advance(g, a));
  const custom = {
    id: "switch",
    target: "custom",
    name: "テスト株式会社",
    role: "people",
    companyType: "unknown",
    facts: null,
  };
  const changed = advance(g, custom);
  assert.equal(changed.employer.name, custom.name);
  assert.equal(changed.employer.facts, null);
  const raw = JSON.parse(encodeSave(changed));
  raw.employer = { name: "改ざん", salary: 999999 };
  raw.decisions[0].salary = 999999;
  raw.decisions[0].kind = "fictional";
  const restored = decodeSave(JSON.stringify(raw));
  assert.equal(restored.employer.name, custom.name);
  assert.equal(restored.salary, changed.salary);
  assert.equal(Object.hasOwn(restored.decisions[0], "salary"), false);
  // Existing v2 generic job changes still round-trip without being renamed to a real firm.
  const legacy = replay(profile, "steady", 42, ["switch", "learn"]);
  assert.equal(legacy.employer.kind, "legacy");
  assert.deepEqual(decodeSave(encodeSave(legacy)), legacy);
});

test("learning and successful work unlock new actions, and risky business outcomes create recovery branches", () => {
  const base = createGame({ ...profile, ai: "beginner" }, "steady", 49);
  assert.ok(!availableChoices(base).includes("pilot"));
  const learned = advance(base, "learn");
  assert.ok(availableChoices(learned).includes("pilot"));
  const started = advance(
    createGame({ ...profile, savings: 1000 }, "steady", 70),
    { id: "startup", venture: "ai", name: "合成事業" },
  );
  assert.equal(started.history[0].outcome.kind, "setback");
  assert.ok(availableChoices(started).includes("pivot"));
  assert.ok(availableChoices(started).includes("closeBusiness"));
  assert.throws(() => advance(base, "expand"));
  const failed = advance(started, "focus");
  assert.equal(failed.history[1].outcome.kind, "failure");
  assert.equal(failed.employer.kind, "seeking");
  assert.equal(failed.salary, 0);
  assert.equal(failed.history[1].businessOverhead, 0);
  assert.ok(availableChoices(failed).includes("recover"));
  assert.ok(!availableChoices(failed).includes("pivot"));
  assert.deepEqual(decodeSave(encodeSave(failed)), failed);
  const back = replay(
    failed.profile,
    failed.scenario,
    failed.seed,
    failed.decisions.slice(0, 1),
  );
  assert.deepEqual(advance(back, "focus"), failed);
  const closed = advance(started, "closeBusiness");
  assert.equal(closed.history[1].outcome.kind, "closure");
  assert.equal(closed.salary, 0);
  const hired = advance(failed, {
    id: "switch",
    target: "microsoft",
    role: "tech",
  });
  assert.equal(hired.employer.kind, "real");
  assert.ok(hired.salary > 0);
  let success;
  for (let seed = 1; seed <= 10; seed++) {
    const g = advance(createGame(profile, "steady", seed), "focus");
    if (g.history[0].outcome.kind === "success") {
      success = g;
      break;
    }
  }
  assert.ok(availableChoices(success).includes("negotiate"));
});
test("older v2 saves preserve past balances and begin dynamic outcomes only at the resumed year", () => {
  const old = replay(profile, "steady", 49, ["learn", "focus"], {}, false, 80);
  const raw = JSON.parse(encodeSave(old));
  delete raw.dynamicFrom;
  const resumed = decodeSave(JSON.stringify(raw));
  assert.equal(resumed.dynamicFrom, 2);
  assert.equal(resumed.income, old.income);
  assert.equal(resumed.cash, old.cash);
  assert.equal(resumed.history[0].outcome, null);
  const next = advance(resumed, "learn");
  assert.ok(next.history[2].outcome);
  assert.deepEqual(decodeSave(encodeSave(next)), next);
});
