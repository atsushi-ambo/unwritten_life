import { pathToFileURL } from "node:url";
import { createGame, advance, onMentalLeave } from "../public/engine.js";
import { ERAS } from "../public/world.js";
import { simulationProfile } from "./simulate-life-realism.mjs";

export function measureEras(seeds = 1000) {
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  const result = {};
  for (const era of Object.keys(ERAS)) {
    let income = 0, wealth = 0, layoffs = 0, completed = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      let g = createGame(simulationProfile({ age: 30 }), "steady", seed * 7919, ...Array(22).fill(0), era);
      let lost = false;
      while (g.age < 50 && !g.ended) {
        g = advance(g, onMentalLeave(g) || g.employer.kind === "seeking" ? "rest" : "focus");
        lost ||= g.history.at(-1).incident?.id === "layoff";
      }
      if (g.age === 50) { income += g.income; wealth += g.savings; completed++; }
      if (lost) layoffs++;
    }
    result[era] = { seeds, completed, incomeGrowthPercent: (income / completed / 500 - 1) * 100, wealthManYen: wealth / completed, layoffPercent: layoffs / seeds * 100 };
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(measureEras(Number(process.argv[2] ?? 1000)), null, 2));
