import {
  createGame,
  advance,
  optionalProfileInputs,
} from "../public/engine.js";

// Fictional people and finances. Public employer evidence is a dated snapshot;
// no saved game or personal profile is read by this evaluation.
export function modelEvaluationCases() {
  const base = {
    age: 32,
    region: "city",
    job: "tech",
    occupation: "infrastructure",
    industry: "services",
    municipality: "あおば市",
    jobDetail: "顧客のクラウド基盤の運用改善",
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
    company: "キンドリルジャパン株式会社",
    careerNotes:
      "AWSとSREの経験を活かし、顧客と一緒に業務改善を試したい。英語も学びたい。",
    companyFacts: {
      summary: "企業のITインフラの設計・構築・管理・モダナイズを行う日本法人。",
      sector: "tech",
      confirmed: true,
      sources: [
        {
          url: "https://www.kyndryl.com/jp/ja/about-us/kyndryl-japan-kk",
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
    intent: "AWSと英語を毎日1時間学び、顧客に説明する",
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
    create({ age: 64, savings: 3000, occupation: "infrastructure" }, 20),
    "retire",
  );
  return [
    {
      id: "si-profile",
      game: create(),
      mode: "life",
      screen: true,
      review:
        "確認した日本法人の事業・AWS/SRE・市・生活から具体的な迷い。転職済みにしない。",
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
