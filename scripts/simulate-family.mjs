import { pathToFileURL } from "node:url";
import {
  createGame, advanceDirection, onMentalLeave, availableChoices,
  optionalProfileInputs, profileInputForLevel, MAX_AGE,
} from "../public/engine.js";

// Synthetic reported household; unspecified fields use advanced-form defaults.
export const familyProfile = (extra = {}) => optionalProfileInputs(profileInputForLevel({
  age: 35, occupation: "marketing", companyType: "large", rank: "lead",
  municipality: "神奈川県川崎市", region: "metro", income: 560,
  partner: "partner", children: 2, childStage: "young", household: "care",
  monthlyCost: 28, housing: "own", homeValue: 4200, mortgage: 3300,
  mortgageYears: 30, savings: 600, ...extra,
}, "advanced"));
const median = (values) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;

export function measureFamily({ seeds = 1000, from = 0, partnerIncome = 0 } = {}) {
  const wealth = { 45: [], 55: [], 65: [] };
  let debtEnds = 0, borrowingYears = 0, twentyYearBorrowers = 0, reachedRetirement = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = { ...createGame(familyProfile({ partnerIncome }), "steady", seed * 7919), familyFrom: from };
    let longest = 0, streak = 0;
    while (!g.ended) {
      // Fixed five-year age bands, even if an incident interrupts a direction.
      // Decline offers; wait for automatic re-employment, rest on mental leave.
      const policy = ["focus", "studyDaily", "careLeave", "connect", "focus", "rest"];
      const preferred = policy[Math.min(5, Math.floor((g.age - 35) / 5))];
      const action = onMentalLeave(g) ? "rest"
        : availableChoices(g).includes(preferred) ? preferred : "rest";
      const run = advanceDirection(g, action, { years: Math.min(5, 5 - (g.age - 35) % 5) });
      for (const h of run.entries) {
        if (wealth[h.age + 1]) wealth[h.age + 1].push(h.savings);
        streak = h.budget.borrowing > 0 ? streak + 1 : 0;
        longest = Math.max(longest, streak);
        if (h.budget.borrowing > 0) borrowingYears++;
      }
      g = run.game;
    }
    if (g.debt > 0) debtEnds++;
    if (longest >= 20) twentyYearBorrowers++;
    if (g.age >= 65) reachedRetirement++;
  }
  return { seeds, partnerIncome, netWorth: Object.fromEntries(Object.entries(wealth).map(([age, v]) => [age, median(v)])),
    reached: Object.fromEntries(Object.entries(wealth).map(([age, v]) => [age, v.length])),
    reachedRetirement, debtEndShare: debtEnds / seeds, meanBorrowingYears: borrowingYears / seeds,
    twentyYearBorrowingShare: twentyYearBorrowers / seeds };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 1000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  for (const partnerIncome of [0, 200])
    console.log(JSON.stringify({ before: measureFamily({ seeds, partnerIncome, from: MAX_AGE }),
      after: measureFamily({ seeds, partnerIncome }) }, null, 2));
}
