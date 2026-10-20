import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { careerMap, careerMilestones, pendingCareerReflection, careerRecord, careerRecordText } from "../public/careers.js";
import { createGame, advance, advanceYears, recordCareerReflection, encodeSave, decodeSave } from "../public/engine.js";
import { storyRequest } from "../public/story.js";
// Play past retirement as under the rules before the career ending.
const pastRetirement = (profile, scenario = "steady", seed = 2026, ...from) =>
  createGame(profile, scenario, seed, ...[0, 0, 0, 0, 0, 0, 0, 0, 0].map((d, i) => from[i] ?? d), 110);

const profile = {
  age: 29, region: "city", job: "tech", income: 500, ai: "sometimes",
  priority: "balance", gender: "undisclosed", household: "solo",
  savings: 500, monthlyCost: 12, companyType: "small", company: "合成SI社",
};

test("career map derives each year's main activity without changing history or saves", () => {
  const game = {
    profile: { age: 29, retirementAge: 65 },
    history: [
      ["focus", "initial"], ["switch", "real"], ["studyDaily", "real"],
      ["startup", "venture"], ["rest", "venture"], ["careLeave", "venture"],
      ["focus", "seeking"], ["switch", "real"], ["retire", "real"], ["learn", "real"],
    ].map(([choice, kind], i) => ({ year: 2026 + i, age: 29 + i, choice, choiceLabel: `選択${i}`, employer: { kind } })),
  };
  const original = structuredClone(game);
  const tiles = careerMap(game);
  assert.deepEqual(tiles.map((t) => t.state), [
    "employed", "change", "learning", "venture", "rest", "rest", "rest", "change", "retired", "retired",
  ]);
  assert.deepEqual(tiles[1], { year: 2027, age: 30, choice: "選択1", state: "change", label: "転職", icon: "↗" });
  assert.deepEqual(game, original);
  assert.deepEqual(careerMap({ ...game, history: [] }), []);
});

test("milestone pauses happen at arrival, once, and do not change annual calculations", () => {
  const initial = createGame(profile);
  assert.equal(pendingCareerReflection(initial), null);
  const journey = advanceYears(initial, "rest", 10, { pauseAtMilestones: true });
  assert.equal(journey.entries.length, 1);
  assert.deepEqual(journey.game, advance(initial, "rest"));
  assert.equal(pendingCareerReflection(journey.game).id, "age-30");
  const answered = recordCareerReflection(journey.game, "age-30", "余白のある仕事を続けたい");
  assert.equal(pendingCareerReflection(answered), null);
  assert.deepEqual(answered.history, journey.game.history);
  const skipped = recordCareerReflection(journey.game, "age-30", "");
  assert.equal(pendingCareerReflection(decodeSave(encodeSave(skipped))), null);
  assert.equal(pendingCareerReflection(createGame({ ...profile, age: 30 })), null);
  for (const age of [39, 49, 59]) {
    const g = advance(createGame({ ...profile, age }), "rest");
    assert.equal(pendingCareerReflection(g).id, `age-${age + 1}`);
  }
});

test("retirement has one checkpoint even at a decade or under legacy retirement rules", () => {
  const g = advance(pastRetirement({ ...profile, age: 59, retirementAge: 60 }), "rest");
  assert.deepEqual(careerMilestones(g).map((m) => m.id), ["retirement"]);
  const early = advance(pastRetirement({ ...profile, age: 45 }), "retire");
  assert.equal(pendingCareerReflection(early).id, "retirement");
  const retiredStart = advance(pastRetirement({ ...profile, age: 70, retirementAge: 65 }), "rest");
  assert.deepEqual(careerMilestones(retiredStart), []);
  const legacy = pastRetirement({ ...profile, age: 64 }, "steady", 2026, 0, 0, 3);
  assert.equal(pendingCareerReflection(advance(legacy, "rest")), null);
  assert.equal(pendingCareerReflection(advance(advance(legacy, "rest"), "rest")).id, "retirement");
});

test("reflections round-trip, reject invalid and unreached entries, and default safely in old saves", () => {
  const g = advance(createGame(profile), "rest");
  const line = "あ".repeat(80);
  const saved = recordCareerReflection(g, "age-30", line);
  assert.deepEqual(decodeSave(encodeSave(saved)), saved);
  const raw = JSON.parse(encodeSave(g));
  delete raw.reflections;
  assert.deepEqual(decodeSave(JSON.stringify(raw)).reflections, {});
  for (const reflections of [
    null, [], "text", 7, { "age-30": 7 }, { "age-30": null },
    { "age-30": "x".repeat(81) }, { "age-30": "一行\n二行" },
    { "age-30": "x\u0000" }, { "age-30": "x\u2028y" },
    { "age-40": "未来の記録" }, { retirement: "まだ退職していない" },
    { invalid: "text" }, { "age-30": {} },
    Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`id${i}`, ""])),
  ]) {
    assert.throws(() => decodeSave(JSON.stringify({ ...raw, reflections })));
    assert.throws(() => encodeSave({ ...g, reflections }));
  }
  assert.throws(() => recordCareerReflection(g, "__proto__", "text"));
  const later = advance(g, "rest");
  assert.equal(pendingCareerReflection(later), null, "no backlog on old saves");
  assert.deepEqual(careerMilestones(decodeSave(encodeSave(saved))), careerMilestones(g));
});

test("career reflections never enter life or career AI prompts or context", () => {
  const g = advance(createGame(profile), "rest");
  const saved = recordCareerReflection(g, "age-30", "PRIVATE_REFLECTION_DO_NOT_SEND");
  for (const mode of ["life", "career"]) {
    assert.deepEqual(storyRequest(saved, { mode }), storyRequest(g, { mode }));
    assert.doesNotMatch(JSON.stringify(storyRequest(saved, { mode })), /PRIVATE_REFLECTION/);
  }
});

test("resume groups consecutive employers and roles, counts every year once, and exports the same record as text", () => {
  let game = advance(createGame({ ...profile, age: 29 }, "steady", 42), "rest");
  game = recordCareerReflection(game, "age-30", "次の仕事にも、余白を。");
  game = advance(game, { id: "switch", target: "microsoft", role: "tech" });
  game = advance(game, "studyDaily");
  game = advance(game, { id: "switch", target: "custom", name: "Microsoft", role: "marketing", companyType: "large" });
  while (game.age < 45) game = advance(game, "rest");
  game = advance(game, "retire");
  while (!game.ended) game = advance(game, "rest");
  const before = encodeSave(game), record = careerRecord(game);
  assert.deepEqual(record.tenures.slice(0, 3).map((t) => [t.employer, t.role, t.years]), [
    ["合成SI社", "tech", 1], ["Microsoft", "tech", 2], ["Microsoft", "marketing", 13],
  ]);
  assert.equal(record.tenures.at(-1).kind, "retired");
  assert.equal(Object.values(record.yearsByState).reduce((a, b) => a + b), game.decisions.length);
  assert.equal(record.tenures.reduce((a, t) => a + t.years, 0), game.decisions.length);
  assert.equal(record.reflections[0].text, "次の仕事にも、余白を。");
  const text = careerRecordText(game, { tech: { label: "技術職" } });
  for (const expected of ["わたしの履歴書", "勤務先と役割", "Microsoft / 技術職", "退職後の暮らし", "次の仕事にも、余白を。", "キャリアマップ", "1マスが1年"])
    assert.ok(text.includes(expected), expected);
  // The turning points live in the story's decades only.
  for (const repeated of ["選んだ転機", "職務経歴書"]) assert.ok(!text.includes(repeated), repeated);
  assert.equal(encodeSave(game), before);
  assert.equal(careerRecordText(decodeSave(before)), careerRecordText(game));
  assert.deepEqual(careerRecord(createGame(profile)).tenures, []);
});

test("career map respects retirement and nonworking starts, including legacy records", async () => {
  let game = pastRetirement({ ...profile, age: 64, retirementAge: 65 });
  game = advance(advance(game, "focus"), "rest");
  assert.deepEqual(careerMap(game).map((t) => t.state), ["employed", "retired"]);
  assert.deepEqual(careerMap(decodeSave(encodeSave(game))), careerMap(game));
  for (const occupation of ["student", "notWorking"]) {
    const g = { profile: { age: 25, retirementAge: 65, occupation }, history: [{ age: 25, year: 2026, choice: "connect", choiceLabel: "人と会う" }] };
    assert.equal(careerMap(g)[0].state, occupation === "student" ? "learning" : "rest");
  }
  const fixtures = JSON.parse(await readFile(new URL("./fixtures/v02-saves.json", import.meta.url)));
  for (const fixture of fixtures) {
    const g = decodeSave(JSON.stringify(fixture.save));
    assert.equal(careerMap(g).length, g.decisions.length);
  }
});
