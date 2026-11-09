import {
  createGame,
  advance,
  optionalProfileInputs,
} from "../public/engine.js";

// Entirely synthetic people, finances and employer evidence;
// no saved game or personal profile is read by this evaluation.
export function modelEvaluationCases() {
  const base = {
    age: 32,
    region: "city",
    job: "office",
    occupation: "office",
    industry: "retail",
    municipality: "あおば市",
    jobDetail: "店舗の在庫確認と発注の調整",
    income: 600,
    savings: 800,
    monthlyCost: 12,
    rent: 7,
    ai: "daily",
    priority: "balance",
    gender: "undisclosed",
    household: "solo",
    companyType: "large",
    workModel: "services",
    company: "合成サービス株式会社",
    careerNotes:
      "接客の経験を活かし、店舗の研修企画に挑戦したい。",
    companyFacts: {
      summary: "合成の業務支援サービスを提供する架空企業。",
      sector: "office",
      confirmed: true,
      sources: [
        {
          url: "https://company.example.com/about",
          title: "公式会社概要",
          checkedAt: "2026-10-17",
        },
      ],
    },
  };
  const create = (patch = {}, seed = 42) =>
    createGame(optionalProfileInputs({ ...base, ...patch }), "steady", seed);
  const study = advance(create({}, 4), {
    id: "studyDaily",
    intent: "発注管理と接客を毎日1時間学び、店舗で試す",
  });
  // Search only deterministic synthetic engine states, never ask AI to invent
  // the success/failure used to judge factual consistency.
  let success;
  for (let seed = 0; seed < 500; seed++) {
    const g = advance(create({}, seed), {
      id: "startup",
      venture: "studio",
      name: "合成スタジオ",
    });
    if (g.history.at(-1).outcome.kind === "success" && g.income < base.income) {
      success = g;
      break;
    }
  }
  let failure;
  for (let seed = 0; seed < 500; seed++) {
    const g = advance(
      advance(create({}, seed), {
        id: "startup",
        venture: "ai",
        name: "合成事業",
      }),
      "focus",
    );
    if (g.history.at(-1).outcome.kind === "failure") {
      failure = g;
      break;
    }
  }
  if (!success || !failure || study.income >= base.income)
    throw Error("Evaluation outcome fixtures changed");
  const family = advance(
    create(
      {
        household: "shared",
        partner: "partner",
        children: 2,
        childStage: "young",
        childrenWish: "two",
        housing: "own",
        homeValue: 3000,
        mortgage: 1800,
        mortgageYears: 25,
        rent: 0,
      },
      4,
    ),
    "reconsiderFamily",
  );
  const marketing = create(
    {
      job: "marketing",
      occupation: "marketing",
      industry: "software",
      workModel: "product",
      company: "合成SaaS社",
      companyFacts: null,
      jobDetail: "自社サービスの顧客調査と広告改善",
      careerNotes: "顧客の声を企画へつなげたい。子どもとの時間も大切にしたい。",
      household: "shared",
      partner: "partner",
      children: 1,
      childStage: "young",
    },
    52,
  );
  const care = create(
    {
      job: "care",
      occupation: "medical",
      industry: "medical",
      region: "rural",
      municipality: "あおば町",
      company: "合成地域病院",
      companyType: "public",
      workModel: "public",
      companyFacts: null,
      jobDetail: "病棟の看護と新人への指導",
      careerNotes:
        "看護を続けながら、現場の事務を少し減らしたい。転職だけが希望ではない。",
      careerGoal: "balance",
      income: 420,
      savings: 250,
    },
    87,
  );
  const retired = advance(
    create({ age: 64, savings: 3000, occupation: "office" }, 20),
    "retire",
  );
  return [
    {
      id: "si-profile",
      game: create(),
      mode: "life",
      screen: true,
      review:
        "合成企業の事業・仕事・市・生活から具体的な迷い。転職済みにしない。",
    },
    {
      id: "study-income-fall",
      game: study,
      mode: "life",
      review:
        "勉強の評価と実際の収入減を両立。国際情勢はゲーム内仮定として扱う。",
    },
    {
      id: "startup-success-income-fall",
      game: success,
      mode: "life",
      review: "事業の成功を年収増や利益保証へ読み替えない。",
    },
    {
      id: "business-failure",
      game: failure,
      mode: "life",
      screen: true,
      review: "事業失敗・撤退後の次の一歩。元の会社に勤め続けているとしない。",
    },
    {
      id: "family-wish",
      game: family,
      mode: "life",
      review: "子ども2人と持ち家・ローン、3人目の希望だけ。出生を確定しない。",
    },
    {
      id: "product-marketing",
      game: marketing,
      mode: "life",
      screen: true,
      review:
        "技術職のテンプレートを使わず、自社SaaSのマーケティングと子育てに合う選択。",
    },
    {
      id: "regional-care",
      game: care,
      mode: "life",
      review: "看護・地域・仕事と生活の両立。エンジニアへ決めつけない。",
    },
    {
      id: "retired",
      game: retired,
      mode: "life",
      review: "退職後の暮らし。現職の給与交渉や転職を前提にしない。",
    },
    {
      id: "career-four",
      game: create(),
      mode: "career",
      review:
        "SI経験に近い道・異分野・意外性・現職に残る。異なる会社3社と残留の実行可能な4択。",
    },
  ];
}
