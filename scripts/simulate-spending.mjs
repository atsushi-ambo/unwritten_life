import { pathToFileURL } from "node:url";
import { createGame, advanceDirection, onMentalLeave, MAX_AGE } from "../public/engine.js";
import { curveProfile } from "./simulate-pay-curve.mjs";
import { measureFamily } from "./simulate-family.mjs";

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Always-focus quick-start players: the share of take-home kept at 50 and
// net worth at 65, with spending that follows pay (from=0) or not (110).
export function measureSpending({ job = "office", band = "new", region = "metro", seeds = 1000, from = 0 } = {}) {
  const saved50 = [], worth65 = [];
  let finished = 0, debt = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = { ...createGame(curveProfile(job, band, region), "steady", seed * 7919), spendFrom: from };
    while (!g.ended) g = advanceDirection(g, onMentalLeave(g) ? "rest" : "focus").game;
    const h50 = g.history.find((h) => h.age === 50);
    if (h50?.disposable > 0) saved50.push(h50.budget.net / h50.disposable);
    const last = g.history.findLast((h) => h.age <= 65);
    if (last.age >= 64) {
      finished++;
      worth65.push(last.savings);
      if (last.savings < 0) debt++;
    }
  }
  return { job, band, region, savedShareAt50: median(saved50), netWorthAt65: Math.round(median(worth65)), debtAt65: debt / finished };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 1000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  const report = {};
  for (const [job, band, region] of [["office", "new", "metro"], ["tech", "new", "metro"], ["care", "new", "rural"], ["office", "30s", "metro"]])
    report[`${band}/${region}/${job}`] = {
      before: measureSpending({ job, band, region, seeds, from: MAX_AGE }),
      after: measureSpending({ job, band, region, seeds }),
    };
  // The family case of simulate-family.mjs, with spending rules on and off.
  for (const partnerIncome of [0, 200])
    report[`family/partner${partnerIncome}`] = {
      before: measureFamily({ seeds, partnerIncome, spendFrom: MAX_AGE }),
      after: measureFamily({ seeds, partnerIncome }),
    };
  console.log(JSON.stringify(report, null, 1));
}
