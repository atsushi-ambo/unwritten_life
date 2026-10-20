import {
  LEGACY_EMPLOYERS,
  VENTURES,
  WORK_MODELS,
  workContext,
  employerKey,
  OCCUPATIONS,
  PROFILE_INDUSTRIES,
  careerMilestones,
} from "./careers.js";
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
  marketing: {
    label: "マーケティング・広報",
    exposure: 0.82,
    complement: 0.78,
  },
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
// Prose stays separate from category labels used by forms and AI context.
const JOB_PROSE = Object.freeze({
  tech: "ITの仕事",
  marketing: "マーケティングの仕事",
  office: "事務や管理の仕事",
  creative: "制作の仕事",
  people: "人と向き合う仕事",
  care: "ケアの仕事",
  physical: "現場の仕事",
  independent: "自分の仕事",
  other: "今の仕事",
});
const workplaceName = (employer) =>
  employer.name === "いまの職場" ? "職場" : employer.name;
const narrativeSentences = (text) =>
  text.match(/[^。！？!?]+[。！？!?]*/gu)?.map((s) => s.trim()).filter(Boolean) ?? [];

export const REGIONS = Object.freeze({
  // Named by city size so the three never overlap (2026-10-20). Tokyo-area
  // suburbs count as metro, as regionFromMunicipality infers.
  metro: { label: "大都市圏", cost: 22 },
  city: { label: "地方の中心都市", cost: 17 },
  rural: { label: "地方の市町村", cost: 14 },
});
const PREFECTURES = /^(北海道|東京都|京都府|大阪府|(?:青森|岩手|宮城|秋田|山形|福島|茨城|栃木|群馬|埼玉|千葉|神奈川|新潟|富山|石川|福井|山梨|長野|岐阜|静岡|愛知|三重|滋賀|兵庫|奈良|和歌山|鳥取|島根|岡山|広島|山口|徳島|香川|愛媛|高知|福岡|佐賀|長崎|熊本|大分|宮崎|鹿児島|沖縄)県)/u;
const METRO_CITIES = /^(横浜市|川崎市|相模原市|さいたま市|千葉市|大阪市|堺市|名古屋市|京都市|神戸市|福岡市)(?:.+区)?$/u;
const TOKYO_WARDS = /^(千代田|中央|港|新宿|文京|台東|墨田|江東|品川|目黒|大田|世田谷|渋谷|中野|杉並|豊島|北|荒川|板橋|練馬|足立|葛飾|江戸川)区$/u;
export function regionFromMunicipality(text) {
  if (typeof text !== "string") return null;
  const name = text.normalize("NFKC").replace(/\s/gu, "");
  const prefecture = name.match(PREFECTURES)?.[0];
  const place = name.slice(prefecture?.length ?? 0);
  if (
    place.length < 2 ||
    !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々ヶケ]+$/u.test(place)
  ) return null;
  // Only a trailing 郡 marks a district: 郡 is also part of city names such as 郡山市 and 蒲郡市.
  if (/[町村郡]$/u.test(place)) return "rural";
  if (!/[市区]$/u.test(place)) return null;
  if (
    ["東京都", "神奈川県", "埼玉県", "千葉県", "大阪府"].includes(prefecture) ||
    METRO_CITIES.test(place) || (!prefecture && TOKYO_WARDS.test(place))
  ) return "metro";
  return prefecture ? "city" : null;
}
export const PRIORITIES = Object.freeze({
  balance: "バランス",
  work: "仕事・挑戦",
  time: "ゆとり・健康",
  people: "家族・つながり",
  freedom: "自由・体験",
});
// Generic in-company stages, not any real employer's grades or titles. From a
// lead, a person goes on as a manager or as a specialist.
export const RANKS = Object.freeze({
  unspecified: { label: "役職は未入力", level: 0 },
  staff: { label: "担当", level: 0 },
  lead: { label: "リーダー", level: 1 },
  manager: { label: "管理職", level: 2, track: "manager" },
  specialist: { label: "専門職", level: 2, track: "specialist" },
  director: { label: "部長級", level: 3, track: "manager" },
  principal: { label: "上級専門職", level: 3, track: "specialist" },
});
export function nextRank(rank, track = "manager") {
  if (["unspecified", "staff"].includes(rank)) return "lead";
  if (rank === "lead") return track === "specialist" ? "specialist" : "manager";
  if (rank === "manager") return "director";
  if (rank === "specialist") return "principal";
  return null;
}
// Realistic pay applies to the years from payRealismFrom (older saves keep
// their recorded years).
export const payRealism = (g) => g.decisions.length >= (g.payRealismFrom ?? 0);
// Stages a job move may target: the current one, or one above once the
// current stage has lasted three years (people rarely climb at every move).
export function switchRanks(g) {
  const current = g.position?.rank ?? "unspecified";
  if (payRealism(g) && g.year - (g.position?.since ?? g.year) < 3) return [current];
  return [...new Set([current, ...["manager", "specialist"].map((t) => nextRank(current, t)).filter(Boolean)])];
}
// Building a career while staying: these and the existing in-company actions.
export const STAY_ACTIONS = Object.freeze([
  "focus", "promote", "transfer", "internalVenture", "pilot", "negotiate", "mentor",
]);
export const CHOICES = Object.freeze({
  promote: {
    label: "昇進・昇格を目指す",
    hint: "責任を引き受けて評価を求める。通るとは限らない",
    cost: 0,
    skill: 3,
    health: -3,
    connection: 1,
    freedom: -2,
    icon: "▲",
  },
  transfer: {
    label: "社内異動に手を挙げる",
    hint: "同じ会社で別の仕事へ。慣れるまでは負担もある",
    cost: 0,
    skill: 4,
    health: -1,
    connection: 2,
    freedom: 2,
    icon: "↻",
  },
  internalVenture: {
    label: "社内の新規事業・公募に応募する",
    hint: "会社に残りながら新しい仕事に挑む。選ばれるとは限らない",
    cost: 0,
    skill: 5,
    health: -2,
    connection: 2,
    freedom: 1,
    icon: "✦",
  },
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
  prepay: {
    label: "余裕資金でローンを繰り上げ返済する",
    hint: "生活費半年分と今年の支払いを残し、元金を減らす。返済期間は維持",
    cost: 0,
    skill: 0,
    health: 0,
    connection: 0,
    freedom: 0,
    icon: "⌂",
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
  p.municipality = str(raw.municipality ?? "", 80);
  p.jobDetail = str(raw.jobDetail ?? "", 120);
  p.occupation = raw.occupation ?? "";
  p.industry = raw.industry ?? "";
  if (
    typeof p.occupation !== "string" ||
    (p.occupation !== "" &&
      (!Object.hasOwn(OCCUPATIONS, p.occupation) ||
        OCCUPATIONS[p.occupation].job !== p.job)) ||
    typeof p.industry !== "string" ||
    (p.industry !== "" && !Object.hasOwn(PROFILE_INDUSTRIES, p.industry))
  )
    fail();
  p.workModel = raw.workModel ?? "unknown";
  if (!Object.hasOwn(WORK_MODELS, p.workModel)) fail();
  p.rank = raw.rank ?? "unspecified";
  if (typeof p.rank !== "string" || !Object.hasOwn(RANKS, p.rank)) fail();
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
  p.careerInterests = str(raw.careerInterests ?? "", 300, true);
  p.companyFacts = validateCompanyFacts(raw.companyFacts ?? null);
  return p;
}
// Only for the new-game form. Save imports still use strict validateProfile.
export const PROFILE_DEFAULTS = Object.freeze({
  age: 30,
  income: 500,
  savings: 300,
  monthlyCost: 12,
  stocks: 0,
  rent: 7,
  homeValue: 0,
  mortgage: 0,
  mortgageYears: 25,
  mortgageRate: 1.5,
  retirementAge: 65,
  pension: 180,
  children: 0,
});
export function optionalProfileInputs(raw, defaults = PROFILE_DEFAULTS) {
  const result = { ...raw };
  for (const [key, value] of Object.entries(PROFILE_DEFAULTS))
    if (
      raw[key] === undefined ||
      (typeof raw[key] === "string" && raw[key].trim() === "")
    )
      result[key] = defaults[key] ?? value;
    else if (["number", "string"].includes(typeof raw[key]))
      result[key] = Number(raw[key]);
    else fail();
  return result;
}
export const QUICK_AGE_BANDS = Object.freeze({
  // A new graduate: first-year pay and little saved (2026-10-20 default).
  new: { age: 22, income: 300, savings: 30, monthlyCost: 10 },
  "20s": { age: 25, income: 350, savings: 100, monthlyCost: 11 },
  "30s": { age: 35, income: 480, savings: 400, monthlyCost: 13 },
  "40s": { age: 45, income: 580, savings: 900, monthlyCost: 15 },
  "50s": { age: 55, income: 650, savings: 1500, monthlyCost: 17 },
  "60s": { age: 63, income: 420, savings: 2000, monthlyCost: 16 },
});
export function quickProfile(quick = { band: "30s", region: "city" }) {
  if (!quick || typeof quick !== "object" || Array.isArray(quick)) fail();
  const { band, region } = quick;
  if (
    typeof band !== "string" ||
    !Object.hasOwn(QUICK_AGE_BANDS, band) ||
    typeof region !== "string" ||
    !Object.hasOwn(REGIONS, region)
  ) fail();
  const values = QUICK_AGE_BANDS[band];
  return {
    ...values,
    region,
    income: Math.round((values.income * { metro: 1.1, city: 1, rural: 0.9 }[region]) / 10) * 10,
    rent: { metro: 9, city: 7, rural: 5 }[region],
  };
}
// New-game UI only: inactive sections retain their draft values in the DOM,
// but never leak into the chosen starting profile. Saves stay strictly validated.
export function profileInputForLevel(
  raw,
  level = "quick",
  quick = { band: "30s", region: "city" },
) {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    !["quick", "standard", "advanced"].includes(level)
  )
    fail();
  const quickValues = quickProfile(quick);
  const base = {
    age: 30,
    region: "city",
    job: "tech",
    ai: "sometimes",
    priority: "balance",
    gender: "undisclosed",
    household: "solo",
    partner: "unspecified",
    children: 0,
    childStage: "school",
    childrenWish: "undecided",
    companyType: "unknown",
    workModel: "unknown",
    rank: "unspecified",
    housing: "rent",
    company: "",
    municipality: "",
    occupation: "",
    industry: "",
    jobDetail: "",
    careerNotes: "",
    careerInterests: "",
    careerGoal: "growth",
    tone: "realistic",
  };
  const pick = (keys) =>
    Object.fromEntries(
      keys.filter((k) => raw[k] !== undefined).map((k) => [k, raw[k]]),
    );
  const common = pick(["careerGoal", "tone", "scenario"]);
  if (level === "quick")
    return { ...base, ...quickValues, ...common };
  const p = {
    ...base,
    ...pick([
      "age",
      "region",
      "municipality",
      "occupation",
      "industry",
      "jobDetail",
      "company",
      "workModel",
      "companyType",
      "rank",
      "ai",
      "priority",
      "income",
      "careerNotes",
      "careerInterests",
    ]),
    ...common,
  };
  if (
    typeof p.occupation !== "string" ||
    (p.occupation !== "" && !Object.hasOwn(OCCUPATIONS, p.occupation))
  )
    fail();
  p.job = OCCUPATIONS[p.occupation]?.job ?? "other";
  if (["student", "notWorking"].includes(p.occupation)) {
    p.company = "";
    p.companyType = "unknown";
    p.workModel = "unknown";
    p.rank = "unspecified";
    p.industry = "";
    if (p.income === undefined || p.income === "") p.income = 0;
  } else if (p.occupation === "independent") {
    p.companyType = "self";
    p.workModel = "self";
  }
  if (level === "advanced")
    Object.assign(
      p,
      pick([
        "partner",
        "children",
        "childStage",
        "childrenWish",
        "gender",
        "household",
        "monthlyCost",
        "stocks",
        "rent",
        "retirementAge",
        "pension",
        "housing",
        "savings",
        "homeValue",
        "mortgage",
        "mortgageYears",
        "mortgageRate",
      ]),
    );
  if (Number(p.children) === 0) p.childStage = "school";
  if (p.housing === "own") {
    p.rent = 0;
    if (Number(p.mortgage ?? 0) === 0) {
      delete p.mortgageYears;
      delete p.mortgageRate;
    }
  } else {
    p.homeValue = 0;
    p.mortgage = 0;
    delete p.mortgageYears;
    delete p.mortgageRate;
  }
  return p;
}
const REGION_PROSE = { metro: "都市部", city: "地方の中心都市", rural: "地方の町" };
// Narrative wording; residenceName keeps the selectable region label for UI.
function residenceProse(g) {
  const name = residenceName(g);
  return name === REGIONS[g.region].label ? REGION_PROSE[g.region] : name;
}
export function residenceName(g) {
  const moved = g.decisions.some((d) => decisionId(d) === "move");
  return !moved && g.region === g.profile.region && g.profile.municipality
    ? g.profile.municipality
    : REGIONS[g.region].label;
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
  const detail =
    raw.intent === undefined ? {} : { intent: str(raw.intent, 100) };
  if (raw.intent !== undefined && !detail.intent) fail();
  if (!["switch", "startup"].includes(id)) {
    if (id === "opportunity") return { ...validateDecision(id, g), ...detail };
    if (!detail.intent) fail();
    const result = { id, ...detail };
    if (["transfer", "internalVenture"].includes(id)) {
      const unit = str(raw.unit ?? "", 40);
      if (!unit) fail();
      result.unit = unit;
    } else if (raw.unit !== undefined) fail();
    if (id === "promote" && g.position.rank === "lead") {
      if (!["manager", "specialist"].includes(raw.track)) fail();
      result.track = raw.track;
    } else if (raw.track !== undefined) fail();
    if (id === "move" && raw.region !== undefined) {
      if (!Object.hasOwn(REGIONS, raw.region) || raw.region === g.region)
        fail();
      result.region = raw.region;
    }
    return result;
  }
  if (id === "startup") {
    if (
      typeof raw.venture !== "string" ||
      !Object.hasOwn(VENTURES, raw.venture)
    )
      fail();
    const name = str(raw.name, 60);
    if (!name || g.cash < VENTURES[raw.venture].setup) fail();
    return { id, venture: raw.venture, name, ...detail };
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
    // A move can be into a higher stage at another company (an executive
    // hire, for example), but at most one stage above the current one.
    let rank;
    if (raw.rank !== undefined) {
      if (typeof raw.rank !== "string" || !Object.hasOwn(RANKS, raw.rank)) fail();
      if (!switchRanks(g).includes(raw.rank)) fail();
      rank = raw.rank;
    }
    const generated = raw.proposal !== undefined;
    let proposal;
    if (generated) {
      proposal = str(raw.proposal, 300, true);
      if (
        !proposal ||
        facts ||
        !["real", "fictional"].includes(raw.candidateKind) ||
        (raw.candidateKind === "fictional" && g.year < 2036) ||
        !Object.hasOwn(WORK_MODELS, raw.workModel) ||
        name === g.employer.name
      )
        fail();
    }
    return {
      id,
      target: "custom",
      role: raw.role,
      name,
      companyType: raw.companyType,
      facts,
      ...(rank ? { rank } : {}),
      ...detail,
      ...(generated
        ? {
            proposal,
            candidateKind: raw.candidateKind,
            workModel: raw.workModel,
          }
        : {}),
    };
  }
  if (typeof raw.target !== "string" || !Object.hasOwn(LEGACY_EMPLOYERS, raw.target))
    fail();
  const c = LEGACY_EMPLOYERS[raw.target];
  if (g.year < (c.availableFrom ?? START_YEAR) || g.employer.id === raw.target)
    fail();
  return { id, target: raw.target, role: raw.role, ...detail };
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
  if (!["switch", "startup"].includes(decision.id)) return g.employer;
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
      kind: decision.candidateKind ?? "real",
      id: "custom",
      name: decision.name,
      role: decision.role,
      companyType: decision.companyType,
      facts: decision.facts,
      summary: decision.facts?.summary ?? "事業内容は未確認",
      ...(decision.proposal
        ? {
            proposal: decision.proposal,
            workModel: decision.workModel,
            unverifiedCandidate: decision.candidateKind === "real",
          }
        : {}),
    };
  const c = LEGACY_EMPLOYERS[decision.target];
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
  retirementFrom = 0,
  careLeaveSalaryFrom = 0,
  prepayFrom = 0,
  debtRepayFrom = 0,
  salaryCapFrom = 0,
  incidentFrom = 0,
  careerPathFrom = 0,
  careerEndFrom = 0,
  payRealismFrom = 0,
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
    worldFrom > MAX_AGE ||
    !Number.isInteger(retirementFrom) ||
    retirementFrom < 0 ||
    retirementFrom > MAX_AGE ||
    !Number.isInteger(careLeaveSalaryFrom) ||
    careLeaveSalaryFrom < 0 ||
    careLeaveSalaryFrom > MAX_AGE ||
    !Number.isInteger(prepayFrom) ||
    prepayFrom < 0 ||
    prepayFrom > MAX_AGE ||
    !Number.isInteger(debtRepayFrom) ||
    debtRepayFrom < 0 ||
    debtRepayFrom > MAX_AGE ||
    !Number.isInteger(salaryCapFrom) ||
    salaryCapFrom < 0 ||
    salaryCapFrom > MAX_AGE ||
    !Number.isInteger(incidentFrom) ||
    incidentFrom < 0 ||
    incidentFrom > MAX_AGE ||
    !Number.isInteger(careerPathFrom) ||
    careerPathFrom < 0 ||
    careerPathFrom > MAX_AGE ||
    !Number.isInteger(careerEndFrom) ||
    careerEndFrom < 0 ||
    careerEndFrom > MAX_AGE ||
    !Number.isInteger(payRealismFrom) ||
    payRealismFrom < 0 ||
    payRealismFrom > MAX_AGE
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
    retirementFrom,
    careLeaveSalaryFrom,
    prepayFrom,
    debtRepayFrom,
    salaryCapFrom,
    incidentFrom,
    careerPathFrom,
    careerEndFrom,
    payRealismFrom,
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
      workModel: p.workModel,
      facts: p.companyFacts,
      summary: p.companyFacts?.confirmed ? p.companyFacts.summary : "",
    },
    // The stage inside the current employer. Tenure counts from the game start
    // for the first employer, since earlier years are not entered.
    position: { rank: p.rank, unit: "", joined: START_YEAR, since: START_YEAR },
    careerMoves: 0,
    ended: false,
    history: [],
    scenes: {},
    reflections: {},
    careerSeen: {},
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
export function isRetiredAt(g) {
  return (
    g.retired ||
    (g.decisions.length >= (g.retirementFrom ?? 0) &&
      g.age >= g.profile.retirementAge)
  );
}
// Working for an employer (not self-employed, running a business, between
// jobs, studying or retired), so in-company career steps make sense.
export function inCompany(g) {
  return (
    !isRetiredAt(g) &&
    !["venture", "seeking"].includes(g.employer.kind) &&
    g.employer.companyType !== "self" &&
    !(
      g.employer.kind === "initial" &&
      ["student", "notWorking", "independent"].includes(g.profile.occupation)
    )
  );
}
export function availableChoices(g) {
  const retired = isRetiredAt(g);
  const ids = ["learn", "focus", "connect", "rest", "explore"];
  if (!retired) ids.push("switch");
  if (!retired && g.employer?.kind !== "venture" && g.cash >= 60)
    ids.push("startup");
  if (g.cash > 30) ids.push("invest");
  if (
    g.decisions.length >= g.prepayFrom &&
    g.mortgage > 0 &&
    g.cash > g.livingCost * 6
  )
    ids.push("prepay");
  if (
    g.housing === "rent" &&
    g.cash > homePrice(g.region) * 0.25 &&
    g.salary > 250 &&
    !retired
  )
    ids.push("home");
  if (g.housing === "rent") ids.push("move");
  if (g.decisions.length >= g.dynamicFrom) {
    if (!retired && g.employer.kind === "venture") {
      ids.push("closeBusiness");
      if (g.businessStage === "growing" && g.cash >= 100) ids.push("expand");
      if (g.businessStage === "setback") ids.push("pivot");
    } else if (!retired && g.employer.kind !== "seeking") {
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
  if (g.decisions.length >= g.careerPathFrom && worldEnabled(g) && inCompany(g)) {
    if (nextRank(g.position.rank)) ids.push("promote");
    ids.push("transfer");
    if (g.skill >= 30) ids.push("internalVenture");
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
    if (g.family.childAges.some((age) => age < 18) && !retired)
      ids.push("careLeave");
    if (
      !retired &&
      opportunityAt(g) &&
      randomAt(g.seed, g.decisions.length, 77) < 0.55
    )
      ids.push("opportunity");
  }
  if (!retired && g.age >= 45) ids.push("retire");
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
  if (allowed.includes("prepay")) contextual.unshift("prepay");
  if (g.employer.kind === "seeking" && allowed.includes("switch"))
    contextual.unshift("switch");
  // Two loss-making years in a row put withdrawal on the table even when the
  // years were narrated as customer traction.
  const losing =
    g.employer.kind === "venture" &&
    g.history.at(-1)?.outcome?.deficitYears >= 2 &&
    allowed.includes("closeBusiness");
  if (losing) contextual.unshift("closeBusiness");
  else if (
    g.employer.kind === "venture" &&
    g.businessStage === "setback" &&
    allowed.includes("closeBusiness")
  )
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
        ...(allowed.includes("prepay") ? ["prepay"] : []),
        career,
        ...(losing ? ["closeBusiness"] : []),
        moment,
        ...(g.decisions.length % 2 === 0 ? ["studyDaily"] : []),
        ...contextual,
        ...rotations[g.decisions.length % 3],
      ]),
    ]
      .filter(Boolean)
      .slice(0, 4);
  }
  return [
    ...new Set([...contextual, ...rotations[g.decisions.length % 3]]),
  ].slice(0, 4);
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
// Venture outcomes are drawn before the year's money is counted. Once the cash
// flow is known, reword them so a "success" never hides a loss or new borrowing,
// and so a long-running business is not narrated with the same sentence every
// year. Text only: kind, salaryFactor and extraCost stay unchanged, and the
// extra draw uses its own channel, so replayed saves give the same numbers.
// Applied to world-enabled years, like annualEpisode.
const VENTURE_PROSE = {
  success: [
    ["仕事が紹介され、事業に手応え。", "顧客との仕事に手応えがあった。"],
    ["前の顧客から、次の相談が届いた。", "続けてきた仕事を見て、声をかけてくれる人がいた。"],
    ["紹介が、紹介を呼んだ一年。", "知り合いの紹介から、新しい依頼が生まれた。"],
    ["任せたいと言われる仕事が増えた。", "顧客から、続けて頼みたいと言われる仕事があった。"],
  ],
  steady: [
    ["小さな受注を積み重ねた一年。", "事業を続け、運営費を払いながら顧客との関係を育てた。"],
    ["大きな変化のない、地道な一年。", "目立つ受注はなかったが、既存の顧客との仕事を丁寧に続けた。"],
    ["顧客と向き合い、足場を固めた。", "新しい顧客探しと、いまある仕事の両方に時間を使った。"],
  ],
  // Loss titles by outcome kind: [first loss year, continuing losses].
  loss: {
    success: [
      ["手応えはあるが、収支は赤字。", "顧客はついた。収支はまだ合わない。"],
      ["手応えはある。けれど、赤字が続く。", "顧客は増えても、収支はまだ合わない。", "評価と収支の間に、まだ距離がある。"],
    ],
    steady: [
      ["受注は続いたが、収支は赤字。", "地道な一年。収支はまだ赤字。"],
      ["受注を重ねても、赤字は埋まらない。", "続けてはいる。けれど、収支は苦しい。", "また赤字の一年。続け方が問われる。"],
    ],
  },
};
function venturePick(pool, g, recent, key = (x) => x) {
  let index = Math.floor(
    randomAt(g.seed, g.decisions.length, 93) * pool.length,
  );
  for (let n = 0; n < pool.length && recent.has(key(pool[index])); n++)
    index = (index + 1) % pool.length;
  return pool[index];
}
function narrateVentureYear(g, outcome, money) {
  if (!["success", "steady", "setback"].includes(outcome?.kind)) return outcome;
  const businessLoss =
    money.salary * 0.76 < money.businessOverhead + money.businessSetup;
  const deficit =
    businessLoss ||
    money.operating < 0 ||
    money.borrowing > 0 ||
    money.liquidation > 0;
  let deficitYears = deficit ? 1 : 0;
  if (deficit)
    for (const h of [...g.history].reverse()) {
      if (h.employer?.kind !== "venture" || !h.outcome?.deficit) break;
      deficitYears += 1;
    }
  const meta = {
    deficit,
    deficitYears,
    ...(deficit ? { deficitKind: businessLoss ? "business" : "household" } : {}),
  };
  // Setback prose already reports the loss; it only records the money result.
  if (outcome.kind === "setback") return { ...outcome, ...meta };
  const recent = new Set(
    g.history.slice(-2).flatMap((h) => [h.outcome?.title, h.outcome?.body]),
  );
  const pivoted = outcome.title.startsWith("方向転換");
  const [baseTitle, opening] = venturePick(
    VENTURE_PROSE[outcome.kind],
    g,
    recent,
    (entry) => entry[0],
  );
  const lossTitle = venturePick(
    VENTURE_PROSE.loss[outcome.kind][deficitYears >= 2 ? 1 : 0],
    g,
    recent,
  );
  const title = deficit && !pivoted ? lossTitle : pivoted ? outcome.title : baseTitle;
  const raised = money.salary > g.salary;
  let body = pivoted ? "方向を変えた事業に、新しい顧客がついた。" : opening;
  if (!deficit) {
    body +=
      outcome.kind === "success"
        ? raised
          ? "事業収入が伸び、手元の収支も保てた。広げる道も見えてきたが、運営の費用もかかる。次の一歩を選べる。"
          : "評価は得たが、収入は大きくは伸びていない。それでも手元の収支は保てた。広げるか、続け方を整えるかを選べる。"
        : "大きく広げる前に、次の一歩を考える。";
  } else {
    body += businessLoss
      ? "ただ、事業の収入は運営費に届かず、事業そのものは赤字だった。"
      : "ただ、事業の収入だけでは暮らしの支出をまかなえず、家計は赤字だった。";
    if (money.borrowing > 0)
      body += "足りない分は借入でつないだ。";
    else if (money.liquidation > 0)
      body += "足りない分は、株式を売って補った。";
    else if (money.operating < 0) body += "手元の現金が減った。";
    else body += "ほかの収入で家計は保てたが、事業だけでは成り立っていない。";
    body +=
      deficitYears >= 3
        ? `赤字の年は${deficitYears}年続いている。手応えだけを頼りに続けるのか、方向転換や撤退を本気で考えるのか、決める時期かもしれない。`
        : deficitYears === 2
          ? "赤字は2年続いた。続ける条件を決めておくか、方向転換や撤退も選択肢に入れたい。"
          : "手応えと収支は別のもの。続けるなら、どこで黒字にするかを考えたい。";
  }
  return { ...outcome, title, body, ...meta };
}
// Chance incidents: things that happen to a person regardless of the choice,
// like a difficult boss in a company that looked good, or a partner's layoff.
// The engine decides whether one happens, which one, and its mechanical
// effect, from the seed. The AI only writes the concrete situation.
// Annual rates are game assumptions, loosely informed by Japanese surveys on
// workplace harassment and mental-health leave; they are not predictions.
// `temporary` salary cuts (a leave, treatment) return the following year.
export const INCIDENTS = Object.freeze({
  difficultBoss: {
    kind: "work", tone: "hard", rate: 0.06,
    title: "上司やチームとの関係がこじれる",
    body: "仕事の進め方や評価をめぐって、上司やチームとの関係がぎくしゃくした。",
    effects: { health: -7, freedom: -3 },
  },
  harassment: {
    kind: "work", tone: "hard", rate: 0.02,
    title: "職場でハラスメントを受ける",
    body: "職場で、人格を否定するような言動や過大な要求が続いた。",
    effects: { health: -10, connection: -3 },
    // A share of cases lead to a mental-health leave of absence.
    severe: {
      share: 0.25,
      title: "ハラスメントで心身を崩し、休職する",
      body: "職場でのハラスメントが続き、心身の不調から休職することになった。",
      effects: { health: -20, connection: -3, salaryFactor: 0.7, temporary: true },
    },
  },
  burnout: {
    kind: "work", tone: "hard", rate: 0.004,
    title: "心身の不調で休職する",
    body: "働き続けた疲れが重なり、医師の勧めで一定期間休職することになった。",
    effects: { health: -15, salaryFactor: 0.7, temporary: true },
  },
  layoff: {
    kind: "work", tone: "hard", rate: 0.004,
    title: "勤務先の人員整理で職を失う",
    body: "勤務先が事業を縮小し、人員整理の対象になった。退職金と給付で当面をしのぐ。",
    effects: { health: -8, layoff: true },
  },
  goodTeam: {
    kind: "work", tone: "good", rate: 0.05,
    title: "信頼できる上司や仲間に恵まれる",
    body: "相談しやすい上司や、支え合える仲間と働けるようになった。",
    effects: { health: 6, skill: 2 },
  },
  bigRole: {
    kind: "work", tone: "good", rate: 0.025,
    title: "思いがけず大きな役割を任される",
    body: "これまでの仕事ぶりが目に留まり、想定より大きな役割を任された。",
    effects: { salaryFactor: 1.1, freedom: -2, skill: 2 },
  },
  reorg: {
    kind: "work", tone: "neutral", rate: 0.03,
    title: "組織再編で担当が変わる",
    body: "組織の再編で、担当する仕事や一緒に働く人が大きく変わった。",
    effects: { skill: 2, freedom: -3 },
  },
  partnerJobLoss: {
    kind: "life", tone: "hard", rate: 0.015,
    title: "パートナーが職を失う",
    body: "パートナーの勤め先で人員整理があり、家計と暮らしの見通しが変わった。",
    effects: { health: -5, extraCost: 80 },
  },
  illness: {
    kind: "life", tone: "hard", rate: 0.012,
    title: "病気やけがで治療が必要になる",
    body: "思いがけない病気やけがで、しばらく治療に時間を使うことになった。",
    effects: { health: -10, extraCost: 30, salaryFactor: 0.9, temporary: true },
  },
  parentCare: {
    kind: "life", tone: "hard", rate: 0.03,
    title: "親の介護が始まる",
    body: "親の体調が変わり、通院の付き添いや介護の段取りが暮らしに加わった。",
    effects: { freedom: -6, connection: 2, extraCost: 40 },
  },
  oldFriend: {
    kind: "life", tone: "good", rate: 0.02,
    title: "古い友人との再会が転機になる",
    body: "久しぶりに会った友人との話から、仕事や暮らしの新しい見方を得た。",
    effects: { connection: 6, freedom: 2 },
  },
  windfall: {
    kind: "life", tone: "good", rate: 0.008,
    title: "思わぬ臨時収入がある",
    body: "親族からの相続や思わぬ払い戻しなど、まとまったお金が入った。",
    effects: { extraCost: -100 },
  },
});
function incidentRates(g, choice, employer) {
  const working =
    !g.retired && g.age < g.profile.retirementAge && choice !== "retire" &&
    !["venture", "seeking"].includes(employer.kind) &&
    !(employer.kind === "initial" && ["student", "notWorking"].includes(g.profile.occupation));
  const world = worldAt(g, employer);
  const moved = choice === "switch";
  const downturn = world.economy.id === "downturn";
  const rates = {};
  if (working) {
    // A new workplace is a fresh draw of boss and team, good or bad.
    rates.difficultBoss = INCIDENTS.difficultBoss.rate * (moved ? 2 : 1);
    rates.harassment = INCIDENTS.harassment.rate * (moved ? 1.5 : 1);
    rates.burnout =
      INCIDENTS.burnout.rate * (g.health < 40 ? 2.5 : 1) * (choice === "focus" ? 1.3 : 1);
    if (!moved)
      rates.layoff =
        INCIDENTS.layoff.rate *
        (world.company.id === "pressure" ? 3 : 1) *
        (downturn ? 1.5 : 1) *
        (employer.companyType === "small" ? 1.3 : 1);
    rates.goodTeam = INCIDENTS.goodTeam.rate * (moved ? 1.5 : 1);
    if (choice !== "careLeave")
      rates.bigRole = INCIDENTS.bigRole.rate * clamp(g.skill / 60, 0.3, 1.6);
    rates.reorg = INCIDENTS.reorg.rate;
  }
  if (g.family.partner && g.age < 70)
    rates.partnerJobLoss = INCIDENTS.partnerJobLoss.rate * (downturn ? 2 : 1);
  rates.illness =
    INCIDENTS.illness.rate + (g.age >= 50 ? 0.012 : 0) + (g.age >= 65 ? 0.02 : 0);
  // Care for a parent begins once; it is not a new event every few years.
  if (g.age >= 45 && g.age <= 70 && !g.history.some((h) => h.incident?.id === "parentCare"))
    rates.parentCare = INCIDENTS.parentCare.rate;
  rates.oldFriend = INCIDENTS.oldFriend.rate;
  rates.windfall = INCIDENTS.windfall.rate;
  return rates;
}
// At most one incident a year. The roll, the pick and the severity use their
// own seeded channels, so the same seed and choices give the same life.
export function incidentAt(g, choice, employer = g.employer) {
  const i = g.decisions.length;
  if (i < g.incidentFrom || !worldEnabled(g)) return null;
  const rates = incidentRates(g, choice, employer);
  const total = Object.values(rates).reduce((a, b) => a + b, 0);
  if (randomAt(g.seed, i, 141) >= total) return null;
  let pick = randomAt(g.seed, i, 142) * total,
    id = Object.keys(rates).at(-1);
  for (const [key, rate] of Object.entries(rates)) {
    if (pick < rate) {
      id = key;
      break;
    }
    pick -= rate;
  }
  const base = INCIDENTS[id];
  const severe =
    base.severe && randomAt(g.seed, i, 143) < base.severe.share ? base.severe : null;
  const working = !g.retired && choice !== "retire";
  const effects = { ...(severe ?? base).effects };
  if (!working) delete effects.salaryFactor;
  return {
    id,
    kind: base.kind,
    tone: base.tone,
    severe: Boolean(severe),
    title: (severe ?? base).title,
    body: (severe ?? base).body,
    effects,
    chance: Math.round(rates[id] * (severe ? base.severe.share : base.severe ? 1 - base.severe.share : 1) * 10000) / 10000,
    yearChance: Math.round(total * 10000) / 10000,
  };
}
function yearlyOutcome(g, choice, employer, decision = null) {
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
  if (["promote", "transfer", "internalVenture"].includes(choice)) {
    // The odds are game assumptions: ability, time in the stage, the
    // employer's situation and relationships, never a real company's rules.
    const world = worldAt(g, employer),
      firm = { growing: 1.15, stable: 1, pressure: 0.7 }[world.company.id] ?? 1,
      inRank = g.year - g.position.since,
      level = RANKS[g.position.rank].level;
    const target = nextRank(g.position.rank, decision?.track);
    // Promotion needs both merit and luck: a seat above must open, and fewer
    // open the higher it goes, so most people stay long at a middle stage.
    // A good or difficult boss last year tilts the odds.
    const lastIncident = g.history.at(-1)?.incident?.id;
    const backing = ["goodTeam", "bigRole"].includes(lastIncident)
      ? 1.4
      : ["difficultBoss", "harassment"].includes(lastIncident)
        ? 0.5
        : 1;
    const seat =
      choice === "promote" && target
        ? clamp(
            { lead: 1, manager: 0.25, specialist: 0.32, director: 0.1, principal: 0.12 }[target] *
              (target === "lead" ? 1 : { growing: 1.3, stable: 1, pressure: 0.6 }[world.company.id] ?? 1),
            0,
            1,
          )
        : 1;
    const seatOpen = randomAt(g.seed, g.decisions.length, 151) < seat;
    const merit =
      choice === "promote"
        ? clamp(
            ability *
              (inRank >= [2, 3, 4][level] ? 1 : 0.35) *
              [1, 0.6, 0.45][level] *
              backing,
            0.04,
            0.7,
          )
        : 1;
    const chance =
      choice === "promote"
        ? seat * merit
        : choice === "transfer"
          ? clamp(0.45 + g.connection * 0.003 + g.skill * 0.002, 0.3, 0.8)
          : clamp(ability * 0.7 * firm, 0.15, 0.55);
    const success = choice === "promote" ? seatOpen && roll < merit : roll < chance;
    const text = {
      promote: success
        ? [`${RANKS[target].label}に昇格した。`, "評価が認められ、任される範囲と責任が広がった。収入とともに、時間や気持ちの負担も変わる。"]
        : !seatOpen
          ? ["上の席が空かず、昇格は見送られた。", "評価とは別に、上の役職の席には限りがある。今年は空きがなかった。多くの人がこの段階で長く働き、別の形で力を発揮している。"]
          : ["昇格は今回は見送られた。", "評価は伸び悩んだ。何が足りなかったかを確かめ、もう一度挑むか、別の道を考えられる。"],
      transfer: success
        ? ["希望した仕事へ社内で移った。", "同じ会社の中で新しい役割に就いた。これまでの人間関係を生かしながら、慣れない仕事を覚えていく。"]
        : ["異動の希望は今回は通らなかった。", "希望は伝わったが、今回は実現しなかった。今の仕事を続けながら次の機会を待てる。"],
      internalVenture: success
        ? ["社内の新しい事業に加わった。", "会社に残りながら、新しい事業づくりに関わることになった。手応えも不確かさも大きい。"]
        : ["社内公募には選ばれなかった。", "選考には通らなかったが、提案をまとめた経験と社内のつながりは残った。"],
    }[choice];
    return {
      kind: success ? "success" : "setback",
      chance,
      title: text[0],
      body: text[1],
      salaryFactor: success
        ? choice === "promote"
          ? [1.1, 1.2, 1.25][RANKS[target].level - 1] ?? 1.1
          : choice === "internalVenture"
            ? 1.04
            : 1
        : 1,
      extraCost: 0,
      ...(success && choice === "promote" ? { promotion: target } : {}),
      ...(success && choice !== "promote"
        ? { unit: decision?.unit ?? (choice === "transfer" ? "希望した部署" : "社内の新規事業") }
        : {}),
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
    const steppingUp =
      choice === "switch" &&
      decision?.rank &&
      RANKS[decision.rank].level > RANKS[g.position?.rank ?? "unspecified"].level;
    const success = roll < ability * (steppingUp ? 0.75 : 1);
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
        "学んだ力を、仕事に生かす手応えが生まれた。",
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
        ? "働き方と暮らしのペースを、整える一年に。"
        : ({
            invest: "お金の置き場所を、見直した。",
            prepay: "手元の備えを残し、ローンを見直した。",
            home: "住まいを買い、暮らしの土台を整えた。",
            move: "暮らす場所を、変える一年に。",
            connect: "これからの働き方と、人との時間を考えた一年。",
            retire: "仕事に区切りをつけ、次の暮らしへ。",
            careLeave: "家族のために、働く時間を調整した。",
          }[choice] ?? "これからの働き方と暮らしを、選ぶ一年に。"),
    body: "選んだ行動が家計やゆとり、人との関係に反映された。働き方と暮らしをどう続けるか、次の一年を考える。",
    salaryFactor: 1,
    extraCost: 0,
  };
}
const homePrice = (region) =>
  ({ metro: 4500, city: 3000, rural: 2000 })[region];
// Annual salary (万円) at which raises clearly level off in a regional city.
const SALARY_CEILINGS = Object.freeze({
  tech: 1400,
  marketing: 1100,
  office: 1000,
  creative: 1000,
  people: 1100,
  care: 750,
  physical: 750,
  independent: 1600,
  other: 650,
});
// The same level-off points with realistic pay (2026-10-20): close to the
// Japanese wage statistics for staff in a regional city. Stages, region and
// company size lift them less than before.
const REALISTIC_CEILINGS = Object.freeze({
  tech: 850,
  marketing: 750,
  office: 620,
  creative: 650,
  people: 700,
  care: 480,
  physical: 520,
  independent: 1100,
  other: 480,
});
// Soft ceiling for one employer: raises shrink above half of it and are
// nearly gone at twice it. Losses are never damped, so variance remains.
export function salaryCeiling(g, employer = g.employer) {
  if (payRealism(g))
    return Math.round(Math.max(
      REALISTIC_CEILINGS[employer.role] *
        { metro: 1.2, city: 1, rural: 0.88 }[g.region] *
        ({ large: 1.1, small: 0.92, public: 0.95, self: 1.05 }[employer.companyType] ?? 1) *
        (employer.kind === "venture" ? 1.8 : 1) *
        (employer.kind === "venture" ? 1 : [1, 1.12, 1.3, 1.5][RANKS[g.position?.rank]?.level ?? 0]),
      g.profile.income * 1.15,
    ));
  const base =
    SALARY_CEILINGS[employer.role] *
    { metro: 1.2, city: 1, rural: 0.85 }[g.region] *
    ({ large: 1.15, small: 0.9, public: 0.9, self: 1.1 }[employer.companyType] ??
      1) *
    (employer.kind === "venture" ? 2 : 1) *
    // A higher stage raises the ceiling, so a promotion is not damped away.
    (employer.kind === "venture"
      ? 1
      : [1, 1.1, 1.25, 1.45][RANKS[g.position?.rank]?.level ?? 0]);
  return Math.round(Math.max(base, g.profile.income * 1.3));
}
// Only raises are damped. Each factor below 1 (negative growth, care leave)
// is applied in full, so a loss or a later restoration never cancels a cut and
// slips past the damping. The ratio uses full-time pay after care leave.
function cappedSalary(g, employer, base, factors, transition, restore) {
  const ratio = (base * restore) / salaryCeiling(g, employer);
  const realism = payRealism(g),
    start = 0.5;
  // Pay peaks in the mid-50s: raises slow from 50 and nearly stop after 55.
  const damp = (ratio <= start ? 1 : Math.exp(-3 * (ratio - start))) *
    (!realism ? 1 : g.age >= 55 ? 0.15 : g.age >= 50 ? 0.5 : 1);
  const merit = factors.reduce((m, f) => m * Math.max(f, 1), 1),
    cut = factors.reduce((m, f) => m * Math.min(f, 1), 1);
  return clamp(
    base * (1 + (merit - 1) * damp) * cut * transition * restore,
    0,
    20000,
  );
}
export function mortgagePayment(balance, rate, years) {
  if (balance <= 0) return 0;
  const r = rate / 100 / 12,
    n = Math.max(1, years * 12);
  // Keep ordinary-rate arithmetic identical when replaying existing saves.
  if (r >= 1e-9) return (balance * r) / (1 - (1 + r) ** -n);
  return r < Number.EPSILON
    ? balance / n
    : (balance * r) / -Math.expm1(-n * Math.log1p(r));
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
    if (!o || !allowed.includes(o.id)) fail();
    const decision =
      o.decision === undefined ? null : validateDecision(o.decision, g);
    if (
      decision &&
      decisionId(decision) !== o.id &&
      !(o.id === "opportunity" && decisionId(decision) === "startup")
    )
      fail();
    const key =
      decision && ["switch", "startup"].includes(o.id)
        ? JSON.stringify([
            o.id,
            decision.target,
            decision.name,
            decision.venture,
            decision.role,
          ])
        : o.id;
    if (seen.has(key)) fail();
    seen.add(key);
    return {
      id: o.id,
      label: str(o.label, 50),
      hint: str(o.hint, 100),
      ...(o.reason === undefined ? {} : { reason: str(o.reason, 100) }),
      ...(decision ? { decision } : {}),
    };
  });
  if (options.some((o) => !o.label) || !raw.title || !raw.body) fail();
  return {
    title: str(raw.title, 100),
    body: str(raw.body, 1400, true),
    insight: str(raw.insight ?? "", 300, true),
    options,
  };
}
export function validateGeneratedScene(
  raw,
  g,
  { personalized = true, mode = "life" } = {},
) {
  if (!personalized) {
    if (raw?.options?.some((o) => o.decision !== undefined)) fail();
    return validateScene(raw, g);
  }
  if (!raw || !Array.isArray(raw.options) || raw.options.length !== 4)
    throw new Error(
      "AIの返答は、実行できる4択である必要があります。自動再試行はしません。",
    );
  const options = raw.options.map((o) => {
    if (!o || !str(o.reason, 100)) fail();
    let decision = o.decision ?? { id: o.id, intent: o.label };
    // Normalized API scenes contain facts:null. It asserts no evidence and can
    // safely round-trip through manual exchange; actual AI evidence is rejected.
    if (decision && typeof decision === "object" && decision.facts === null) {
      const { facts, ...withoutFacts } = decision;
      decision = withoutFacts;
    }
    const fields = [
      "id",
      "intent",
      ...(o.id === "switch"
        ? [
            "target",
            "name",
            "role",
            "companyType",
            "candidateKind",
            "workModel",
            "proposal",
            "rank",
          ]
        : o.id === "startup"
          ? ["venture", "name"]
          : o.id === "move"
            ? ["region"]
            : ["transfer", "internalVenture"].includes(o.id)
              ? ["unit"]
              : o.id === "promote"
                ? ["track"]
                : []),
    ];
    if (
      !decision ||
      typeof decision !== "object" ||
      Array.isArray(decision) ||
      Object.keys(decision).some((k) => !fields.includes(k))
    )
      fail();
    const fieldLeak =
      /target\s*:\s*custom|["\\](?:intent|target|role|workModel|companyType|candidateKind)["\\]*\s*:/iu;
    if (
      [o.label, o.hint, o.reason, decision.intent, decision.proposal].some(
        (value) => typeof value === "string" && fieldLeak.test(value),
      )
    )
      fail();
    if (
      decision.id === "switch" &&
      decision.target === "custom" &&
      (!decision.proposal || !decision.candidateKind || !decision.workModel)
    )
      fail();
    if (
      decision.id === "switch" &&
      employerKey(decision.name ?? LEGACY_EMPLOYERS[decision.target]?.name ?? "") ===
        employerKey(g.employer.name)
    )
      fail();
    if (
      decision.id === "switch" &&
      decision.candidateKind === "real" &&
      /^(?:未公開|未定|未確認|不明|非公開|匿名|架空)|^(?:大手|中小|某).*(?:企業|会社|部門|推進部)$|^(?:AI|技術|地域|一般的な|新興)?スタートアップ$|企業$/u.test(
        decision.name ?? "",
      )
    )
      fail();
    // AI may propose an employer, never mark its invented facts as verified.
    return { ...o, decision };
  });
  const scene = validateScene({ ...raw, options }, g);
  // While working for an employer, staying and building a career there is
  // always one of the four paths, next to moving, learning and living.
  if (
    mode === "life" &&
    g.decisions.length >= g.careerPathFrom &&
    worldEnabled(g) &&
    inCompany(g) &&
    !scene.options.some((o) => STAY_ACTIONS.includes(o.id))
  )
    fail();
  if (mode === "career") {
    const moves = scene.options.filter((o) => o.id === "switch");
    const stay = scene.options.filter(
      (o) => o.id === (g.employer.kind === "seeking" ? "rest" : "focus"),
    );
    const names = moves.map((o) =>
      employerKey(o.decision.name ?? LEGACY_EMPLOYERS[o.decision.target]?.name ?? ""),
    );
    const currentName = employerKey(g.employer.name);
    if (
      isRetiredAt(g) ||
      moves.length !== 3 ||
      stay.length !== 1 ||
      new Set(names).size !== 3 ||
      names.includes(currentName) ||
      names.some((n) => !n)
    )
      fail();
    const background = workContext(g).model;
    if (
      ["product", "services", "inhouse", "public"].includes(background) &&
      !moves.some((o) => o.decision.workModel === background)
    )
      fail();
  }
  return scene;
}
export function applyScene(g, scene) {
  if (g.ended) fail();
  return {
    ...g,
    scenes: { ...g.scenes, [sceneKey(g)]: validateScene(scene, g) },
  };
}

// Local personalization is deliberately bounded: a keyword is a topic in the
// player's memo, never evidence of proficiency, employment or a completed act.
const NOTE_TOPICS = [
  [
    "cloud",
    /\b(?:aws|azure|gcp|iac|terraform)\b|クラウド/iu,
    "クラウド・基盤",
    "小さな検証環境で構成を比べる",
  ],
  [
    "reliability",
    /\b(?:sre|devops|observability|kubernetes|k8s)\b|監視|可観測性|運用/iu,
    "運用・信頼性",
    "日々の運用で手間のかかる作業を見直す",
  ],
  [
    "security",
    /\bsecurity\b|セキュリティ|情報保護/iu,
    "セキュリティ",
    "守りたい情報と道具に任せる範囲を整理する",
  ],
  [
    "data",
    /\b(?:sql|python|analytics)\b|データ分析|データ基盤|機械学習/iu,
    "データの活用",
    "身近なデータから問いを一つ確かめる",
  ],
  [
    "marketing",
    /\b(?:marketing|seo|crm)\b|マーケティング|広報|広告|集客/iu,
    "顧客理解・発信",
    "伝え方を変えた小さな案を比較する",
  ],
  [
    "design",
    /\b(?:ux|ui|design)\b|デザイン|プロダクト|自社サービス/iu,
    "サービス・体験づくり",
    "使う人の困りごとを小さな試作にする",
  ],
  [
    "language",
    /英語|英会話|海外|グローバル|\benglish\b/iu,
    "英語・海外との接点",
    "異なる言葉で仕事の説明を組み立てる",
  ],
  [
    "management",
    /マネジメント|育成|リーダー|管理職|組織づくり/iu,
    "チーム・育成",
    "仕事の分け方と伝え方を考える",
  ],
  [
    "agriculture",
    /農業|農園|農作物|就農/iu,
    "農業・地域の食",
    "地域の食に関わる小さな困りごとを調べる",
  ],
  [
    "creative",
    /ゲーム制作|ゲーム開発|イラスト|執筆|映像|創作/iu,
    "創作・作品づくり",
    "作りたい作品を小さな形にしてみる",
  ],
  [
    "ai",
    /\b(?:ai|llm|fde)\b|生成ＡＩ|生成AI|人工知能/iu,
    "AIの活用",
    "AIに任せる作業と自分で確かめる部分を分ける",
  ],
];
const excerpt = (text, limit = 72) => {
  const value = String(text ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  return value.length > limit ? value.slice(0, limit - 1) + "…" : value;
};
export function profileStoryContext(g, { action = null, intention = "" } = {}) {
  const p = g.profile,
    turn = g.decisions.length,
    threads = [];
  const add = (id, source, label, detail, lines, actions, category = "life") =>
    threads.push({ id, source, label, detail, lines, actions, category });
  const clauses = p.careerNotes.split(/[。！？;；\n]/u).filter(Boolean);
  const topics = NOTE_TOPICS.filter(([, pattern]) =>
    clauses.some(
      (clause) =>
        pattern.test(clause) &&
        !/(?:使いたくない|興味(?:が|は)?ない|希望しない|避けたい|やりたくない|不要)/u.test(
          clause,
        ),
    ),
  );
  for (const [id, pattern, topic, practice] of topics) {
    const evidence = clauses.find(
      (clause) =>
        pattern.test(clause) &&
        !/(?:使いたくない|興味(?:が|は)?ない|希望しない|避けたい|やりたくない|不要)/u.test(
          clause,
        ),
    );
    add(
      `note-${id}`,
      "careerNotes",
      `メモのテーマ：${topic}`,
      excerpt(evidence, 110),
      [
        `メモに書いた「${topic}」を、次の一歩にどうつなげよう。${practice}ところからなら、始められるだろうか。`,
        `「${topic}」というテーマを見返す。${practice}時間を取るか、今ある課題を先に片づけるか。`,
        `気になっていた「${topic}」。${practice}案と、暮らしに余裕を残す案を比べてみたい。`,
      ],
      {
        studyDaily: `${topic}を毎日1時間学ぶ`,
        learn: `${topic}の小さな課題を学ぶ`,
        pilot: `${topic}を仕事で小さく試す`,
        focus: `${topic}に関わる課題を一つ進める`,
        explore: `${topic}で小さな挑戦をする`,
        connect: `${topic}に関わる人と話す`,
        switch: `${topic}と接点のある働き先を比べる`,
        mentor: `${topic}を人に伝える機会を作る`,
      },
      "work",
    );
    threads.at(-1).practice = practice;
  }
  if (p.careerNotes && !topics.length)
    add(
      "note-free",
      "careerNotes",
      "職歴・希望のメモ",
      excerpt(p.careerNotes, 120),
      [
        `書き留めた「${excerpt(p.careerNotes, 58)}」というメモ。今の仕事や暮らしの中で、小さく確かめるなら何から始めよう。`,
        `「${excerpt(p.careerNotes, 58)}」というメモを、もう一度開いた。すぐに結論を出すか、誰かと話してみるか。`,
        `メモの「${excerpt(p.careerNotes, 58)}」を今の暮らしと照らす。学ぶ時間と、試す時間を分けて考えてみたい。`,
      ],
      {
        explore: "メモの希望を、小さな挑戦で確かめる",
        learn: "メモをもとに、次に学ぶ課題を探す",
        connect: "職歴や希望のメモをもとに人と話す",
      },
      "work",
    );
  if (
    g.employer.kind === "initial" &&
    (p.occupation || p.industry || p.jobDetail)
  ) {
    const occupation = OCCUPATIONS[p.occupation]?.label ?? JOBS[p.job].label;
    const industry = PROFILE_INDUSTRIES[p.industry];
    const detail = [occupation, industry, p.jobDetail]
      .filter(Boolean)
      .join(" / ");
    add(
      "work-detail",
      "profile.occupation,industry,jobDetail",
      "入力した仕事と業界",
      detail,
      [
        `入力した仕事の背景は「${detail}」。この分野で大切にしたいことと、新しく学ぶことを考えてみる。`,
        `「${detail}」という現在地を見返す。同じ分野を深める道と、違う現場で試す道のどちらに時間を使おう。`,
        `仕事のメモ「${detail}」から、次に小さく試せることを探す。今ある暮らしの予定も、並べて考えたい。`,
      ],
      {
        learn: `${occupation}に関わる課題を一つ学ぶ`,
        explore: `${industry ?? occupation}で小さな試みを考える`,
        connect: "仕事と暮らしの希望を人と話す",
      },
      "work",
    );
  }
  const facts = g.employer.facts;
  if (
    facts?.confirmed &&
    facts.summary &&
    !g.retired &&
    g.employer.kind !== "seeking"
  )
    add(
      "company",
      "employer.facts",
      "確認した勤務先の事業",
      `${g.employer.name}：${excerpt(facts.summary, 110)}`,
      [
        `確認した${g.employer.name}の事業は「${excerpt(facts.summary, 90)}」。この背景と、自分の関心が重なる仕事を考えてみたい。`,
        `${g.employer.name}の事業「${excerpt(facts.summary, 90)}」を見返す。同じ場所で役割を深める道と、経験を別の場所で使う道がある。`,
        `勤務先について確認した「${excerpt(facts.summary, 90)}」という事業の背景。自分が関わるなら、何を大切にしたいだろう。`,
      ],
      {
        focus: "勤務先の事業と自分の役割をつなぐ",
        pilot: "事業の背景に合う小さな改善を試す",
      },
      "work",
    );
  if (g.family.childAges.length) {
    const ages = g.family.childAges,
      young = ages.some((age) => age < 6),
      minor = ages.some((age) => age < 18);
    add(
      "children",
      "family.childAges",
      "現在の子どもと暮らし",
      `${ages.length}人（${ages.join("・")}歳）`,
      [
        `子ども${ages.length}人は${ages.join("・")}歳。${young ? "日々の世話と、自分が学ぶ時間をどう分けよう。" : minor ? "学校生活や成長に向き合う時間と、仕事の予定をどう両立しよう。" : "それぞれの暮らしを尊重しながら、会う時間や自分の仕事を考えたい。"}`,
        `子どもは${ages.join("・")}歳になった。${minor ? "以前と同じ予定の組み方でよいか、仕事と家族の時間を並べてみる。" : "子育ての頃と違う距離で、家族との関わり方と自分の働き方を考える。"}`,
        `子ども${ages.length}人との時間も、この一年にある。${young ? "短い学びの時間を毎日に入れるか、まず暮らしを整えるか。" : "自分の挑戦と家族の予定に、どのくらいの余裕を残そう。"}`,
      ],
      {
        connect: minor
          ? "子どもとの時間を予定に入れる"
          : "成人した子どもと話す時間を作る",
        careLeave: "子どもの今の年代に合わせ仕事を抑える",
        rest: "家族の予定の間に休む時間を確保する",
      },
    );
  } else if (p.household === "care")
    add(
      "care",
      "profile.household",
      "ケアのある暮らし",
      "育児やケアとの両立を入力",
      [
        "ケアのある暮らしでは、自分だけで予定を決められない日もある。学びや仕事に使う時間を、無理なく確保できるだろうか。",
        "仕事以外に担うことも、同じ予定表にある。誰かと分担を相談する時間も必要そうだ。",
        "ケアと自分の挑戦を、どちらも続けられる形にしたい。今のペースを見つめ直してみる。",
      ],
      {
        connect: "ケアとの両立や分担を相談する",
        rest: "ケアと仕事の間に休む時間を作る",
      },
    );
  else if (g.family.partner)
    add(
      "partner",
      "family.partner",
      "パートナーとの暮らし",
      "現在のゲーム内の関係",
      [
        "パートナーとの暮らしにも、互いの予定がある。働き方を変える前に、どんな一年にしたいか話してみたい。",
        "自分の挑戦に使う時間と、共に過ごす時間。今の分け方が合っているか、相談してみようか。",
        "次の働き方を考えると、ふたりの暮らしの予定も浮かぶ。仕事以外の希望にも耳を傾けたい。",
      ],
      { connect: "パートナーと来年の時間の使い方を話す" },
    );
  if (
    g.family.desired !== null &&
    g.family.desired > g.family.childAges.length &&
    g.age <= 65
  )
    add(
      "family-wish",
      "family.desired",
      "これからの家族の希望",
      `希望は合計${g.family.desired}人、現在${g.family.childAges.length}人`,
      [
        `家族は合計${g.family.desired}人の子どもを迎えたいという希望がある。叶う時期は決まらないが、今の働き方や支えを考えることはできる。`,
        `子どもの希望は合計${g.family.desired}人。仕事だけでなく、暮らしの支えをどう整えるかも考えてみたい。`,
        "これから迎えたい家族の希望を見返した。急いで決めず、暮らしの準備と自分の仕事を並べて考える。",
      ],
      {
        familyPlan: "希望する家族を迎える準備を進める",
        connect: "これからの家族と支援について相談する",
      },
    );
  if (g.housing === "own")
    add(
      "housing",
      "housing,mortgage",
      "持ち家と住居費",
      g.mortgage > 0
        ? `住宅ローン残高 約${Math.round(g.mortgage)}万円`
        : "住宅ローン残高なし",
      [
        `持ち家の${g.mortgage > 0 ? "ローン返済と維持費" : "維持や手入れ"}は、働き方を変えた後も続く。新しい挑戦に使う時間と、暮らしの余裕を両方残したい。`,
        `帰る家を持つ安心と、${g.mortgage > 0 ? "返済を続ける負担" : "維持する責任"}。収入が揺れる選択の前に、手元資金を確かめておきたい。`,
        `${g.mortgage > 0 ? "住宅ローンを返済し、" : ""}住まいを維持しながら、どんな仕事を続けたいだろう。大きく変える前に、小さく試す道もありそうだ。`,
      ],
      {
        prepay: "生活の備えを残し、ローンの元金を減らす",
        explore: "住居費を確かめながら小さく挑戦する",
        rest: "住まいの手入れと休む時間を作る",
      },
    );
  else
    add(
      "housing",
      "housing,rent,region",
      "賃貸等の住まいと地域",
      `${residenceName(g)}・住居費 月${g.rent}万円`,
      [
        `住居費は月${g.rent}万円。${residenceProse(g)}で暮らし続ける道と、別の地域で仕事と生活を組み直す道を考えてみる。`,
        `今の住まいの費用を払いながら、新しいことに使える時間を考える。住む場所を変えたら、暮らしのペースも変わるだろうか。`,
        `${residenceProse(g)}の暮らしにも慣れた。働く場所と住む場所を、一緒に考え直すこともできそうだ。`,
      ],
      { move: "住居費と仕事から、暮らす地域を変える" },
    );
  const tight = g.cash < g.livingCost * 6;
  add(
    "finances",
    "cash,investments,debt",
    tight ? "手元資金の余裕" : "資産の持ち方",
    `現金 約${Math.round(g.cash)}万円・株式等 約${Math.round(g.investments)}万円${g.debt > 0 ? `・借入 約${Math.round(g.debt)}万円` : ""}`,
    [
      tight
        ? "手元現金は生活費の半年分を下回る。学びや挑戦をするにしても、まず日々を続けられる形を考えたい。"
        : g.investments > 0
          ? "資産の一部は株式等で持っている。価格が動くお金と、すぐに使える現金を分けて、仕事を変える余地を考える。"
          : "大きく働き方を変える前に、手元の現金で暮らしをどれだけ支えられるか見ておきたい。",
      g.debt > 0
        ? `${g.decisions.length >= g.debtRepayFrom ? "借入の返済も続いている。" : "借入が残っている。"}次の選択の費用だけでなく、毎日の支出も含めて考えたい。`
        : "収入だけでなく、手元に残る余裕も選択を左右する。今すぐ広げるか、小さく始めるか。",
      "挑戦に使うお金と、暮らしのために残すお金。次の一歩の前に、その配分を見直してみる。",
    ],
    tight
      ? { recover: "手元資金と生活のペースを立て直す" }
      : {
          invest: "現金の余裕を見て、株式等へ一部を移す",
          explore: "生活の余裕を残し、小さな挑戦をする",
        },
  );
  if (g.retired || g.age >= p.retirementAge - 5)
    add(
      "retirement",
      "profile.retirementAge,pension",
      "仕事の区切りと、その後",
      g.retired
        ? `仕事を離れた現在・65歳以降の年間収入の設定${p.pension}万円`
        : `入力した退職の目安${p.retirementAge}歳`,
      [
        g.retired
          ? "仕事を離れた今、給与に代わる収入と資産を使う日々になった。働く中で培った経験やつながりを、その先の暮らしにどう生かそう。"
          : `${p.retirementAge}歳を仕事の区切りの目安にしている。収入だけでなく、その先に続けたいことも少しずつ考えておきたい。`,
        "仕事の時間が変わると、会う人や一日の過ごし方も変わる。次の暮らしで続けたいことを考える。",
        "これまでの経験を誰かに伝える道と、自分のために新しいことを学ぶ道。時間の使い方を選び直せる。",
      ],
      {
        connect: "仕事の外にも人とのつながりを作る",
        learn: "これからの暮らしで楽しむことを学ぶ",
        rest: "自分のペースで休む時間を確保する",
      },
    );
  const work = threads.filter(
    (t) =>
      t.category === "work" && (!action || Object.hasOwn(t.actions, action)),
  );
  const life = threads.filter(
    (t) =>
      t.category === "life" && (!action || Object.hasOwn(t.actions, action)),
  );
  let primary = work[turn % Math.max(1, work.length)];
  if (g.retired) primary = threads.find((t) => t.id === "retirement");
  else if (tight) primary = threads.find((t) => t.id === "finances");
  if (action && intention) {
    const exact = threads.find((t) => t.actions[action] === intention);
    const subject = NOTE_TOPICS.find(([, pattern]) => pattern.test(intention));
    const topic =
      subject &&
      threads.find(
        (t) =>
          t.id === `note-${subject[0]}` && Object.hasOwn(t.actions, action),
      );
    // Multi-year progress keeps the subject of the player's actual policy.
    primary = exact ?? topic ?? primary;
  }
  // Cycle the whole list: alternating even/odd subsets can permanently skip a
  // housing or family thread when the list happens to have an even length.
  const secondary = life[turn % Math.max(1, life.length)];
  const focus = [...new Set([primary, secondary].filter(Boolean))];
  if (!focus.length) focus.push(threads.find((t) => t.id === "housing"));
  return {
    method: "local-rules-v1",
    noteInterpretation:
      "キーワードで話題を拾う処理。自由文全体の意味・経験・能力は推定しない。",
    threads,
    focus,
  };
}
function profileOptions(g, options, context) {
  const allowed = availableChoices(g),
    assigned = new Map(),
    protectedIDs = new Set([
      "pivot",
      "expand",
      "recover",
      "closeBusiness",
      "negotiate",
      "prepay",
      ...(g.employer.kind === "seeking" ? ["switch"] : []),
      g.history.at(-1)?.episode?.sideAction,
    ]);
  for (const thread of context.focus) {
    const present = options.find(
      (o) =>
        Object.hasOwn(thread.actions, o.id) &&
        !assigned.has(o.id) &&
        o.id !== g.history.at(-1)?.episode?.sideAction,
    );
    if (present) {
      assigned.set(present.id, thread);
      protectedIDs.add(present.id);
      continue;
    }
    const id = Object.keys(thread.actions).find(
      (key) => allowed.includes(key) && !options.some((o) => o.id === key),
    );
    const index = options.findLastIndex((o) => !protectedIDs.has(o.id));
    if (id && index >= 0) {
      options[index] = { id, label: CHOICES[id].label, hint: CHOICES[id].hint };
      assigned.set(id, thread);
      protectedIDs.add(id);
    }
  }
  return options.map((option) => {
    if (option.id === g.history.at(-1)?.episode?.sideAction) return option;
    const thread =
      assigned.get(option.id) ??
      [...context.focus, ...context.threads].find((t) =>
        Object.hasOwn(t.actions, option.id),
      );
    if (!thread) return option;
    const label = thread.actions[option.id];
    return {
      ...option,
      label,
      reason: excerpt(`${thread.label}：${thread.detail}`, 96),
      profileThread: thread.id,
      ...(!["switch", "startup", "opportunity"].includes(option.id)
        ? { decision: { id: option.id, intent: label } }
        : {}),
    };
  });
}
export function eventFor(g) {
  const cached = g.scenes[sceneKey(g)];
  if (cached) return { ...cached, generated: true };
  let options = suggestedChoices(g).map((id) => ({
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
  const side = g.history.at(-1)?.episode;
  if (side?.sideAction && availableChoices(g).includes(side.sideAction)) {
    const option = {
      id: side.sideAction,
      label: side.sideLabel,
      hint: CHOICES[side.sideAction].hint,
    };
    const index = options.findIndex((o) => o.id === side.sideAction);
    if (index >= 0) options[index] = option;
    else options[options.length - 1] = option;
  }
  const last = decisionId(g.decisions.at(-1)),
    company = workplaceName(g.employer);
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
        ? "働いた年月を、その先の暮らしへ。"
        : "仕事で得たものと、その先の毎日。";
    body = `${g.age}歳。${residenceProse(g)}で、${g.housing === "own" ? "持ち家を手入れしながら" : "住まいの費用を払いながら"}暮らしている。給与に代わる収入と、これまでの資産をどう使うか。仕事で培った経験やつながりと、新しい楽しみにも目を向けたい。`;
  } else if (g.employer.kind === "seeking") {
    title = "経験を持って、次の一歩を探す。";
    body = `${g.employer.lastSalary ? "人員整理で職を離れ、次の仕事を探している" : "事業を終え、暮らしと仕事を組み直している"}。手元現金は約${Math.round(g.cash)}万円。これまでの経験を別の企業で生かすか、まず生活のペースを整えるか。収入と支出の変化を確かめながら、次の選択を考える。`;
  } else if (g.employer.kind === "venture") {
    title = `${company}を、自分の手で育てる。`;
    body = `${company}では、${g.employer.summary}という架空の事業で、${g.year - g.employer.started}年目に入った。顧客を探し、運営費を払いながら、自分の仕事をつくる。${technologyAt(g) > 0.5 ? "AIが広く使われる世界では、効率化だけでなく選ばれる理由も必要になっている。" : "AIを試しながら、任せる部分と自分で担う部分を見極めたい。"}手元の現金は約${Math.round(g.cash)}万円。${
      g.history.at(-1)?.outcome?.deficit
        ? g.history.at(-1).outcome.deficitYears >= 2
          ? "赤字の年が続き、借入や貯えの減り方も気になる。続ける条件、方向転換、撤退をどう比べよう。"
          : "去年は収支が赤字だった。手応えを、どうやって収入に変えよう。"
        : "収入の変動と暮らしを両立するには、どこへ時間を使おう。"
    }`;
  } else if (last === "switch") {
    title = "新しい環境の、一年目。";
    body = `${company}へ移る架空の転職を経験し、${JOB_PROSE[g.employer.role]}に取り組みながら、慣れないことにも向き合う日々。${business ? `事業の背景：${business} ` : ""}これまでの経験を、新しい役割にどう生かすか。${g.skill > 50 ? "学んだAIの使い方を試せる機会も見えてきた。" : "新しい道具と仕事の進め方に、学ぶ余地がありそうだ。"}`;
  } else if (g.cash < g.livingCost * 6) {
    title = "暮らしの収支を、見つめなおす。";
    body = [
      `手元の現金が、生活費の半年分を下回っている。${g.investments > 0 ? "株式を持っていても、必要な時に同じ価格で売れるとは限らない。" : ""}${g.housing === "own" ? "住まいの維持とローンにも費用がかかる。" : "家賃も毎月の支出のひとつ。"}仕事や暮らしの組み合わせを考える一年になりそうだ。`,
      `日々の支払いに備える現金を、もう少し残しておきたい。${g.housing === "own" ? "家を保つ費用も含め、" : "毎月の住居費も含め、"}支出と働き方を一緒に見直そう。`,
      `今の生活費に対して、現金の備えは心もとない。${g.year}年は、無理なく続けられる暮らし方から考えたい。`,
    ][g.decisions.length % 3];
  } else {
    title =
      technologyAt(g) > 0.5
        ? "仕事のかたちを、作りなおす。"
        : `${company}で、次の役割を考える。`;
    body = `${g.age}歳、${company}で${JOB_PROSE[g.employer.role]}を続けるあなた。${SCENARIOS[g.scenario].label}の世界では、AIを使う仕事の比重が${technologyAt(g) > 0.5 ? "大きく変わってきた" : "少しずつ増えている"}。${g.profile.household === "care" ? "育児やケアとの両立も、時間の使い方を左右する。" : ""}${["learn", "studyDaily"].includes(last) ? "去年の学びを、実際の仕事で試す場面が見えてきた。" : last === "connect" ? "大切な人と過ごした時間が、選びたい働き方を考えるきっかけになった。" : "収入だけでなく、暮らしに残る時間も大切にしたい。"}`;
  }
  const continuation =
    worldEnabled(g) &&
    !g.retired &&
    !["venture", "seeking"].includes(g.employer.kind) &&
    last !== "switch" &&
    g.cash >= g.livingCost * 6 &&
    g.history.at(-1)?.episode;
  if (!g.history.length && worldEnabled(g) && !g.retired) {
    title = {
      growth: "今の経験を、次の役割へ。",
      switch: "この場所に残る未来と、外へ出る未来。",
      business: "まだ、名前のない仕事。",
      balance: "仕事の予定と、暮らしの予定。",
    }[g.profile.careerGoal];
    const hook = {
      growth:
        "帰り道、気になっていた学びのページをもう一度開いた。まず毎日少しずつ学ぶか、仕事で試す場を探すか。",
      switch:
        "いつもの一週間が終わるころ、別の働き方が頭に浮かんだ。今の経験を深める道も、別の会社で使う道もある。",
      business:
        "暮らしの中の小さな不便を、自分の仕事にできないかと思った。すぐに始める前に、誰かに会う、学ぶ、小さく試すという道もある。",
      balance:
        "予定表には仕事が並んでいる。その隙間に、自分や大切な人との時間をどれくらい残したいだろう。",
    }[g.profile.careerGoal];
    body = `${g.age}歳、${residenceProse(g)}で暮らすあなた。${g.employer.role === "other" ? "次の仕事と暮らしを考える日々。" : `${company}で${JOB_PROSE[g.employer.role]}に取り組んでいる。`}${hook} 今年は、働き方と暮らしの何を大切にしてみよう。`;
  }
  if (continuation) {
    title = continuation.nextTitle;
    const turn = g.decisions.length,
      rotation = (turn + g.seed % 3) % 3,
      workplace = workContext(g).model;
    const subjects = {
      product: ["利用者の声", "サービスの改善", "使う人に届く価値"],
      services: ["顧客の課題", "案件の進め方", "任される仕事の範囲"],
      inhouse: ["社内の業務", "仕事を支える仕組み", "現場との連携"],
    }[workplace];
    const subject = subjects?.[rotation] ?? JOB_PROSE[g.employer.role];
    const experience = ["learn", "studyDaily"].includes(last) ? "経験と学び" : "経験";
    const setting = [
      `${company}で、${subject}に目を向ける。これまでの${experience}から、何を試せるだろう。`,
      `${subject}をめぐって、${["learn", "studyDaily"].includes(last) ? "学びをどう使うか" : "次に深めたいことを"}考えている。${company}での時間を、どう使おう。`,
      `${company}で積んだ${experience}を、${subject}につなげたい。続けてきたことにも、見直す余地がありそうだ。`,
    ][rotation];
    const changedHome = ["move", "home"].includes(last);
    const home = turn === 1 || changedHome || rotation === 0
      ? last === "move"
        ? `${residenceProse(g)}へ移り、日々の暮らしを整えている。`
        : last === "home"
          ? `${residenceProse(g)}に買った家で、これからの生活を考える。`
          : `${g.year}年、${residenceProse(g)}の${g.housing === "own" ? "自宅" : "借りている住まい"}で暮らしている。`
      : "";
    // Repeated actions may yield the same episode. Carry only sentences that
    // were not already offered at the start of the preceding continuation year.
    const previous = g.history.at(-2)?.episode;
    const used = new Set(narrativeSentences(
      previous ? `${previous.title} ${previous.next}` : "",
    ));
    const carry = (text) => narrativeSentences(text)
      .filter((sentence) => !used.has(sentence)).join("");
    const stage = (age) => age < 6 ? "young" : age < 18 ? "school" : "adult";
    const ages = g.family.childAges;
    const oldAges = g.history.at(-2)?.family.childAges ??
      Array(g.profile.children).fill({ young: 3, school: 10, adult: 22 }[g.profile.childStage]);
    const family = ages.length > oldAges.length
      ? "家族が増え、仕事と暮らしの時間配分も変わり始めた。"
      : ages.some((age, i) => stage(age) !== stage(oldAges[i] ?? age))
        ? `子どもは${ages.join("・")}歳。成長の節目に、仕事と家族の予定も見直したい。`
        : "";
    body = [carry(continuation.title), `${home}${setting}`, carry(continuation.next), family].filter(Boolean).join(" ");
  }
  const currentMunicipality =
    residenceName(g) === g.profile.municipality ? g.profile.municipality : "";
  if (currentMunicipality && !body.includes(currentMunicipality) && !continuation)
    body = `${currentMunicipality}で暮らす。${body}`;
  const personalization = profileStoryContext(g);
  if (worldEnabled(g)) {
    body +=
      " " +
      personalization.focus
        .map((t) => t.lines[g.decisions.length % t.lines.length])
        .join(" ");
    options = profileOptions(g, options, personalization);
  }
  return {
    title,
    body: worldEnabled(g)
      ? `${body} ${worldAt(g).shock.body}${worldAt(g).frontier ? ` ${worldAt(g).frontier}` : ""}`
      : body,
    insight: `キャリアの歩みと、家計・住まい・過去の選択をつなぐ端末内の物語。AI普及指標はゲーム上の仮定。`,
    options,
    profileBasis: worldEnabled(g)
      ? [
          ...new Set([
            ...(currentMunicipality
              ? [
                  {
                    id: "municipality",
                    source: "profile.municipality",
                    label: "現在の市区町村",
                    detail: currentMunicipality,
                  },
                ]
              : []),
            ...personalization.focus,
            ...options
              .map((o) =>
                personalization.threads.find((t) => t.id === o.profileThread),
              )
              .filter(Boolean),
          ]),
        ].map(({ id, source, label, detail }) => ({
          id,
          source,
          label,
          detail,
        }))
      : [],
    generated: false,
  };
}
// Small fictional scenes built from the actual calculated outcome. They never
// add money, relatives, a job offer or a historical event to the game state.
export function annualEpisode(before, record) {
  const id = record.choice,
    ok = record.outcome?.kind === "success";
  const model = workContext(before).model;
  const setting =
    {
      product: "利用者の声とサービスの改善",
      services: "顧客の現場と案件の進め方",
      inhouse: "社内の業務と仕組み",
    }[model] ?? JOB_PROSE[record.employer.role];
  const variation = Math.floor(
    randomAt(before.seed, before.decisions.length, 91) * 3,
  );
  const learning = [
    "仕事や暮らしの予定に、机に向かう時間を組み込んだ。",
    "次に生かしたい専門の課題を、少しずつ調べ続けた。",
    "前なら読み飛ばした説明が、少し分かるようになった。",
  ][variation];
  const deficit = record.outcome?.deficit === true,
    deficitYears = record.outcome?.deficitYears ?? 0;
  let ventureTold = false;
  let title = record.outcome?.title ?? CHOICES[id].label;
  let body = record.outcome?.body ?? record.note;
  let nextTitle = [
    "これからの働き方を、誰と考える？",
    "働き方と暮らし、続けることと変えること。",
    "これからのキャリアに、何をつなぐ？",
  ][variation];
  let next =
    "経験を深めるか、働き方や暮らしを見直すか。仕事を離れた後の時間も含め、次の一年の重点を選ぼう。";
  if (["learn", "studyDaily"].includes(id)) {
    title = ok
      ? "学んだことが、現場の言葉になった。"
      : "ノートは増えた。評価はまだ、追いつかない。";
    const studiedYears = before.history.filter((h) =>
      ["learn", "studyDaily"].includes(h.choice),
    ).length;
    const progress =
      studiedYears === 0
        ? "まずは、自分に合う学び方を探した。"
        : studiedYears === 1
          ? "去年のノートを開くと、分かることが増えていた。"
          : studiedYears === 2
            ? "続けてみて、次に学びたい課題も見えてきた。"
            : "積み重ねた時間を、どこで使うか考えるようになった。";
    body = `${progress}${learning}${id === "studyDaily" ? "1日1時間、年間365時間。" : "学びに使った時間が積み重なる。"}${ok ? `${setting}で、取り組みが評価につながった。` : `${setting}に生かしたいが、今年は目に見える評価につながらなかった。学んだ力は残る。`}`;
    nextTitle = ok
      ? "この手応えを、次はどこで試す？"
      : "続ける？ やり方を変えてみる？";
    next = ok
      ? "小さく仕事で試す、成果をもとに相談する、学びを続ける。手応えの先にも選び方がある。"
      : "もう一年続けるか、小さな実践へ移るか。それとも、いったん息をつくか。";
  } else if (
    record.employer.kind !== "venture" &&
    !["failure", "closure"].includes(record.outcome?.kind) &&
    (id === "focus" || id === "pilot" || id === "negotiate")
  ) {
    body = `${workplaceName(record.employer)}で、${setting}に向き合った。${record.outcome?.body ?? record.note}`;
    nextTitle = ok
      ? "任されることが増えた、その先。"
      : "この場所で、もう一度試す？";
    next = ok
      ? "経験を深める道と、外の仕事を知る道。成果をどう使うかは、まだ選べる。"
      : "成果が見えにくい時期をどう過ごすか。学ぶ、人に会う、働く場所を変えることも考えられる。";
  } else if (id === "rest") {
    title = [
      "何もしない予定を、ひとつ入れた。",
      "久しぶりに、帰り道を急がなかった。",
      "忙しさから、少し距離を置いた。",
    ][variation];
    body = `仕事や暮らしの予定を詰めず、自分のペースを確かめた。${record.note}これからの働き方や、仕事の外で大切にしたいことを考える余地も生まれた。`;
    nextTitle = "これからの働き方に、どんな余白を残す？";
  } else if (id === "connect") {
    title = [
      "久しぶりの会話に、ヒントがあった。",
      "仕事の外にある、大切な時間。",
      "予定を合わせて、人に会う時間を作った。",
    ][variation];
    body = `${record.note}${before.family.childAges.length ? "家族と、仕事と暮らしの時間の使い方も話した。" : "どう働き、何を大切にしたいか、誰かと話すうちに少し形が見えてきた。"}`;
    nextTitle = "人との時間から、次の働き方を考える。";
  } else if (id === "switch") {
    title = "いつもの朝が、新しい職場の朝に変わった。";
    body = `${workplaceName(record.employer)}へ移り、${JOB_PROSE[record.employer.role]}に取り組んだ。仕事の進め方と人との距離を、一つずつ覚えていく。これは架空の転職の結果。`;
    nextTitle = "新しい職場で、何から始める？";
  } else if (
    id === "startup" ||
    record.employer.kind === "venture" ||
    record.outcome?.kind === "failure" ||
    record.outcome?.kind === "closure"
  ) {
    const ended =
      record.outcome?.kind === "failure" || record.outcome?.kind === "closure";
    ventureTold = true;
    body = `${record.outcome?.body ?? record.note}${
      ended
        ? "事業を終えた経験を持って、暮らしと次の仕事を組み直す。"
        : [
            "顧客を探す時間と運営の負担。その両方が、仕事を選ぶ意味を変えていく。",
            "自分で決められる自由と、収入が読めない不安。その両方を抱えて働いている。",
            "請求書を送る日と、支払いを確かめる日。事業の一年は、その繰り返しでもあった。",
          ][
            // Rotate by business year so consecutive years never repeat.
            Math.abs(record.year - (record.employer.started ?? record.year)) % 3
          ]
    }`;
    nextTitle =
      record.employer.kind === "seeking"
        ? "この事業の経験を、次のキャリアへ。"
        : deficit
          ? deficitYears >= 2
            ? "続ける、変える、手を引く。"
            : "手応えを、収支に変えられる？"
          : ok
            ? "広げる前に、何を確かめる？"
            : "続け方を、変えてみる？";
  } else if (["home", "move", "invest", "prepay"].includes(id)) {
    title =
      id === "move"
        ? "働く場所と暮らしの地図を、描き直した。"
        : id === "home"
          ? "帰る場所に、新しい責任が増えた。"
          : id === "prepay"
            ? "手元の備えと、これからの返済を考えた。"
            : "お金の置き場所を、見直した。";
    body = `${record.note.replace(`${record.outcome?.title} `, "")}働くための時間、手元の余裕、これから守りたい暮らしを、改めて考える。`;
    nextTitle = "この暮らしに合う、働き方は？";
  }
  if (deficit) {
    // Learning or resting in a loss-making venture year still shows the loss.
    if (!ventureTold)
      body += ` ${record.outcome.deficitKind === "business" ? "事業の収支" : "事業の収入と暮らしの支出"}は、${deficitYears >= 2 ? "赤字の年が続いている。" : "今年は赤字だった。"}`;
    next =
      deficitYears >= 2
        ? "赤字のまま続けるなら、いつまでに何を変えるかを決めたい。事業の方向を変える、規模を抑える、撤退して働き方を組み直すこともできる。"
        : "顧客の手応えを、収支の改善につなげたい。運営費を見直す、価格や仕事の選び方を変える、続ける期限を決めることも考えられる。";
  }
  if (record.familyOutcome && record.familyOutcome !== record.outcome)
    body += ` ${record.familyOutcome.body}`;
  if (
    record.world?.shock.id !== "calm" &&
    record.world &&
    record.world.shock.id !== before.history.at(-1)?.world?.shock.id
  )
    body += ` ${record.world.shock.body}`;
  const detours = [
    {
      action: "connect",
      label: "気になった勉強会で人と話す",
      body: "小さな勉強会の案内を見かけた。今の経験をどう生かせるか、違う仕事の人の話も聞いてみたくなる。",
    },
    {
      action: "rest",
      label: "予定を空けて、自分の時間を取り戻す",
      body: "休日の予定を見て、少し詰め込みすぎたかもしれないと思った。自分に合う働き方を考えるにも、何もしない日が必要そうだ。",
    },
    {
      action: "move",
      label: "暮らす場所から、働き方を考える",
      body: "いつもと違う道を歩いた。別の街で暮らしたら、毎日の仕事も変わるだろうか。",
    },
    {
      action: "explore",
      label: "身近な不便を、小さな挑戦に変える",
      body: "身近な不便に気づいた。自分の経験で小さく試せないかと、副業や事業の種として考えてみた。",
    },
    {
      action: "learn",
      label: "AIに任せることと自分で学ぶことを探す",
      body: "AIの道具を試すと、任せやすい作業と、自分で確かめたい作業の両方が見えてきた。次の仕事に必要な学びは何だろう。",
    },
    ...(before.family.childAges.length
      ? [
          {
            action: "careLeave",
            label: "子どもの成長に合わせ、時間を組み直す",
            body: "子どもの成長とともに、家族の予定も変わっていく。仕事に使う時間との配分が合っているか、見直してみたい。",
          },
        ]
      : []),
  ].filter(
    (entry) =>
      entry.action !== id && availableChoices(before).includes(entry.action),
  );
  const detour =
    detours[
      Math.floor(
        randomAt(before.seed, before.decisions.length, 92) * detours.length,
      )
    ];
  const showDetour =
    detour &&
    !record.ended &&
    !record.familyOutcome &&
    !["failure", "closure"].includes(record.outcome?.kind);
  if (showDetour) body += ` ${detour.body}`;
  const personalization = profileStoryContext(before, {
    action: id,
    intention: record.intention,
  });
  const thread = personalization.focus.find((t) =>
    Object.hasOwn(t.actions, id),
  );
  if (
    thread &&
    !record.ended &&
    !["failure", "closure"].includes(record.outcome?.kind)
  ) {
    // A reflection/question adds no unrecorded hire, relative, success or pay.
    body +=
      thread.practice &&
      ["learn", "studyDaily", "pilot", "focus", "explore"].includes(id)
        ? ` メモのテーマ「${thread.label.replace("メモのテーマ：", "")}」を手掛かりに、${thread.practice}ことを${["learn", "studyDaily"].includes(id) ? "今年の学びの課題にした" : "今年の取り組みとして選んだ"}。${ok ? "評価されたことを、次にどこで生かそう。" : "取り組んだことと、望む成果が出ることには距離があった。"}`
        : ` ${thread.lines[(before.decisions.length + 1) % thread.lines.length]}`;
    next += ` ${thread.actions[id]}という方針を、次も続けるか考えられる。`;
  }
  if (record.intention) body += `選んだ方針は「${record.intention}」。`;
  return {
    title,
    body,
    nextTitle,
    next,
    ...(showDetour
      ? { sideAction: detour.action, sideLabel: detour.label }
      : {}),
  };
}
export function advanceYears(game, decision, years = 1, { pauseAtMilestones = false } = {}) {
  if (![1, 5, 10].includes(years)) fail();
  const repeated = new Set([
    "learn",
    "studyDaily",
    "focus",
    "rest",
    "connect",
    "explore",
    "careLeave",
    "recover",
    "pilot",
  ]);
  const id = decisionId(decision),
    requested = years;
  const entries = [];
  let next = game,
    stopReason = "";
  for (let i = 0; i < (repeated.has(id) ? years : 1); i++) {
    if (next.ended) break;
    if (!availableChoices(next).includes(id)) {
      stopReason = "状況が変わり、この方針を続けられなくなりました。";
      break;
    }
    const before = next;
    next = advance(next, decision);
    entries.push(next.history.at(-1));
    if (next.ended) {
      stopReason = next.history.at(-1).careerEnd
        ? "キャリアに区切りがつきました。"
        : "キャリアと人生の物語が完結しました。";
      break;
    }
    if (
      next.family.childAges.length !== before.family.childAges.length ||
      next.family.partner !== before.family.partner
    ) {
      stopReason = "家族の節目です。働き方と暮らしの配分を選び直せます。";
      break;
    }
    if (
      isRetiredAt(next) !== isRetiredAt(before) ||
      ["failure", "closure"].includes(next.history.at(-1).outcome?.kind)
    ) {
      stopReason = "働き方の節目です。ここからの方針を選び直せます。";
      break;
    }
    if (next.history.at(-1).incident?.tone === "hard" && i < years - 1) {
      stopReason = "思いがけない出来事がありました。ここからの方針を選び直せます。";
      break;
    }
    if (pauseAtMilestones && careerMilestones(next).some((m) => m.step === next.decisions.length)) {
      stopReason = "キャリアの節目です。ここまでを一行で振り返れます。";
      break;
    }
  }
  if (!entries.length)
    throw new Error("現在の状況では、この選択を実行できません。");
  if (years > 1 && !repeated.has(id))
    stopReason = "キャリアや暮らしが変わる選択なので、まず一年の結果を見ます。";
  return { game: next, entries, requested, stopReason };
}
// A direction changes course once, then continues without repeating a move,
// purchase or business expansion. Every year still uses the ordinary rules.
export function advanceDirection(game, decision, { years = 5 } = {}) {
  if (!Number.isInteger(years) || years < 1 || years > 5) fail();
  const id = decisionId(decision), entries = [];
  let next = game, stopReason = "";
  for (let i = 0; i < years; i++) {
    const before = next;
    let action = decision;
    if (i) {
      const allowed = availableChoices(next);
      const working = !isRetiredAt(next) && next.employer.kind !== "seeking" &&
        !(next.employer.kind === "initial" && ["student", "notWorking"].includes(next.profile.occupation));
      const preferred = ["learn", "studyDaily"].includes(id) ? ["studyDaily", "learn"]
        : ["rest", "recover", "careLeave", "connect", "explore"].includes(id) ? [id]
          : ["familyPlan", "reconsiderFamily", "meet"].includes(id) ? ["connect", "rest"]
            : working ? ["focus"] : ["rest"];
      action = [...preferred, working ? "focus" : "rest"].find((a) => allowed.includes(a));
      if (!action) {
        stopReason = "状況が変わり、この方針を続けられなくなりました。";
        break;
      }
      // Retain a continuing study/rest intention, never a one-time transaction.
      if (typeof decision === "object" && decision.intent &&
        (action === id || ["learn", "studyDaily"].includes(id)))
        action = { id: action, intent: decision.intent };
    }
    next = advance(next, action);
    const entry = next.history.at(-1);
    entries.push(entry);
    if (next.ended) {
      stopReason = entry.careerEnd ? "キャリアに区切りがつきました。" : "キャリアと人生の物語が完結しました。";
    } else if (next.family.childAges.length !== before.family.childAges.length || next.family.partner !== before.family.partner) {
      stopReason = "家族の節目です。働き方と暮らしの配分を選び直せます。";
    } else if (isRetiredAt(next) !== isRetiredAt(before) || ["failure", "closure"].includes(entry.outcome?.kind)) {
      stopReason = "働き方の節目です。ここからの方針を選び直せます。";
    } else if (entry.incident?.tone === "hard") {
      stopReason = "思いがけない出来事がありました。ここからの方針を選び直せます。";
    }
    if (stopReason) break;
  }
  const blocks = validateDirectionBlocks(game.directionBlocks ?? [], game.decisions.length);
  next = { ...next, directionBlocks: [...blocks, [game.decisions.length, next.decisions.length]] };
  return { game: next, entries, requested: years, stopReason };
}
function validateDirectionBlocks(raw, length) {
  if (!Array.isArray(raw) || raw.length > MAX_AGE) fail();
  let previous = 0;
  return raw.map((block) => {
    if (!Array.isArray(block) || block.length !== 2) fail();
    const [start, end] = block;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < previous ||
      end <= start || end > length || end - start > 5) fail();
    previous = end;
    return [start, end];
  });
}
export function previousDirectionStep(game) {
  const block = game.directionBlocks?.at(-1);
  return block?.[1] === game.decisions.length ? block[0] : Math.max(0, game.decisions.length - 1);
}
export function advance(g, rawDecision) {
  if (g.ended || g.decisions.length >= MAX_AGE)
    throw new Error("キャリアと人生の物語は完結しました。");
  const decision = validateDecision(rawDecision, g),
    choice = decisionId(decision);
  let employer = nextEmployer(g, decision);
  const familyChange = familyTurn(g, choice);
  const workOutcome = yearlyOutcome(
    g,
    choice,
    employer,
    typeof decision === "object" ? decision : null,
  );
  // Family events do not suspend business risk. Both can happen in one year.
  let outcome =
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
  const incident = incidentAt(g, choice, employer);
  if (incident?.effects.layoff) {
    // No pay while looking for work; severance and benefits arrive as cash,
    // and the next job starts from the previous pay rather than from zero.
    incident.effects.salaryFactor = 0;
    incident.effects.extraCost = -Math.round(g.salary * 0.76 * 0.6);
    employer = {
      kind: "seeking",
      id: "seeking",
      name: "次の仕事を探している",
      role: "other",
      companyType: "unknown",
      facts: null,
      summary: "人員整理で職を離れ、次の仕事を探している",
      lastSalary: g.salary,
      lastRole: employer.role,
    };
  }
  // In-company stage. A move keeps the stage reached (people usually join at a
  // similar level) and starts a new tenure; the old one stays in the history.
  let position = g.position;
  if (choice === "switch" && typeof decision === "object")
    position =
      decision.rank && decision.rank !== position.rank
        ? { rank: decision.rank, unit: "", joined: g.year, since: g.year }
        : { ...position, unit: "", joined: g.year, since: position.since };
  if (outcome?.promotion)
    position = { ...position, rank: outcome.promotion, since: g.year };
  if (outcome?.unit) position = { ...position, unit: outcome.unit };
  const previousIncident = g.history.at(-1)?.incident;
  const incidentRestore =
    previousIncident?.effects.temporary && previousIncident.effects.salaryFactor
      ? 1 / previousIncident.effects.salaryFactor
      : 1;
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
      // Aiming for promotion is also a year of committed work.
      (["focus", "promote"].includes(choice)
        ? 0.023
        : ["transfer", "internalVenture"].includes(choice)
          ? 0.01
          : 0) +
      (g.health < 30 ? -0.035 : 0),
    -0.12,
    0.12,
  );
  const realism = payRealism(g);
  // A small yearly seniority raise for employees before 50.
  if (
    realism &&
    g.age < 50 &&
    employer.kind !== "venture" &&
    employer.kind !== "seeking" &&
    employer.role !== "independent" &&
    employer.companyType !== "self"
  )
    growth += 0.012;
  // With realistic pay a move averages about +1% (raises, cuts and no change
  // are each roughly a third of moves in the labour survey).
  if (choice === "switch")
    growth += realism
      ? -0.11 + randomAt(g.seed, i, 7) * 0.24
      : -0.12 + randomAt(g.seed, i, 7) * 0.3;
  if (choice === "switch" && typeof decision === "object") {
    growth +=
      employer.role === g.employer.role
        ? (g.skill / 100) * (realism ? 0.01 : 0.025)
        : -0.08;
  }
  const venture = employer.kind === "venture" ? VENTURES[employer.id] : null;
  if (venture)
    growth +=
      (randomAt(g.seed, i, 21) - 0.5) * 0.4 +
      tech * (g.skill / 100 - 0.5) * 0.1;
  if (world) growth += world.growth;
  // Employees are usually rehired at 60 on lower pay; the self-employed and
  // business owners are not.
  const rehire =
    realism &&
    g.age + 1 === 60 &&
    !retired &&
    !venture &&
    choice !== "startup" &&
    employer.kind !== "seeking" &&
    employer.role !== "independent" &&
    employer.companyType !== "self"
      ? 0.75
      : 1;
  const transitionIncome =
    (choice === "startup" ? 0.3 + randomAt(g.seed, i, 22) * 0.55 : 1) * rehire;
  const salary = retired
    ? 0
    : i >= g.salaryCapFrom
      ? cappedSalary(
          g,
          employer,
          choice === "startup"
            ? g.salary || 120
            : choice === "switch" && typeof decision === "object"
              ? g.salary || (g.employer.lastSalary ?? 0) * 0.9 || 180
              : g.salary,
          [
            1 + growth,
            outcome?.salaryFactor ?? 1,
            familyChange.outcome && outcome !== familyChange.outcome
              ? familyChange.outcome.salaryFactor
              : 1,
            incident?.effects.salaryFactor ?? 1,
          ],
          transitionIncome,
          (world &&
          (g.decisions.length < g.careLeaveSalaryFrom || g.salary > 0) &&
          decisionId(g.decisions.at(-1)) === "careLeave"
            ? 1 / 0.85
            : 1) * incidentRestore,
        )
      : clamp(
        (choice === "startup"
          ? g.salary || 120
          : choice === "switch" && typeof decision === "object"
            ? g.salary || (g.employer.lastSalary ?? 0) * 0.9 || 180
            : g.salary) *
          (1 + growth) *
          transitionIncome *
          (outcome?.salaryFactor ?? 1) *
          (familyChange.outcome && outcome !== familyChange.outcome
            ? familyChange.outcome.salaryFactor
            : 1) *
          (incident?.effects.salaryFactor ?? 1) *
          incidentRestore *
          (world &&
          (g.decisions.length < g.careLeaveSalaryFrom || g.salary > 0) &&
          decisionId(g.decisions.at(-1)) === "careLeave"
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
      c.cost +
      businessSetup +
      businessOverhead +
      (outcome?.extraCost ?? 0) +
      (incident?.effects.extraCost ?? 0),
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
    region = decision.region ?? order[(order.indexOf(region) + 1) % 3];
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
  let prepayment = 0;
  if (choice === "prepay") {
    const buffer = livingCost * 6,
      scheduled = amortizeYear(mortgage, p.mortgageRate, mortgageYears),
      reserved =
        livingCost * 12 * (1 + (world?.shock.costs ?? 0)) +
        familyChange.cost +
        (g.age >= 80 ? 12 : 0) +
        homeValue * 0.01 +
        cost +
        scheduled.payment;
    // Reserve the unreduced annual payment too, so prepayment itself cannot
    // force asset sales or borrowing, or consume the six-month cash buffer.
    prepayment = Math.max(
      0,
      Math.min(mortgage, cash - buffer, cash + income * 0.76 - reserved - buffer),
    );
    cash -= prepayment;
    mortgage -= prepayment;
  }
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
  let liquidation = 0,
    borrowing = 0;
  if (cash < 0 && investments > 0) {
    liquidation = Math.min(-cash, investments);
    cash += liquidation;
    investments -= liquidation;
  }
  if (cash < 0) {
    borrowing = -cash;
    debt -= cash;
    cash = 0;
  }
  const debtRepayment =
    g.decisions.length >= g.debtRepayFrom
      ? Math.min(debt, Math.max(0, cash - livingCost * 6))
      : 0;
  cash -= debtRepayment;
  debt -= debtRepayment;
  const debtInterest = debt * 0.02;
  debt += debtInterest;
  // Legacy (pre-world) years keep their recorded outcome objects verbatim.
  if (employer.kind === "venture" && world)
    outcome = narrateVentureYear(g, outcome, {
      salary,
      businessOverhead,
      businessSetup,
      operating: disposable - expenses + bonus,
      borrowing,
      liquidation,
    });
  const health = clamp(
    g.health +
      c.health +
      (incident?.effects.health ?? 0) -
      (g.age >= 80 ? 2 : g.age >= 65 ? 1.4 : 0.8) +
      (p.priority === "time" ? 0.5 : 0),
  );
  const connection = clamp(
    g.connection +
      c.connection +
      (incident?.effects.connection ?? 0) -
      1 +
      (p.priority === "people" ? 0.8 : 0),
  );
  const freedom = clamp(
    g.freedom +
      c.freedom +
      (incident?.effects.freedom ?? 0) -
      0.5 +
      (p.priority === "freedom" ? 0.8 : 0),
  );
  const skill = clamp(
    g.skill +
      (incident?.effects.skill ?? 0) +
      c.skill *
        (world && ["learn", "studyDaily"].includes(choice)
          ? 0.7 + randomAt(g.seed, i, 78) * 0.6
          : 1) -
      2 * SCENARIOS[g.scenario].pace,
  );
  const studyHours =
    g.studyHours +
    (world ? (choice === "studyDaily" ? 365 : choice === "learn" ? 90 : 0) : 0);
  const died = randomAt(g.seed, i, 20) < deathChance(g);
  // The story is a working life: it closes in the year work ends, with a
  // reason that fits how the person worked. Death stays possible before that.
  const careerEnd =
    !died &&
    i >= g.careerEndFrom &&
    !isRetiredAt(g) &&
    (choice === "retire" || g.age + 1 >= p.retirementAge)
      ? employer.kind === "venture"
        ? { reason: "leaveBusiness", title: `${employer.name}から退き、仕事に区切りをつけた` }
        : employer.kind !== "seeking" && ["director", "principal"].includes(g.position?.rank)
          ? { reason: "stepDown", title: `${RANKS[g.position.rank].label}を退任し、仕事に区切りをつけた` }
          : choice === "retire" && g.age < p.retirementAge
            ? { reason: "early", title: "早めに仕事から離れ、次の暮らしへ進んだ" }
            : { reason: "retire", title: "定年を迎え、仕事から退いた" }
      : null;
  const ended = died || Boolean(careerEnd);
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
        ? `${workplaceName(employer)}へ移り、${JOB_PROSE[employer.role]}に取り組む架空の転職。移行費用30万円と役割の変化を反映した。`
        : "働く環境を変更。移行費用を払い、収入と自由が変化した。",
    startup: `${employer.name}を開業（架空）。${venture?.label ?? ""}。初期費用${businessSetup}万円、年間運営費${businessOverhead}万円を支払い、収入が変化した。`,
    invest: "現金の一部を株式へ配分。以後の価格変動の影響も変わる。",
    prepay:
      prepayment > 0
        ? `生活費半年分と今年の支払いを確保できる範囲で、ローン元金を${Math.round(prepayment)}万円繰り上げ返済。残りの返済期間を保ち、毎月の返済額と利息を再計算した。`
        : "今年の支払いと生活費半年分の備えを優先し、繰り上げ返済は見送った。通常の返済は続けた。",
    home: "住まいを購入。金融資産・不動産・ローンの構成が変わった。",
    move: "地域を移り、生活費・住居費・人との距離が変わった。",
    retire: "給与収入を止めた。65歳以降は設定した退職後収入を受け取る。",
  };
  const event = eventFor(g),
    option = event.options.find(
      (o) =>
        o.id === choice &&
        (!o.decision ||
          JSON.stringify(o.decision) === JSON.stringify(decision)),
    );
  const record = {
    year: g.year,
    age: g.age,
    choice,
    ...(decision.intent ? { intention: decision.intent } : {}),
    choiceLabel:
      choice === "startup"
        ? `${employer.name}を開業`
        : choice === "switch" && typeof decision === "object"
          ? `${employer.name}へ転職`
          : (option?.label ?? decision.intent ?? c.label),
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
    note: incident
      ? `思いがけない出来事：${incident.title}。${outcome ? `${outcome.title} ${effects[choice] ?? c.label}` : (effects[choice] ?? c.label)}`
      : outcome
        ? `${outcome.title} ${effects[choice] ?? c.label}`
        : effects[choice],
    ...(incident ? { incident } : {}),
    ...(careerEnd ? { careerEnd } : {}),
    ...(i >= g.careerPathFrom ? { position } : {}),
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
    debtRepayment,
    investmentTransfer,
    homeTransaction,
    liquidation,
    ...(choice === "prepay" ? { prepayment } : {}),
    // Signed cash flows, in the same unrounded 万円 as the simulation. Market
    // gains stay in investmentGain/propertyGain and do not enter cash flow.
    budget: {
      income: salary * 0.76,
      pension: (income - salary) * 0.76,
      living: -(expenses - housingCost - cost),
      housing: -(housingCost - loanPayment + homeTransaction),
      loanInterest: -loan.interest,
      loanPrincipal: -(principal + prepayment),
      investment: liquidation - investmentTransfer,
      other: bonus - cost,
      borrowing,
      debtRepayment: -debtRepayment,
      net: cash - g.cash,
    },
    ended,
  };
  if (worldEnabled(g)) record.episode = annualEpisode(g, record);
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
    position,
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
  retirementFrom = 0,
  careLeaveSalaryFrom = 0,
  prepayFrom = 0,
  debtRepayFrom = 0,
  salaryCapFrom = 0,
  incidentFrom = 0,
  careerPathFrom = 0,
  careerEndFrom = 0,
  payRealismFrom = 0,
  directionBlocks,
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
  let g = createGame(
    profile,
    scenario,
    seed,
    dynamicFrom,
    worldFrom,
    retirementFrom,
    careLeaveSalaryFrom,
    prepayFrom,
    debtRepayFrom,
    salaryCapFrom,
    incidentFrom,
    careerPathFrom,
    careerEndFrom,
    payRealismFrom,
  );
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
  if (directionBlocks !== undefined) {
    const blocks = validateDirectionBlocks(directionBlocks, decisions.length);
    g.directionBlocks = stopAtEnd ? blocks.filter(([, end]) => end <= g.decisions.length) : blocks;
  }
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
      g.retirementFrom,
      g.careLeaveSalaryFrom,
      g.prepayFrom,
      g.debtRepayFrom,
      g.salaryCapFrom,
      g.incidentFrom,
      g.careerPathFrom,
      g.careerEndFrom,
      g.payRealismFrom,
      g.directionBlocks,
    ),
  );
}
export function encodeSave(g) {
  if (
    !Number.isInteger(g.prepayFrom) ||
    g.prepayFrom < 0 ||
    g.prepayFrom > MAX_AGE ||
    !Number.isInteger(g.debtRepayFrom) ||
    g.debtRepayFrom < 0 ||
    g.debtRepayFrom > MAX_AGE ||
    !Number.isInteger(g.salaryCapFrom) ||
    g.salaryCapFrom < 0 ||
    g.salaryCapFrom > MAX_AGE ||
    !Number.isInteger(g.incidentFrom) ||
    g.incidentFrom < 0 ||
    g.incidentFrom > MAX_AGE ||
    !Number.isInteger(g.careerPathFrom) ||
    g.careerPathFrom < 0 ||
    g.careerPathFrom > MAX_AGE ||
    !Number.isInteger(g.careerEndFrom) ||
    g.careerEndFrom < 0 ||
    g.careerEndFrom > MAX_AGE ||
    !Number.isInteger(g.payRealismFrom) ||
    g.payRealismFrom < 0 ||
    g.payRealismFrom > MAX_AGE
  )
    fail();
  const value = JSON.stringify({
    version: VERSION,
    dynamicFrom: g.dynamicFrom,
    worldFrom: g.worldFrom,
    retirementFrom: g.retirementFrom,
    careLeaveSalaryFrom: g.careLeaveSalaryFrom,
    prepayFrom: g.prepayFrom,
    debtRepayFrom: g.debtRepayFrom,
    salaryCapFrom: g.salaryCapFrom,
    incidentFrom: g.incidentFrom,
    careerPathFrom: g.careerPathFrom,
    careerEndFrom: g.careerEndFrom,
    payRealismFrom: g.payRealismFrom,
    profile: g.profile,
    scenario: g.scenario,
    seed: g.seed,
    decisions: g.decisions,
    scenes: g.scenes,
    reflections: validateReflections(Object.hasOwn(g, "reflections") ? g.reflections : {}, g),
    careerSeen: validateCareerSeen(g.careerSeen ?? {}, g),
    ...(g.directionBlocks === undefined ? {} : { directionBlocks: validateDirectionBlocks(g.directionBlocks, g.decisions.length) }),
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
  const game = replay(
    d.profile,
    d.scenario,
    d.seed,
    d.decisions,
    d.scenes ?? {},
    false,
    d.dynamicFrom ?? d.decisions?.length,
    d.worldFrom ?? d.decisions?.length,
    Object.hasOwn(d, "retirementFrom")
      ? d.retirementFrom
      : d.decisions?.length + 1,
    Object.hasOwn(d, "careLeaveSalaryFrom")
      ? d.careLeaveSalaryFrom
      : d.decisions?.length,
    Object.hasOwn(d, "prepayFrom") ? d.prepayFrom : d.decisions?.length,
    Object.hasOwn(d, "debtRepayFrom") ? d.debtRepayFrom : d.decisions?.length,
    Object.hasOwn(d, "salaryCapFrom") ? d.salaryCapFrom : d.decisions?.length,
    // Saves from before chance incidents keep their recorded years unchanged.
    Object.hasOwn(d, "incidentFrom") ? d.incidentFrom : d.decisions?.length,
    // Saves from before the in-company career keep their recorded years.
    Object.hasOwn(d, "careerPathFrom") ? d.careerPathFrom : d.decisions?.length,
    // Saves from before the career ending keep their years after retirement.
    Object.hasOwn(d, "careerEndFrom") ? d.careerEndFrom : d.decisions?.length,
    // Saves from before the realistic pay curve keep their recorded salaries.
    // A scene already shown for the current year was made under the former
    // move rules, so that year keeps them too.
    Object.hasOwn(d, "payRealismFrom")
      ? d.payRealismFrom
      : d.decisions?.length + (d.scenes?.[String(d.decisions?.length)] ? 1 : 0),
  );
  if (Object.hasOwn(d, "directionBlocks"))
    game.directionBlocks = validateDirectionBlocks(d.directionBlocks, game.decisions.length);
  game.reflections = validateReflections(Object.hasOwn(d, "reflections") ? d.reflections : {}, game);
  game.careerSeen = validateCareerSeen(d.careerSeen ?? {}, game);
  return game;
}

// Company names the AI already proposed, keyed by the turn they were shown.
// Only used to ask for different candidates later; never evidence or a choice.
const CAREER_SEEN_TURNS = 30;
function validateCareerSeen(raw, game) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > CAREER_SEEN_TURNS) fail();
  const result = {};
  for (const [turn, names] of Object.entries(raw)) {
    if (!/^(?:0|[1-9]\d{0,2})$/.test(turn) || Number(turn) > game.decisions.length ||
      !Array.isArray(names) || names.length > 3 ||
      names.some((n) => typeof n !== "string" || /[\u2028\u2029]/u.test(n))) fail();
    result[turn] = names.map((n) => str(n, 60));
  }
  return result;
}
export function recordCareerSeen(game, names) {
  const seen = { ...(game.careerSeen ?? {}), [String(game.decisions.length)]: names.slice(0, 3) };
  const turns = Object.keys(seen).sort((a, b) => Number(a) - Number(b)).slice(-CAREER_SEEN_TURNS);
  return { ...game, careerSeen: validateCareerSeen(Object.fromEntries(turns.map((t) => [t, seen[t]])), game) };
}
export function careerSeenUntil(game, length) {
  return Object.fromEntries(Object.entries(game.careerSeen ?? {}).filter(([turn]) => Number(turn) <= length));
}
function validateReflections(raw, game) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length > 5) fail();
  const allowed = new Set(careerMilestones(game).map((m) => m.id));
  const result = {};
  for (const [id, text] of Object.entries(raw)) {
    if (!allowed.has(id) || typeof text !== "string" || /[\u2028\u2029]/u.test(text)) fail();
    result[id] = str(text, 80);
  }
  return result;
}
export function recordCareerReflection(game, id, text) {
  return { ...game, reflections: validateReflections({ ...game.reflections, [id]: text }, game) };
}
