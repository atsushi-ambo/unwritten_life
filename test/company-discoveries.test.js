import test from "node:test";
import assert from "node:assert/strict";
import { discoveredCompanies, createGame } from "../public/engine.js";
import { careerRecordText, COMPANY_DISCOVERY_NOTE } from "../public/careers.js";

const suggestion = (name, proposal = null, candidateKind = "real") =>
  ({ decision: { id: "switch", name, proposal, candidateKind } });

test("discoveries merge by employerKey in first-seen order without mutating saves", () => {
  const game = {
    profile: { age: 30 }, decisions: ["rest", "rest"], year: 2028,
    careerSeen: { 1: [" Later ", "ALPHA"], 0: [" Alpha "] },
    scenes: { 1: { options: [suggestion("alpha", " 経験を活かす ", "fictional"), suggestion("Beta")] } },
  };
  const before = structuredClone(game);
  assert.deepEqual(discoveredCompanies(game), [
    { name: "Alpha", year: 2026, age: 30, proposal: "経験を活かす", fictional: true },
    { name: "Later", year: 2027, age: 31, proposal: null, fictional: false },
    { name: "Beta", year: 2027, age: 31, proposal: null, fictional: false },
  ]);
  assert.deepEqual(game, before);
});

test("discoveries exclude initial, current and past employers but skip non-employer history kinds", () => {
  const game = {
    profile: { company: "Initial" }, employer: { name: "Current" },
    history: [{ employer: { name: "Past", kind: "real" } },
      ...["seeking", "venture", "legacy"].map((kind) => ({ employer: { name: kind, kind } }))],
    careerSeen: { 0: ["INITIAL", "current", "past"] },
    scenes: { 0: { options: ["seeking", "venture", "legacy"].map((name) => suggestion(name)) } },
  };
  assert.deepEqual(discoveredCompanies(game).map((c) => c.name), ["seeking", "venture", "legacy"]);
});

test("discoveries cap at twelve and still enrich included companies from later turns", () => {
  const careerSeen = Object.fromEntries(Array.from({ length: 6 }, (_, i) =>
    [i, Array.from({ length: 3 }, (_, j) => `Company${i * 3 + j}`)]));
  const result = discoveredCompanies({ careerSeen, scenes: { 6: { options: [suggestion("Company0", "提案", "fictional")] } } });
  assert.equal(result.length, 12);
  assert.equal(result.at(-1).name, "Company11");
  assert.equal(result[0].fictional, true);
  assert.equal(result[0].proposal, "提案");
});

test("malformed saves are ignored and unreliable dates are omitted", () => {
  for (const game of [null, [], 7, { careerSeen: [], scenes: "bad", history: [null] }])
    assert.deepEqual(discoveredCompanies(game), []);
  const result = discoveredCompanies({
    profile: { age: "30" }, year: 2040, decisions: ["rest"],
    careerSeen: { bad: ["invalid"], 2: ["future"], 0: [null, {}, 4, " ", "x".repeat(61), "a\nb", "Good"] },
    scenes: { 0: { options: [null, {}, suggestion("Good", "x".repeat(301), "fictional"),
      suggestion("Other", {}, "real"), { decision: { id: "rest", name: "ignored" } }] }, 1: null },
  });
  assert.deepEqual(result, [
    { name: "Good", proposal: null, fictional: true },
    { name: "Other", proposal: null, fictional: false },
  ]);
});

test("copied resume shares discoveries, fictional labels, note and empty state", () => {
  const game = createGame({ age: 30, region: "city", job: "tech", ai: "daily", priority: "balance", gender: "undisclosed", household: "solo", companyType: "small" });
  assert.ok(careerRecordText(game).includes("転職先の候補は挙がりませんでした。"));
  game.scenes = { 0: { options: [suggestion("合成企業", "<script>提案</script>", "fictional")] } };
  const text = careerRecordText(game);
  for (const expected of [COMPANY_DISCOVERY_NOTE, "合成企業（架空）", "<script>提案</script>"])
    assert.ok(text.includes(expected));
});
