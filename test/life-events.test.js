import test from "node:test";
import assert from "node:assert/strict";
import { createGame, advance, incidentAt, incidentRates, encodeSave, decodeSave, validateGeneratedScene } from "../public/engine.js";
import { familyProfile } from "../scripts/simulate-family.mjs";
import { fourReply } from "./fixtures/ai-replies.js";
import { storyRequest } from "../public/story.js";

const ids = ["meetPartner", "unplannedBirth", "partnerSeparation", "parentPassing", "relocation"];
const profile = familyProfile({ age: 30, partner: "partner", children: 0 });

test("boundary preserves old rates and new events respect eligibility", () => {
  const g = createGame(profile);
  const old = incidentRates({ ...g, lifeEventsFrom: 110, payTypeFrom: 110 }, "rest");
  const current = incidentRates({ ...g, payTypeFrom: 110 }, "rest");
  assert.deepEqual(Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))), old);
  assert.ok(!incidentRates({ ...g, family: { ...g.family, partner: false } }, "rest").partnerSeparation);
  assert.ok(!current.parentPassing);
  assert.ok(!incidentRates(g, "familyPlan").unplannedBirth);
  assert.ok(!incidentRates({ ...g, family: { ...g.family, partner: false } }, "meet").meetPartner);
  assert.ok(ids.every((id) => !incidentRates(g, "careLeave")[id]));
});

test("events are deterministic, probability matches draw and saves replay", () => {
  const found = new Set();
  for (let seed = 1; seed < 3000; seed++) {
    const g = createGame(profile, "steady", seed);
    const event = incidentAt(g, "rest");
    if (!event || !ids.includes(event.id)) continue;
    found.add(event.id);
    assert.deepEqual(event, incidentAt(g, "rest"));
    assert.equal(event.chance, Math.round(incidentRates(g, "rest")[event.id] * 10000) / 10000);
    const next = advance(g, "rest");
    assert.equal(next.history[0].incident.id, event.id);
    assert.deepEqual(decodeSave(encodeSave(next)), next);
    assert.equal(Array.isArray(next.history[0].incident), false);
    if (event.id === "partnerSeparation") assert.equal(next.family.partner, false);
    if (event.id === "unplannedBirth") assert.deepEqual(next.family.childAges, [0]);
  }
  assert.ok(found.has("partnerSeparation") && found.has("unplannedBirth") && found.has("relocation"));
});

test("care precedes passing and passing cannot recur", () => {
  const g = createGame(profile);
  const cared = { ...g, history: [{ incident: { id: "parentCare" } }] };
  assert.equal(incidentRates(cared, "rest").parentPassing, 0.03);
  const passed = { ...cared, history: [...cared.history, { incident: { id: "parentPassing" } }] };
  assert.equal(incidentRates(passed, "rest").parentPassing, undefined);
  const older = { ...cared, history: [...cared.history, ...Array.from({ length: 6 }, () => ({}))] };
  assert.equal(incidentRates(older, "rest").parentPassing, 0.1);
});

test("AI output cannot supply incident type or numeric effects", () => {
  const g = createGame(profile);
  const raw = fourReply(storyRequest(g).context);
  assert.doesNotThrow(() => validateGeneratedScene(raw, g));
  for (const key of ["incident", "effects", "chance", "yearChance"]) {
    assert.throws(() => validateGeneratedScene({ ...raw, [key]: key === "incident" ? { id: "parentPassing" } : 100 }, g));
  }
  const withEvent = Array.from({ length: 500 }, (_, seed) => advance(createGame(profile, "steady", seed), "rest")).find((x) => x.history[0].incident);
  assert.match(storyRequest(withEvent).messages[0].content, /記録にない家族/);
});


test("meeting adds a zero-income partner and an old save preserves its years", () => {
  const solo = familyProfile({ age: 30, partner: "solo", children: 0 });
  let next;
  for (let seed = 0; seed < 5000; seed++) {
    const g = createGame(solo, "steady", seed);
    if (incidentAt(g, "rest")?.id === "meetPartner") { next = advance(g, "rest"); break; }
  }
  assert.ok(next);
  assert.equal(next.family.partner, true);
  assert.equal(next.history[0].budget.partnerIncome ?? 0, 0);
  const legacy = advance({ ...createGame(solo, "steady", 42), lifeEventsFrom: 110, payTypeFrom: 110 }, "rest");
  const saved = JSON.parse(encodeSave(legacy));
  delete saved.lifeEventsFrom;
  const restored = decodeSave(JSON.stringify(saved));
  assert.equal(restored.lifeEventsFrom, saved.decisions.length);
  assert.deepEqual(restored.history, legacy.history);
});
