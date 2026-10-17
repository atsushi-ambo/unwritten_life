// All monetary values are illustrative, in 2026 purchasing-power units of ¥10,000.
export const VERSION = 1;
export const START_YEAR = 2026;
export const YEARS = 20;
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
    hint: "AIや仕事の学びに時間を投資する",
    cost: 10,
    skill: 9,
    health: -2,
    connection: -1,
    freedom: 1,
    icon: "↗",
  },
  focus: {
    label: "いまの仕事を深める",
    hint: "経験と信頼を積み上げる",
    cost: 0,
    skill: 2,
    health: -3,
    connection: -1,
    freedom: -1,
    icon: "◎",
  },
  connect: {
    label: "大切な人と過ごす",
    hint: "家族、友人、身近な人に時間を使う",
    cost: 7,
    skill: 0,
    health: 2,
    connection: 8,
    freedom: 1,
    icon: "♡",
  },
  rest: {
    label: "暮らしと体を整える",
    hint: "休養や運動に、自分のペースで取り組む",
    cost: 5,
    skill: 0,
    health: 8,
    connection: 1,
    freedom: 3,
    icon: "◡",
  },
  explore: {
    label: "小さな挑戦を始める",
    hint: "副業、旅、創作。気になることを試す",
    cost: 18,
    skill: 4,
    health: 0,
    connection: 3,
    freedom: 7,
    icon: "✳",
  },
});
const EVENTS = [
  [
    "いつもの仕事に、新しい相棒。",
    "資料の下書きや情報整理をAIに任せる人が増えてきた。空いた時間を何に使うかは、まだ自分で選べる。",
    "仕事の一部が道具に移り、人の役割も少しずつ変わる。",
  ],
  [
    "変わらないものも、ある。",
    "便利な道具が増えても、誰かの相談に耳を傾ける時間は短くならない。今日はいつもより、相手の顔を見て話せた。",
    "効率化で生まれた時間が、そのまま余暇になるとは限らない。",
  ],
  [
    "学び直しへの招待状。",
    "地域の講座に、新しい仕事の進め方を学ぶコースができた。気になる。でも、いまの暮らしにも手いっぱいだ。",
    "学ぶ機会へのアクセスと時間が、変化への対応を左右する。",
  ],
  [
    "働く場所を、選びなおす。",
    "遠隔でできる仕事の範囲が広がった。住む場所を変える友人もいる。自分にとって、心地よい暮らしはどこだろう。",
    "働き方の変化は、仕事の外側の暮らしにも波及する。",
  ],
  [
    "得意なことが、つながった。",
    "今まで積み上げた経験を頼られる場面があった。新しい道具と自分の得意を組み合わせる余地が、少し見えてきた。",
    "専門知識と人への理解が、AIを使う場面でも役に立つ。",
  ],
  [
    "予定のない、日曜日。",
    "新しいことを追いかける日々の間に、何もしない一日ができた。続けたいことと、手放したいことを考える。",
    "技術の速さと、自分の暮らしの速さは同じでなくていい。",
  ],
  [
    "チームのかたちが変わる。",
    "役割の見直しが話題になった。慣れた作業が減る一方で、確認や調整を担う新しい役割が生まれている。",
    "AIへの影響の受けやすさは、職業全体がなくなる確率を意味しない。",
  ],
  [
    "小さな「やってみたい」。",
    "前から気になっていた活動が、道具のおかげで少ない準備で始められそうだ。うまくいく保証はない。でも、試すことはできる。",
    "始めやすさが増えても、収入や成功が保証されるわけではない。",
  ],
  [
    "暮らしを支える人たち。",
    "身近な人の予定に合わせて、自分の時間を組み替えた。助ける日も、助けられる日もある。暮らしは一人では完結しない。",
    "ケアやつながりにも時間が必要。収入だけでは測れない価値がある。",
  ],
  [
    "便利さの、その先へ。",
    "選択肢が増えたからこそ、何を選ばないかが気になり始めた。十年前とは少し違う、自分のものさしができてきた。",
    "普及の速度だけでなく、使い方と制度でも結果は変わる。",
  ],
];
const enums = {
  region: REGIONS,
  job: JOBS,
  priority: PRIORITIES,
  ai: { beginner: 1, sometimes: 1, daily: 1 },
  gender: { undisclosed: 1, woman: 1, man: 1, other: 1 },
  household: { solo: 1, shared: 1, care: 1 },
  companyType: { unknown: 1, large: 1, small: 1, public: 1, self: 1 },
};
const fail = () => {
  throw new Error(
    "入力内容を確認してください。数値の範囲と選択項目を見直してください。",
  );
};
export function validateProfile(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail();
  const p = {};
  for (const [key, options] of Object.entries(enums)) {
    if (typeof raw[key] !== "string" || !Object.hasOwn(options, raw[key]))
      fail();
    p[key] = raw[key];
  }
  for (const [key, min, max] of [
    ["age", 18, 80],
    ["income", 0, 10000],
    ["savings", -10000, 100000],
    ["monthlyCost", 0, 500],
  ]) {
    if (
      typeof raw[key] !== "number" ||
      !Number.isFinite(raw[key]) ||
      raw[key] < min ||
      raw[key] > max ||
      (key === "age" && !Number.isInteger(raw[key]))
    )
      fail();
    p[key] = raw[key];
  }
  if (
    typeof raw.company !== "string" ||
    raw.company.length > 60 ||
    /[\u0000-\u001f\u007f]/u.test(raw.company)
  )
    fail();
  p.company = raw.company.trim();
  return p;
}
const clamp = (n, low = 0, high = 100) => Math.max(low, Math.min(high, n));
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
export function createGame(profile, scenario = "steady", seed = 2026) {
  const p = validateProfile(profile);
  if (
    !Object.hasOwn(SCENARIOS, scenario) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    fail();
  return {
    profile: p,
    scenario,
    seed,
    decisions: [],
    year: START_YEAR,
    age: p.age,
    income: p.income,
    savings: p.savings,
    health: 65,
    connection: 55,
    freedom: 55,
    skill: { beginner: 15, sometimes: 40, daily: 65 }[p.ai],
    history: [],
  };
}
export function technologyAt(game) {
  return clamp(
    (0.12 + game.decisions.length * 0.037) * SCENARIOS[game.scenario].pace,
    0,
    0.95,
  );
}
export function eventFor(game) {
  const i = game.decisions.length;
  const event =
    EVENTS[(i + Math.floor(randomAt(game.seed, i, 4) * 3)) % EVENTS.length];
  return {
    title: event[0],
    body: event[1],
    insight: event[2],
    level: technologyAt(game),
    world: SCENARIOS[game.scenario].label,
  };
}
export function advance(game, choice) {
  if (!Object.hasOwn(CHOICES, choice)) fail();
  if (game.decisions.length >= YEARS)
    throw new Error("この物語は20年間を迎えました。");
  const c = CHOICES[choice],
    p = game.profile,
    job = JOBS[p.job],
    tech = technologyAt(game),
    i = game.decisions.length;
  const volatility = (randomAt(game.seed, i) - 0.5) * 0.07;
  const aiBenefit = tech * job.complement * (game.skill / 100) * 0.1;
  const transitionCost = tech * job.exposure * (1 - game.skill / 125) * 0.075;
  const burnout = game.health < 30 ? -0.035 : 0;
  const growth = clamp(
    0.006 +
      volatility +
      aiBenefit -
      transitionCost +
      (choice === "focus" ? 0.023 : 0) +
      burnout,
    -0.12,
    0.12,
  );
  const income = clamp(game.income * (1 + growth), 0, 20000);
  const disposable = income * 0.76; // a game assumption, not a tax calculation
  const expenses = p.monthlyCost * 12 + c.cost;
  const bonus =
    choice === "explore" ? (randomAt(game.seed, i, 1) - 0.5) * 30 : 0;
  const savings = game.savings + disposable - expenses + bonus;
  const health = clamp(
    game.health + c.health - 0.8 + (p.priority === "time" ? 0.8 : 0),
  );
  const connection = clamp(
    game.connection + c.connection - 1 + (p.priority === "people" ? 0.8 : 0),
  );
  const freedom = clamp(
    game.freedom + c.freedom - 0.5 + (p.priority === "freedom" ? 0.8 : 0),
  );
  const skill = clamp(game.skill + c.skill - 2 * SCENARIOS[game.scenario].pace);
  const note =
    choice === "learn"
      ? "学びへの投資が、次の選択肢を少し広げた。"
      : choice === "focus"
        ? "経験を深めた一年。忙しさの分、休む時間にも目を向けたい。"
        : choice === "connect"
          ? "誰かと過ごした時間が、暮らしの支えになった。"
          : choice === "rest"
            ? "自分をいたわる時間を取った。長く続けるための一年。"
            : bonus > 0
              ? "小さな挑戦に手応えがあった。続けるかどうかは、また選べる。"
              : "挑戦はすぐ収入にはつながらなかった。それでも経験が残った。";
  const record = {
    year: game.year,
    age: game.age,
    choice,
    title: eventFor(game).title,
    income,
    savings,
    health,
    connection,
    freedom,
    skill,
    note,
    aiBenefit,
    transitionCost,
    volatility,
    expenses,
    disposable,
    bonus,
  };
  return {
    ...game,
    year: game.year + 1,
    age: game.age + 1,
    income,
    savings,
    health,
    connection,
    freedom,
    skill,
    decisions: [...game.decisions, choice],
    history: [...game.history, record],
  };
}
export function replay(profile, scenario, seed, decisions) {
  if (!Array.isArray(decisions) || decisions.length > YEARS) fail();
  return decisions.reduce(
    (game, choice) => advance(game, choice),
    createGame(profile, scenario, seed),
  );
}
export function compareWorlds(game) {
  return Object.keys(SCENARIOS).map((scenario) =>
    replay(game.profile, scenario, game.seed, game.decisions),
  );
}
export function encodeSave(game) {
  return JSON.stringify({
    version: VERSION,
    profile: game.profile,
    scenario: game.scenario,
    seed: game.seed,
    decisions: game.decisions,
  });
}
export function decodeSave(value) {
  if (typeof value !== "string" || value.length > 12000) fail();
  const data = JSON.parse(value);
  if (!data || data.version !== VERSION) fail();
  return replay(data.profile, data.scenario, data.seed, data.decisions);
}
