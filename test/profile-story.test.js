import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame as originalCreateGame,
  advance,
  advanceYears,
  eventFor,
  profileStoryContext,
  validateDecision,
  availableChoices,
  encodeSave,
  decodeSave,
} from "../public/engine.js";

// Preserve the historical incident distribution in existing scenarios.
const createGame = (...args) => originalCreateGame(...[...args, ...Array(Math.max(0, 27 - args.length)).fill(undefined)].map((v, i) => (i === 24 || i === 26) && v === undefined ? 110 : v));
import { storyRequest } from "../public/story.js";

const base = {
  age: 32,
  region: "city",
  job: "tech",
  income: 600,
  savings: 500,
  monthlyCost: 12,
  rent: 7,
  ai: "sometimes",
  priority: "balance",
  gender: "undisclosed",
  household: "solo",
  companyType: "small",
  company: "合成SI社",
  workModel: "services",
};
const numericState = (g) =>
  Object.fromEntries(
    Object.entries(g).filter(([, v]) => typeof v === "number"),
  );

test("local scenes and four actionable choices distinguish detailed profiles without AI or skill bonuses for prose", () => {
  const cloud = createGame(
    {
      ...base,
      careerNotes: "AWSで基盤を検証したい。運用の仕事にも関心がある。",
    },
    "steady",
    42,
  );
  const language = createGame(
    { ...base, careerNotes: "英語で仕事を説明する練習をしたい。" },
    "steady",
    42,
  );
  const a = eventFor(cloud),
    b = eventFor(language);
  assert.match(a.body, /クラウド・基盤/);
  assert.match(b.body, /英語・海外/);
  assert.notDeepEqual(a.options, b.options);
  assert.ok(
    a.profileBasis.some(
      (s) => s.source === "careerNotes" && s.detail.includes("AWS"),
    ),
  );
  for (const [game, scene] of [
    [cloud, a],
    [language, b],
  ]) {
    assert.equal(scene.options.length, 4);
    assert.equal(new Set(scene.options.map((o) => o.id)).size, 4);
    for (const option of scene.options) {
      assert.ok(availableChoices(game).includes(option.id));
      if (option.decision) {
        assert.deepEqual(
          validateDecision(option.decision, game),
          option.decision,
        );
        const next = advance(game, option.decision);
        assert.equal(next.history.at(-1).intention, option.decision.intent);
      }
    }
  }
  assert.deepEqual(numericState(cloud), numericState(language));
  assert.deepEqual(
    numericState(advance(cloud, "studyDaily")),
    numericState(advance(language, "studyDaily")),
  );
});

test("family ages, hopes, housing and liquid assets become story conflicts rather than invented family or guaranteed outcomes", () => {
  const parent = createGame(
    {
      ...base,
      children: 2,
      childStage: "young",
      partner: "partner",
      childrenWish: "three",
      housing: "own",
      homeValue: 3000,
      mortgage: 2000,
      rent: 0,
      careerNotes: "クラウドを学びたい。",
    },
    "steady",
    42,
  );
  const first = eventFor(parent);
  assert.match(first.body, /子ども2人.*3・3歳/u);
  assert.ok(first.options.some((o) => /子ども/.test(o.label)));
  assert.ok(
    profileStoryContext(parent).threads.some(
      (t) => t.id === "family-wish" && /合計3人/.test(t.detail),
    ),
  );
  const next = advance(parent, "rest");
  assert.equal(next.family.childAges.length, 2);
  assert.match(eventFor(advance(next, "rest")).body, /ローン|返済/);
  const poor = createGame({ ...base, savings: 20, stocks: 15 }, "steady", 42);
  assert.match(eventFor(poor).body, /手元現金|手元の現金/);
  assert.ok(eventFor(poor).profileBasis.some((t) => t.id === "finances"));
  assert.ok(eventFor(poor).options.some((o) => o.id === "recover"));
  const paid = createGame(
    { ...base, housing: "own", homeValue: 3000, mortgage: 0 },
    "steady",
    42,
  );
  assert.match(
    profileStoryContext(paid).threads.find((t) => t.id === "housing").lines[0],
    /維持や手入れ/,
  );
  assert.doesNotMatch(
    profileStoryContext(paid).threads.find((t) => t.id === "housing").lines[0],
    /ローン返済/,
  );
  const adult = createGame(
    { ...base, children: 1, childStage: "adult" },
    "steady",
    42,
  );
  assert.match(eventFor(adult).body, /22歳/);
  assert.ok(!eventFor(adult).options.some((o) => o.id === "careLeave"));
  assert.doesNotMatch(
    eventFor(createGame(base, "steady", 42)).body,
    /パートナーとの暮らしにも|子ども1人/,
  );
});

test("company background needs confirmation and follows the current employer after a simulated transfer", () => {
  const facts = {
    summary: "合成材料の研究を支援する事業。",
    sector: "tech",
    confirmed: false,
    sources: [
      {
        url: "https://example.test/about",
        title: "合成企業の資料",
        checkedAt: "2026-10-17",
      },
    ],
  };
  const unchecked = createGame({ ...base, companyFacts: facts });
  assert.ok(
    !profileStoryContext(unchecked).threads.some((t) => t.id === "company"),
  );
  const checked = createGame({
    ...base,
    companyFacts: { ...facts, confirmed: true },
  });
  assert.match(eventFor(checked).body, /合成材料の研究/);
  const moved = advance(checked, {
    id: "switch",
    target: "toyota",
    role: "tech",
  });
  const company = profileStoryContext(moved).threads.find(
    (t) => t.id === "company",
  );
  assert.match(company.detail, /トヨタ自動車/);
  assert.doesNotMatch(company.detail, /合成材料/);
});

test("five-year stories carry the chosen subject, calculated evaluation and intent; replay restores the same branch", () => {
  const g = createGame(
    {
      ...base,
      careerNotes: "クラウドのAWSを使う仕事に関心がある。英語も学びたい。",
    },
    "steady",
    42,
    0, 0, 0, 0, 0, 0, 0,
    // Chance incidents would pause multi-year play; this case checks the story.
    110,
  );
  const option = eventFor(g).options.find((o) => o.id === "studyDaily");
  const { game, entries } = advanceYears(g, option.decision, 5);
  assert.equal(entries.length, 5);
  for (const h of entries) {
    assert.match(h.episode.body, /クラウド・基盤/);
    assert.equal(h.intention, option.decision.intent);
    if (h.outcome.kind === "setback")
      assert.match(h.episode.body, /評価につながらなかった/);
  }
  assert.ok(new Set(entries.map((h) => h.episode.body)).size > 1);
  assert.deepEqual(decodeSave(encodeSave(game)), game);
  assert.match(eventFor(game).body, /この手応え|ノート|学び|クラウド/);
});

test("unknown free text stays a quoted memo, negated interests do not become skills, and AI gets bounded grounded threads", () => {
  const unknown = createGame({
    ...base,
    careerNotes: "陶芸をもう一度始めてみたい。",
  });
  assert.match(eventFor(unknown).body, /陶芸をもう一度/);
  assert.ok(eventFor(unknown).options.some((o) => /メモ/.test(o.label)));
  const negative = createGame({
    ...base,
    careerNotes: "AWSは使いたくない。英語の仕事には関心がある。",
  });
  const personal = profileStoryContext(negative);
  assert.ok(!personal.threads.some((t) => t.id === "note-cloud"));
  assert.ok(personal.threads.some((t) => t.id === "note-language"));
  const unskilled = createGame({
    ...base,
    careerNotes: "AWSは未経験だが学んでみたい。",
  });
  assert.match(eventFor(unskilled).body, /どうつなげよう|見返す|気になって/);
  assert.doesNotMatch(eventFor(unskilled).body, /AWSの経験を生かし|熟練/);
  const request = storyRequest(unskilled);
  assert.ok(
    request.context.profileStory.focus.some((t) => t.source === "careerNotes"),
  );
  assert.equal(request.context.careerNotes, unskilled.profile.careerNotes);
  assert.match(request.messages[0].content, /否定も尊重/);
  assert.match(
    request.messages[0].content,
    /careerNotesや記録された家族の希望に実際にある表現以外は、本人の言葉・願いとして「」で引用しない/,
  );
  assert.match(request.messages[0].content, /本人が書いていない願望・動機を創作しない/);
  assert.ok(!("gender" in request.context.profile));
  assert.ok(JSON.stringify(request.context.profileStory).length < 5000);
});

test("competing work/family topics keep four distinct executable options through changing age and outcomes", () => {
  for (let seed = 0; seed < 12; seed++) {
    let g = createGame(
      {
        ...base,
        age: 32 + seed * 4,
        children: 2,
        childStage: "young",
        careerNotes: "AWSと英語と農業とデザインを試したい。運用を学びたい。",
      },
      "steady",
      seed,
    );
    for (let year = 0; year < 10 && !g.ended; year++) {
      const scene = eventFor(g);
      assert.equal(scene.options.length, 4);
      assert.equal(new Set(scene.options.map((o) => o.id)).size, 4);
      for (const option of scene.options)
        if (option.decision) validateDecision(option.decision, g);
      const option =
        scene.options.find((o) => o.decision && o.id !== "move") ??
        scene.options.find((o) => !["switch", "startup"].includes(o.id));
      g = advance(g, option.decision ?? option.id);
    }
  }
});
