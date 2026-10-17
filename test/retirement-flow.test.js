import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { createGame, advance, encodeSave, decodeSave, isRetiredAt, availableChoices, suggestedChoices } from "../public/engine.js";
import { storyRequest } from "../public/story.js";

test("career comparison, direct generation and manual exchange share the versioned retirement guard", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    before = createGame({
      age: 64, retirementAge: 65, region: "city", job: "tech",
      ai: "sometimes", priority: "balance", gender: "undisclosed",
      household: "solo", companyType: "unknown",
    }),
    boundary = advance(before, "rest"),
    legacySave = JSON.parse(encodeSave(boundary));
  delete legacySave.retirementFrom;
  const legacy = decodeSave(JSON.stringify(legacySave));
  for (const [game, allowed] of [
    [before, true],
    [boundary, false],
    [legacy, true],
    [advance(legacy, "rest"), false],
  ]) {
    const elements = new Map();
    let comparisons = 0, requests = 0, exchanges = 0;
    const $ = (id) => {
      if (!elements.has(id)) elements.set(id, {
        classList: { toggle() {} },
        setAttribute() {},
        addEventListener(_type, handler) { this.click = handler; },
        showModal() { exchanges++; },
      });
      return elements.get(id);
    };
    const aiState = {
      provider: "ollama", cloud: false, calls: 0, reservedUSD: 0,
      requestCap: 100, usdCap: 1, model: "synthetic",
    };
    const context = createContext({
      $, game, aiState, isRetiredAt, encodeSave, storyRequest,
      generating: false, hosted: false, revision: 0,
      careerGenerating: false, careerDraft: null,
      exchangeMode: "life", exchangeRevision: 0, knowledgeCatalog: undefined,
      needsCareerServerUpdate: () => false,
      needsChoiceServerUpdate: () => false,
      renderAITiming() {}, renderGame() {}, renderCareerOffers() {},
      openCareer: () => { comparisons++; },
      performance: { now: () => 0 },
      setInterval: () => 0, clearInterval() {},
      api: async () => {
        requests++;
        return { accounting: aiState, scene: {} };
      },
    });
    for (const [start, end] of [
      ["function renderAI()", "function renderAITiming()"],
      ["async function generateCareerChoices()", '$("career-generate").addEventListener'],
      ["function openExchange(", '$("exchange-button").addEventListener'],
      ['$("career-compare-button").addEventListener', "function renderCareer()"],
    ])
      runInContext(app.slice(app.indexOf(start), app.indexOf(end)), context);
    runInContext("renderAI()", context);
    for (const id of ["career-compare-button", "career-generate", "career-exchange"])
      assert.equal($(id).disabled, !allowed, id);
    $("career-compare-button").click();
    await runInContext("generateCareerChoices()", context);
    runInContext('openExchange("career")', context);
    assert.equal(comparisons, Number(allowed));
    assert.equal(requests, Number(allowed));
    assert.equal(exchanges, Number(allowed));
    aiState.provider = "disabled";
    await runInContext("generateCareerChoices()", context);
    assert.equal(exchanges, Number(allowed) * 2);
    runInContext('openExchange("life")', context);
    assert.equal(exchanges, Number(allowed) * 2 + 1);
  }
});

test("suggested choices stay executable around the retirement age, including business setbacks", () => {
  const profile = {
    age: 62, retirementAge: 65, region: "city", job: "tech",
    ai: "sometimes", priority: "balance", gender: "undisclosed",
    household: "solo", companyType: "unknown", savings: 2000,
  };
  for (let seed = 0; seed < 40; seed++) {
    let g = createGame(profile, "steady", seed);
    for (const step of [
      { id: "startup", venture: "studio", name: "合成スタジオ" },
      "rest",
      "rest",
      "rest",
      "rest",
    ]) {
      const allowed = availableChoices(g);
      for (const id of suggestedChoices(g))
        assert.ok(allowed.includes(id), `seed ${seed} age ${g.age}: ${id}`);
      if (g.ended || !allowed.includes(typeof step === "string" ? step : step.id)) break;
      g = advance(g, step);
    }
  }
});
