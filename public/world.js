// Observations are reference material, never calibration of personal outcomes.
export const HISTORICAL_FACTS = Object.freeze([
  {
    year: "2000 → 2015",
    title: "携帯電話も、基盤と市場とともに広がった",
    detail:
      "ITUの2015年資料では、世界の携帯電話契約は約7.38億から70億超へ。契約数は人数ではなく、インターネット利用者数やAIの導入率とは比較できない。",
    source: "ITU / ICT Facts & Figures 2015",
    url: "https://www.itu.int/en/ITU-D/statistics/documents/facts/ICTfactsfigures2015.pdf",
  },
  {
    year: "2020 → 2025",
    title: "インターネットは、時間をかけて広がった",
    detail:
      "世界のインターネット利用者の割合は60%から74%へ（ITU推計）。人口の利用率であり、企業のAI導入率とは別の指標。",
    source: "ITU / ICT Statistics",
    url: "https://www.itu.int/en/ITU-D/Statistics/Pages/stat/default.aspx",
  },
  {
    year: "2023 → 2025",
    title: "AIの導入は、業種によって違う",
    detail:
      "データのあるOECD加盟国の企業のAI利用は8.7%から20.2%へ。2025年のICT企業では57.3%。日本だけの値でも、生成AIだけの値でもない。",
    source: "OECD / Artificial intelligence",
    url: "https://www.oecd.org/en/topics/artificial-intelligence.html",
  },
  {
    year: "2018.10 → 2020.05",
    title: "日本の景気にも、山と谷がある",
    detail:
      "内閣府が確定した第16循環の景気の山と谷。未来にも同じ時期・長さの不況が来るという意味ではない。",
    source: "内閣府 / 景気基準日付（2022年7月確定）",
    url: "https://www.esri.cao.go.jp/jp/stat/di/220719shiryou1.pdf",
  },
]);
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
