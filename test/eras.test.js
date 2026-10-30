import test from "node:test";
import assert from "node:assert/strict";
import { createGame, advance, encodeSave, decodeSave, compareWorlds, rewindTo } from "../public/engine.js";
import { ERAS, worldAt } from "../public/world.js";
import { storyRequest } from "../public/story.js";
import { simulationProfile } from "../scripts/simulate-life-realism.mjs";
const game = (era = "standard", seed = 42) => createGame(simulationProfile(), "steady", seed, ...Array(22).fill(0), era);

test("era thresholds and independent rolls preserve the standard world", () => {
  assert.deepEqual(Object.values(ERAS).map(e => [e.downturn, e.expansion]), [[.23,.72],[.12,.55],[.30,.85],[.45,.90]]);
  for (let seed = 1; seed <= 1000; seed++) {
    const base = game("standard", seed), old = { ...base }; delete old.era;
    assert.deepEqual(worldAt(base), worldAt(old));
    for (const era of Object.keys(ERAS)) assert.deepEqual(worldAt(game(era, seed)).shock, worldAt(base).shock);
  }
});
test("era survives saves, comparisons, rewind and is validated", () => {
  let g = advance(advance(game("boom"), "rest"), "rest");
  assert.equal(decodeSave(encodeSave(g)).era, "boom");
  assert.equal(rewindTo(g, 1).era, "boom");
  assert.ok(compareWorlds(g).every(x => x.era === "boom"));
  const save = JSON.parse(encodeSave(g)); delete save.era;
  assert.equal(decodeSave(JSON.stringify(save)).era, "standard");
  for (const bad of [null, "bad", 1, {}]) {
    assert.throws(() => decodeSave(JSON.stringify({ ...save, era: bad })));
    assert.throws(() => encodeSave({ ...g, era: bad }));
    assert.throws(() => game(bad));
  }
  const request = storyRequest(g);
  assert.equal(request.context.economicEra.era, "boom");
  assert.match(request.messages[0].content, /実際の将来予測として書かない/);
});
