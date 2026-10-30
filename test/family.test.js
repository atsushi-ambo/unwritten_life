import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, advanceDirection, encodeSave, decodeSave, replay,
  compareWorlds, MAX_AGE, validateProfile, optionalProfileInputs, profileInputForLevel,
  incidentAt, incidentRates, onMentalLeave, availableChoices, partnerIncomeAt,
} from "../public/engine.js";
import { storyRequest } from "../public/story.js";
import { careerRecord, careerRecordText } from "../public/careers.js";
import { familyProfile, measureFamily } from "../scripts/simulate-family.mjs";
import { readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`);
const quiet = (extra = {}, seed = 42) => ({ ...createGame(familyProfile(extra), "steady", seed), incidentFrom: MAX_AGE });
const replayGame = (g, length = g.decisions.length) => replay(
  g.profile, g.scenario, g.seed, g.decisions.slice(0, length),
  Object.fromEntries(Object.entries(g.scenes).filter(([step]) => Number(step) <= length)),
  false, g.dynamicFrom, g.worldFrom, g.retirementFrom, g.careLeaveSalaryFrom,
  g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom, g.incidentFrom, g.careerPathFrom,
  g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom, g.offersFrom, g.paceFrom,
  g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom, g.cycleFrom, g.spendFrom, g.oddsFrom, g.lifeEventsFrom,
  g.directionBlocks?.filter(([, end]) => end <= length),
);

test("consecutive family-first years pay 85% of full-time pay; normal hours restore the entire evolving basis", () => {
  for (const salaryCapFrom of [0, MAX_AGE]) {
    let care = { ...quiet({ income: 1800 }), salaryCapFrom }, full = care;
    for (let year = 0; year < 10; year++) {
      care = advance(care, "careLeave");
      full = advance(full, "rest");
      close(care.salary, full.salary * 0.85);
      close(care.history.at(-1).careSalary, full.salary);
      assert.deepEqual(decodeSave(encodeSave(care)), care);
    }
    close(advance(care, "rest").salary, advance(full, "rest").salary);
    assert.deepEqual(replayGame(care), care);
    const run = advanceDirection(quiet(), "careLeave");
    assert.equal(run.entries.length, 5);
    assert.ok(run.entries.every((h) => Math.abs(h.salary - h.careSalary * 0.85) < 1e-8));
    assert.deepEqual(replayGame(run.game), run.game);
  }
});

test("family leave preserves illness recovery, mental-leave benefits and the age-60 rehire cut", () => {
  // Same action/state with and without the temporary illness cut.
  let found = false;
  for (let seed = 1; seed < 20000 && !found; seed++) {
    const g = createGame(familyProfile(), "steady", seed);
    if (incidentAt(g, "careLeave")?.id !== "illness") continue;
    const cared = advance(g, "careLeave"), uncared = advance({ ...g, incidentFrom: MAX_AGE }, "rest");
    close(cared.history[0].careSalary, uncared.salary * 0.9);
    const next = advance({ ...cared, incidentFrom: MAX_AGE }, "rest");
    close(next.salary, advance(uncared, "rest").salary);
    found = true;
  }
  assert.ok(found);
  const before = quiet({ age: 59 }), full = advance(before, "rest"), care = advance(before, "careLeave");
  close(care.salary, full.salary * 0.85);
  close(advance(care, "rest").salary, advance(full, "rest").salary);
  found = false;
  for (let seed = 1; seed < 20000 && !found; seed++) {
    const g = createGame(familyProfile(), "steady", seed);
    if (!incidentAt(g, "careLeave")?.effects.mentalLeave) continue;
    const leave = advance(g, "careLeave"), next = advance(leave, "rest");
    assert.equal(leave.salary, 0);
    assert.ok(!Object.hasOwn(leave.history[0], "careSalary"));
    if (onMentalLeave(next)) close(next.history.at(-1).leaveSalary, leave.history[0].leaveSalary);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
    found = true;
  }
  assert.ok(found);
});

test("entered family costs start at their total, rise with education, and drop at independence", () => {
  let g = quiet();
  const costs = {};
  while (!g.ended) {
    g = advance(g, "rest");
    costs[g.family.childAges[0]] = g.livingCost;
  }
  close(costs[4], 28);
  assert.ok(costs[6] > costs[5]);
  assert.ok(costs[15] > costs[14]);
  assert.ok(costs[22] < costs[4]);
  close(costs[22], 28 * 21.6 / 27.6);
  close(costs[23], costs[22]);
  assert.deepEqual(decodeSave(encodeSave(g)), g);
  const moved = advance(quiet({ housing: "rent", homeValue: 0, mortgage: 0 }), { id: "move", region: "rural", intent: "地方で暮らす" });
  const later = advance(moved, "rest");
  close(later.livingCost, moved.livingCost);
  const adults = quiet({ childStage: "adult" });
  close(advance(adults, "rest").livingCost, 28);
});

test("births use the same scaled child cost, without a second family charge or children created by a wish", () => {
  for (const children of [0, 1, 2]) {
    let found = false;
    for (let seed = 1; seed < 100 && !found; seed++) {
      const g = quiet({ children, childrenWish: "three" }, seed), next = advance(g, "familyPlan");
      if (next.family.childAges.length === children) continue;
      const perChild = 28 * 3 / (21.6 + children * 3);
      close(next.livingCost, 28 + perChild);
      assert.equal(next.history[0].familyCost, 0);
      const wishStart = { ...g, family: { ...g.family, desired: children } };
      const wish = availableChoices(wishStart).includes("reconsiderFamily")
        ? advance(wishStart, "reconsiderFamily") : advance(g, "rest");
      assert.equal(wish.family.childAges.length, children);
      close(wish.livingCost, 28);
      assert.deepEqual(decodeSave(encodeSave(next)), next);
      found = true;
    }
    assert.ok(found);
  }
});

test("partner earnings enter household cash after tax, separately from salary, raises and career records", () => {
  for (const action of ["rest", "careLeave", "prepay", "retire"]) {
    const extra = action === "retire" ? { age: 64 } : {};
    const g = quiet({ ...extra, partnerIncome: 200 }), next = advance(g, action);
    const zero = advance(quiet(extra), action), h = next.history[0];
    assert.equal(next.salary, zero.salary);
    assert.equal(next.income, zero.income);
    close(h.disposable - zero.history[0].disposable, 152);
    close(h.budget.partnerIncome, 152);
    close(Object.entries(h.budget).filter(([k]) => k !== "net").reduce((sum, [, n]) => sum + n, 0), h.budget.net);
    assert.deepEqual(careerRecord(next), careerRecord(zero));
    assert.equal(careerRecordText(next).match(/年収 .*? \/ 純資産/)[0], careerRecordText(zero).match(/年収 .*? \/ 純資産/)[0]);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
    const context = storyRequest(next).context;
    assert.equal(context.householdIncome.enteredPartnerGross, 200);
    assert.equal(context.householdIncome.partnerGross, 200);
    assert.equal(context.householdIncome.partnerTakeHome, 152);
    assert.match(context.householdIncome.note, /職業・年齢・勤務先/);
  }
  assert.equal(advance(quiet({ partner: "solo", partnerIncome: 200 }), "rest").history[0].budget.partnerIncome, 0);
});

test("partner job loss suspends earnings for two years then restores the entered amount", () => {
  let found = false;
  for (let seed = 1; seed < 20000 && !found; seed++) {
    const g = createGame(familyProfile({ partnerIncome: 200 }), "steady", seed);
    if (incidentAt(g, "rest")?.id !== "partnerJobLoss") continue;
    const lost = advance(g, "rest"), next = advance({ ...lost, incidentFrom: MAX_AGE }, "rest");
    const returned = advance(next, "rest");
    assert.deepEqual([lost, next, returned].map((x) => x.history.at(-1).budget.partnerIncome), [0, 0, 152]);
    assert.ok(!Object.hasOwn(incidentRates(lost, "rest"), "partnerJobLoss"));
    assert.deepEqual(decodeSave(encodeSave(lost)), lost);
    const continued = advance(decodeSave(encodeSave(lost)), "rest");
    assert.equal(continued.history.at(-1).budget.partnerIncome, 0);
    assert.equal(storyRequest(lost).context.householdIncome.partnerGross, 0);
    found = true;
  }
  assert.ok(found);
  assert.ok(!Object.hasOwn(incidentRates(createGame(familyProfile()), "rest"), "partnerJobLoss"));
});

test("partner income is optional and bounded, only advanced fields affect the profile", () => {
  const p = familyProfile();
  delete p.partnerIncome;
  assert.equal(validateProfile(p).partnerIncome, 0);
  for (const partnerIncome of [null, -1, 10001, "200", true, {}, NaN, Infinity])
    assert.throws(() => validateProfile({ ...p, partnerIncome }));
  for (const partnerIncome of [0, 200.5, 10000])
    assert.equal(validateProfile({ ...p, partnerIncome }).partnerIncome, partnerIncome);
  assert.equal(optionalProfileInputs({ partnerIncome: "" }).partnerIncome, 0);
  assert.equal(optionalProfileInputs({ partnerIncome: "200" }).partnerIncome, 200);
  for (const level of ["quick", "standard"])
    assert.equal(optionalProfileInputs(profileInputForLevel({ partnerIncome: "200" }, level)).partnerIncome, 0);
  assert.equal(familyProfile({ partnerIncome: "200" }).partnerIncome, 200);
});

test("familyFrom preserves frozen old histories and current scenes through save, replay, undo and comparison", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/family-saves.json", import.meta.url)));
  for (const { id, save, historyHash, salary, savings, livingCost } of fixtures) {
    assert.ok(!Object.hasOwn(save, "familyFrom"));
    assert.ok(!Object.hasOwn(save.profile, "partnerIncome"));
    const g = decodeSave(JSON.stringify(save));
    const withPartner = decodeSave(JSON.stringify({ ...save, profile: { ...save.profile, partnerIncome: 200 } }));
    assert.deepEqual(withPartner.history, g.history);
    const boundary = save.decisions.length + (id.includes("current-scene") ? 1 : 0);
    assert.equal(g.familyFrom, boundary);
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash);
    assert.equal(g.salary, salary);
    assert.equal(g.savings, savings);
    assert.equal(g.livingCost, livingCost);
    assert.equal(g.profile.partnerIncome, 0);
    assert.deepEqual(g.scenes, save.scenes);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, 0).familyFrom, boundary);
    for (const other of compareWorlds(g)) assert.equal(other.familyFrom, boundary);
    const next = advance(g, "careLeave"), old = advance({ ...g, familyFrom: MAX_AGE }, "careLeave");
    if (id.includes("current-scene")) assert.deepEqual(next.history, old.history);
    else assert.notDeepEqual(next.history, old.history);
    assert.deepEqual(replayGame(next, g.decisions.length).history, g.history);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
    const active = advance(next, "rest");
    assert.ok(Object.hasOwn(active.history.at(-1).budget, "partnerIncome"));
  }
});

test("familyFrom and partner-income validation precede AI accounting and partition local caches", async () => {
  const g = quiet(), saved = JSON.parse(encodeSave(g));
  assert.equal(g.familyFrom, 0);
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  for (const familyFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, familyFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const withPartner = JSON.stringify({ ...saved, profile: { ...saved.profile, partnerIncome: 200 } });
  assert.equal((await ai.generate(withPartner)).cached, false);
  assert.equal((await ai.generate(withPartner)).cached, true);
  const accounting = ai.status();
  for (const value of [null, -1, 0.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(16).fill(0), value));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(16).fill(0), value));
    assert.throws(() => encodeSave({ ...g, familyFrom: value }));
    const save = JSON.stringify({ ...saved, familyFrom: value });
    assert.throws(() => decodeSave(save));
    await assert.rejects(() => ai.generate(save));
  }
  await assert.rejects(() => ai.generate(JSON.stringify({ ...saved, profile: { ...saved.profile, partnerIncome: "200" } })));
  assert.equal(calls, 4);
  assert.equal(ai.status().calls, accounting.calls);
  assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
});

test("1,000 mixed-direction careers ease after children leave; partner earnings reduce debt", () => {
  const before = measureFamily({ from: MAX_AGE }), after = measureFamily(), dual = measureFamily({ partnerIncome: 200 });
  assert.ok(after.netWorth[65] > before.netWorth[65]);
  assert.ok(after.twentyYearBorrowingShare < before.twentyYearBorrowingShare);
  assert.ok(after.twentyYearBorrowingShare < 0.5);
  assert.ok(dual.netWorth[65] > after.netWorth[65]);
  assert.ok(dual.debtEndShare < after.debtEndShare);
});

test("an entered partner income belongs to the partner the player started with", () => {
  const solo = createGame({ age: 30, region: "city", job: "tech", ai: "daily", priority: "balance", gender: "undisclosed",
    household: "solo", companyType: "small", partner: "solo", partnerIncome: 200 }, "steady", 1);
  assert.equal(partnerIncomeAt({ ...solo, family: { ...solo.family, partner: true } }), 0);
  const couple = createGame({ age: 30, region: "city", job: "tech", ai: "daily", priority: "balance", gender: "undisclosed",
    household: "shared", companyType: "small", partner: "partner", partnerIncome: 200 }, "steady", 1);
  assert.equal(partnerIncomeAt(couple), 200);
});
