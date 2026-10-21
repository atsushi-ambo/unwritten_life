import { pathToFileURL } from "node:url";
import {
  createGame, advanceDirection, onMentalLeave, optionalProfileInputs,
  profileInputForLevel, PROFILE_DEFAULTS, MAX_AGE,
} from "../public/engine.js";
import { worldAt } from "../public/world.js";

// Synthetic quick-start profiles. No personal data.
export const curveProfile = (job = "office", band = "new", region = "metro") =>
  optionalProfileInputs(profileInputForLevel({ job }, "quick", { band, region }), PROFILE_DEFAULTS);
export const CURVE_AGES = [25, 30, 35, 40, 45, 50, 55, 59, 62];
const median = (values) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null;
// Always focus (rest on leave); while job-seeking, focus also searches.
const focus = (g) => onMentalLeave(g) ? "rest" : "focus";
// A mixed player: work, learn, connect and rest in turn.
const mixed = (g) => onMentalLeave(g) ? "rest" : ["focus", "learn", "focus", "connect", "rest"][(g.directionBlocks?.length ?? 0) % 5];

export function measureCurve({ job = "office", band = "new", region = "metro", seeds = 1000, from = 0, cycleFrom = from, strategy = "focus" } = {}) {
  const pick = strategy === "mixed" ? mixed : focus;
  const all = {}, stayers = {};
  let finished = 0, debt = 0;
  const worth = [];
  for (let seed = 1; seed <= seeds; seed++) {
    let g = { ...createGame(curveProfile(job, band, region), "steady", seed * 7919), growthFrom: from, cycleFrom };
    while (!g.ended) g = advanceDirection(g, pick(g)).game;
    // A stayer has never left the first employer nor had a year without pay.
    let disrupted = false;
    for (const h of g.history) {
      if (h.employer.kind !== "initial" || h.salary === 0) disrupted = true;
      if (!CURVE_AGES.includes(h.age)) continue;
      (all[h.age] ??= []).push(h.salary);
      if (!disrupted) (stayers[h.age] ??= []).push(h.salary);
    }
    const last = g.history.findLast((h) => h.age <= 65);
    if (last.age >= 64) {
      finished++;
      worth.push(last.savings);
      if (last.savings < 0) debt++;
    }
  }
  const at = (m) => Object.fromEntries(CURVE_AGES.map((a) => [a, m[a] ? Math.round(median(m[a])) : null]));
  return { job, band, region, strategy, pay: at(all), stayerPay: at(stayers),
    debtAt65: debt / finished, netWorthAt65: Math.round(median(worth)) };
}
// Mean of the world's yearly pay term over seeds, years and employers.
export function worldGrowthMean(seeds = 2000) {
  let sum = 0, n = 0;
  for (let seed = 1; seed <= seeds; seed++)
    for (let year = 2026; year < 2080; year += 3)
      for (const employer of [{ id: "initial", kind: "initial" }, { id: "legacy", kind: "legacy" }]) {
        sum += worldAt({ seed: seed * 7919, year, scenario: "steady", region: "metro",
          profile: { tone: "realistic" }, employer }, employer).growth;
        n++;
      }
  return sum / n;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 1000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  const cases = [["office", "new", "metro"], ["tech", "new", "metro"], ["care", "new", "rural"],
    ["physical", "new", "city"], ["office", "30s", "metro"]];
  const report = { worldGrowthMean: worldGrowthMean() };
  for (const strategy of ["focus", "mixed"])
    for (const [job, band, region] of cases)
      report[`${band}/${region}/${job}/${strategy}`] = {
        before: measureCurve({ job, band, region, seeds, strategy, from: MAX_AGE }),
        after: measureCurve({ job, band, region, seeds, strategy }),
      };
  console.log(JSON.stringify(report, null, 1));
}
