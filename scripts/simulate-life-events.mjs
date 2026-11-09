import { pathToFileURL } from "node:url";
import { createGame, advance, availableChoices } from "../public/engine.js";
import { familyProfile } from "./simulate-family.mjs";

export function measureLifeEvents(seeds = 2000) {
  const bands = {}, ids = ["meetPartner", "unplannedBirth", "partnerSeparation", "parentPassing", "relocation"];
  let separated = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = createGame(familyProfile({ age: 25, partner: "partner", children: 0 }), "steady", seed * 7919);
    let didSeparate = false;
    while (!g.ended && g.age < 65) {
      const band = `${Math.floor(g.age / 10) * 10}代`;
      bands[band] ??= { years: 0, ...Object.fromEntries(ids.map((id) => [id, 0])) };
      bands[band].years++;
      const action = availableChoices(g).includes("rest") ? "rest" : availableChoices(g)[0];
      g = advance(g, action);
      const id = g.history.at(-1).incident?.id;
      if (ids.includes(id)) bands[band][id]++;
      if (id === "partnerSeparation") didSeparate = true;
    }
    if (didSeparate) separated++;
  }
  return { seeds, separationBy65: separated / seeds, bands: Object.fromEntries(Object.entries(bands).map(([band, row]) => [band, { years: row.years, ...Object.fromEntries(ids.map((id) => [id, row[id] / row.years])) }])) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 2000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error("seeds must be 1..10000");
  console.log(JSON.stringify(measureLifeEvents(seeds), null, 2));
}
