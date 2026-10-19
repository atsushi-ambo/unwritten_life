import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  advance,
  encodeSave,
  decodeSave,
  recordCareerSeen,
  careerSeenUntil,
} from "../public/engine.js";
import { storyRequest, pastCandidates } from "../public/story.js";
import { KNOWLEDGE } from "../public/world.js";
const profile = {
  age: 30,
  region: "city",
  job: "tech",
  income: 500,
  ai: "sometimes",
  priority: "balance",
  gender: "undisclosed",
  household: "solo",
  savings: 500,
  monthlyCost: 12,
  companyType: "small",
  company: "合成企業",
};
const move = (name) => ({
  id: "switch",
  target: "custom",
  name,
  role: "tech",
  companyType: "unknown",
  facts: null,
});

test("no built-in company list reaches the prompt or the knowledge catalog", () => {
  const g = createGame(profile, "steady", 7612026);
  for (const mode of ["life", "career"]) {
    const { context, messages } = storyRequest(g, { mode });
    assert.equal(Object.hasOwn(context, "careerRoutes"), false);
    assert.equal(Object.hasOwn(context.localKnowledge, "companySnapshots"), false);
    for (const name of ["Microsoft", "トヨタ自動車", "NTTデータ", "みずほ銀行", "中外製薬"])
      assert.ok(!JSON.stringify(messages).includes(name), name);
  }
  assert.ok(!KNOWLEDGE.some((r) => r.kind === "company"));
});

test("companies shown or worked at are passed back so the AI proposes different ones", () => {
  let g = createGame(profile, "steady", 7612026);
  assert.deepEqual(pastCandidates(g), []);
  g = recordCareerSeen(g, ["合成商事", "合成ソフト", "合成企業"]);
  assert.deepEqual(pastCandidates(g), ["合成商事", "合成ソフト"]);
  g = advance(g, move("合成商事"));
  g = recordCareerSeen(g, ["合成ロジ", "合成ソフト", "合成企業"]);
  // The current employer is never listed; the previous one and older offers are.
  assert.deepEqual(pastCandidates(g), ["合成企業", "合成ロジ", "合成ソフト"]);
  assert.deepEqual(storyRequest(g, { mode: "career" }).context.pastCandidates, pastCandidates(g));
  const restored = decodeSave(encodeSave(g));
  assert.deepEqual(restored.careerSeen, g.careerSeen);
  assert.deepEqual(careerSeenUntil(g, 0), { 0: ["合成商事", "合成ソフト", "合成企業"] });
});

test("the shown-company record is bounded, validated and accepts older saves without it", () => {
  let g = createGame(profile, "steady", 1);
  for (let i = 0; i < 40; i++) {
    g = recordCareerSeen(g, [`会社${i}`]);
    g = advance(g, "rest");
  }
  assert.equal(Object.keys(g.careerSeen).length, 30);
  assert.equal(pastCandidates(g).length, 15);
  const saved = JSON.parse(encodeSave(g));
  delete saved.careerSeen;
  assert.deepEqual(decodeSave(JSON.stringify(saved)).careerSeen, {});
  for (const careerSeen of [
    { 999: ["未来"] },
    { 0: ["a", "b", "c", "d"] },
    { 0: ["x".repeat(61)] },
    { 0: [1] },
    { "01": ["a"] },
    [],
  ])
    assert.throws(() => decodeSave(JSON.stringify({ ...saved, careerSeen })));
});

test("saves that chose a company from an earlier built-in list still replay", () => {
  const g = createGame(profile, "steady", 7612026);
  const legacy = advance(g, { id: "switch", target: "nttdata", role: "tech" });
  assert.equal(legacy.employer.name, "NTTデータ");
  assert.deepEqual(decodeSave(encodeSave(legacy)).employer, legacy.employer);
});
