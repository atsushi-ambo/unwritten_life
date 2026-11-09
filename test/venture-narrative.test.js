import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, advance, suggestedChoices, eventFor, encodeSave, decodeSave,
} from "../public/engine.js";
import { storyRequest } from "../public/story.js";

const profile = {
  age: 35, region: "city", job: "tech", income: 600,
  ai: "sometimes", priority: "balance", gender: "undisclosed",
  household: "solo", companyType: "unknown", savings: 1000,
  stocks: 0, monthlyCost: 12, rent: 7, pension: 180,
};
// Synthetic venture lives: start a business, then keep working on it.
function ventureLife(seed, years = 18, choice = "focus") {
  let g = createGame(profile, "steady", seed);
  g = advance(g, { id: "startup", venture: "studio", name: "合成事業" });
  for (let k = 0; k < years && !g.ended && g.employer.kind === "venture"; k++)
    g = advance(g, choice);
  return g;
}
const ventureYears = (g) =>
  g.history.filter((h) => h.employer.kind === "venture" &&
    ["success", "steady"].includes(h.outcome?.kind));
const lost = (h) =>
  h.budget.borrowing > 0 || h.budget.investment > 0 ||
  h.disposable - h.expenses + h.bonus < 0;

test("a loss-making venture year is never narrated as plain traction or growth", () => {
  let checked = 0, long = 0;
  for (let seed = 1; seed <= 12; seed++)
    for (const h of ventureYears(ventureLife(seed))) {
      if (!lost(h)) continue;
      checked++;
      const { title, body } = h.outcome,
        episode = `${h.episode.title}${h.episode.body}${h.episode.next}`;
      assert.equal(h.outcome.deficit, true);
      assert.match(`${title}${body}`, /赤字|収支/u);
      assert.doesNotMatch(`${title}${body}${episode}`, /事業収入が伸び|収支は保てた|事業を広げる道が見えてきた/u);
      if (h.budget.borrowing > 0) assert.match(body, /借入/u);
      if (h.outcome.deficitYears >= 2) {
        long++;
        assert.match(`${body}${h.episode.next}`, /撤退/u);
        assert.match(`${body}${h.episode.next}`, /方向/u);
      }
    }
  assert.ok(checked >= 10 && long >= 5, `${checked} loss years, ${long} long`);
});

test("a profitable venture year keeps its traction story without a loss warning", () => {
  let checked = 0;
  for (let seed = 1; seed <= 12; seed++)
    for (const h of ventureYears(ventureLife(seed))) {
      if (lost(h) || h.salary * 0.76 < h.businessOverhead + h.businessSetup) continue;
      checked++;
      assert.equal(h.outcome.deficit, false);
      assert.doesNotMatch(`${h.outcome.title}${h.outcome.body}`, /赤字|借入/u);
    }
  assert.ok(checked >= 3, `${checked} profitable years`);
});

test("consecutive venture years do not repeat the same result prose", () => {
  let pairs = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const h = ventureLife(seed).history;
    for (let i = 1; i < h.length; i++) {
      if (h[i - 1].employer.kind !== "venture" || h[i].employer.kind !== "venture") continue;
      pairs++;
      assert.notEqual(h[i].outcome?.title, h[i - 1].outcome?.title, `seed ${seed} year ${i}`);
      assert.notEqual(h[i].outcome?.body, h[i - 1].outcome?.body);
      assert.notEqual(h[i].episode.body, h[i - 1].episode.body);
    }
  }
  assert.ok(pairs >= 30, `${pairs} consecutive pairs`);
});

test("long losses surface withdrawal in the next scene and AI context", () => {
  const g = Array.from({ length: 12 }, (_, i) => ventureLife(i + 1, 3))
    .find((life) => life.employer.kind === "venture" &&
      life.history.at(-1).outcome?.deficitYears >= 2);
  assert.ok(g, "a synthetic life with two loss years");
  assert.ok(suggestedChoices(g).includes("closeBusiness"));
  assert.ok(eventFor(g).options.some((o) => o.id === "closeBusiness"));
  assert.match(eventFor(g).body, /撤退/u);
  const request = storyRequest(g);
  const context = JSON.parse(request.messages.at(-1).content);
  assert.equal(context.lastOutcome.deficit, true);
  assert.ok(context.lastOutcome.deficitYears >= 2);
  assert.match(request.messages[0].content, /deficit/u);
});

test("venture narration changes text only: saves replay to the same game", () => {
  for (const seed of [2, 3, 5]) {
    const g = ventureLife(seed, 10, "learn");
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    for (const h of ventureYears(g))
      if (lost(h)) assert.match(h.episode.body, /赤字/u);
  }
});
