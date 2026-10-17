import { EMPLOYERS, VENTURES } from "./careers.js";
import { worldAt, worldEnabled, opportunityAt, TONES } from "./world.js";
// All monetary values are illustrative, in 2026 purchasing-power units of ¥10,000.
export const VERSION = 2;
export const START_YEAR = 2026;
export const MAX_AGE = 110;
export const YEARS = MAX_AGE; // absolute replay bound, not a predicted lifespan
export const SCENARIOS = Object.freeze({
  slow: {
    label: "ゆるやかな普及",
    short: "ゆるやか",
    pace: 0.46,
    detail:
      "道具は進歩しても、費用や制度、現場の慣習で普及はゆっくり。学び直す時間を取りやすい世界。",
  },
  steady: {
    label: "着実な変化",
    short: "着実",
    pace: 0.74,
    detail:
      "AIが日常の仕事に少しずつ入り、仕事の組み合わせと求められる力が変わっていく世界。",
  },
  fast: {
    label: "急速な変革",
    short: "急速",
    pace: 1.08,
    detail:
      "技術と導入がともに進む世界。新しい機会も、移行の負担も大きくなる。",
  },
});
export const JOBS = Object.freeze({
  tech: { label: "IT・技術・研究", exposure: 0.85, complement: 0.88 },
  office: { label: "事務・管理・金融", exposure: 0.9, complement: 0.57 },
  creative: { label: "企画・デザイン・制作", exposure: 0.82, complement: 0.78 },
  people: { label: "営業・接客・教育", exposure: 0.55, complement: 0.7 },
  care: { label: "医療・介護・福祉", exposure: 0.32, complement: 0.56 },
  physical: { label: "現場・製造・運輸", exposure: 0.38, complement: 0.44 },
  independent: {
    label: "自営・経営・フリーランス",
    exposure: 0.68,
    complement: 0.85,
  },
  other: { label: "学生・休職中・その他", exposure: 0.3, complement: 0.5 },
});
export const REGIONS = Object.freeze({
  metro: { label: "首都圏・大都市", cost: 22 },
  city: { label: "地方都市", cost: 17 },
  rural: { label: "郊外・地方", cost: 14 },
});
export const PRIORITIES = Object.freeze({
  balance: "バランス",
  work: "仕事・挑戦",
  time: "ゆとり・健康",
  people: "家族・つながり",
  freedom: "自由・体験",
});
export const CHOICES = Object.freeze({
  learn: {
    label: "新しい力を身につける",
    hint: "学びとAIの活用に時間を投資",
    cost: 10,
    skill: 9,
    health: -1,
    connection: -1,
    freedom: 1,
    icon: "↗",
  },
  studyDaily: {
    label: "専門とAIを、1日1時間学ぶ",
    hint: "年間365時間の学び。仕事に生かせる確率を育てるが、評価は保証されない",
    cost: 12,
    skill: 12,
    health: -2,
    connection: -2,
    freedom: -2,
    icon: "↗",
  },
  meet: {
    label: "新しい出会いに時間を使う",
    hint: "関係を育てる。パートナーと出会うとは限らない",
    cost: 8,
    skill: 0,
    health: 1,
    connection: 6,
    freedom: 1,
    icon: "♡",
  },
  familyPlan: {
    label: "家族を迎える準備を進める",
    hint: "育て方や支援を相談。すぐに家族が増えるとは限らない",
    cost: 15,
    skill: 0,
    health: -1,
    connection: 4,
    freedom: -2,
    icon: "♡",
  },
  reconsiderFamily: {
    label: "もうひとり迎える暮らしを考える",
    hint: "希望を見直す。選ぶだけで子どもが増えることはない",
    cost: 0,
    skill: 0,
    health: 0,
    connection: 2,
    freedom: 0,
    icon: "♡",
  },
  careLeave: {
    label: "仕事の比重を下げ、家族を支える",
    hint: "この年の労働収入を15%抑え、家族との時間とゆとりへ",
    cost: 0,
    skill: 0,
    health: 4,
    connection: 7,
    freedom: 1,
    icon: "♡",
  },
  opportunity: {
    label: "思いがけない起業の誘いに乗る",
    hint: "その年に現れた架空の事業を、用意された名前で始める。失敗もある",
    cost: 0,
    skill: 7,
    health: -4,
    connection: 4,
    freedom: 8,
    icon: "✧",
  },
  focus: {
    label: "いまの仕事を深める",
    hint: "経験を積む。退職後は地域で経験を生かす",
    cost: 0,
    skill: 2,
    health: -2,
    connection: 0,
    freedom: -1,
    icon: "◎",
  },
  connect: {
    label: "大切な人と過ごす",
    hint: "家族や友人との時間をつくる",
    cost: 7,
    skill: 0,
    health: 2,
    connection: 8,
    freedom: 1,
    icon: "♡",
  },
  rest: {
    label: "暮らしと体を整える",
    hint: "休養、運動、日々のケア",
    cost: 5,
    skill: 0,
    health: 6,
    connection: 1,
    freedom: 3,
    icon: "◡",
  },
  explore: {
    label: "小さな挑戦を始める",
    hint: "旅、創作、副業を試す",
    cost: 18,
    skill: 4,
    health: 0,
    connection: 3,
    freedom: 7,
    icon: "✳",
  },
  switch: {
    label: "転職先を選ぶ",
    hint: "実在企業や未来の架空企業で、次の役割を選ぶ",
    cost: 30,
    skill: 5,
    health: -2,
    connection: 2,
    freedom: 4,
    icon: "⇄",
  },
  startup: {
    label: "自分の事業を起こす",
    hint: "事業と名前を決める。初期費用と毎年の運営費、収入の変動あり",
    cost: 0,
    skill: 7,
    health: -4,
    connection: 4,
    freedom: 8,
    icon: "✧",
  },
  pilot: {
    label: "学びを実際の仕事で試す",
    hint: "小さな実証に投資。成果が出れば収入につながるが、失敗もある",
    cost: 20,
    skill: 6,
    health: -2,
    connection: 2,
    freedom: 2,
    icon: "↗",
  },
  negotiate: {
    label: "成果をもとに役割と待遇を相談",
    hint: "これまでの成果を交渉へ。合意できるとは限らない",
    cost: 0,
    skill: 1,
    health: -1,
    connection: 1,
    freedom: 1,
    icon: "⇧",
  },
  mentor: {
    label: "経験を人に伝える",
    hint: "育成や協働を通じ、つながりと次の役割を育てる",
    cost: 5,
    skill: 2,
    health: 0,
    connection: 6,
    freedom: 1,
    icon: "♧",
  },
  expand: {
    label: "事業を広げる",
    hint: "追加投資100万円。顧客を広げる機会と、資金を失うリスク",
    cost: 100,
    skill: 4,
    health: -4,
    connection: 5,
    freedom: -2,
    icon: "✧",
  },
  pivot: {
    label: "事業の方向を変える",
    hint: "見直しに30万円。顧客や提供方法を変えて立て直す",
    cost: 30,
    skill: 5,
    health: -2,
    connection: 2,
    freedom: 2,
    icon: "↝",
  },
  closeBusiness: {
    label: "事業をたたんで次を探す",
    hint: "整理費15万円。事業収入と運営費を止め、転職や生活の再建へ",
    cost: 15,
    skill: 1,
    health: 3,
    connection: -1,
    freedom: 4,
    icon: "⇄",
  },
  recover: {
    label: "暮らしと次の仕事を立て直す",
    hint: "支出や働き方を見直し、ゆとりを取り戻す",
    cost: 0,
    skill: 2,
    health: 5,
    connection: 2,
    freedom: 2,
    icon: "◡",
  },
  invest: {
    label: "金融資産の配分を変える",
    hint: "現金の一部を株式へ。価格変動あり",
    cost: 0,
    skill: 0,
    health: 0,
    connection: 0,
    freedom: 0,
    icon: "◈",
  },
  home: {
    label: "住まいを購入する",
    hint: "頭金・諸費用を払い、住宅ローンを組む",
    cost: 0,
    skill: 0,
    health: -1,
    connection: 2,
    freedom: -2,
    icon: "⌂",
  },
  move: {
    label: "住む地域を変える",
    hint: "生活費・住居費と人との距離が変わる",
    cost: 35,
    skill: 0,
    health: 1,
    connection: -4,
    freedom: 4,
    icon: "↝",
  },
  retire: {
    label: "仕事から距離を置く",
    hint: "給与収入を止め、暮らしを組み直す",
    cost: 0,
    skill: 0,
    health: 4,
    connection: 1,
    freedom: 6,
    icon: "☼",
  },
});
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
function fail() {
  throw new Error("入力内容・保存データの範囲と項目を確認してください。");
}
function num(raw, key, lo, hi, fallback) {
  const v = raw[key] === undefined ? fallback : raw[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) fail();
  return v;
}
function str(v, max, multiline = false) {
  const bad = multiline
    ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
    : /[\u0000-\u001f\u007f]/u;
  if (typeof v !== "string" || v.length > max || bad.test(v)) fail();
  return v.trim();
}
const enums = {
  region: REGIONS,
  job: JOBS,
  priority: PRIORITIES,
  ai: { beginner: 1, sometimes: 1, daily: 1 },
  gender: { undisclosed: 1, woman: 1, man: 1, other: 1 },
  household: { solo: 1, shared: 1, care: 1 },
  companyType: { unknown: 1, large: 1, small: 1, public: 1, self: 1 },
};
export function validateProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
  const p = {};
  for (const [k, values] of Object.entries(enums)) {
    if (typeof raw[k] !== "string" || !Object.hasOwn(values, raw[k])) fail();
    p[k] = raw[k];
  }
  for (const [k, lo, hi, def] of [
    ["age", 18, 100, 30],
    ["income", 0, 10000, 500],
    ["savings", -10000, 100000, 300],
    ["monthlyCost", 0, 500, 12],
    ["stocks", 0, 100000, 0],
    ["rent", 0, 500, 0],
    ["homeValue", 0, 100000, 0],
    ["mortgage", 0, 100000, 0],
    ["mortgageYears", 1, 50, 25],
    ["mortgageRate", 0, 15, 1.5],
    ["retirementAge", 40, 85, 65],
    ["pension", 0, 2000, 120],
  ])
    p[k] = num(raw, k, lo, hi, def);
  if (
    !Number.isInteger(p.age) ||
    !Number.isInteger(p.retirementAge) ||
    !Number.isInteger(p.mortgageYears) ||
    p.stocks > Math.max(0, p.savings)
  )
    fail();
  p.company = str(raw.company ?? "", 60);
  p.housing = raw.housing ?? "rent";
  if (!["rent", "own"].includes(p.housing)) fail();
  if (p.housing === "rent" && (p.homeValue || p.mortgage)) fail();
  p.tone = raw.tone ?? "realistic";
  p.partner = raw.partner ?? "unspecified";
  p.childrenWish = raw.childrenWish ?? "undecided";
  p.careerGoal = raw.careerGoal ?? "growth";
  if (
    !Object.hasOwn(TONES, p.tone) ||
    !["unspecified", "solo", "partner"].includes(p.partner) ||
    !["undecided", "none", "one", "two", "three"].includes(p.childrenWish) ||
    !["growth", "switch", "business", "balance"].includes(p.careerGoal)
  )
    fail();
  p.children = num(raw, "children", 0, 6, 0);
  p.childStage = raw.childStage ?? "school";
  if (
    !Number.isInteger(p.children) ||
    !["young", "school", "adult"].includes(p.childStage)
  )
    fail();
  p.careerNotes = str(raw.careerNotes ?? "", 1000, true);
  p.companyFacts = validateCompanyFacts(raw.companyFacts ?? null);
  return p;
}
export function validateCompanyFacts(raw) {
  if (raw === null) return null;
  if (
    !raw ||
    typeof raw !== "object" ||
    typeof raw.confirmed !== "boolean" ||
    !Array.isArray(raw.sources) ||
    raw.sources.length > 3
  )
    fail();
  const summary = str(raw.summary, 1800, true),
    sector = raw.sector ?? "unknown";
  if (!["unknown", ...Object.keys(JOBS)].includes(sector)) fail();
  const sources = raw.sources.map((s) => {
    const u = new URL(str(s.url, 2048));
    if (u.protocol !== "https:" || u.username || u.password) fail();
    return {
      url: u.href,
      title: str(s.title ?? "", 160),
      checkedAt: str(s.checkedAt ?? "", 30),
    };
  });
  return { summary, sector, confirmed: raw.confirmed, sources };
}
// New career choices are structured; old v2 string choices retain their rules.
export const decisionId = (value) =>
  typeof value === "string" ? value : value?.id;
export function validateDecision(raw, g) {
  const id = decisionId(raw);
  if (!availableChoices(g).includes(id)) fail();
  if (typeof raw === "string") {
    if (id === "opportunity") {
      const offer = opportunityAt(g);
      if (!offer) fail();
      return { id: "startup", venture: offer.venture, name: offer.name };
    }
    if (id === "startup") fail();
    return raw;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
  if (id === "startup") {
    if (
      typeof raw.venture !== "string" ||
      !Object.hasOwn(VENTURES, raw.venture)
    )
      fail();
    const name = str(raw.name, 60);
    if (!name || g.cash < VENTURES[raw.venture].setup) fail();
    return { id, venture: raw.venture, name };
  }
  if (
    id !== "switch" ||
    typeof raw.role !== "string" ||
    !Object.hasOwn(JOBS, raw.role) ||
    raw.role === "other" ||
    raw.role === "independent"
  )
    fail();
  if (raw.target === "custom") {
    const name = str(raw.name, 60),
      facts = validateCompanyFacts(raw.facts ?? null);
    if (
      !name ||
      !["unknown", "large", "small", "public"].includes(raw.companyType)
    )
      fail();
    if (facts && (!facts.confirmed || !facts.sources.length)) fail();
    return {
      id,
      target: "custom",
      role: raw.role,
      name,
      companyType: raw.companyType,
      facts,
    };
  }
  if (typeof raw.target !== "string" || !Object.hasOwn(EMPLOYERS, raw.target))
    fail();
  const c = EMPLOYERS[raw.target];
  if (g.year < (c.availableFrom ?? START_YEAR) || g.employer.id === raw.target)
    fail();
  return { id, target: raw.target, role: raw.role };
}
function nextEmployer(g, decision) {
  if (typeof decision === "string") {
    return decision === "switch"
      ? {
          kind: "legacy",
          id: "legacy",
          name: "新しい職場（仮想）",
          role: g.employer.role,
          companyType: g.profile.companyType,
          facts: null,
        }
      : g.employer;
  }
  if (decision.id === "startup") {
    const v = VENTURES[decision.venture];
    return {
      kind: "venture",
      id: decision.venture,
      name: decision.name,
      role: "independent",
      companyType: "self",
      sector: v.sector,
      summary: v.label,
      facts: null,
      started: g.year,
    };
  }
  if (decision.target === "custom")
    return {
      kind: "real",
      id: "custom",
      name: decision.name,
      role: decision.role,
      companyType: decision.companyType,
      facts: decision.facts,
      summary: decision.facts?.summary ?? "事業内容は未確認",
    };
  const c = EMPLOYERS[decision.target];
  return {
    kind: c.kind,
    id: decision.target,
    name: c.name,
    role: decision.role,
    companyType: c.companyType,
    sector: c.sector,
    summary: c.summary,
    facts:
      c.kind === "real"
        ? {
            summary: c.summary,
            sector: c.sector,
            confirmed: true,
            sources: [
              {
                url: c.url,
                title: c.name + " 公式事業情報",
                checkedAt: c.checkedAt,
              },
            ],
          }
        : null,
  };
}
export function randomAt(seed, year, channel = 0) {
  let n =
    (seed ^
      Math.imul(year + 1, 0x45d9f3b) ^
      Math.imul(channel + 1, 0x27d4eb2d)) >>>
    0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function createGame(
  profile,
  scenario = "steady",
  seed = 2026,
  dynamicFrom = 0,
  worldFrom = 0,
) {
  const p = validateProfile(profile);
  if (
    !Object.hasOwn(SCENARIOS, scenario) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !Number.isInteger(dynamicFrom) ||
    dynamicFrom < 0 ||
    dynamicFrom > MAX_AGE ||
    !Number.isInteger(worldFrom) ||
    worldFrom < 0 ||
    worldFrom > MAX_AGE
  )
    fail();
  const cash = Math.max(p.savings, 0) - p.stocks,
    investments = p.stocks,
    debt = Math.max(-p.savings, 0);
  return {
    profile: p,
    scenario,
    seed,
    decisions: [],
    dynamicFrom,
    worldFrom,
    studyHours: 0,
    family: {
      partner: p.partner === "partner",
      childAges: Array(p.children).fill(
        { young: 3, school: 10, adult: 22 }[p.childStage],
      ),
      desired: { undecided: null, none: 0, one: 1, two: 2, three: 3 }[
        p.childrenWish
      ],
      lastPlan: -3,
      lastWish: -4,
    },
    businessStage: null,
    businessSetbacks: 0,
    year: START_YEAR,
    age: p.age,
    income: p.income,
    salary: p.income,
    cash,
    investments,
    debt,
    homeValue: p.homeValue,
    mortgage: p.mortgage,
    mortgageYears: p.mortgageYears,
    housing: p.housing,
    region: p.region,
    livingCost: p.monthlyCost,
    rent: p.rent,
    savings: cash + investments + p.homeValue - p.mortgage - debt,
    health: 65,
    connection: 55,
    freedom: 55,
    skill: { beginner: 15, sometimes: 40, daily: 65 }[p.ai],
    retired: p.age >= p.retirementAge,
    employer: {
      kind: "initial",
      id: "initial",
      name: p.company || "いまの職場",
      role: p.job,
      companyType: p.companyType,
      facts: p.companyFacts,
      summary: p.companyFacts?.confirmed ? p.companyFacts.summary : "",
    },
    careerMoves: 0,
    ended: false,
    history: [],
    scenes: {},
  };
}
export function technologyAt(g) {
  if (worldEnabled(g)) return worldAt(g).adoption;
  return clamp(
    (0.12 + g.decisions.length * 0.037) * SCENARIOS[g.scenario].pace,
    0,
    0.97,
  );
}
export function availableChoices(g) {
  const ids = ["learn", "focus", "connect", "rest", "explore"];
  if (!g.retired) ids.push("switch");
  if (!g.retired && g.employer?.kind !== "venture" && g.cash >= 60)
    ids.push("startup");
  if (g.cash > 30) ids.push("invest");
  if (
    g.housing === "rent" &&
    g.cash > homePrice(g.region) * 0.25 &&
    g.salary > 250 &&
    !g.retired
  )
    ids.push("home");
  if (g.housing === "rent") ids.push("move");
  if (g.decisions.length >= g.dynamicFrom) {
    if (!g.retired && g.employer.kind === "venture") {
      ids.push("closeBusiness");
      if (g.businessStage === "growing" && g.cash >= 100) ids.push("expand");
      if (g.businessStage === "setback") ids.push("pivot");
    } else if (!g.retired && g.employer.kind !== "seeking") {
      if (g.skill >= 35 || decisionId(g.decisions.at(-1)) === "learn")
        ids.push("pilot");
      if (g.history.at(-1)?.outcome?.kind === "success") ids.push("negotiate");
      if (g.age >= 40 && g.skill >= 45) ids.push("mentor");
    }
    if (
      g.cash < g.livingCost * 6 ||
      g.health < 40 ||
      g.employer.kind === "seeking"
    )
      ids.push("recover");
  }
  if (worldEnabled(g)) {
    ids.push("studyDaily");
    if (!g.family.partner && g.age < 75) ids.push("meet");
    if (
      g.age <= 65 &&
      g.family.childAges.length < 6 &&
      g.decisions.length - g.family.lastPlan >= 3 &&
      (g.family.desired === null ||
        g.family.childAges.length < g.family.desired)
    )
      ids.push("familyPlan");
    if (
      g.age <= 65 &&
      g.family.desired !== null &&
      g.family.desired > 0 &&
      g.family.childAges.length >= g.family.desired &&
      g.family.childAges.length < 6 &&
      g.decisions.length - g.family.lastWish >= 4 &&
      randomAt(g.seed, g.decisions.length, 75) < 0.35
    )
      ids.push("reconsiderFamily");
    if (g.family.childAges.some((age) => age < 18) && !g.retired)
      ids.push("careLeave");
    if (opportunityAt(g) && randomAt(g.seed, g.decisions.length, 77) < 0.55)
      ids.push("opportunity");
  }
  if (!g.retired && g.age >= 45) ids.push("retire");
  return ids;
}
export function suggestedChoices(g) {
  const allowed = availableChoices(g);
  const contextual = [
    "pivot",
    "expand",
    "negotiate",
    "recover",
    "pilot",
    "mentor",
  ].filter((id) => allowed.includes(id));
  if (g.employer.kind === "seeking") contextual.unshift("switch");
  if (g.employer.kind === "venture" && g.businessStage === "setback")
    contextual.push("closeBusiness");
  const lifeActions = ["home", "invest", "move", "retire"];
  const lifeAction = lifeActions[g.decisions.length % lifeActions.length];
  if (allowed.includes(lifeAction)) contextual.push(lifeAction);
  const rotations = [
    ["focus", "connect", "rest", "explore", "learn"],
    ["learn", "rest", "explore", "focus", "connect"],
    ["explore", "connect", "focus", "learn", "rest"],
  ];
  const moments = [
    "reconsiderFamily",
    "familyPlan",
    "meet",
    "careLeave",
    "opportunity",
  ].filter((id) => allowed.includes(id));
  const moment = moments.length
    ? moments[g.decisions.length % moments.length]
    : null;
  if (worldEnabled(g)) {
    const goal = {
      switch: "switch",
      business: "startup",
      balance: allowed.includes("careLeave") ? "careLeave" : "connect",
      growth: "studyDaily",
    }[g.profile.careerGoal];
    const career = [
      "pivot",
      "expand",
      "recover",
      "negotiate",
      goal,
      "pilot",
    ].find((id) => allowed.includes(id));
    return [
      ...new Set([
        career,
        moment,
        ...(g.decisions.length % 2 === 0 ? ["studyDaily"] : []),
        ...contextual,
        ...rotations[g.decisions.length % 3],
      ]),
    ]
      .filter(Boolean)
      .slice(0, 5);
  }
  return [
    ...new Set([...contextual, ...rotations[g.decisions.length % 3]]),
  ].slice(0, 5);
}
export function workSuccessChance(g, employer = g.employer) {
  const w = worldAt(g, employer);
  return clamp(
    0.24 + g.skill * 0.004 + g.health * 0.0015 + w.demand * 0.12,
    0.15,
    0.88,
  );
}
function familyTurn(g, choice) {
  const family = {
    ...g.family,
    childAges: g.family.childAges.map((age) => age + 1),
  };
  let outcome = null;
  if (!worldEnabled(g)) return { family, outcome, cost: 0 };
  const roll = randomAt(g.seed, g.decisions.length, 74);
  const life = (title, body) => ({
    kind: "life",
    title,
    body,
    salaryFactor: choice === "careLeave" ? 0.85 : 1,
    extraCost: 0,
  });
  if (choice === "meet") {
    if (roll < 0.52) family.partner = true;
    outcome = life(
      family.partner
        ? "出会いから、共に暮らす関係へ。"
        : "出会いはあったが、関係はゆっくり。",
      family.partner
        ? "互いの希望を話し合い、パートナーとの暮らしを選んだ。家族の希望や仕事の比重を、また考えられる。"
        : "時間を使っても、すぐに望む関係になるとは限らない。人とのつながりを残し、次の一年へ。",
    );
  }
  if (choice === "reconsiderFamily") {
    family.desired = Math.min(6, family.childAges.length + 1);
    family.lastWish = g.decisions.length;
    outcome = life(
      "家族についての希望を、更新した。",
      "もうひとり迎える可能性を考えることにした。次の年から準備を選べる。希望は結果の保証ではない。",
    );
  }
  if (choice === "familyPlan") {
    family.lastPlan = g.decisions.length;
    if (roll < 0.58) family.childAges.push(0);
    outcome = life(
      roll < 0.58
        ? "新しい家族を迎える暮らしが始まった。"
        : "家族の準備は、もう少し続く。",
      roll < 0.58
        ? "育て方や周囲の支援を整え、新しい家族との生活へ。子どもの世話と仕事の時間をどう分けるか、次の選択が生まれた。"
        : "話し合いや支援の準備には時間が必要だった。希望どおりの時期には進まなかったが、暮らしや希望を選び直せる。",
    );
  }
  if (choice === "careLeave")
    outcome = life(
      "家族を支える時間へ、比重を移した。",
      "この年の労働収入を抑え、家族との時間とゆとりを増やした。翌年も同じ働き方を続ける必要はない。",
    );
  const cost =
    family.childAges.slice(g.profile.children).filter((age) => age < 22)
      .length * 36;
  return { family, outcome, cost };
}
function yearlyOutcome(g, choice, employer) {
  const i = g.decisions.length;
  if (
    i < g.dynamicFrom ||
    g.retired ||
    g.age >= g.profile.retirementAge ||
    choice === "retire"
  )
    return null;
  const roll = randomAt(g.seed, i, 31),
    ability = worldEnabled(g)
      ? workSuccessChance(g, employer)
      : clamp(0.35 + g.skill * 0.004 + g.health * 0.002, 0.2, 0.85);
  if (choice === "closeBusiness")
    return {
      kind: "closure",
      title: "事業を整理し、次の働き方へ。",
      body: "事業の収入と継続費用を止めた。経験は残り、転職や生活の立て直しを選べる。",
      salaryFactor: 0,
      extraCost: 0,
    };
  if (employer.kind === "venture") {
    const risk = clamp(
      0.18 +
        (g.cash < g.livingCost * 12 ? 0.12 : 0) +
        technologyAt(g) * (1 - g.skill / 100) * 0.12 +
        (choice === "expand" ? 0.12 : 0) -
        (choice === "pivot" ? 0.08 : 0) +
        (worldEnabled(g)
          ? (0.5 - worldAt(g, employer).demand) * 0.25 - g.skill * 0.0005
          : 0),
      0.1,
      0.55,
    );
    if (roll < risk) {
      const failed = g.businessSetbacks >= 1;
      return {
        kind: failed ? "failure" : "setback",
        title: failed
          ? "事業が続かず、いったん撤退。"
          : "顧客が伸びず、事業の収支が悪化。",
        body: failed
          ? "不調が続き、事業を閉じることになった。事業収入と運営費を止め、次の仕事と暮らしを立て直す。"
          : "見込んだ受注が得られず、事業収入が減った。次は事業の方向転換や撤退も選べる。",
        salaryFactor: failed ? 0 : 0.55,
        extraCost: failed ? 15 : 20,
      };
    }
    if (roll > 1 - ability * 0.5 || (choice === "pivot" && roll > 0.55))
      return {
        kind: "success",
        title:
          choice === "pivot"
            ? "方向転換が、次の顧客につながった。"
            : "仕事が紹介され、事業に手応え。",
        body: worldEnabled(g)
          ? "顧客との仕事に手応えがあった。事業を広げる道が見えてきたが、開業や運営の費用もかかる。収入と家計の変化を確かめ、次の一歩を選べる。"
          : "顧客との仕事が増え、事業収入が伸びた。次は追加投資して広げるか、暮らしとのバランスを選べる。",
        salaryFactor: choice === "expand" ? 1.3 : 1.15,
        extraCost: 0,
      };
    return {
      kind: "steady",
      title: "小さな受注を積み重ねた一年。",
      body: "事業を続け、運営費を払いながら顧客との関係を育てた。大きく広げる前に、次の一歩を考える。",
      salaryFactor: 1,
      extraCost: 0,
    };
  }
  if (
    [
      "pilot",
      "negotiate",
      "focus",
      "learn",
      "studyDaily",
      "switch",
      "explore",
      "mentor",
    ].includes(choice)
  ) {
    const success = roll < ability;
    const titles = {
      pilot: [
        "試した仕組みが、仕事で役立った。",
        "実証は思い通りに進まなかった。",
      ],
      negotiate: [
        "成果が認められ、役割と収入が変化。",
        "今回の待遇の相談は見送りに。",
      ],
      studyDaily: [
        "毎日の学びが、仕事に生きる場面へ。",
        "学びを続けたが、今年の評価には届かず。",
      ],
      learn: [
        "新しい力を、使える手応えが生まれた。",
        "学びは続けたが、実践にはまだ距離がある。",
      ],
      focus: [
        "積み重ねた仕事が評価された。",
        "仕事を続けたが、成果につながりにくい一年。",
      ],
      switch: [
        "新しい役割で、経験を生かせた。",
        "新しい職場への適応に時間がかかった。",
      ],
      explore: [
        "小さな挑戦から、新しい依頼が来た。",
        "試したことは、まだ仕事にはつながらず。",
      ],
      mentor: [
        "伝えた経験が、協働の機会を育てた。",
        "教え方を探りながら、人と向き合った。",
      ],
    };
    return {
      kind: success ? "success" : "setback",
      ...(worldEnabled(g) ? { chance: ability } : {}),
      title: titles[choice][success ? 0 : 1],
      body: success
        ? "取り組みが次の仕事につながった。得た成果を試す、相談するなど、次の選び方も広がる。"
        : "時間や費用をかけても、すぐに成果が出るとは限らない。経験を残して、次の方法を選び直せる。",
      salaryFactor: success
        ? ["negotiate", "pilot"].includes(choice)
          ? 1.1
          : 1.025
        : choice === "pilot"
          ? 0.97
          : 1,
      extraCost: 0,
    };
  }
  return {
    kind: "steady",
    title:
      choice === "rest" || choice === "recover"
        ? "暮らしのペースを、整える一年に。"
        : "大切にしたい時間を、選んだ一年。",
    body: "選んだ行動が家計やゆとり、人との関係に反映された。この変化を受けて次の一年を考える。",
    salaryFactor: 1,
    extraCost: 0,
  };
}
const homePrice = (region) =>
  ({ metro: 4500, city: 3000, rural: 2000 })[region];
export function mortgagePayment(balance, rate, years) {
  if (balance <= 0) return 0;
  const r = rate / 100 / 12,
    n = Math.max(1, years * 12);
  return r === 0 ? balance / n : (balance * r) / (1 - (1 + r) ** -n);
}
export function amortizeYear(balance, rate, years) {
  const monthly = mortgagePayment(balance, rate, years);
  let payment = 0,
    interest = 0,
    principal = 0;
  for (let i = 0; i < 12 && balance > 1e-9; i++) {
    const fee = (balance * rate) / 100 / 12;
    const paid = Math.min(monthly, balance + fee);
    const repayment = paid - fee;
    balance = Math.max(0, balance - repayment);
    payment += paid;
    interest += fee;
    principal += repayment;
  }
  return { balance, payment, interest, principal };
}
export function deathChance(g) {
  if (g.age + 1 >= MAX_AGE) return 1;
  return clamp(
    (0.0005 *
      Math.exp(Math.max(0, g.age - 35) / 10) *
      (1 + (50 - g.health) / 180)) /
      (1 + technologyAt(g) * 0.08),
    0.0002,
    0.6,
  );
}
export function sceneKey(g) {
  return String(g.decisions.length);
}
export function validateScene(raw, g) {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray(raw.options) ||
    raw.options.length < 3 ||
    raw.options.length > 5
  )
    fail();
  const allowed = availableChoices(g),
    seen = new Set();
  const options = raw.options.map((o) => {
    if (!o || !allowed.includes(o.id) || seen.has(o.id)) fail();
    seen.add(o.id);
    return { id: o.id, label: str(o.label, 50), hint: str(o.hint, 100) };
  });
  if (options.some((o) => !o.label) || !raw.title || !raw.body) fail();
  return {
    title: str(raw.title, 100),
    body: str(raw.body, 1400, true),
    insight: str(raw.insight ?? "", 300, true),
    options,
  };
}
export function applyScene(g, scene) {
  if (g.ended) fail();
  return {
    ...g,
    scenes: { ...g.scenes, [sceneKey(g)]: validateScene(scene, g) },
  };
}
export function eventFor(g) {
  const cached = g.scenes[sceneKey(g)];
  if (cached) return { ...cached, generated: true };
  const options = suggestedChoices(g).map((id) => ({
    id,
    label:
      id === "opportunity"
        ? (opportunityAt(g)?.label ?? CHOICES[id].label)
        : CHOICES[id].label,
    hint:
      id === "opportunity"
        ? `初期費用${opportunityAt(g)?.setup}万円。収入が減ることも、事業が失敗することもある`
        : CHOICES[id].hint,
  }));
  const last = decisionId(g.decisions.at(-1)),
    company = g.employer.name;
  const business =
    g.employer.id === "custom"
      ? g.employer.facts?.sector && g.employer.facts.sector !== "unknown"
        ? `確認した事業分野は${JOBS[g.employer.facts.sector].label}。`
        : ""
      : g.employer.summary;
  let title, body;
  if (g.retired) {
    title =
      g.age >= 80
        ? "自分のペースで、暮らしをつなぐ。"
        : "仕事の先にある、毎日。";
    body = `${g.age}歳。${REGIONS[g.region].label}で、${g.housing === "own" ? "持ち家を手入れしながら" : "住まいの費用を払いながら"}暮らしている。給与に代わる収入と、これまでの資産をどう使うか。人との時間や新しい楽しみにも、目を向けたい。`;
  } else if (g.employer.kind === "seeking") {
    title = "経験を持って、次の一歩を探す。";
    body = `事業を終え、暮らしと仕事を組み直している。手元現金は約${Math.round(g.cash)}万円。これまでの経験を別の企業で生かすか、まず生活のペースを整えるか。収入と支出の変化を確かめながら、次の選択を考える。`;
  } else if (g.employer.kind === "venture") {
    title = `${company}を、自分の手で育てる。`;
    body = `${company}では、${g.employer.summary}という架空の事業で、${g.year - g.employer.started}年目に入った。顧客を探し、運営費を払いながら、自分の仕事をつくる。${technologyAt(g) > 0.5 ? "AIが広く使われる世界では、効率化だけでなく選ばれる理由も必要になっている。" : "AIを試しながら、任せる部分と自分で担う部分を見極めたい。"}手元の現金は約${Math.round(g.cash)}万円。収入の変動と暮らしを両立するには、どこへ時間を使おう。`;
  } else if (last === "switch") {
    title = "新しい環境の、一年目。";
    body = `${company}へ移る架空の転職を経験し、${JOBS[g.employer.role].label}の役割で慣れないことにも向き合う日々。${business ? `事業の背景：${business} ` : ""}これまでの経験を、新しい役割にどう生かすか。${g.skill > 50 ? "学んだAIの使い方を試せる機会も見えてきた。" : "新しい道具と仕事の進め方に、学ぶ余地がありそうだ。"}`;
  } else if (g.cash < g.livingCost * 6) {
    title = "暮らしの収支を、見つめなおす。";
    body = `手元の現金が、生活費の半年分を下回っている。${g.investments > 0 ? "株式を持っていても、必要な時に同じ価格で売れるとは限らない。" : ""}${g.housing === "own" ? "住まいの維持とローンにも費用がかかる。" : "家賃も毎月の支出のひとつ。"}仕事や暮らしの組み合わせを考える一年になりそうだ。`;
  } else {
    title =
      technologyAt(g) > 0.5
        ? "仕事のかたちを、作りなおす。"
        : `${company}で、次の役割を考える。`;
    body = `${g.age}歳、${company}で${JOBS[g.employer.role].label}を担うあなた。${SCENARIOS[g.scenario].label}の世界では、AIを使う仕事の比重が${technologyAt(g) > 0.5 ? "大きく変わってきた" : "少しずつ増えている"}。${g.profile.household === "care" ? "育児やケアとの両立も、時間の使い方を左右する。" : ""}${["learn", "studyDaily"].includes(last) ? "去年の学びを、実際の仕事で試す場面が見えてきた。" : last === "connect" ? "大切な人と過ごした時間が、選びたい働き方を考えるきっかけになった。" : "収入だけでなく、暮らしに残る時間も大切にしたい。"}`;
  }
  return {
    title,
    body: worldEnabled(g)
      ? `${body} ${worldAt(g).shock.body}${worldAt(g).frontier ? ` ${worldAt(g).frontier}` : ""}`
      : body,
    insight: `仕事・資産・住まい・過去の選択を反映したローカルの物語。AI普及指標はゲーム上の仮定。`,
    options,
    generated: false,
  };
}
export function advance(g, rawDecision) {
  if (g.ended || g.decisions.length >= MAX_AGE)
    throw new Error("この人生の物語は完結しました。");
  const decision = validateDecision(rawDecision, g),
    choice = decisionId(decision);
  let employer = nextEmployer(g, decision);
  const familyChange = familyTurn(g, choice);
  const workOutcome = yearlyOutcome(g, choice, employer);
  // Family events do not suspend business risk. Both can happen in one year.
  const outcome =
    employer.kind === "venture"
      ? workOutcome
      : (familyChange.outcome ?? workOutcome);
  const world = worldEnabled(g) ? worldAt(g, employer) : null;
  if (outcome?.kind === "failure" || outcome?.kind === "closure")
    employer = {
      kind: "seeking",
      id: "seeking",
      name: "次の仕事を探している",
      role: "other",
      companyType: "unknown",
      facts: null,
      summary: "事業を終え、働き方を組み直している",
    };
  const c = CHOICES[choice],
    p = g.profile,
    tech = technologyAt(g),
    i = g.decisions.length,
    job = JOBS[employer.role];
  let {
    cash,
    investments,
    debt,
    homeValue,
    mortgage,
    mortgageYears,
    housing,
    region,
    livingCost,
    rent,
  } = g;
  const retired = g.retired || g.age >= p.retirementAge || choice === "retire";
  const adoption = {
    unknown: 1,
    large: 1.05,
    small: 1.1,
    public: 0.75,
    self: 1.15,
  }[employer.companyType];
  const sectorKey = employer.facts?.confirmed
    ? employer.facts.sector
    : employer.sector;
  const sector = sectorKey && sectorKey !== "unknown" ? JOBS[sectorKey] : null;
  const exposure = sector
    ? job.exposure * 0.8 + sector.exposure * 0.2
    : job.exposure;
  const volatility = (randomAt(g.seed, i) - 0.5) * 0.07;
  const aiBenefit = tech * adoption * job.complement * (g.skill / 100) * 0.1;
  const transitionCost =
    tech * adoption * exposure * (1 - g.skill / 125) * 0.075;
  let growth = clamp(
    0.006 +
      volatility +
      aiBenefit -
      transitionCost +
      (choice === "focus" ? 0.023 : 0) +
      (g.health < 30 ? -0.035 : 0),
    -0.12,
    0.12,
  );
  if (choice === "switch") growth += -0.12 + randomAt(g.seed, i, 7) * 0.3;
  if (choice === "switch" && typeof decision === "object") {
    growth +=
      employer.role === g.employer.role ? (g.skill / 100) * 0.025 : -0.08;
  }
  const venture = employer.kind === "venture" ? VENTURES[employer.id] : null;
  if (venture)
    growth +=
      (randomAt(g.seed, i, 21) - 0.5) * 0.4 +
      tech * (g.skill / 100 - 0.5) * 0.1;
  if (world) growth += world.growth;
  const transitionIncome =
    choice === "startup" ? 0.3 + randomAt(g.seed, i, 22) * 0.55 : 1;
  const salary = retired
    ? 0
    : clamp(
        (choice === "startup"
          ? g.salary || 120
          : choice === "switch" && typeof decision === "object"
            ? g.salary || 180
            : g.salary) *
          (1 + growth) *
          transitionIncome *
          (outcome?.salaryFactor ?? 1) *
          (familyChange.outcome && outcome !== familyChange.outcome
            ? familyChange.outcome.salaryFactor
            : 1) *
          (world && decisionId(g.decisions.at(-1)) === "careLeave"
            ? 1 / 0.85
            : 1),
        0,
        20000,
      );
  const income = salary + (g.age >= 65 ? p.pension : 0);
  const businessSetup =
    choice === "startup" ? VENTURES[decision.venture].setup : 0;
  const businessOverhead = venture && !retired ? venture.overhead : 0;
  let cost =
      c.cost + businessSetup + businessOverhead + (outcome?.extraCost ?? 0),
    investmentTransfer = 0,
    homeTransaction = 0;
  if (choice === "invest") {
    investmentTransfer = Math.min(cash * 0.18, Math.max(30, income * 0.15));
    cash -= investmentTransfer;
    investments += investmentTransfer;
  }
  if (choice === "home") {
    homeValue = homePrice(region);
    homeTransaction = homeValue * 0.25;
    cash -= homeTransaction;
    mortgage = homeValue * 0.8;
    mortgageYears = 30;
    housing = "own";
    rent = 0;
  }
  if (choice === "move") {
    const order = ["metro", "city", "rural"];
    const prev = REGIONS[region].cost;
    region = order[(order.indexOf(region) + 1) % 3];
    livingCost *= REGIONS[region].cost / prev;
    rent *= REGIONS[region].cost / prev;
  }
  const stockReturn =
      0.025 +
      (randomAt(g.seed, i, 8) - 0.5) * 0.34 +
      (world?.shock.market ?? 0),
    propertyReturn = (randomAt(g.seed, i, 9) - 0.5) * 0.06;
  const investmentGain = investments * stockReturn;
  investments += investmentGain;
  const propertyGain = homeValue * propertyReturn;
  homeValue += propertyGain;
  const loan = amortizeYear(mortgage, p.mortgageRate, mortgageYears),
    loanPayment = loan.payment,
    principal = loan.principal;
  mortgage = loan.balance;
  if (mortgageYears > 1) mortgageYears -= 1;
  const housingCost =
    housing === "own" ? loanPayment + homeValue * 0.01 : rent * 12;
  const disposable = income * 0.76,
    bonus = choice === "explore" ? (randomAt(g.seed, i, 1) - 0.5) * 30 : 0;
  const expenses =
    livingCost * 12 * (1 + (world?.shock.costs ?? 0)) +
    housingCost +
    cost +
    familyChange.cost +
    (g.age >= 80 ? 12 : 0);
  cash += disposable - expenses + bonus;
  let liquidation = 0;
  if (cash < 0 && investments > 0) {
    liquidation = Math.min(-cash, investments);
    cash += liquidation;
    investments -= liquidation;
  }
  if (cash < 0) {
    debt -= cash;
    cash = 0;
  }
  const debtInterest = debt * 0.02;
  debt += debtInterest;
  const health = clamp(
    g.health +
      c.health -
      (g.age >= 80 ? 2 : g.age >= 65 ? 1.4 : 0.8) +
      (p.priority === "time" ? 0.5 : 0),
  );
  const connection = clamp(
    g.connection + c.connection - 1 + (p.priority === "people" ? 0.8 : 0),
  );
  const freedom = clamp(
    g.freedom + c.freedom - 0.5 + (p.priority === "freedom" ? 0.8 : 0),
  );
  const skill = clamp(
    g.skill +
      c.skill *
        (world && ["learn", "studyDaily"].includes(choice)
          ? 0.7 + randomAt(g.seed, i, 78) * 0.6
          : 1) -
      2 * SCENARIOS[g.scenario].pace,
  );
  const studyHours =
    g.studyHours +
    (world ? (choice === "studyDaily" ? 365 : choice === "learn" ? 90 : 0) : 0);
  const ended = randomAt(g.seed, i, 20) < deathChance(g);
  const savings = cash + investments + homeValue - mortgage - debt;
  const effects = {
    learn: "学びが蓄積し、AIを生かせる仕事の幅が変わった。",
    focus: retired
      ? "地域で経験を生かし、自分の居場所を育てた。"
      : "仕事を深めた一方で、ゆとりにも負担がかかった。",
    connect: "大切な人と過ごし、つながりが深まった。",
    rest: "心と体をいたわり、暮らしのペースを整えた。",
    explore: "小さな挑戦を通じて、経験と新しいつながりが増えた。",
    switch:
      typeof decision === "object"
        ? `${employer.name}へ、${JOBS[employer.role].label}として移る架空の転職。移行費用30万円と役割の変化を反映した。`
        : "働く環境を変更。移行費用を払い、収入と自由が変化した。",
    startup: `${employer.name}を開業（架空）。${venture?.label ?? ""}。初期費用${businessSetup}万円、年間運営費${businessOverhead}万円を支払い、収入が変化した。`,
    invest: "現金の一部を株式へ配分。以後の価格変動の影響も変わる。",
    home: "住まいを購入。金融資産・不動産・ローンの構成が変わった。",
    move: "地域を移り、生活費・住居費・人との距離が変わった。",
    retire: "給与収入を止めた。65歳以降は設定した退職後収入を受け取る。",
  };
  const event = eventFor(g),
    option = event.options.find((o) => o.id === choice);
  const record = {
    year: g.year,
    age: g.age,
    choice,
    choiceLabel:
      choice === "startup"
        ? `${employer.name}を開業`
        : choice === "switch" && typeof decision === "object"
          ? `${employer.name}へ転職`
          : (option?.label ?? c.label),
    employer,
    title: event.title,
    income,
    salary,
    savings,
    cash,
    investments,
    homeValue,
    mortgage,
    debt,
    health,
    connection,
    freedom,
    skill,
    outcome,
    world,
    family: familyChange.family,
    familyCost: familyChange.cost,
    familyOutcome: familyChange.outcome,
    studyHours,
    note: outcome
      ? `${outcome.title} ${effects[choice] ?? c.label}`
      : effects[choice],
    aiBenefit,
    transitionCost,
    volatility,
    expenses,
    businessSetup,
    businessOverhead,
    disposable,
    bonus,
    investmentGain,
    propertyGain,
    principal,
    debtInterest,
    investmentTransfer,
    homeTransaction,
    liquidation,
    ended,
  };
  return {
    ...g,
    employer,
    family: familyChange.family,
    studyHours,
    businessStage:
      employer.kind === "venture"
        ? outcome?.kind === "success"
          ? "growing"
          : outcome?.kind === "setback"
            ? "setback"
            : (g.businessStage ?? "stable")
        : null,
    businessSetbacks:
      employer.kind === "venture"
        ? outcome?.kind === "setback"
          ? g.businessSetbacks + 1
          : outcome?.kind === "success"
            ? 0
            : g.businessSetbacks
        : 0,
    careerMoves:
      g.careerMoves + (["switch", "startup"].includes(choice) ? 1 : 0),
    year: g.year + 1,
    age: g.age + 1,
    income,
    salary,
    cash,
    investments,
    debt,
    homeValue,
    mortgage,
    mortgageYears,
    housing,
    region,
    livingCost,
    rent,
    savings,
    health,
    connection,
    freedom,
    skill,
    retired,
    ended,
    decisions: [...g.decisions, decision],
    history: [...g.history, record],
  };
}
export function replay(
  profile,
  scenario,
  seed,
  decisions,
  scenes = {},
  stopAtEnd = false,
  dynamicFrom = 0,
  worldFrom = 0,
) {
  if (
    !Array.isArray(decisions) ||
    decisions.length > MAX_AGE ||
    !scenes ||
    typeof scenes !== "object" ||
    Array.isArray(scenes) ||
    Object.keys(scenes).length > MAX_AGE
  )
    fail();
  let g = createGame(profile, scenario, seed, dynamicFrom, worldFrom);
  for (let i = 0; i < decisions.length; i++) {
    if (g.ended) {
      if (stopAtEnd) break;
      fail();
    }
    let unavailable = false;
    if (stopAtEnd) {
      try {
        validateDecision(decisions[i], g);
      } catch {
        unavailable = true;
      }
    }
    if (unavailable) {
      g = { ...g, comparisonBlocked: true };
      break;
    }
    if (scenes[String(i)]) g = applyScene(g, scenes[String(i)]);
    g = advance(g, decisions[i]);
  }
  if (!g.ended && scenes[String(decisions.length)])
    g = applyScene(g, scenes[String(decisions.length)]);
  return g;
}
export function compareWorlds(g) {
  return Object.keys(SCENARIOS).map((s) =>
    replay(
      g.profile,
      s,
      g.seed,
      g.decisions,
      {},
      true,
      g.dynamicFrom,
      g.worldFrom,
    ),
  );
}
export function encodeSave(g) {
  const value = JSON.stringify({
    version: VERSION,
    dynamicFrom: g.dynamicFrom,
    worldFrom: g.worldFrom,
    profile: g.profile,
    scenario: g.scenario,
    seed: g.seed,
    decisions: g.decisions,
    scenes: g.scenes,
  });
  if (value.length > 250000)
    throw new Error("保存データが上限を超えました。元の保存は保持しています。");
  return value;
}
export function decodeSave(value) {
  if (typeof value !== "string" || value.length > 250000) fail();
  const d = JSON.parse(value);
  if (!d || d.version !== VERSION)
    throw new Error(
      "旧版または未対応の保存形式です。元データを保持したまま新しい物語を開始してください。",
    );
  return replay(
    d.profile,
    d.scenario,
    d.seed,
    d.decisions,
    d.scenes ?? {},
    false,
    d.dynamicFrom ?? d.decisions?.length,
    d.worldFrom ?? d.decisions?.length,
  );
}
