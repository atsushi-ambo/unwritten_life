import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, advance, advanceYears, encodeSave, decodeSave, RANKS, MAX_AGE,
  optionalProfileInputs, profileInputForLevel,
} from "../public/engine.js";
import { lifeStory, careerRecordText } from "../public/careers.js";

const profile = (extra = {}) => optionalProfileInputs(profileInputForLevel(
  { occupation: "software", company: "合成ソフト社", ...extra }, "advanced",
));
// Incidents are off so the ending is the only thing being tested.
const quiet = (p, seed = 3) => createGame(p, "steady", seed, 0, 0, 0, 0, 0, 0, 0, MAX_AGE);

test("the story closes in the year work ends, not at the end of life", () => {
  let g = quiet(profile({ age: 62, retirementAge: 65 }));
  g = advance(g, "focus");
  g = advance(g, "focus");
  assert.equal(g.ended, false);
  g = advance(g, "focus");
  assert.equal(g.ended, true);
  assert.equal(g.age, 65);
  assert.equal(g.history.at(-1).careerEnd.reason, "retire");
  assert.match(g.history.at(-1).careerEnd.title, /定年/);
  assert.throws(() => advance(g, "rest"), /完結/);
  assert.deepEqual(decodeSave(encodeSave(g)), g);
});

test("the ending fits how the person worked", () => {
  const early = advance(quiet(profile({ age: 50 })), "retire");
  assert.equal(early.history.at(-1).careerEnd.reason, "early");
  const director = advance(quiet(profile({ age: 64, retirementAge: 65, rank: "director" })), "focus");
  assert.equal(director.history.at(-1).careerEnd.reason, "stepDown");
  assert.match(director.history.at(-1).careerEnd.title, /部長級を退任/);
  let founder = advance(quiet(profile({ age: 63, retirementAge: 65, savings: 2000 })), {
    id: "startup", venture: "ai", name: "合成AI相談室",
  });
  founder = advance(founder, "focus");
  assert.equal(founder.history.at(-1).careerEnd.reason, "leaveBusiness");
  assert.match(founder.history.at(-1).careerEnd.title, /合成AI相談室から退き/);
});

test("multi-year play stops at the ending and says so", () => {
  const journey = advanceYears(quiet(profile({ age: 62, retirementAge: 65 })), "focus", 5);
  assert.equal(journey.entries.length, 3);
  assert.match(journey.stopReason, /キャリアに区切り/);
});

test("older saves keep playing past retirement as they did", () => {
  const g = advance(createGame(profile({ age: 63, retirementAge: 65 }), "steady", 1), "focus");
  const saved = JSON.parse(encodeSave(g));
  delete saved.careerEndFrom;
  const migrated = decodeSave(JSON.stringify(saved));
  assert.equal(migrated.careerEndFrom, 1);
  for (const careerEndFrom of [null, -1, 1.5, MAX_AGE + 1, "0"])
    assert.throws(() => decodeSave(JSON.stringify({ ...saved, careerEndFrom })));
});

test("my resume sums up money, titles, family and luck, decade by decade", () => {
  let g = quiet(profile({ age: 38, retirementAge: 45, rank: "staff", savings: 3000 }), 5);
  g = advance(g, { id: "switch", target: "custom", name: "合成クラウド社", role: "tech", companyType: "unknown", facts: null });
  g = advance(g, "home");
  for (let seed = 0; !g.ended && seed < 20; seed++)
    g = advance(g, availableTry(g));
  const story = lifeStory(g, RANKS);
  assert.equal(story.startAge, 38);
  assert.match(story.headline, /定年|退/);
  assert.ok(story.stats.peakIncome >= story.stats.startIncome);
  assert.equal(story.stats.moves, 1);
  assert.equal(story.stats.employers, 2);
  assert.equal(story.stats.housing, "own");
  const texts = story.chapters.flatMap((c) => c.events.map((e) => e.text));
  assert.ok(texts.includes("合成クラウド社へ転職"));
  assert.ok(texts.includes("家を買う"));
  assert.deepEqual(story.chapters.map((c) => c.label), ["30代", "40代"]);
  assert.equal(story.chapters.at(-1).events.at(-1).kind, "end");
  const text = careerRecordText(g, {}, RANKS);
  assert.match(text, /わたしの履歴書/);
  assert.match(text, /【30代】/);
  assert.match(text, /純資産/);
});

function availableTry(g) {
  return g.position.rank === "staff" ? "promote" : "focus";
}
