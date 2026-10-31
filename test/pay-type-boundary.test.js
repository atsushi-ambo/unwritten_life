import test from "node:test";
import assert from "node:assert/strict";
import { createGame, advance, encodeSave, decodeSave, replay, rewindTo, compareWorlds, MAX_AGE } from "../public/engine.js";
import { familyProfile } from "../scripts/simulate-family.mjs";

test("pay type boundary survives save, replay, rewind and comparison; legacy saves migrate", () => {
  const profile = familyProfile({ age: 30, partner: "solo", children: 0 });
  let g = createGame(profile, "steady", 42, ...Array(22).fill(0), "standard", 7);
  g = advance(advance(g, "rest"), "rest");
  assert.deepEqual(decodeSave(encodeSave(g)), g);
  assert.deepEqual(replay(profile, g.scenario, g.seed, g.decisions, {}, false, ...Array(22).fill(0), undefined, g.era, 7), g);
  assert.equal(rewindTo(g, 1).payTypeFrom, 7);
  for (const world of compareWorlds(g)) assert.equal(world.payTypeFrom, 7);
  const save = JSON.parse(encodeSave(g));
  delete save.payTypeFrom;
  assert.equal(decodeSave(JSON.stringify(save)).payTypeFrom, save.decisions.length);
  for (const invalid of [-1, MAX_AGE + 1, 1.5, null]) {
    assert.throws(() => createGame(profile, "steady", 42, ...Array(22).fill(0), "standard", invalid));
    assert.throws(() => replay(profile, "steady", 42, [], {}, false, ...Array(22).fill(0), undefined, "standard", invalid));
    assert.throws(() => encodeSave({ ...g, payTypeFrom: invalid }));
    assert.throws(() => decodeSave(JSON.stringify({ ...save, payTypeFrom: invalid })));
  }
});
