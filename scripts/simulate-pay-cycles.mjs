import { pathToFileURL } from "node:url";
import { createGame, advanceDirection, onMentalLeave, MAX_AGE } from "../public/engine.js";
import { curveProfile } from "./simulate-pay-curve.mjs";

const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor(values.length * q)];
const AGES = [30, 40, 50, 55];

// Always-focus stayers (never left the first employer, never a year without
// pay) before 59: the spread of pay and how many fall far below their peak.
export function measureCycles({ job = "office", band = "new", region = "metro", seeds = 1000, from = 0 } = {}) {
  const at = Object.fromEntries(AGES.map((a) => [a, []]));
  let careers = 0, bigDrops = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = { ...createGame(curveProfile(job, band, region), "steady", seed * 7919), cycleFrom: from };
    while (!g.ended) g = advanceDirection(g, onMentalLeave(g) ? "rest" : "focus").game;
    let peak = 0, worst = 0;
    for (const h of g.history) {
      if (h.employer.kind !== "initial" || h.salary === 0 || h.age >= 59) break;
      peak = Math.max(peak, h.salary);
      worst = Math.max(worst, 1 - h.salary / peak);
      if (at[h.age]) at[h.age].push(h.salary);
    }
    careers++;
    if (worst > 0.25) bigDrops++;
  }
  const spread = Object.fromEntries(AGES.map((a) => [a,
    [0.1, 0.5, 0.9].map((q) => Math.round(quantile(at[a], q)))]));
  return { job, band, region, spread, dropOver25: bigDrops / careers };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 1000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  const report = {};
  for (const [job, band, region] of [["office", "new", "metro"], ["tech", "new", "metro"], ["care", "new", "rural"]])
    report[`${band}/${region}/${job}`] = {
      before: measureCycles({ job, band, region, seeds, from: MAX_AGE }),
      after: measureCycles({ job, band, region, seeds }),
    };
  console.log(JSON.stringify(report, null, 1));
}
