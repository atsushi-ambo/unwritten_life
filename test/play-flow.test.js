import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  advance,
  advanceYears,
  optionalProfileInputs,
  encodeSave,
  decodeSave,
  eventFor,
  availableChoices,
  isRetiredAt,
} from "../public/engine.js";
import {
  browserDirectoryText,
  makeDirectorySearch,
} from "../public/careers.js";
import { parse } from "parse5";
import { readFile } from "node:fs/promises";
// Play past retirement as under the rules before the career ending.
const pastRetirement = (profile, scenario = "steady", seed = 2026, ...from) =>
  createGame(profile, scenario, seed, ...[0, 0, 0, 0, 0, 0, 0, 0, 0].map((d, i) => from[i] ?? d), 110);

const p = {
  age: 30,
  job: "tech",
  company: "合成SI社",
  workModel: "services",
  income: 500,
  savings: 500,
  monthlyCost: 12,
  region: "city",
  priority: "balance",
  ai: "sometimes",
  gender: "undisclosed",
  household: "solo",
  companyType: "small",
};
test("blank optional finances use explicit game defaults while zero stays zero and invalid values fail", () => {
  const optional = optionalProfileInputs({
    ...p,
    income: "",
    savings: "  ",
    stocks: "",
    rent: "",
  });
  const game = createGame(optional, "steady", 42);
  assert.equal(game.profile.income, 500);
  assert.equal(game.profile.savings, 300);
  assert.equal(game.profile.rent, 7);
  assert.equal(
    createGame(optionalProfileInputs({ ...p, income: "0", savings: "0" }))
      .income,
    0,
  );
  assert.equal(
    optionalProfileInputs({ ...p, savings: "" }, { savings: 80 }).savings,
    80,
  );
  for (const bad of ["-10001", "Infinity", "unknown", "100001"])
    assert.throws(() =>
      createGame(optionalProfileInputs({ ...p, savings: bad })),
    );
  for (const bad of [null, false, {}])
    assert.throws(() => optionalProfileInputs({ ...p, savings: bad }));
});

test("five years retain five distinct episodes and real yearly outcomes, then restore exactly", () => {
  // Chance incidents would pause multi-year play; this case checks the episodes.
  const base = createGame(p, "steady", 42, 0, 0, 0, 0, 0, 0, 0, 110);
  const result = advanceYears(
    base,
    { id: "studyDaily", intent: "顧客に説明できる設計を毎日学ぶ" },
    5,
  );
  assert.equal(result.entries.length, 5);
  assert.equal(result.game.year, 2031);
  assert.equal(result.game.studyHours, 365 * 5);
  assert.equal(result.game.decisions.length, 5);
  assert.ok(new Set(result.entries.map((h) => h.episode.body)).size > 1);
  for (const h of result.entries) {
    assert.match(h.episode.body, /顧客/);
    if (h.outcome.kind === "setback")
      assert.match(h.episode.body, /評価につながらなかった/);
    assert.ok(Number.isFinite(h.income));
  }
  assert.deepEqual(decodeSave(encodeSave(result.game)), result.game);
  assert.match(eventFor(result.game).body, /2031|合成SI社/);
  const rested = advanceYears(base, "rest", 5);
  assert.notEqual(
    rested.entries[0].episode.body,
    result.entries[0].episode.body,
  );
  assert.notEqual(rested.game.skill, result.game.skill);
});

test("one-time actions and major family/work changes pause multi-year progress for another choice", () => {
  const base = pastRetirement({ ...p, savings: 2000 }, "steady", 42);
  const move = advanceYears(
    base,
    { id: "move", region: "metro", intent: "大都市で暮らす" },
    5,
  );
  assert.equal(move.entries.length, 1);
  assert.match(move.stopReason, /一年/);
  const retirement = advanceYears(
    pastRetirement({ ...p, age: 64 }, "steady", 42),
    "rest",
    5,
  );
  assert.ok(retirement.entries.length < 5);
  assert.match(retirement.stopReason, /節目/);
  let observedBirth = false;
  for (let seed = 0; seed < 10; seed++) {
    const family = pastRetirement(
      { ...p, partner: "partner", childrenWish: "one" },
      "steady",
      seed,
    );
    const next = advanceYears(family, "familyPlan", 5);
    if (next.game.family.childAges.length) {
      observedBirth = true;
      assert.equal(next.entries.length, 1);
    }
  }
  assert.ok(observedBirth);
  assert.throws(() => advanceYears(base, "rest", 500));
  assert.throws(() => advanceYears(base, "invented", 5));
});

test("multi-year progress stops at the first retired year and respects the saved migration boundary", () => {
  // These cases check retirement under the earlier rules, where play went on.
  const before = createGame({ ...p, age: 64, retirementAge: 65 }, "steady", 42,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 110, 0, 0, 110);
  const journey = advanceYears(before, "rest", 5);
  assert.equal(journey.entries.length, 1);
  assert.equal(journey.game.age, 65);
  assert.equal(journey.game.retired, false);
  assert.equal(isRetiredAt(journey.game), true);
  assert.match(journey.stopReason, /働き方の節目/);
  assert.deepEqual(decodeSave(encodeSave(journey.game)), journey.game);

  // The delayed retired flag alone must not cause a second retirement stop.
  const after = advanceYears(journey.game, "rest", 5);
  assert.equal(after.entries.length, 5);
  const oldSave = JSON.parse(encodeSave(journey.game));
  delete oldSave.retirementFrom;
  const legacy = decodeSave(JSON.stringify(oldSave));
  assert.equal(isRetiredAt(legacy), false);
  const resumed = advanceYears(legacy, "rest", 5);
  assert.equal(resumed.entries.length, 1);
  assert.equal(resumed.game.age, 66);
  assert.equal(isRetiredAt(resumed.game), true);
  assert.deepEqual(decodeSave(encodeSave(resumed.game)), resumed.game);
});

test("local narrative distinguishes product/SI work and preserves game facts instead of making new hires", () => {
  const a = advance({ ...createGame(p, "steady", 42), payTypeFrom: 110 }, "studyDaily");
  const b = advance(
    { ...createGame({ ...p, workModel: "product" }, "steady", 42), payTypeFrom: 110 },
    "studyDaily",
  );
  assert.match(a.history[0].episode.body, /顧客/);
  assert.match(b.history[0].episode.body, /サービス/);
  assert.equal(a.employer.name, p.company);
  assert.equal(a.family.childAges.length, 0);
  assert.equal(a.income, b.income);
  const side = a.history[0].episode;
  if (side.sideAction && availableChoices(a).includes(side.sideAction))
    assert.ok(
      eventFor(a).options.some(
        (o) => o.id === side.sideAction && o.label === side.sideLabel,
      ),
    );
});

test("new-game form has three levels, no required financial entries, and company lookup beside the name", async () => {
  const doc = parse(
    await readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  );
  const nodes = [];
  const walk = (n) => {
    nodes.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(doc);
  const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value;
  assert.deepEqual(
    nodes
      .filter((n) => attr(n, "data-profile-level"))
      .map((n) => attr(n, "data-profile-level")),
    ["quick", "standard", "advanced"],
  );
  const savings = nodes.find((n) => attr(n, "name") === "savings");
  assert.ok(!savings.attrs.some((a) => a.name === "required"));
  assert.ok(savings.attrs.some((a) => a.name === "placeholder"));
  const company = nodes.find((n) => attr(n, "id") === "company-name");
  const button = nodes.find((n) => attr(n, "id") === "company-search");
  assert.equal(company.parentNode, button.parentNode);
  for (const id of ["timeline", "journey-next", "timeline-pause", "timeline-speed"])
    assert.ok(nodes.some((n) => attr(n, "id") === id));
  for (const id of ["year-step", "journey-dialog", "reflection-dialog"])
    assert.ok(!nodes.some((n) => attr(n, "id") === id));
});

test("phone company lookup has no built-in list and bounds external requests to an anonymous fixed directory", async (t) => {
  let calls = 0;
  const lookup = makeDirectorySearch({
    transport: async () => {
      calls++;
      throw Error("offline");
    },
  });
  await assert.rejects(() => lookup("NTT DATA"), /offline/);
  assert.equal(calls, 1);
  calls = 0;
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(new URL(url).origin, "https://www.wikidata.org");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    return new Response("x".repeat(200));
  };
  for (const bad of [
    "http://127.0.0.1",
    "https://evil.example/w/api.php",
    "https://www.wikidata.org/other",
    "https://www.wikidata.org/w/api.php?callback=evil",
  ])
    await assert.rejects(() => browserDirectoryText(bad));
  assert.equal(calls, 0);
  const url =
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&origin=*";
  assert.equal((await browserDirectoryText(url)).text.length, 200);
  await assert.rejects(
    () => browserDirectoryText(url, { maxBytes: 100 }),
    /上限/,
  );
});
