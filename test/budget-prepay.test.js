import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import {
  createGame, advance, advanceYears, availableChoices, suggestedChoices,
  eventFor, amortizeYear, encodeSave, decodeSave, replay, compareWorlds,
  applyScene, validateGeneratedScene, profileStoryContext, MAX_AGE, CHOICES,
  careerSeenUntil,
} from "../public/engine.js";
import { storyRequest, sceneSchema } from "../public/story.js";
import { careerMilestones } from "../public/careers.js";

const profile = {
  age: 35, region: "city", job: "tech", income: 600,
  ai: "sometimes", priority: "balance", gender: "undisclosed",
  household: "solo", companyType: "unknown", savings: 1000,
  stocks: 0, monthlyCost: 12, rent: 7, pension: 180,
};
const owner = {
  ...profile, housing: "own", homeValue: 3000,
  mortgage: 2000, mortgageYears: 25, mortgageRate: 2,
};
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function checkBudget(before, next) {
  const h = next.history.at(-1), b = h.budget;
  for (const amount of Object.values(b)) assert.ok(Number.isFinite(amount));
  close(Object.entries(b).filter(([key]) => key !== "net")
    .reduce((sum, [, amount]) => sum + amount, 0), next.cash - before.cash);
  assert.equal(b.net, next.cash - before.cash);
  close(b.income + b.pension, h.disposable);
  close(b.loanPrincipal, -h.principal - (h.prepayment ?? 0));
  close(b.debtRepayment, -h.debtRepayment);
  close(b.investment, h.liquidation - h.investmentTransfer);
  close(b.other, h.bonus - h.businessSetup - h.businessOverhead -
    (h.outcome?.extraCost ?? 0) -
    (h.incident?.effects.extraCost ?? 0) -
    CHOICES[h.choice].cost);
  return b;
}
function replayAt(g, length, scenes = {}) {
  return replay(g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
    scenes, false, g.dynamicFrom, g.worldFrom, g.retirementFrom,
    g.careLeaveSalaryFrom, g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom);
}
const scene = {
  title: "住まいと手元の備えを考える",
  body: "ローンを払いながら、暮らしの備えと次の一年を考える。",
  insight: "返済と手元の余裕の両方を確かめる。",
  options: [
    ["prepay", "備えを残して元金を返す"],
    ["learn", "次の仕事のために学ぶ"],
    ["rest", "体調と暮らしを整える"],
    ["focus", "今の仕事で備えをつくる"],
  ].map(([id, label]) => ({
    id, label, hint: "時間や手元資金の配分を考える",
    reason: "現在の暮らしと余裕から考える", decision: { id, intent: label },
  })),
};

test("yearly budgets reconcile rent, mortgage, family, pensions and financial transactions", () => {
  for (const seed of [0, 1, 42, 2026, 7612026]) {
    for (const [p, actions] of [
      [profile, ["rest", "invest", "explore", "learn"]],
      [owner, ["rest", "prepay", "invest", "rest"]],
      [{ ...profile, savings: 3000 }, ["home", "rest", "prepay"]],
      [{ ...profile, partner: "partner", children: 1, childrenWish: "three" },
        ["familyPlan", "rest", "careLeave"]],
      [{ ...profile, age: 67, retirementAge: 65 }, ["rest", "invest"]],
      [{ ...profile, age: 81, income: 0, savings: 0, stocks: 0, pension: 0 }, ["rest"]],
      [{ ...profile, income: 0, savings: 50, stocks: 40 }, ["rest"]],
      [profile, [{ id: "startup", venture: "studio", name: "合成事業" }, "rest"]],
      [profile, ["move"]],
    ]) {
      let g = createGame(p, "steady", seed);
      for (const action of actions) {
        if (g.ended) break;
        const before = g;
        g = advance(g, action);
        const b = checkBudget(before, g);
        if (p.age >= 65) {
          assert.equal(b.income, 0);
          assert.equal(b.pension, p.pension * 0.76);
        }
        if (before.housing === "rent" && action !== "home" && action !== "move")
          assert.equal(b.housing, -before.rent * 12);
        if (before.housing === "own" && action !== "prepay")
          close(b.loanInterest, -amortizeYear(before.mortgage,
            before.profile.mortgageRate, before.mortgageYears).interest);
        if (g.history.at(-1).familyCost)
          close(-b.living, before.livingCost * 12 *
            (1 + g.history.at(-1).world.shock.costs) + g.history.at(-1).familyCost);
      }
    }
  }
});

test("shortfall borrowing is repaid from later surpluses before interest with a six-month buffer", () => {
  for (const seed of [0, 42, 2026]) {
    let g = createGame({
      ...profile, savings: 0, monthlyCost: 30, rent: 5, children: 1,
    }, "steady", seed), borrowed = false, repaid = false;
    for (let i = 0; i < 10; i++) {
      const before = g;
      g = advance(g, i === 0 ? "careLeave" : "rest");
      const h = g.history.at(-1), b = checkBudget(before, g),
        available = before.cash + h.disposable - h.expenses + h.bonus +
          h.liquidation + b.borrowing;
      close(h.debtRepayment, Math.min(before.debt + b.borrowing,
        Math.max(0, available - g.livingCost * 6)));
      close(h.debtInterest, (before.debt + b.borrowing - h.debtRepayment) * 0.02);
      close(g.debt, before.debt + b.borrowing - h.debtRepayment + h.debtInterest);
      assert.ok(g.debt >= 0);
      assert.ok(!(b.borrowing > 0 && h.debtRepayment > 0));
      if (b.borrowing > 0) borrowed = true;
      if (h.debtRepayment > 0) {
        repaid = true;
        assert.ok(g.cash >= g.livingCost * 6 - 1e-8);
        assert.ok(g.debt < before.debt);
        const unpaid = advance({ ...before, debtRepayFrom: 110 }, "rest");
        assert.equal(g.mortgage, unpaid.mortgage);
        close(g.savings - unpaid.savings, h.debtRepayment * 0.02);
      }
    }
    assert.ok(borrowed && repaid);
    assert.equal(g.debt, 0);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayAt(g, g.decisions.length), g);
  }
  for (const debt of [10, 2000]) {
    const before = createGame({ ...profile, savings: -debt }),
      next = advance(before, "rest");
    assert.ok(next.history[0].debtRepayment > 0);
    assert.ok(next.cash >= next.livingCost * 6);
    assert.ok(next.debt >= 0);
    if (debt === 10) assert.equal(next.debt, 0);
    else close(next.cash, next.livingCost * 6);
    checkBudget(before, next);
  }
});

test("debt repayment migration preserves old histories and starts at the next decision", () => {
  let old = createGame({ ...profile, savings: -2000 }, "steady", 42, 0, 0, 0, 0, 0, 110);
  for (let i = 0; i < 3; i++) {
    const before = old;
    old = advance(old, "rest");
    assert.equal(old.history.at(-1).debtRepayment, 0);
    assert.equal(old.debt, before.debt + before.debt * 0.02);
  }
  assert.ok(old.cash > old.livingCost * 6);
  const saved = JSON.parse(encodeSave(old));
  delete saved.debtRepayFrom;
  // Persisted numeric state is ignored; the old decisions must be replayed.
  saved.debt = 0;
  const migrated = decodeSave(JSON.stringify(saved));
  assert.equal(migrated.debtRepayFrom, 3);
  assert.deepEqual(migrated, { ...old, debtRepayFrom: 3 });
  assert.deepEqual(decodeSave(encodeSave(migrated)), migrated);
  for (let i = 0; i <= 3; i++)
    assert.deepEqual(replayAt(migrated, i).history, replayAt(old, i).history);
  const currentScene = {
    ...scene,
    options: scene.options.map((o) => o.id === "prepay"
      ? { ...o, id: "invest", decision: { id: "invest", intent: "資産の配分を考える" } } : o),
  }, current = applyScene(migrated, validateGeneratedScene(currentScene, migrated)),
    next = advance(current, "rest"),
    undone = replayAt(next, 3, current.scenes);
  assert.ok(next.history.at(-1).debtRepayment > 0);
  assert.deepEqual(next.history.slice(0, 3), old.history);
  assert.deepEqual(decodeSave(encodeSave(current)), current);
  assert.deepEqual(decodeSave(encodeSave(next)), next);
  assert.deepEqual(undone, current);
  assert.deepEqual(advance(undone, "rest"), next);
  for (const world of compareWorlds(next)) assert.equal(world.debtRepayFrom, 3);
  const finance = (g) => profileStoryContext(g).threads.find((t) => t.id === "finances");
  assert.match(finance(old).lines[1], /借入が残っている/);
  assert.doesNotMatch(finance(old).lines[1], /返済も続いている/);
  assert.match(finance(migrated).lines[1], /借入の返済も続いている/);
});

test("debt repayment boundaries are validated by create, replay, encode and decode", () => {
  const g = createGame(profile), saved = JSON.parse(encodeSave(g));
  assert.equal(g.debtRepayFrom, 0);
  assert.equal(saved.debtRepayFrom, 0);
  for (const debtRepayFrom of [null, -1, 1.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(profile, "steady", 42, 0, 0, 0, 0, 0, debtRepayFrom));
    assert.throws(() => replay(profile, "steady", 42, [], {}, false, 0, 0, 0, 0, 0, debtRepayFrom));
    assert.throws(() => encodeSave({ ...g, debtRepayFrom }));
    assert.throws(() => decodeSave(JSON.stringify({ ...saved, debtRepayFrom })));
  }
  for (const debtRepayFrom of [0, 1, MAX_AGE]) {
    const bounded = createGame(profile, "steady", 42, 0, 0, 0, 0, 0, debtRepayFrom);
    assert.deepEqual(decodeSave(encodeSave(bounded)), bounded);
  }
});

test("prepayment requires a mortgage, surplus cash and the migration boundary", () => {
  for (const extra of [
    { housing: "rent", homeValue: 0, mortgage: 0 },
    { mortgage: 0 }, { savings: 72 }, { savings: 71 },
    { savings: 1000, stocks: 950 },
  ]) {
    const g = createGame({ ...owner, ...extra });
    assert.ok(!availableChoices(g).includes("prepay"));
    assert.throws(() => advance(g, "prepay"));
  }
  const g = createGame(owner);
  assert.ok(availableChoices(g).includes("prepay"));
  assert.ok(suggestedChoices(g).includes("prepay"));
  assert.ok(eventFor(g).options.some((o) => o.id === "prepay"));
  const old = { ...g, prepayFrom: 1 };
  assert.ok(!availableChoices(old).includes("prepay"));
  assert.throws(() => advance(old, "prepay"));
  assert.ok(availableChoices(advance(old, "rest")).includes("prepay"));
});

test("prepayment lowers this year's and future interest, keeps the term and cash buffer, and stops at one year", () => {
  for (const seed of [0, 1, 42, 2026]) {
    const g = createGame(owner, "steady", seed),
      paid = advance(g, "prepay"),
      regular = advance(g, "invest"),
      h = paid.history[0],
      loan = amortizeYear(g.mortgage - h.prepayment,
        g.profile.mortgageRate, g.mortgageYears);
    assert.equal(h.prepayment, g.cash - g.livingCost * 6);
    assert.equal(paid.income, regular.income);
    assert.equal(paid.health, regular.health);
    assert.equal(paid.skill, regular.skill);
    assert.equal(paid.mortgage, loan.balance);
    assert.equal(paid.mortgageYears, regular.mortgageYears);
    assert.ok(paid.mortgage < regular.mortgage);
    assert.ok(-h.budget.loanInterest < -regular.history[0].budget.loanInterest);
    assert.ok(paid.cash >= g.livingCost * 6);
    assert.equal(h.liquidation, 0);
    assert.equal(h.budget.borrowing, 0);
    const paidNext = advance(paid, "rest"), regularNext = advance(regular, "rest");
    assert.ok(-paidNext.history[1].budget.loanInterest <
      -regularNext.history[1].budget.loanInterest);
    assert.deepEqual(decodeSave(encodeSave(paidNext)), paidNext);
    assert.deepEqual(advance(replayAt(paidNext, 1), "rest"), paidNext);
    for (const world of compareWorlds(paid)) {
      assert.equal(world.prepayFrom, paid.prepayFrom);
      assert.equal(world.decisions.length, 1);
    }
    for (const years of [5, 10]) {
      const journey = advanceYears(g, "prepay", years);
      assert.deepEqual(journey.game, paid);
      assert.equal(journey.entries.length, 1);
      assert.match(journey.stopReason, /一年/);
    }
    checkBudget(g, paid);
  }
});

test("local fallback keeps prepay among four executable choices alongside family, career and detours", () => {
  for (const careerGoal of ["growth", "switch", "business", "balance"]) {
    for (let seed = 0; seed < 8; seed++) {
      let g = createGame({ ...owner, careerGoal, partner: "partner", children: 1 }, "steady", seed);
      for (let i = 0; i < 4 && !g.ended; i++) {
        const options = eventFor(g).options;
        assert.equal(options.length, 4);
        assert.ok(options.some((o) => o.id === "prepay"), `${careerGoal}/${seed}/${i}`);
        for (const option of options) assert.ok(availableChoices(g).includes(option.id));
        g = advance(g, "rest");
      }
    }
  }
});

test("prepayment caps at the balance and reserves a deficit year's bills without asset sales", () => {
  const g = createGame({ ...owner, mortgage: 100 }), paid = advance(g, "prepay");
  assert.equal(paid.history[0].prepayment, 100);
  assert.equal(paid.mortgage, 0);
  close(paid.history[0].budget.loanInterest, 0);
  assert.ok(!availableChoices(paid).includes("prepay"));
  for (const extra of [
    { income: 0, pension: 0 },
    { age: 70, income: 0, pension: 100 },
    { age: 81, income: 0, pension: 0, savings: 500 },
  ]) {
    const before = createGame({ ...owner, ...extra }, "steady", 42),
      next = advance(before, "prepay"), h = next.history[0];
    assert.ok(h.prepayment >= 0 && h.prepayment < before.cash - before.livingCost * 6);
    assert.ok(next.cash >= before.livingCost * 6 - 1e-8);
    assert.equal(h.liquidation, 0);
    assert.equal(h.budget.borrowing, 0);
    checkBudget(before, next);
  }
  const tight = createGame({ ...owner, income: 0, savings: 100 }),
    deferred = advance(tight, "prepay");
  assert.equal(deferred.history[0].prepayment, 0);
  assert.match(deferred.history[0].note, /見送った/);
  checkBudget(tight, deferred);
});

test("prepay markers validate at creation, encode and decode, including tampered recorded decisions", () => {
  const g = createGame(owner), save = JSON.parse(encodeSave(g));
  assert.equal(g.prepayFrom, 0);
  assert.equal(save.prepayFrom, 0);
  for (const prepayFrom of [null, -1, 0.5, "2", MAX_AGE + 1, NaN]) {
    assert.throws(() => createGame(owner, "steady", 2026, 0, 0, 0, 0, prepayFrom));
    assert.throws(() => encodeSave({ ...g, prepayFrom }));
    assert.throws(() => decodeSave(JSON.stringify({ ...save, prepayFrom })));
  }
  const paidSave = JSON.parse(encodeSave(advance(g, "prepay")));
  assert.throws(() => decodeSave(JSON.stringify({ ...paidSave, prepayFrom: 1 })));
  delete paidSave.prepayFrom;
  assert.throws(() => decodeSave(JSON.stringify(paidSave)));
});

test("old fixture histories keep the former action catalogue, new boundaries and saved scenes round-trip", () => {
  for (const name of ["v02-saves.json", "care-leave-save.json", "retirement-saves.json"]) {
    const raw = JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
    for (const { save } of Array.isArray(raw) ? raw : [raw]) {
      const g = decodeSave(JSON.stringify(save));
      assert.equal(g.prepayFrom, save.decisions.length);
      assert.deepEqual(decodeSave(encodeSave(g)), g);
      assert.deepEqual(replayAt(g, g.decisions.length, g.scenes), g);
      for (let i = 0; i < g.decisions.length; i++) {
        const h = replayAt(g, i);
        assert.ok(!availableChoices(h).includes("prepay"));
        assert.deepEqual(availableChoices(h), availableChoices({ ...h, prepayFrom: 110 }));
      }
    }
  }
  let g = advance(createGame(owner, "steady", 42), "rest");
  const old = JSON.parse(encodeSave(g));
  delete old.prepayFrom;
  g = decodeSave(JSON.stringify(old));
  assert.equal(g.prepayFrom, 1);
  g = applyScene(g, validateGeneratedScene(scene, g));
  assert.deepEqual(decodeSave(encodeSave(g)), g);
  const next = advance(g, scene.options[0].decision);
  assert.deepEqual(decodeSave(encodeSave(next)), next);
  const undone = replayAt(next, 1, g.scenes);
  assert.equal(undone.prepayFrom, 1);
  assert.deepEqual(advance(undone, scene.options[0].decision), next);
  for (const world of compareWorlds(next)) assert.equal(world.prepayFrom, 1);
});

test("AI schema, catalogue and validation permit prepay only after its boundary", () => {
  for (const boundary of [0, 1, 110]) {
    const g = createGame(owner, "steady", 42, 0, 0, 0, 0, boundary), allowed = boundary === 0;
    for (const personalized of [true, false]) {
      const request = storyRequest(g, { personalized });
      assert.equal(request.context.allowedActions.some((a) => a.id === "prepay"), allowed);
      assert.equal(JSON.stringify(sceneSchema(g, { personalized })).includes('"prepay"'), allowed);
      const value = personalized ? scene : {
        ...scene, options: scene.options.map(({ decision, ...option }) => option),
      };
      if (allowed) assert.ok(validateGeneratedScene(value, g, { personalized }));
      else assert.throws(() => validateGeneratedScene(value, g, { personalized }));
    }
    assert.ok(!storyRequest(g, { mode: "career" }).context.allowedActions.some((a) => a.id === "prepay"));
    const malicious = structuredClone(scene);
    malicious.options[0].decision.amount = 1000;
    assert.throws(() => validateGeneratedScene(malicious, g));
  }
  const next = advance(createGame(owner), "prepay");
  assert.ok(!Object.hasOwn(storyRequest(next).context.lastChanges, "budget"));
  assert.ok(!JSON.stringify(storyRequest(next).context).includes('"budget"'));
});

test("the UI undo handler preserves the migrated boundary when undoing prepayment", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8"),
    first = advance(createGame(owner), "rest"),
    saved = JSON.parse(encodeSave(first));
  delete saved.prepayFrom;
  const migrated = decodeSave(JSON.stringify(saved)),
    paid = advance(migrated, "prepay"), button = {},
    context = createContext({
      game: paid, generating: false, lastJourney: {}, revision: 0, replay, careerMilestones, careerSeenUntil, favoriteYears: new Set(),
      $: () => ({ addEventListener(_type, handler) { button.click = handler; } }),
      renderGame() {}, moveToStory() {},
    });
  runInContext(app.slice(app.indexOf('$("undo-button").addEventListener'),
    app.indexOf('$("compare-button").addEventListener')), context);
  button.click();
  assert.equal(context.lastJourney, null);
  assert.equal(context.game.prepayFrom, 1);
  // Only normalize the metadata object's VM prototype; compare actual balances.
  assert.deepEqual({ ...context.game, reflections: { ...context.game.reflections }, careerSeen: { ...context.game.careerSeen } }, migrated);
  assert.deepEqual({ ...advance(context.game, "prepay"), reflections: { ...context.game.reflections }, careerSeen: { ...context.game.careerSeen } }, paid);
});

test("UI undo and retry preserve the debt repayment boundary", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  let g = createGame({ ...profile, savings: -2000 }, "steady", 42, 0, 0, 0, 0, 0, 3);
  for (let i = 0; i < 3; i++) g = advance(g, "rest");
  const paid = advance(g, "rest"), button = {},
    context = createContext({
      game: paid, generating: false, lastJourney: {}, revision: 0, replay, createGame, careerMilestones, careerSeenUntil, favoriteYears: new Set(),
      $: () => ({ addEventListener(_type, handler) { button.click = handler; } }),
      again: { addEventListener(_type, handler) { button.retry = handler; } },
      renderGame() {}, moveToStory() {}, showGame() {},
    });
  assert.ok(paid.history.at(-1).debtRepayment > 0);
  runInContext(app.slice(app.indexOf('$("undo-button").addEventListener'),
    app.indexOf('$("compare-button").addEventListener')), context);
  button.click();
  assert.deepEqual({ ...context.game, reflections: { ...context.game.reflections }, careerSeen: { ...context.game.careerSeen } }, g);
  assert.deepEqual({ ...advance(context.game, "rest"), reflections: { ...context.game.reflections }, careerSeen: { ...context.game.careerSeen } }, paid);
  runInContext(app.slice(app.indexOf('again.addEventListener("click"'),
    app.indexOf('compare.addEventListener("click"')), context);
  button.retry();
  assert.equal(context.game.debtRepayFrom, 3);
  assert.equal(context.game.decisions.length, 0);
  for (let i = 0; i < 3; i++) {
    context.game = advance(context.game, "rest");
    assert.equal(context.game.history.at(-1).debtRepayment, 0);
  }
  assert.deepEqual(context.game, g);
});

test("year results and history show signed budgets safely and legacy entries without them still render", () => {
  const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const node = (tag, textContent = "", className = "") => ({
    tag, textContent, className, children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    showModal() { this.open = true; },
    set innerHTML(_value) { assert.fail("HTML must not be interpreted"); },
  });
  const g = advance(createGame(owner), "prepay"), h = g.history[0],
    elements = new Map(), $ = (id) => {
      if (!elements.has(id)) elements.set(id, node("div"));
      return elements.get(id);
    }, context = createContext({ node, $, game: g,
      nf: new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }) });
  runInContext(app.slice(app.indexOf("function appendBudget("),
    app.indexOf('$("journey-next").addEventListener')), context);
  const parent = node("article");
  context.parent = parent;
  context.h = h;
  runInContext("appendBudget(parent, h, true)", context);
  assert.equal(parent.children[0].tag, "details");
  assert.equal(parent.children[0].children[0].tag, "summary");
  const text = (el) => [el.textContent, ...el.children.map(text)].join(" ");
  assert.match(text(parent), /家計の内訳/);
  assert.match(text(parent), /労働収入.*\+/);
  assert.match(text(parent), /ローン利息.*−/);
  assert.match(text(parent), /繰り上げ/);
  assert.match(text(parent), /評価損益/);
  assert.doesNotMatch(text(parent), /借入の返済/);
  const repayment = node("article");
  context.parent = repayment;
  context.h = advance(createGame({ ...profile, savings: -2000 }), "rest").history[0];
  runInContext("appendBudget(parent, h)", context);
  assert.match(text(repayment), /借入の返済.*−/);
  assert.doesNotMatch(text(repayment), /不足分の借入/);
  context.parent = parent;
  const { budget, ...legacy } = h;
  context.h = legacy;
  runInContext("appendBudget(parent, h)", context);
  assert.equal(parent.children.length, 1);
  context.journey = { entries: [h, legacy], stopReason: "" };
  runInContext("showJourney(journey)", context);
  assert.equal($("journey-years").children.length, 2);
  assert.match(text($("journey-years").children[0]), /家計の内訳/);
  assert.doesNotMatch(text($("journey-years").children[1]), /家計の内訳/);
  assert.equal($("journey-dialog").open, true);
});
