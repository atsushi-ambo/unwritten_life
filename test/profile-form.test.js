import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "parse5";
import { createContext, runInContext } from "node:vm";
import {
  profileInputForLevel,
  regionFromMunicipality,
  isRetiredAt,
  MAX_AGE,
  REGIONS,
  PROFILE_DEFAULTS,
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
const profile = (raw, level = "standard", quick) =>
  optionalProfileInputs(profileInputForLevel(raw, level, quick));

test("municipality inference normalizes spaces and leaves unknown locations to the player", () => {
  for (const [text, expected] of [
    ["埼玉県久喜市", "metro"], ["東京都世田谷区", "metro"],
    ["世田谷区", "metro"], ["大阪市", "metro"],
    ["宮城県仙台市", "city"], ["静岡県浜松市", "city"],
    ["長野県軽井沢町", "rural"], ["北海道虻田郡ニセコ町", "rural"],
    ["千葉県長生郡一宮町", "rural"], ["長野県白馬村", "rural"],
    ["北海道虻田郡", "rural"], ["軽井沢町", "rural"],
    ["　埼玉県　久喜市　", "metro"], ["宮城県 仙台市", "city"],
    ["", null], ["　　", null], ["どこか", null], ["仙台市", null],
    ["東京都", null], ["架空県架空市", null], ["東京都123市", null],
    [null, null], [123, null],
  ]) assert.equal(regionFromMunicipality(text), expected, String(text));
  for (const city of ["横浜市", "川崎市", "相模原市", "さいたま市", "千葉市",
    "堺市", "名古屋市", "京都市", "神戸市", "福岡市"])
    assert.equal(regionFromMunicipality(city), "metro", city);
  assert.equal(regionFromMunicipality("愛知県名古屋市中区"), "metro");
  // 郡 inside a city name and 村 inside a ward name are not town markers.
  for (const [text, expected] of [
    ["福島県郡山市", "city"], ["奈良県大和郡山市", "city"], ["愛知県蒲郡市", "city"],
    ["愛知県名古屋市中村区", "metro"], ["名古屋市中村区", "metro"],
  ]) assert.equal(regionFromMunicipality(text), expected, text);
  assert.equal(regionFromMunicipality("大阪府豊中市"), "metro");
});

test("every quick age band and region uses the stated game estimates with neutral family fields", () => {
  const bands = [
    ["new", 22, [330, 300, 270], 30, 10],
    ["20s", 25, [390, 350, 320], 100, 11],
    ["30s", 35, [530, 480, 430], 400, 13],
    ["40s", 45, [640, 580, 520], 900, 15],
    ["50s", 55, [720, 650, 590], 1500, 17],
    ["60s", 63, [460, 420, 380], 2000, 16],
  ];
  for (const [band, age, incomes, savings, monthlyCost] of bands) {
    for (const [i, region] of ["metro", "city", "rural"].entries()) {
      const p = profile({ household: "care", partner: "partner", children: 3 },
        "quick", { band, region });
      assert.deepEqual([p.age, p.income, p.savings, p.monthlyCost, p.rent],
        [age, incomes[i], savings, monthlyCost, [9, 7, 5][i]]);
      assert.equal(p.region, region);
      assert.deepEqual([p.household, p.partner, p.children], ["solo", "unspecified", 0]);
      const game = createGame(p, "steady", 42);
      assert.deepEqual(decodeSave(encodeSave(game)), game);
    }
  }
  const defaults = profile({}, "quick");
  assert.deepEqual([defaults.age, defaults.region], [35, "city"]);
  for (const quick of [
    { band: "10s", region: "city" }, { band: "30s", region: "unknown" },
    { band: "toString", region: "city" }, { band: "30s", region: "constructor" },
    { band: null, region: "city" }, { band: "30s", region: [] },
    {}, null, [], "balanced",
  ]) assert.throws(() => profile({}, "quick", quick));
});

test("a quick start at 63 reaches retirement at 65 and stays within the replay age bound", () => {
  let g = createGame(profile({}, "quick", { band: "60s", region: "city" }), "steady", 42);
  assert.equal(g.profile.retirementAge, 65);
  assert.equal(isRetiredAt(g), false);
  while (g.age < 65) g = advance(g, "rest");
  assert.equal(isRetiredAt(g), true);
  while (!g.ended) g = advance(g, "rest");
  assert.ok(g.age <= MAX_AGE);
  assert.equal(g.ended, true);
  assert.deepEqual(decodeSave(encodeSave(g)), g);
});

test("each starting level uses only its active fields without mutating the retained draft", () => {
  const draft = {
    age: "46",
    occupation: "infrastructure",
    industry: "finance",
    municipality: "合成県あおば市",
    company: "合成銀行",
    jobDetail: "銀行のクラウド運用",
    careerNotes: "運用を見直したい",
    careerInterests: "事業会社のAI推進",
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
  const quick = profile(draft, "quick", { band: "20s", region: "metro" });
  assert.equal(quick.age, 25);
  assert.equal(quick.income, 390);
  assert.equal(quick.savings, 100);
  assert.equal(quick.company, "");
  assert.equal(quick.municipality, "");
  assert.equal(quick.jobDetail, "");
  assert.equal(quick.careerNotes, "");
  assert.equal(quick.careerInterests, "");
  assert.equal(quick.children, 0);
  assert.equal(quick.scenario, "fast");
  const standard = profile(draft);
  assert.equal(standard.age, 46);
  assert.equal(standard.job, "tech");
  assert.equal(standard.company, draft.company);
  assert.equal(standard.industry, "finance");
  assert.equal(standard.careerInterests, draft.careerInterests);
  assert.equal(standard.savings, 300);
  assert.equal(standard.children, 0);
  assert.equal(standard.housing, "rent");
  assert.equal(standard.mortgage, 0);
  const advanced = createGame(profile(draft, "advanced"));
  assert.equal(advanced.profile.children, 2);
  assert.equal(advanced.profile.careerInterests, draft.careerInterests);
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

// Run the form's real handlers against the HTML's controls without storage or HTTP.
async function formHarness() {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const ids = new Map();
  function adapt(n, parent = null) {
    const attrs = Object.fromEntries((n.attrs ?? []).map((a) => [a.name, a.value]));
    const el = {
      tag: n.tagName, id: attrs.id, name: attrs.name, attrs, parent,
      value: attrs.value ?? "", hidden: "hidden" in attrs, disabled: false,
      textContent: "", checked: false, listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      closest() { return this.hidden ? this : this.parent?.closest() ?? null; },
      focus() { this.focused = true; },
      querySelectorAll(selector) {
        return this.children.flatMap((child) => [
          ...((selector.startsWith("[") ? selector.slice(1, -1) in child.attrs
            : selector.split(",").includes(child.tag)) ? [child] : []),
          ...child.querySelectorAll(selector),
        ]);
      },
    };
    el.children = (n.childNodes ?? []).map((child) => adapt(child, el));
    if (el.tag === "select") el.value = (el.children.find((c) => "selected" in c.attrs)
      ?? el.children.find((c) => c.tag === "option"))?.value ?? "";
    if (el.id) ids.set(el.id, el);
    return el;
  }
  adapt(parse(html));
  const $ = (id) => ids.get(id), form = $("profile-form");
  const controls = form.querySelectorAll("input,select,textarea");
  form.elements = Object.fromEntries(controls.filter((el) => el.name).map((el) => [el.name, el]));
  const context = createContext({
    $, profileInputForLevel, optionalProfileInputs, PROFILE_DEFAULTS, REGIONS, regionFromMunicipality,
    profileLevel: "standard", regionRevealed: false, manualRegion: false,
    customCost: false, companySources: [],
    FormData: class {
      *[Symbol.iterator]() {
        for (const el of controls) if (el.name && !el.disabled) yield [el.name, el.value];
      }
    },
  });
  for (const [start, end] of [
    ["function readProfile()", "function showGame("],
    ["function updateProfileVisibility()", "for (const [id, occupation]"],
    ['$("monthly-cost").addEventListener', 'for (const id of [\n  "company-summary"'],
  ]) runInContext(app.slice(app.indexOf(start), app.indexOf(end)), context);
  runInContext("updateBudget()", context);
  const edit = (id, value, event = "input") => {
    $(id).value = value;
    $(id).listeners[event]?.();
    form.listeners[event]?.();
  };
  return { $, context, edit, read: () => runInContext("readProfile()", context) };
}

test("form inference submits a hidden region, retains manual overrides, and resets them on municipality edits", async () => {
  const h = await formHarness(), { $, context, edit } = h;
  edit("municipality", "埼玉県久喜市");
  assert.equal($("region-field").hidden, true);
  assert.equal($("region").disabled, false);
  assert.match($("region-inference-text").textContent, /大都市圏/);
  assert.deepEqual([h.read().region, h.read().monthlyCost, h.read().rent], ["metro", 15.5, 9]);
  const started = createGame(h.read());
  assert.equal(started.profile.region, "metro");
  assert.deepEqual(decodeSave(encodeSave(started)), started);
  $("change-region").listeners.click();
  assert.equal($("region-field").hidden, false);
  assert.equal($("region").focused, true);
  edit("region", "rural", "change");
  assert.equal(h.read().region, "rural");
  assert.match($("region-inference-text").textContent, /地方の市町村/);
  runInContext('profileLevel = "quick"; updateBudget()', context);
  assert.equal($("region").disabled, true);
  assert.equal(h.read().region, "city");
  runInContext('profileLevel = "advanced"; updateBudget()', context);
  assert.equal(h.read().region, "rural");
  edit("monthly-cost", "27.3");
  const rent = $("profile-form").elements.rent;
  rent.value = "8.1";
  edit("municipality", "宮城県仙台市");
  assert.equal($("region-field").hidden, false);
  assert.deepEqual([h.read().region, h.read().monthlyCost, h.read().rent], ["city", 27.3, 8.1]);
  for (const [text, reason] of [["どこか", /判定できないため/], ["", /未入力のため/]]) {
    edit("municipality", text);
    assert.equal($("region-field").hidden, false);
    assert.equal(h.read().region, "city");
    assert.match($("region-inference-text").textContent, reason);
  }
});

test("without a readable municipality the area select stays hidden and falls back to 地方の中心都市", async () => {
  const h = await formHarness(), { $, edit } = h;
  for (const [text, reason] of [["", /未入力のため/], ["どこか", /判定できないため/]]) {
    edit("municipality", text);
    assert.equal($("region-field").hidden, true);
    assert.equal(h.read().region, "city");
    assert.match($("region-inference-text").textContent, reason);
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
  const interests = nodes.find((n) => attr(n, "name") === "careerInterests");
  const notes = nodes.find((n) => attr(n, "name") === "careerNotes");
  assert.equal(interests.tagName, "textarea");
  assert.equal(attr(interests, "maxlength"), "300");
  assert.equal(interests.parentNode.parentNode, notes.parentNode.parentNode);
  assert.ok(
    nodes.some(
      (n) =>
        attr(n, "name") === "municipality" && attr(n, "maxlength") === "80",
    ),
  );
});
