import { pathToFileURL } from "node:url";
import {
  createGame, advanceDirection, onMentalLeave, optionalProfileInputs,
  profileInputForLevel, PROFILE_DEFAULTS, MAX_AGE,
} from "../public/engine.js";

// Synthetic detailed profile. Specialist describes the occupation, not a
// management/specialist rank: no rank was supplied in the reported play.
export const paceProfile = (extra = {}) => optionalProfileInputs(profileInputForLevel({
  age: 32, occupation: "infrastructure", companyType: "large", region: "metro",
  income: 650, ai: "daily", ...extra,
}, "advanced"), PROFILE_DEFAULTS);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

export function measurePace({ seeds = 2000, from = 0, studyFirst = false } = {}) {
  const at37 = [], at45 = [], peaks = [];
  let focusYears = 0, assessedFocusYears = 0, successes = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = createGame(paceProfile(), "steady", seed * 7919,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, from);
    let peak = g.salary;
    while (!g.ended) {
      // Decline all offers; use automatic re-employment after job loss.
      // Leave requires rest, then resume focus at the next direction.
      const run = advanceDirection(g, onMentalLeave(g) ? "rest"
        : studyFirst && !g.decisions.length ? "studyDaily" : "focus");
      for (const h of run.entries) {
        if (h.age === 37) at37.push(h.salary);
        if (h.age === 45) at45.push(h.salary);
        peak = Math.max(peak, h.salary);
        if (h.choice === "focus") {
          focusYears++;
          if (["success", "setback"].includes(h.outcome?.kind)) assessedFocusYears++;
          if (h.outcome?.kind === "success") successes++;
        }
      }
      g = run.game;
    }
    peaks.push(peak);
  }
  return { seeds, studyFirst, pay37: median(at37), pay45: median(at45), peak: median(peaks),
    reached37: at37.length, reached45: at45.length, focusYears, assessedFocusYears,
    successShare: successes / assessedFocusYears, allFocusSuccessShare: successes / focusYears };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 2000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  console.log(JSON.stringify({ before: measurePace({ seeds, from: MAX_AGE }),
    after: measurePace({ seeds }), studyFirst: {
      before: measurePace({ seeds, from: MAX_AGE, studyFirst: true }),
      after: measurePace({ seeds, studyFirst: true }) } }, null, 2));
}
