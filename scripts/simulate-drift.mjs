import { pathToFileURL } from "node:url";
import {
  createGame, advance, advanceDirection, onMentalLeave, optionalProfileInputs,
  profileInputForLevel, PROFILE_DEFAULTS, MAX_AGE,
} from "../public/engine.js";
import { paceProfile } from "./simulate-pace.mjs";

export const careProfile = () => optionalProfileInputs(
  profileInputForLevel({ job: "care" }, "quick", { band: "new", region: "rural" }), PROFILE_DEFAULTS);
const median = (v) => v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;
// Paired counterfactual of cash flows, using the exact same annual decisions.
// No investment/home actions occur in this policy. Remove only the benefit,
// then perform the same asset sale, borrowing, repayment and interest steps.
function removeAllowance(before, next) {
  const h = next.history.at(-1), allowance = h.budget.sicknessAllowance ?? 0;
  let cash = before.cash + h.disposable - allowance - h.expenses + h.bonus;
  let investments = before.investments + h.investmentGain, debt = before.debt;
  if (cash < 0) {
    const sale = Math.min(-cash, investments);
    cash += sale;
    investments -= sale;
  }
  if (cash < 0) { debt -= cash; cash = 0; }
  const repayment = Math.min(debt, Math.max(0, cash - next.livingCost * 6));
  cash -= repayment;
  debt = (debt - repayment) * 1.02;
  return { ...next, cash, investments, debt,
    savings: cash + investments + next.homeValue - next.mortgage - debt };
}

export function measureDrift({ seeds = 2000, profile = careProfile(), from = 0, healthy = false } = {}) {
  const ages = [30, 40, 50, 55, 60], pay = Object.fromEntries(ages.map((a) => [a, []]));
  const stayerPay = Object.fromEntries(ages.map((a) => [a, []]));
  const netWorth = [], allowanceEffect = [];
  let leaveYears = 0, paidLeaveYears = 0, fullYears = 0, halfYears = 0, exhaustedYears = 0, benefit = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = { ...createGame(profile, "steady", seed * 7919), driftFrom: from };
    let noAllowance = g;
    while (!g.ended) {
      // Controlled comparison, not an ordinary play: restore ゆとり to 70 at
      // each direction boundary to separate pay noise from exhaustion cuts.
      if (healthy) {
        g = { ...g, health: 70 };
        noAllowance = { ...noAllowance, health: 70 };
      }
      const run = advanceDirection(g, onMentalLeave(g) ? "rest" : "focus");
      for (const decision of run.game.decisions.slice(g.decisions.length)) {
        const next = advance(noAllowance, decision);
        noAllowance = removeAllowance(noAllowance, next);
      }
      g = run.game;
    }
    // Same survivors with no job loss or mental leave through 60, at all ages.
    // Real incident cuts remain enabled; do not select on resulting salary.
    const stayer = g.history.some((h) => h.age === 60) &&
      !g.history.some((h) => h.age <= 60 && (h.employer.kind === "seeking" || h.incident?.effects.mentalLeave));
    for (const h of g.history) {
      if (pay[h.age]) {
        pay[h.age].push(h.salary);
        if (stayer) stayerPay[h.age].push(h.salary);
      }
      if (h.incident?.effects.mentalLeave) {
        leaveYears++;
        const amount = h.budget.sicknessAllowance ?? 0;
        if (amount > 0) {
          paidLeaveYears++;
          if (amount / h.leaveSalary > 0.5) fullYears++; else halfYears++;
          benefit += amount;
        } else exhaustedYears++;
      }
    }
    netWorth.push(g.savings);
    allowanceEffect.push(g.savings - noAllowance.savings);
  }
  return { seeds, healthy, startAge: profile.age, pay: Object.fromEntries(ages.map((a) => [a, median(pay[a])])),
    reached: Object.fromEntries(ages.map((a) => [a, pay[a].length])), stayers: stayerPay[40].length,
    stayerPay: Object.fromEntries(ages.map((a) => [a, median(stayerPay[a])])),
    leaveYears, paidLeaveYears, fullYears, halfYears, exhaustedYears,
    totalAllowance: benefit, medianNetWorth: median(netWorth),
    meanAllowanceNetWorthEffect: allowanceEffect.reduce((a, b) => a + b, 0) / seeds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 2000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  for (const [name, profile] of [["care/rural", careProfile()], ["IT/metro", paceProfile()]])
    console.log(JSON.stringify({ profile: name, before: measureDrift({ seeds, profile, from: MAX_AGE }),
      after: measureDrift({ seeds, profile }), healthyStayers: {
        before: measureDrift({ seeds, profile, from: MAX_AGE, healthy: true }),
        after: measureDrift({ seeds, profile, healthy: true }),
      } }, null, 2));
}
