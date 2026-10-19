import { workContext } from "./careers.js";

// Reviewed source material, shipped with the app. No player or AI output is
// admitted to this catalog. Increment the revision when a record changes.
export const KNOWLEDGE_REVISION = "2026-10-19.1";
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const checkedAt = "2026-10-17";
const history = [
  {
    id: "history-mobile-2000-2015",
    year: "2000 → 2015",
    endYear: 2015,
    title: "携帯電話も、基盤と市場とともに広がった",
    detail:
      "ITUの2015年資料では、世界の携帯電話契約は約7.38億から70億超へ。契約数は人数ではなく、インターネット利用者数やAIの導入率とは比較できない。",
    source: "ITU / ICT Facts & Figures 2015",
    url: "https://www.itu.int/en/ITU-D/statistics/documents/facts/ICTfactsfigures2015.pdf",
    tags: ["technology", "adoption", "rural"],
  },
  {
    id: "history-internet-2020-2025",
    year: "2020 → 2025",
    endYear: 2025,
    title: "インターネットは、時間をかけて広がった",
    detail:
      "世界のインターネット利用者の割合は60%から74%へ（ITU推計）。人口の利用率であり、企業のAI導入率とは別の指標。",
    source: "ITU / ICT Statistics",
    url: "https://www.itu.int/en/ITU-D/Statistics/Pages/stat/default.aspx",
    tags: ["technology", "adoption", "work:product", "rural"],
  },
  {
    id: "history-ai-enterprises-2023-2025",
    year: "2023 → 2025",
    endYear: 2025,
    title: "AIの導入は、業種によって違う",
    detail:
      "データのあるOECD加盟国の企業のAI利用は8.7%から20.2%へ。2025年のICT企業では57.3%。日本だけの値でも、生成AIだけの値でもない。",
    source: "OECD / Artificial intelligence",
    url: "https://www.oecd.org/en/topics/artificial-intelligence.html",
    tags: [
      "technology",
      "adoption",
      "job:tech",
      "job:office",
      "work:services",
      "work:inhouse",
    ],
  },
  {
    id: "history-japan-cycle-16",
    year: "2018.10 → 2020.05",
    endYear: 2020,
    title: "日本の景気にも、山と谷がある",
    detail:
      "内閣府が確定した第16循環の景気の山と谷。未来にも同じ時期・長さの不況が来るという意味ではない。",
    source: "内閣府 / 景気基準日付（2022年7月確定）",
    url: "https://www.esri.cao.go.jp/jp/stat/di/220719shiryou1.pdf",
    tags: ["economy", "business", "shock"],
  },
  {
    id: "history-web-1989",
    year: "1989",
    endYear: 1989,
    title: "Webは、情報共有の課題から生まれた",
    detail:
      "Tim Berners-LeeがCERNでWorld Wide Webを考案。研究者の情報共有という課題が出発点だった。発明の年と社会全体への普及の年は同じではない。",
    source: "CERN / The birth of the Web",
    url: "https://home.cern/science/computing/the-birth-of-the-web/",
    tags: ["technology", "job:tech", "work:product"],
  },
  {
    id: "history-web-open-1993",
    year: "1993.04.30",
    endYear: 1993,
    title: "Webのソフトウェアが公開された",
    detail:
      "CERNがWebのソフトウェアをパブリックドメインに置いた。公開の事実は確定した過去。将来のAIも同じ条件で広がると保証する資料ではない。",
    source: "CERN / The birth of the Web",
    url: "https://home.cern/science/computing/the-birth-of-the-web/",
    tags: ["technology", "business", "work:product"],
  },
  {
    id: "history-transformer-2017",
    year: "2017.06",
    endYear: 2017,
    title: "Transformerが論文で提案された",
    detail:
      "VaswaniらのAttention Is All You Needが、注意機構に基づくTransformerを提案した。研究成果の公表と、各職場の導入は別の出来事。",
    source: "Vaswani et al. / Attention Is All You Need",
    url: "https://arxiv.org/abs/1706.03762",
    tags: ["technology", "job:tech", "study"],
  },
  {
    id: "history-pandemic-2020",
    year: "2020.03.11",
    endYear: 2020,
    title: "世界的な感染拡大も、過去の出来事",
    detail:
      "WHOはCOVID-19の流行をパンデミックと位置づけた。この歴史を未来の同じ年に再発させたり、本人の感染・健康の予測に使ったりはしない。",
    source: "WHO / Coronavirus disease (COVID-19) pandemic",
    url: "https://www.who.int/europe/emergencies/situations/covid-19",
    tags: ["shock", "job:care", "family"],
  },
].map((entry) => ({ ...entry, kind: "history", checkedAt, asOf: checkedAt }));

// Descriptions of existing mechanics, not estimated real-world probabilities.
const rules = [
  [
    "rule-technology",
    "進歩と普及は別に進む",
    "技術能力と現場への浸透は別のゲーム指標。業種・地域・選んだ世界で浸透が変わる。過去の普及率を将来のAIの確率にしない。",
    ["technology"],
  ],
  [
    "rule-product",
    "自社サービスの経験を次につなぐ",
    "仕事の形が自社サービスなら、利用者の声、開発・運営の改善、継続した検証との接点を提案に使う。本人が未入力の経験は仮定とし、給与や確率を上乗せしない。",
    ["work:product"],
  ],
  [
    "rule-services",
    "受託・SIの経験を次につなぐ",
    "仕事の形が受託・SIなら、顧客の課題や案件の進め方との接点を提案に使う。経験済みの業界や技術は勝手に補わず、同業・別業界・残留にも具体的な迷いを作る。",
    ["work:services"],
  ],
  [
    "rule-inhouse",
    "事業と現場の経験を次につなぐ",
    "社内IT・業務部門なら、事業や現場の課題との接点を提案に使う。会社名だけで仕事内容や採用要件を確定しない。",
    ["work:inhouse"],
  ],
  [
    "rule-learning",
    "努力の蓄積と、評価の結果を分ける",
    "毎日1時間の学習はゲーム内で年間365時間を累積する。学びは後の確率に影響するが、景気や需要によって評価・収入につながらない年もある。結果の判定はゲーム側。",
    ["study"],
  ],
  [
    "rule-business",
    "起業には負担と分岐がある",
    "初期費用と運営費をゲーム側で計算する。顧客の手応え、事業の成長、不調、方向転換、撤退を区別し、前職を超える収入を約束しない。",
    ["business"],
  ],
  [
    "rule-family",
    "家族の希望と、実際の暮らしを分ける",
    "記録された家族・子の年代・希望・直前の結果を使う。希望人数は保証ではなく、準備や希望の見直しも別の選択。家族のいない人物に配偶者や子を作らない。",
    ["family"],
  ],
  [
    "rule-housing",
    "住まいと資産は同じ財布にしない",
    "現金、株式、不動産評価、住宅ローン、生活費を分けて計算する。賃貸か持ち家かと手元の余裕を次の選択に反映し、不動産の評価を使える現金として扱わない。",
    ["housing"],
  ],
  [
    "rule-world",
    "世界の局面は選択だけでは消えない",
    "景気・勤務先の業況・国際情勢は架空のゲーム状態。努力しても逆風の年がある。同じ人生の乱数を保ち、戻って選び直すだけで世界の混乱を抽選し直さない。",
    ["economy", "shock"],
  ],
].map(([id, title, detail, tags]) => ({
  id,
  title,
  detail,
  tags,
  kind: "game-rule",
  year: "ゲーム内の設計",
  source: "Unwritten Life / ゲームの仮定",
  checkedAt,
  asOf: checkedAt,
}));
export const KNOWLEDGE = freeze([...history, ...rules]);
export const HISTORICAL_FACTS = freeze(
  KNOWLEDGE.filter((r) => r.kind === "history"),
);

// This index is built from the current validated game state, not free text or
// user-supplied tags. Selection changes after actions, without an LLM call.
export function knowledgeFor(
  game,
  { catalog = KNOWLEDGE, mode = "life" } = {},
) {
  const work = workContext(game).model;
  const tags = new Map([
    ["technology", 1],
    [`job:${game.employer.role}`, 3],
  ]);
  const add = (tag, weight) => tags.set(tag, weight);
  add(`work:${work}`, 6);
  if (game.region === "rural") add("rural", 3);
  if (game.housing === "own") add("housing", 3);
  if (game.family?.childAges.length || game.family?.partner) add("family", 4);
  if (game.family?.desired > 0) add("family", 4);
  if (game.employer.kind === "venture") add("business", 5);
  const last = game.decisions.at(-1);
  const action = typeof last === "string" ? last : last?.id;
  if (["learn", "studyDaily", "pilot"].includes(action)) add("study", 10);
  if (
    ["startup", "expand", "pivot", "closeBusiness", "opportunity"].includes(
      action,
    )
  )
    add("business", 10);
  if (["familyPlan", "reconsiderFamily", "careLeave", "meet"].includes(action))
    add("family", 10);
  if (["home", "move", "invest", "cash"].includes(action)) add("housing", 10);
  const lastWorld = game.history.at(-1)?.world;
  if (lastWorld?.economy.id === "downturn") add("economy", 5);
  if (lastWorld && lastWorld.shock.id !== "calm") add("shock", 7);
  const score = (r) => r.tags.reduce((n, tag) => n + (tags.get(tag) ?? 0), 0);
  const ranked = catalog
    // Knowledge known at the 2026 starting point stays a dated snapshot even
    // in 2050. It never claims to be an up-to-date corporate announcement.
    .filter(
      (r) =>
        r.asOf <= `${Math.min(game.year, 2026)}-12-31` &&
        (!r.endYear || r.endYear <= game.year),
    )
    .map((record, index) => ({ record, index, score: score(record) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const pick = (kind, limit) =>
    ranked
      .filter((r) => r.record.kind === kind && r.score > 0)
      .slice(0, limit)
      .map((r) => r.record);
  return {
    revision: KNOWLEDGE_REVISION,
    historical: pick("history", 2),
    rules: pick("game-rule", mode === "career" ? 3 : 4),
  };
}

// Prompt packets omit internal search tags and duplicate source metadata.
export function referencePacket(record) {
  return {
    id: record.id,
    kind: record.kind,
    period: record.year,
    title: record.title,
    detail: record.detail,
    source: record.source,
    ...(record.url ? { url: record.url } : {}),
    asOf: record.asOf,
  };
}

// A cache of the reviewed bundled catalog only. There is deliberately no API
// for saving a profile, a prompt, a player outcome or generated "facts" here.
export const KNOWLEDGE_DB = "unwritten-life-knowledge";
export async function loadKnowledge({ indexedDB, timeoutMs = 2500 } = {}) {
  const fallback = {
    catalog: KNOWLEDGE,
    revision: KNOWLEDGE_REVISION,
    storage: "bundled",
  };
  try {
    if (indexedDB === undefined) indexedDB = globalThis.indexedDB;
  } catch {
    return fallback;
  }
  if (!indexedDB) return fallback;
  return new Promise((resolve) => {
    let db,
      transaction,
      finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      db?.close();
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        transaction?.abort();
      } catch {}
      finish(fallback);
    }, timeoutMs);
    try {
      const open = indexedDB.open(KNOWLEDGE_DB, 1);
      open.onupgradeneeded = () => {
        if (finished) {
          open.transaction.abort();
          return;
        }
        const connection = open.result;
        connection.createObjectStore("records", { keyPath: "id" });
        connection.createObjectStore("meta", { keyPath: "id" });
      };
      open.onerror = open.onblocked = () => finish(fallback);
      open.onsuccess = () => {
        db = open.result;
        if (finished) {
          db.close();
          return;
        }
        db.onversionchange = () => db.close();
        try {
          transaction = db.transaction(["records", "meta"], "readwrite");
          const records = transaction.objectStore("records");
          const meta = transaction.objectStore("meta");
          const read = records.getAll(undefined, KNOWLEDGE.length + 1);
          let catalog;
          read.onsuccess = () => {
            const saved = read.result;
            const canonical = new Map(
              KNOWLEDGE.map((r) => [r.id, JSON.stringify(r)]),
            );
            // Do not trust a version string or values edited by another tab.
            const valid =
              saved.length === KNOWLEDGE.length &&
              saved.every((r) => {
                try {
                  return !!r && canonical.get(r.id) === JSON.stringify(r);
                } catch {
                  return false;
                }
              });
            if (valid)
              catalog = saved.sort(
                (a, b) =>
                  KNOWLEDGE.findIndex((r) => r.id === a.id) -
                  KNOWLEDGE.findIndex((r) => r.id === b.id),
              );
            else {
              records.clear();
              KNOWLEDGE.forEach((r) => records.put(r));
              catalog = KNOWLEDGE;
            }
            meta.put({
              id: "catalog",
              revision: KNOWLEDGE_REVISION,
              count: KNOWLEDGE.length,
            });
          };
          transaction.oncomplete = () =>
            finish({
              catalog,
              revision: KNOWLEDGE_REVISION,
              storage: "indexeddb",
            });
          transaction.onerror = transaction.onabort = () => finish(fallback);
        } catch {
          finish(fallback);
        }
      };
    } catch {
      finish(fallback);
    }
  });
}

export const TONES = Object.freeze({
  realistic: "現実寄り",
  speculative: "少しSFもある未来",
});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function roll(seed, year, channel) {
  let n =
    (seed ^
      Math.imul(year + 1, 0x45d9f3b) ^
      Math.imul(channel + 1, 0x27d4eb2d)) >>>
    0;
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function companyKey(employer) {
  let n = 2166136261;
  for (const c of `${employer.id}:${employer.facts?.confirmed ? employer.facts.sources.map((s) => s.url).join("|") : "unconfirmed"}`)
    n = Math.imul(n ^ c.codePointAt(0), 16777619);
  return n >>> 0;
}
export const worldEnabled = (g) => g.decisions.length >= (g.worldFrom ?? 0);
// All coefficients below are game design assumptions, not estimated forecasts.
// Capability and diffusion differ; adoption can lag because of institutions,
// cost and implementation. The slow/steady/fast curves are sensitivity cases.
export function worldAt(g, employer = g.employer) {
  const t = g.year - 2026,
    epoch = Math.floor(t / 3);
  const speed = { slow: 0.095, steady: 0.16, fast: 0.255 }[g.scenario];
  const capability = 1 / (1 + Math.exp(1.1 - speed * 1.5 * t));
  const sector = employer.facts?.confirmed
    ? employer.facts.sector
    : employer.sector;
  const lag =
    { tech: 0, office: 2, creative: 1, people: 4, care: 8, physical: 7 }[
      sector
    ] ?? 4;
  const adoption = clamp(
    (1 / (1 + Math.exp(1.5 - speed * (t - lag)))) *
      (g.region === "rural" ? 0.9 : 1),
    0.02,
    0.97,
  );
  const shockRoll = roll(g.seed, epoch, 70),
    cycle = roll(g.seed, epoch, 71);
  let shock = {
    id: "calm",
    label: "大きな国際混乱のない局面",
    body: "世界の取引は続く。企業や個人の成果には、なお差がある。",
    growth: 0,
    market: 0,
    costs: 0,
  };
  if (shockRoll < 0.07)
    shock = {
      id: "conflict",
      label: "国際紛争と貿易の混乱",
      body: "架空の国際紛争で物流・取引が滞る。良い仕事をしても、受注や待遇が伸びにくい。",
      growth: -0.055,
      market: -0.16,
      costs: 0.07,
    };
  else if (shockRoll < 0.15)
    shock = {
      id: "climate",
      label: "気候災害と供給の混乱",
      body: "架空の広域災害で、供給や暮らしの維持に負担がかかる。",
      growth: -0.03,
      market: -0.07,
      costs: 0.04,
    };
  else if (shockRoll > 0.88)
    shock = {
      id: "cooperation",
      label: "国際協調と投資の広がり",
      body: "架空の協調局面で、新たな仕事や投資の機会が生まれる。",
      growth: 0.025,
      market: 0.06,
      costs: 0,
    };
  const economy =
    shock.growth < -0.03 || cycle < 0.23
      ? { id: "downturn", label: "日本経済：後退局面", growth: -0.025 }
      : cycle > 0.72
        ? { id: "expansion", label: "日本経済：拡大局面", growth: 0.02 }
        : { id: "mixed", label: "日本経済：まだらな成長", growth: 0 };
  const firmRoll = roll(g.seed ^ companyKey(employer), epoch, 72);
  const firmScore = firmRoll + economy.growth * 3 + shock.growth * 2;
  const company =
    firmScore < 0.24
      ? { id: "pressure", label: "勤務先：受注と予算に逆風", growth: -0.035 }
      : firmScore > 0.72
        ? { id: "growing", label: "勤務先：事業機会が拡大", growth: 0.025 }
        : { id: "stable", label: "勤務先：足場を固める", growth: 0 };
  const sf =
    g.profile.tone === "speculative" &&
    t >= 10 &&
    roll(g.seed, epoch, 73) < 0.25;
  return {
    year: g.year,
    since: 2026 + epoch * 3,
    until: 2028 + epoch * 3,
    capability,
    adoption,
    shock,
    economy,
    company,
    frontier: sf
      ? "SFの仮定：汎用ロボットの実証が、地域の仕事やケアに広がる。普及も成功も確定していない。"
      : "",
    growth: economy.growth + company.growth + shock.growth,
    demand: clamp(
      0.5 + economy.growth * 4 + company.growth * 4 + shock.growth * 4,
      0.05,
      0.85,
    ),
    hypothetical: true,
  };
}
export function opportunityAt(g) {
  const offers = [
    {
      venture: "agriculture",
      name: "みのり循環農園",
      label: "知人と小さな農園を始める",
      setup: 140,
    },
    {
      venture: "studio",
      name: "灯りゲーム工房",
      label: "仲間とゲーム工房を始める",
      setup: 100,
    },
    {
      venture: "community",
      name: "まちの手サポート",
      label: "地域の生活支援を事業にする",
      setup: 180,
    },
    {
      venture: "ai",
      name: "つなぐAI相談室",
      label: "企業向けAI相談室を始める",
      setup: 60,
    },
  ];
  const offer =
    offers[Math.floor(roll(g.seed, g.decisions.length, 76) * offers.length)];
  return g.cash >= offer.setup && !g.retired && g.employer.kind !== "venture"
    ? offer
    : null;
}
