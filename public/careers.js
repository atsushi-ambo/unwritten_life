// Public business descriptions are dated evidence. Simulation coefficients live
// in engine.js and are game assumptions, never company pay or hiring estimates.
export const EMPLOYERS = Object.freeze({
  microsoft: {
    name: "Microsoft",
    kind: "real",
    industry: "software",
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
    industry: "manufacturing",
    sector: "physical",
    companyType: "large",
    summary: "自動車の生産・販売を主な事業とする。",
    url: "https://global.toyota/en/company/profile/overview/",
    checkedAt: "2026-10-17",
  },
  nintendo: {
    name: "任天堂",
    kind: "real",
    industry: "entertainment",
    sector: "creative",
    companyType: "large",
    summary: "家庭用レジャー機器の製造・販売を事業とする。",
    url: "https://www.nintendo.co.jp/corporate/outline/index.html",
    checkedAt: "2026-10-17",
  },
  layerx: {
    name: "LayerX",
    kind: "real",
    industry: "software",
    sector: "tech",
    companyType: "small",
    summary:
      "バクラク事業で、経費精算・請求書受取などバックオフィス業務を支援するAIエージェントを提供。",
    url: "https://jobs.layerx.co.jp/business/bakuraku/",
    checkedAt: "2026-10-17",
  },
  nttdata: {
    name: "NTTデータ",
    aliases: ["株式会社NTTデータ", "NTT DATA"],
    kind: "real",
    industry: "it-services",
    sector: "tech",
    companyType: "large",
    summary: "国内で公共・社会基盤、金融、法人向けなどのITサービスを展開する。",
    url: "https://www.nttdata.com/jp/ja/about-us/profile/",
    checkedAt: "2026-10-17",
  },
  mizuho: {
    name: "みずほ銀行",
    aliases: ["株式会社みずほ銀行", "Mizuho Bank"],
    kind: "real",
    industry: "finance",
    sector: "office",
    companyType: "large",
    summary: "預金、貸出、為替などの銀行業務を提供する。",
    url: "https://www.mizuhobank.co.jp/company/info/profile/index.html",
    checkedAt: "2026-10-17",
  },
  chugai: {
    name: "中外製薬",
    aliases: ["中外製薬株式会社", "Chugai", "Chugai Pharmaceutical"],
    kind: "real",
    industry: "health",
    sector: "care",
    companyType: "large",
    summary: "医療用医薬品の研究・開発などを行う製薬企業。",
    url: "https://www.chugai-pharm.co.jp/profile/index.html",
    checkedAt: "2026-10-17",
  },
  machi: {
    name: "まちケア・ロボティクス",
    kind: "fictional",
    industry: "care",
    sector: "care",
    companyType: "small",
    availableFrom: 2036,
    summary:
      "架空の2036年設立企業。地域のケアと生活支援ロボットを組み合わせる。",
  },
  orbit: {
    name: "オービット循環工房",
    kind: "fictional",
    industry: "circular",
    sector: "physical",
    companyType: "small",
    availableFrom: 2036,
    summary:
      "架空の2036年設立企業。AIと小型工場で、地域の修理・資源循環を支える。",
  },
  memory: {
    name: "灯りメモリー・スタジオ",
    kind: "fictional",
    industry: "entertainment",
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
  agriculture: {
    label: "小さな農園・地域の食の事業を始める",
    sector: "physical",
    setup: 140,
    overhead: 48,
    detail:
      "架空の小規模農園。顧客づくりに加え、気候や物流の影響も受ける。設備・規模・費用はゲーム用の仮定。",
  },
  community: {
    label: "地域の暮らしを支える事業をつくる",
    sector: "care",
    setup: 180,
    overhead: 60,
    detail: "人との信頼を軸に、小さな生活支援サービスを始める。",
  },
});
// This describes the player's work, separately from employer size or job title.
export const WORK_MODELS = Object.freeze({
  unknown: "まだ指定しない",
  product: "自社サービス・自社製品を育てる",
  services: "受託開発・SI・顧客の案件を支える",
  inhouse: "事業会社の社内IT・業務部門",
  public: "公共・非営利の仕事",
  self: "自営・フリーランス",
});
export function workContext(game) {
  const explicit =
    game.employer.workModel ??
    (game.employer.kind === "initial" ? game.profile.workModel : "unknown");
  const model = Object.hasOwn(WORK_MODELS, explicit) ? explicit : "unknown";
  return {
    model,
    description: WORK_MODELS[model],
    basis:
      model === "unknown"
        ? "不明。職種や会社名だけで断定しない"
        : game.employer.proposal
          ? "ゲーム内の仮定"
          : "本人の入力",
    proposal: game.employer.proposal ?? null,
    note: "会社の規模、業界、仕事の形、職種・専門は別の軸。同じエンジニアでも一律の候補にしない。",
  };
}
export function careerCandidates(game) {
  return Object.entries(EMPLOYERS)
    .filter(
      ([id, c]) =>
        game.year >= (c.availableFrom ?? 2026) &&
        game.employer?.id !== id &&
        ![c.name, ...(c.aliases ?? [])].some(
          (name) =>
            companyName(name) === companyName(game.employer?.name ?? ""),
        ),
    )
    .map(([id, c]) => ({ id, ...c }));
}

function companyName(name) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|[\s・.,（）()]/g, "");
}
export const INDUSTRIES = Object.freeze({
  software: "ソフトウェア・クラウド",
  "it-services": "ITサービス",
  manufacturing: "製造・モビリティ",
  entertainment: "エンターテインメント",
  finance: "金融",
  health: "医薬・研究",
  care: "生活支援・ケア",
  circular: "地域・資源循環",
});
const ROUTES = Object.freeze({
  tech: {
    core: ["it-services", "software"],
    bridge: ["finance", "manufacturing"],
    surprise: ["health", "entertainment", "care", "circular"],
    skill: "技術・開発の経験",
    work: "システムやデータ基盤を支える",
  },
  marketing: {
    core: ["entertainment", "software"],
    bridge: ["manufacturing", "finance"],
    surprise: ["health", "care", "circular", "it-services"],
    skill: "顧客理解や発信の経験",
    work: "顧客との接点や価値の伝え方を考える",
  },
  office: {
    core: ["finance", "it-services"],
    bridge: ["software", "manufacturing"],
    surprise: ["entertainment", "health", "care", "circular"],
    skill: "業務整理や管理の経験",
    work: "業務の仕組みと運営を整える",
  },
  creative: {
    core: ["entertainment", "software"],
    bridge: ["manufacturing", "it-services"],
    surprise: ["health", "finance", "care", "circular"],
    skill: "企画や制作の経験",
    work: "利用者に伝わる企画や体験をつくる",
  },
  people: {
    core: ["it-services", "software"],
    bridge: ["finance", "manufacturing"],
    surprise: ["entertainment", "health", "care", "circular"],
    skill: "対話や提案の経験",
    work: "利用者や取引先の課題を整理する",
  },
  care: {
    core: ["health", "care"],
    bridge: ["it-services", "finance"],
    surprise: ["software", "manufacturing", "entertainment", "circular"],
    skill: "人を支える現場の経験",
    work: "現場の声を運営やサービス改善へつなぐ",
  },
  physical: {
    core: ["manufacturing", "circular"],
    bridge: ["it-services", "software"],
    surprise: ["health", "entertainment", "finance", "care"],
    skill: "現場や工程改善の経験",
    work: "現場と仕組みをつなぎ、工程を改善する",
  },
});
// Role connections and rankings are game-writing rules, not evidence of jobs,
// suitability, hiring odds, pay or a company's actual internal assignments.
export function careerOffers(game) {
  if (game.retired || game.ended) return [];
  const role = Object.hasOwn(ROUTES, game.employer.role)
    ? game.employer.role
    : Object.hasOwn(ROUTES, game.profile.job)
      ? game.profile.job
      : "people";
  const route = ROUTES[role];
  const current =
    EMPLOYERS[game.employer.id] ?? careerIdentity(game.employer.name);
  const usedIndustries = new Set(current ? [current.industry] : []);
  const candidates = careerCandidates(game);
  const recent = game.history.slice(-3).map((h) => h.employer?.id);
  const offset = ((game.seed >>> 0) + game.year - 2026) >>> 0;
  const used = new Set();
  function pick(industries, rotate = true) {
    const preferred = industries.filter(
      (i) =>
        !usedIndustries.has(i) &&
        candidates.some((c) => c.industry === i && !used.has(c.id)),
    );
    const sequence =
      rotate && preferred.length
        ? [
            ...preferred.slice(offset % preferred.length),
            ...preferred.slice(0, offset % preferred.length),
          ]
        : preferred;
    for (const industry of sequence) {
      const pool = candidates.filter(
        (c) => c.industry === industry && !used.has(c.id),
      );
      const fresh = pool.filter((c) => !recent.includes(c.id));
      const choices = fresh.length ? fresh : pool;
      const c = choices[offset % choices.length];
      if (c) {
        used.add(c.id);
        usedIndustries.add(c.industry);
        return c;
      }
    }
    return null;
  }
  const allIndustries = Object.keys(INDUSTRIES);
  const near = pick(route.core) ?? pick(allIndustries);
  const bridge = pick(route.bridge) ?? pick(allIndustries);
  const surprise = pick(route.surprise) ?? pick(allIndustries);
  function offer(c, id, label, reason, tradeoff) {
    if (!c) return null;
    return {
      id,
      label,
      company: c.name,
      kind: c.kind,
      industry: INDUSTRIES[c.industry],
      role,
      work: `${INDUSTRIES[c.industry]}で、${route.work}役割（架空）`,
      reason,
      tradeoff,
      source: c.url ? { url: c.url, checkedAt: c.checkedAt } : null,
      decision: { id: "switch", target: c.id, role },
    };
  }
  const staying =
    game.employer.kind === "seeking"
      ? {
          id: "stay",
          label: "いまは暮らしを立て直す",
          company: "次の仕事を考える時間",
          role,
          work: "就職を急がず、心身と生活のペースを整える",
          reason: "次の判断に使う余裕をつくる。",
          tradeoff: "この選択だけでは新しい給与収入は生まれない。",
          decision: "rest",
        }
      : {
          id: "stay",
          label:
            game.employer.kind === "venture"
              ? "今の事業を続ける"
              : "今の会社に残る",
          company: game.employer.name,
          role,
          work: "今の仕事に力を注ぎ、実績を積む",
          reason: "これまでの経験や関係を生かし、今の場所で次の役割を探る。",
          tradeoff:
            "転職費用はかからないが、今の勤務先や世界の逆風の影響は受ける。",
          decision: "focus",
        };
  return [
    offer(
      near,
      "familiar",
      "経験を深める",
      `${route.skill}を生かしやすい仕事を、${near ? INDUSTRIES[near.industry] : "別の会社"}で考える。`,
      "組織や担当範囲は変わる。慣れた経験だけで成果が出るとは限らない。",
    ),
    offer(
      bridge,
      "bridge",
      "別の業界で生かす",
      `${route.skill}を、違う事業の課題へつなげる。`,
      "業界の知識や仕事の進め方を学び直す必要がある。",
    ),
    staying,
    offer(
      surprise,
      "surprise",
      "意外な接点を探す",
      `${route.skill}から、${surprise ? INDUSTRIES[surprise.industry] : "新しい分野"}を支える接点を考える。`,
      "未経験の領域も多い。準備に時間がかかり、期待どおりにならないこともある。",
    ),
  ].filter(Boolean);
}
function careerIdentity(name) {
  return Object.values(EMPLOYERS).find((c) =>
    [c.name, ...(c.aliases ?? [])].some(
      (n) => companyName(n) === companyName(name),
    ),
  );
}
export function employerKey(name) {
  return companyName(careerIdentity(name)?.name ?? name);
}

// Browser company search never fetches a URL supplied by a user or directory.
export async function browserDirectoryText(
  input,
  { maxBytes = 512000, timeout = 10000 } = {},
) {
  const url = new URL(input);
  if (
    url.origin !== "https://www.wikidata.org" ||
    url.pathname !== "/w/api.php" ||
    url.href.length > 4096 ||
    !["wbsearchentities", "wbgetentities"].includes(
      url.searchParams.get("action"),
    ) ||
    url.searchParams.get("origin") !== "*" ||
    url.searchParams.has("callback") ||
    url.username ||
    url.password
  )
    throw new Error("企業検索の接続先を確認してください。");
  const response = await fetch(url.href, {
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok)
    throw new Error(
      "企業検索に接続できませんでした。時間をおいてお試しください。",
    );
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("企業情報が容量の上限を超えました。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { status: response.status, text: new TextDecoder().decode(bytes) };
}
// Portable directory lookup; only its fixed Wikidata API URLs are fetched.
const normalizeLookup = (s) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|[\s・.]/gu, "");
const directoryAliases = {
  microsoft: ["マイクロソフト", "日本マイクロソフト"],
  toyota: ["トヨタ", "toyota"],
  nintendo: ["nintendo", "ニンテンドー"],
  layerx: ["レイヤーエックス"],
};
export function makeDirectorySearch({ transport } = {}) {
  async function wikidata(params) {
    const url = new URL("https://www.wikidata.org/w/api.php");
    url.search = new URLSearchParams({
      format: "json",
      origin: "*",
      ...params,
    });
    const r = await transport(url.href, { timeout: 10000, maxBytes: 512000 });
    if (r.status !== 200)
      throw new Error(
        "企業名の検索に接続できませんでした。時間をおいて再度お試しください。",
      );
    const d = JSON.parse(r.text);
    if (d.error) throw new Error("企業名を検索できませんでした。");
    return d;
  }
  return async function search(name) {
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 60 ||
      /[\u0000-\u001f\u007f]/u.test(name)
    )
      throw new Error("調べたい企業名を60文字以内で入力してください。");
    const query = normalizeLookup(name.trim());
    for (const [id, c] of Object.entries(EMPLOYERS)) {
      if (
        c.kind === "real" &&
        [
          c.name,
          id,
          ...(c.aliases ?? []),
          ...(directoryAliases[id] ?? []),
        ].some((s) => normalizeLookup(s) === query)
      ) {
        return [
          {
            name: c.name,
            url: c.url,
            description: c.summary,
            sector: c.sector,
            directory: "公式資料リスト",
            known: true,
            checkedAt: c.checkedAt,
          },
        ];
      }
    }
    const result = await wikidata({
      action: "wbsearchentities",
      search: name.trim(),
      language: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
        name,
      )
        ? "ja"
        : "en",
      uselang: "ja",
      limit: "5",
      type: "item",
    });
    const hits = (Array.isArray(result.search) ? result.search : [])
      .filter((x) => /^Q\d+$/.test(x.id))
      .slice(0, 5);
    if (!hits.length) return [];
    const data = await wikidata({
      action: "wbgetentities",
      ids: hits.map((h) => h.id).join("|"),
      props: "labels|descriptions|claims",
      languages: "ja|en",
    });
    const candidates = [];
    for (const hit of hits) {
      const entity = data.entities?.[hit.id];
      if (!entity || entity.missing !== undefined) continue;
      // A person, settlement or given name is not an employer candidate.
      const description =
        entity.descriptions?.ja?.value ??
        entity.descriptions?.en?.value ??
        hit.description ??
        "";
      if (
        !/企業|会社|法人|組織|銀行|大学|コングロマリット|メーカー|製造|持株|事業|サービス|company|corporation|business|bank|organization|enterprise|conglomerate|studio|manufacturer/iu.test(
          description,
        )
      )
        continue;
      const claims = (entity.claims?.P856 ?? []).filter(
        (c) => c.rank !== "deprecated" && !c.qualifiers?.P582,
      );
      const preferred = claims.some((c) => c.rank === "preferred")
        ? claims.filter((c) => c.rank === "preferred")
        : claims;
      const localized = [...preferred].sort(
        (a, b) =>
          Number(
            /\/(?:ja|jp|ja-jp)(?:\/|$)/i.test(
              b.mainsnak?.datavalue?.value ?? "",
            ),
          ) -
          Number(
            /\/(?:ja|jp|ja-jp)(?:\/|$)/i.test(
              a.mainsnak?.datavalue?.value ?? "",
            ),
          ),
      );
      for (const claim of localized) {
        const value = claim.mainsnak?.datavalue?.value;
        if (typeof value !== "string") continue;
        try {
          const u = new URL(value);
          // Only the HTTPS version is eligible, including old HTTP directory entries.
          if (u.protocol === "http:") u.protocol = "https:";
          if (
            u.protocol !== "https:" ||
            u.username ||
            u.password ||
            u.hash ||
            u.href.length > 2048 ||
            (u.port && u.port !== "443")
          )
            continue;
          if (candidates.some((c) => new URL(c.url).hostname === u.hostname))
            continue;
          candidates.push({
            name: String(
              entity.labels?.ja?.value ?? entity.labels?.en?.value ?? hit.label,
            ).slice(0, 60),
            url: u.href,
            description: String(description).slice(0, 180),
            directory: "Wikidataの公式サイト項目（候補）",
            known: false,
            directoryURL: `https://www.wikidata.org/wiki/${hit.id}`,
            sector: "unknown",
          });
          break;
        } catch {
          /* malformed directory data is ignored */
        }
      }
    }
    return candidates.slice(0, 3);
  };
}
