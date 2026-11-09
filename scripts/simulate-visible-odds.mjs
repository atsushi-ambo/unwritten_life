// Synthetic one-year moves and tired learning directions; no AI or saved personal data.
import assert from "node:assert/strict";
import { createGame, advance, advanceDirection, choiceForecast, MAX_AGE } from "../public/engine.js";
const seeds = Number(process.argv[2] ?? 1000);
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seed数は1〜10000");
const profile = { age: 35, job: "tech", region: "city", ai: "daily", priority: "balance", rank: "staff",
  gender: "undisclosed", household: "solo", companyType: "small", savings: 2000 };
const decision = { id: "switch", target: "custom", name: "合成テスト社", role: "tech", companyType: "unknown",
  rank: "lead", intent: "上の役割を目指す" };
let oldChance = 0, newChance = 0, successes = 0, legacyRest = 0, updatedRest = 0;
for (let seed = 1; seed <= seeds; seed++) {
  let g = { ...createGame(profile, "steady", seed * 7919), incidentFrom: MAX_AGE };
  // Three years in the stage make a move one stage up available.
  for (let i = 0; i < 3; i++) g = advance(g, "rest");
  const before = advance({ ...g, oddsFrom: MAX_AGE }, decision).history.at(-1);
  const after = advance(g, decision).history.at(-1);
  assert.equal(after.outcome.chance, choiceForecast(g, decision).chance);
  assert.deepEqual({ ...after, outcome: { ...after.outcome, chance: before.outcome.chance } }, before);
  oldChance += before.outcome.chance; newChance += after.outcome.chance;
  successes += Number(after.outcome.kind === "success");
  const tired = { ...g, health: 29 };
  for (const [legacy, from] of [[true, MAX_AGE], [false, 0]]) {
    const run = advanceDirection({ ...tired, oddsFrom: from }, "studyDaily", { years: 2 });
    const count = run.entries.filter((h) => h.choice === "rest").length;
    if (legacy) legacyRest += count; else updatedRest += count;
  }
}
console.log(JSON.stringify({ seeds, scenario: "steady", seedMultiplier: 7919,
  raisedRole: { oldRecordedMean: oldChance / seeds, actualAndDisplayedMean: newChance / seeds,
    observedSuccessRate: successes / seeds, otherRecordChanges: 0 },
  tiredStudyTwoYears: { legacyRest, updatedRest } }, null, 2));
