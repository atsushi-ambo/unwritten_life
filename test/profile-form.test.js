import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "parse5";
import { createContext, runInContext } from "node:vm";
import {
  profileInputForLevel,
  optionalProfileInputs,
  createGame,
  advance,
  encodeSave,
  decodeSave,
  eventFor,
  residenceName,
  validateProfile,
} from "../public/engine.js";
import {
  OCCUPATIONS,
  PROFILE_INDUSTRIES,
  workContext,
} from "../public/careers.js";
import { storyRequest } from "../public/story.js";
const profile = (raw, level = "standard", preset = "balanced") =>
  optionalProfileInputs(profileInputForLevel(raw, level, preset));

test("each starting level uses only its active fields without mutating the retained draft", () => {
  const draft = {
    age: "46",
    occupation: "infrastructure",
    industry: "finance",
    municipality: "合成県あおば市",
    company: "合成銀行",
    jobDetail: "銀行のクラウド運用",
    careerNotes: "運用を見直したい",
    income: "800",
    savings: "900",
    stocks: "400",
    children: "2",
    childStage: "young",
    housing: "own",
    homeValue: "3000",
    mortgage: "1000",
    mortgageRate: "2",
    mortgageYears: "20",
    scenario: "fast",
    tone: "speculative",
    careerGoal: "switch",
  };
  const copy = structuredClone(draft);
  const quick = profile(draft, "quick", "starter");
  assert.equal(quick.age, 23);
  assert.equal(quick.income, 300);
  assert.equal(quick.savings, 80);
  assert.equal(quick.company, "");
  assert.equal(quick.municipality, "");
  assert.equal(quick.jobDetail, "");
  assert.equal(quick.careerNotes, "");
  assert.equal(quick.children, 0);
  assert.equal(quick.scenario, "fast");
  const standard = profile(draft);
  assert.equal(standard.age, 46);
  assert.equal(standard.job, "tech");
  assert.equal(standard.company, draft.company);
  assert.equal(standard.industry, "finance");
  assert.equal(standard.savings, 300);
  assert.equal(standard.children, 0);
  assert.equal(standard.housing, "rent");
  assert.equal(standard.mortgage, 0);
  const advanced = createGame(profile(draft, "advanced"));
  assert.equal(advanced.profile.children, 2);
  assert.equal(advanced.mortgage, 1000);
  assert.equal(advanced.rent, 0);
  assert.equal(advanced.cash, 500);
  assert.deepEqual(draft, copy);
  assert.deepEqual(profile(draft), standard);
  assert.deepEqual(decodeSave(encodeSave(advanced)), advanced);
});

test("dependent fields do not apply stale company, child-age or mortgage conditions", () => {
  const raw = {
    occupation: "student",
    company: "残してある会社",
    industry: "finance",
    companyType: "large",
    workModel: "services",
    income: "",
    housing: "rent",
    mortgage: "2000",
    homeValue: "5000",
    mortgageYears: "40",
    mortgageRate: "12",
    children: "0",
    childStage: "adult",
  };
  const student = createGame(profile(raw, "advanced"));
  assert.equal(student.profile.company, "");
  assert.equal(student.profile.industry, "");
  assert.equal(student.profile.workModel, "unknown");
  assert.equal(student.income, 0);
  assert.equal(student.homeValue, 0);
  assert.equal(student.mortgage, 0);
  assert.equal(student.profile.childStage, "school");
  const paid = createGame(
    profile(
      { ...raw, occupation: "software", housing: "own", mortgage: "0" },
      "advanced",
    ),
  );
  assert.equal(paid.profile.mortgageRate, 1.5);
  assert.equal(paid.profile.mortgageYears, 25);
  const solo = createGame(
    profile({ ...raw, occupation: "independent", income: "0" }),
  );
  assert.equal(solo.profile.workModel, "self");
  assert.equal(solo.profile.companyType, "self");
  assert.equal(solo.income, 0);
  const companyOnly = createGame(profile({ company: "入力した会社" }));
  assert.equal(companyOnly.employer.name, "入力した会社");
  assert.equal(companyOnly.profile.occupation, "");
});

test("detailed work and municipality are bounded, survive replay and reach stories without invented geographic prices", () => {
  const input = profile({
    occupation: "infrastructure",
    industry: "finance",
    municipality: "合成県あおば市",
    jobDetail: "銀行のクラウド運用",
    workModel: "inhouse",
  });
  const g = createGame(input, "steady", 42);
  const otherPlace = createGame(
    { ...input, municipality: "別の合成市" },
    "steady",
    42,
  );
  assert.match(eventFor(g).body, /合成県あおば市/);
  assert.match(eventFor(g).body, /銀行のクラウド運用/);
  assert.ok(eventFor(g).profileBasis.some((t) => t.id === "municipality"));
  const request = storyRequest(g);
  assert.equal(request.context.life.municipality, input.municipality);
  assert.equal(request.context.workplace.industry, PROFILE_INDUSTRIES.finance);
  assert.match(request.messages[0].content, /地元企業の募集を創作しない/);
  const a = advance(g, "studyDaily"),
    b = advance(otherPlace, "studyDaily");
  for (const key of ["income", "cash", "investments", "skill", "health"])
    assert.equal(a[key], b[key]);
  assert.deepEqual(decodeSave(encodeSave(a)), a);
  const moved = advance(g, {
    id: "move",
    region: "metro",
    intent: "別の場所で暮らす",
  });
  assert.notEqual(residenceName(moved), input.municipality);
  assert.equal(storyRequest(moved).context.life.municipality, null);
  const switched = advance(g, { id: "switch", target: "toyota", role: "tech" });
  assert.equal(workContext(switched).industry, undefined);
  assert.equal(
    workContext(switched).startingWork.industry,
    PROFILE_INDUSTRIES.finance,
  );
  for (const change of [
    { municipality: "a".repeat(81) },
    { municipality: "市\n町" },
    { jobDetail: "x".repeat(121) },
    { occupation: "invented" },
    { occupation: "sales" },
    { industry: "constructor" },
  ])
    assert.throws(() => validateProfile({ ...g.profile, ...change }));
  assert.throws(() => profileInputForLevel({}, "invented"));
  for (const [id, role] of Object.entries(OCCUPATIONS)) {
    const p = profile({ occupation: id });
    assert.equal(createGame(p).profile.job, role.job);
  }
});

test("quick HTML hides whole detailed sections and exposes only one start control", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const nodes = [];
  const walk = (n) => {
    nodes.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(parse(html));
  const attr = (n, k) => n.attrs?.find((a) => a.name === k)?.value;
  for (const id of ["profile-standard", "profile-advanced"]) {
    const n = nodes.find((n) => attr(n, "id") === id);
    assert.equal(n.tagName, "section");
    assert.ok(n.attrs.some((a) => a.name === "hidden"));
  }
  const form = nodes.find((n) => attr(n, "id") === "profile-form");
  const submits = nodes.filter(
    (n) => n.tagName === "button" && attr(n, "type") === "submit",
  );
  assert.equal(
    submits.filter((n) => {
      for (let p = n; p; p = p.parentNode) if (p === form) return true;
      return false;
    }).length,
    1,
  );
  assert.equal(
    nodes.filter((n) => attr(n, "name") === "careerNotes").length,
    1,
  );
  assert.ok(
    nodes.some(
      (n) =>
        attr(n, "name") === "municipality" && attr(n, "maxlength") === "80",
    ),
  );
});

test("older local servers cannot silently discard detailed inputs during AI generation", async () => {
  const app = await readFile(
    new URL("../public/app.js", import.meta.url),
    "utf8",
  );
  const c = createContext({
    standalone: false,
    aiState: { provider: "ollama" },
    serverPersonalizedChoices: true,
    serverProfileDetails: false,
    game: { profile: { municipality: "合成市" } },
  });
  runInContext(
    app.slice(
      app.indexOf("function needsChoiceServerUpdate()"),
      app.indexOf("function needsCareerServerUpdate()"),
    ),
    c,
  );
  assert.equal(runInContext("needsChoiceServerUpdate()", c), true);
  c.serverProfileDetails = true;
  assert.equal(runInContext("needsChoiceServerUpdate()", c), false);
  c.serverProfileDetails = false;
  c.game.profile = {};
  assert.equal(runInContext("needsChoiceServerUpdate()", c), false);
});
