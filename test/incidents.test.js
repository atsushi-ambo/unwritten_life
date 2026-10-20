import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, advance, advanceYears, replay, encodeSave, decodeSave,
  incidentAt, INCIDENTS, MAX_AGE, optionalProfileInputs, profileInputForLevel,
} from "../public/engine.js";
import { storyRequest } from "../public/story.js";

const profile = optionalProfileInputs({
  ...profileInputForLevel({}, "quick"), age: 30, partner: "partner",
});
const move = (name) => ({
  id: "switch", target: "custom", name, role: "tech", companyType: "unknown", facts: null,
});
// The first seed whose opening year draws the wanted incident.
function seedFor(id, { action = "focus", severe, p = profile, offersFrom = 0 } = {}) {
  for (let seed = 0; seed < 20000; seed++) {
    const g = { ...createGame(p, "steady", seed), offersFrom };
    const incident = incidentAt(g, typeof action === "string" ? action : action.id);
    if (incident?.id === id && (severe === undefined || incident.severe === severe)) return seed;
  }
  assert.fail(`no seed for ${id}`);
}

test("incidents are seeded: the same seed and choices give the same life, and saves round-trip", () => {
  for (const seed of [0, 7, 42, 2026]) {
    let g = createGame(profile, "steady", seed);
    for (const action of ["focus", "rest", move("合成商事"), "learn", "focus", "connect"]) g = advance(g, action);
    assert.deepEqual(replay(g.profile, g.scenario, g.seed, g.decisions), g);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
  }
});

test("rates stay in the game's assumed range and at most one incident happens a year", () => {
  let years = 0, any = 0;
  const counts = {};
  for (let seed = 0; seed < 300; seed++) {
    let g = createGame(profile, "steady", seed);
    for (let y = 0; y < 20 && !g.ended; y++) {
      g = advance(g, y % 2 ? "rest" : "learn");
      years++;
      const incident = g.history.at(-1).incident;
      if (incident) {
        any++;
        counts[incident.id] = (counts[incident.id] ?? 0) + 1;
        assert.ok(Object.hasOwn(INCIDENTS, incident.id));
        assert.ok(incident.chance > 0 && incident.chance <= incident.yearChance && (incident.yearChance < 0.6 || ["leaveContinues", "returnToWork"].includes(incident.id)));
      }
    }
  }
  assert.ok(any / years > 0.15 && any / years < 0.4, `${any / years}`);
  // Hard, rare incidents stay rare; everyday friction is the most common.
  for (const id of ["burnout", "layoff", "windfall"]) assert.ok((counts[id] ?? 0) / years < 0.015, id);
  assert.ok(counts.difficultBoss > (counts.harassment ?? 0));
});

test("a new workplace raises the chance of both a difficult boss and a good team", () => {
  const g = createGame(profile, "steady", 1);
  const stay = incidentAt(g, "focus"), moved = incidentAt(g, "switch", { ...g.employer, kind: "real" });
  assert.ok(!stay || stay.yearChance < (moved?.yearChance ?? 1));
  const seed = seedFor("difficultBoss", { action: move("合成商事") });
  const next = advance(createGame(profile, "steady", seed), move("合成商事"));
  assert.equal(next.history[0].incident.id, "difficultBoss");
  assert.equal(next.employer.name, "合成商事");
  assert.ok(next.health < createGame(profile, "steady", seed).health);
});

test("a layoff ends pay for the year, pays severance as cash, and the next job starts from the previous pay", () => {
  const seed = seedFor("layoff");
  const g = createGame({ ...profile, income: 800 }, "steady", seed);
  const laid = advance(g, "focus"), h = laid.history[0];
  assert.equal(h.incident.id, "layoff");
  assert.equal(laid.employer.kind, "seeking");
  assert.equal(laid.salary, 0);
  assert.ok(h.budget.other > 0);
  assert.match(h.note, /人員整理/);
  const hired = advance(laid, move("合成ロジ"));
  assert.ok(hired.salary > 400, `${hired.salary}`);
});

test("a pre-offers leave lowers pay for one year and then returns to the earlier level", () => {
  const seed = seedFor("harassment", { severe: true, offersFrom: MAX_AGE });
  const g = { ...createGame(profile, "steady", seed), offersFrom: MAX_AGE };
  const leave = advance(g, "focus");
  assert.equal(leave.history[0].incident.severe, true);
  assert.match(leave.history[0].incident.title, /休職/);
  assert.ok(leave.salary < g.salary * 0.8);
  const back = advance(leave, "rest");
  assert.ok(back.salary > g.salary * 0.85, `${back.salary} vs ${g.salary}`);
});

test("people who are not working only meet life incidents", () => {
  for (const p of [
    optionalProfileInputs({ ...profileInputForLevel({}, "standard"), occupation: "student" }),
    { ...profile, age: 70, retirementAge: 65 },
  ])
    for (let seed = 0; seed < 400; seed++) {
      const incident = incidentAt(createGame(p, "steady", seed), "rest");
      assert.ok(!incident || incident.kind === "life", `${seed} ${incident?.id}`);
    }
});

test("saves from before incidents keep their recorded years, and the boundary is validated", () => {
  let g = createGame(profile, "steady", seedFor("layoff"), 0, 0, 0, 0, 0, 0, 0, MAX_AGE);
  g = advance(g, "focus");
  assert.equal(g.history[0].incident, undefined);
  const saved = JSON.parse(encodeSave(g));
  delete saved.incidentFrom;
  const migrated = decodeSave(JSON.stringify(saved));
  assert.equal(migrated.incidentFrom, 1);
  assert.deepEqual(migrated.history, g.history);
  for (const incidentFrom of [null, -1, 1.5, MAX_AGE + 1, "0"]) {
    assert.throws(() => decodeSave(JSON.stringify({ ...saved, incidentFrom })));
    assert.throws(() => createGame(profile, "steady", 1, 0, 0, 0, 0, 0, 0, 0, incidentFrom));
  }
});

test("the AI receives the incident as a fixed fact and is told how to narrate it", () => {
  const seed = seedFor("harassment", { severe: false });
  const g = advance(createGame(profile, "steady", seed), "focus");
  const { context, messages } = storyRequest(g);
  assert.equal(context.lastIncident.title, "職場でハラスメントを受ける");
  assert.equal(context.lastIncident.tone, "hard");
  assert.equal(context.pastChoices.at(-1).incident, "職場でハラスメントを受ける");
  const system = messages[0].content;
  assert.match(system, /lastIncidentはゲームの乱数で確定した/);
  assert.match(system, /種類と重さ.*変えず/);
  assert.match(system, /本人の責任にせず/);
  assert.match(system, /少なくとも1案はこの出来事への具体的な向き合い方/);
  const quiet = createGame(profile, "steady", seed);
  assert.equal(storyRequest(quiet).context.lastIncident, null);
  assert.doesNotMatch(storyRequest(quiet).messages[0].content, /lastIncident/);
});

test("multi-year play pauses after a hard incident", () => {
  const seed = seedFor("layoff");
  const journey = advanceYears(createGame(profile, "steady", seed), "focus", 5);
  assert.equal(journey.entries.length, 1);
  assert.match(journey.stopReason, /思いがけない出来事/);
});
