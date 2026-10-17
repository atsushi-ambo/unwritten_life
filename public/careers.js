// Public business descriptions are dated evidence. Simulation coefficients live
// in engine.js and are game assumptions, never company pay or hiring estimates.
export const EMPLOYERS = Object.freeze({
  microsoft: {
    name: "Microsoft",
    kind: "real",
    sector: "tech",
    companyType: "large",
    summary:
      "クラウド、開発者向けの製品やサービス、AIアシスタントCopilotを提供。",
    url: "https://www.microsoft.com/en-us/about",
    checkedAt: "2026-10-17",
  },
  toyota: {
    name: "トヨタ自動車",
    kind: "real",
    sector: "physical",
    companyType: "large",
    summary: "自動車の生産・販売を主な事業とする。",
    url: "https://global.toyota/en/company/profile/overview/",
    checkedAt: "2026-10-17",
  },
  nintendo: {
    name: "任天堂",
    kind: "real",
    sector: "creative",
    companyType: "large",
    summary: "家庭用レジャー機器の製造・販売を事業とする。",
    url: "https://www.nintendo.co.jp/corporate/outline/index.html",
    checkedAt: "2026-10-17",
  },
  layerx: {
    name: "LayerX",
    kind: "real",
    sector: "tech",
    companyType: "small",
    summary:
      "バクラク事業で、経費精算・請求書受取などバックオフィス業務を支援するAIエージェントを提供。",
    url: "https://jobs.layerx.co.jp/business/bakuraku/",
    checkedAt: "2026-10-17",
  },
  machi: {
    name: "まちケア・ロボティクス",
    kind: "fictional",
    sector: "care",
    companyType: "small",
    availableFrom: 2036,
    summary:
      "架空の2036年設立企業。地域のケアと生活支援ロボットを組み合わせる。",
  },
  orbit: {
    name: "オービット循環工房",
    kind: "fictional",
    sector: "physical",
    companyType: "small",
    availableFrom: 2036,
    summary:
      "架空の2036年設立企業。AIと小型工場で、地域の修理・資源循環を支える。",
  },
  memory: {
    name: "灯りメモリー・スタジオ",
    kind: "fictional",
    sector: "creative",
    companyType: "small",
    availableFrom: 2041,
    summary:
      "架空の2041年設立企業。人の体験をもとに、AIと共に新しい物語や遊びをつくる。",
  },
});
export const VENTURES = Object.freeze({
  ai: {
    label: "AIで地域や企業の困りごとを解く",
    sector: "tech",
    setup: 60,
    overhead: 24,
    detail: "小さく受託から始める。AIの普及で需要も競争も変わる。",
  },
  studio: {
    label: "創作・ゲームのスタジオをつくる",
    sector: "creative",
    setup: 100,
    overhead: 36,
    detail: "作品と顧客を育てる。制作道具の進歩と価格競争に向き合う。",
  },
  community: {
    label: "地域の暮らしを支える事業をつくる",
    sector: "care",
    setup: 180,
    overhead: 60,
    detail: "人との信頼を軸に、小さな生活支援サービスを始める。",
  },
});
export function careerCandidates(game) {
  return Object.entries(EMPLOYERS)
    .filter(
      ([id, c]) =>
        game.year >= (c.availableFrom ?? 2026) && game.employer?.id !== id,
    )
    .map(([id, c]) => ({ id, ...c }));
}
