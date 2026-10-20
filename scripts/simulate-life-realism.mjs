import { pathToFileURL } from "node:url";
import {
  createGame, advance, availableChoices, optionalProfileInputs,
  profileInputForLevel, PROFILE_DEFAULTS, MAX_AGE,
} from "../public/engine.js";

// Synthetic cohorts only. The same seeds, existing pay rules and policies are
// used on both sides; only lifeRealismFrom changes. No AI or private saves.
export const simulationProfile = (extra = {}) => optionalProfileInputs({
  ...profileInputForLevel({}, "standard"), age: 32, income: 500,
  savings: 1500, monthlyCost: 12, region: "city", companyType: "small",
  rank: "staff", ...extra,
}, PROFILE_DEFAULTS);

export function measureLifeRealism({ seeds = 2000, from = 0 } = {}) {
  const counts = { firstYearFailure: 0, survivedFiveYears: 0, doubledWithinTenYears: 0,
    managerBy50: 0, directorBy50: 0, negotiations: 0, negotiationSuccesses: 0 };
  const start = (seed, extra) => createGame(simulationProfile(extra), "steady", seed * 7919,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, from);
  for (let seed = 1; seed <= seeds; seed++) {
    let g = start(seed), doubled = false;
    for (let year = 0; year < 10 && !g.ended; year++) {
      if (year && g.employer.kind !== "venture") break;
      // Grow when possible, pivot after a setback, otherwise do the work.
      const allowed = availableChoices(g);
      g = advance(g, year === 0 ? { id: "startup", venture: "ai", name: "合成事業" }
        : allowed.includes("pivot") ? "pivot" : allowed.includes("expand") ? "expand" : "focus");
      if (year === 0 && g.history.at(-1).outcome?.kind === "failure") counts.firstYearFailure++;
      if (year === 4 && g.employer.kind === "venture" && !g.ended) counts.survivedFiveYears++;
      if (g.salary >= 1000 && g.employer.kind === "venture") doubled = true;
    }
    if (doubled) counts.doubledWithinTenYears++;

    g = start(seed, { age: 25 });
    let manager = false, director = false;
    for (let year = 0; g.age < 50 && !g.ended; year++) {
      const allowed = availableChoices(g);
      const action = g.employer.kind === "seeking"
        ? { id: "switch", target: "custom", name: "合成勤務先", role: "tech", companyType: "small" }
        : year % 2 === 0 && allowed.includes("promote") ? "promote"
          : allowed.includes("negotiate") ? "negotiate" : year % 2 ? "rest" : "focus";
      g = advance(g, action);
      if (g.history.at(-1).choice === "negotiate") {
        counts.negotiations++;
        if (g.history.at(-1).outcome?.kind === "success") counts.negotiationSuccesses++;
      }
      manager ||= ["manager", "director"].includes(g.position.rank);
      director ||= g.position.rank === "director";
    }
    if (manager) counts.managerBy50++;
    if (director) counts.directorBy50++;
  }
  return { seeds, ...Object.fromEntries(Object.entries(counts).slice(0, 5).map(([key, n]) => [key, n / seeds])),
    negotiateSuccess: counts.negotiationSuccesses / counts.negotiations, negotiations: counts.negotiations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 2000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  console.log(JSON.stringify({ before: measureLifeRealism({ seeds, from: MAX_AGE }),
    after: measureLifeRealism({ seeds }) }, null, 2));
}
