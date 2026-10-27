// Public business descriptions are dated evidence. Simulation coefficients live
// in engine.js and are game assumptions, never company pay or hiring estimates.

// Presentation only: one tile for each completed annual record. A tile describes
// the year's main activity, not an inferred employment contract or achievement.
export const CAREER_STATES = Object.freeze({
  employed: { label: "仕事", icon: "■" },
  change: { label: "転職", icon: "↗" },
  promoted: { label: "昇格・社内異動", icon: "▲" },
  learning: { label: "学び", icon: "+" },
  venture: { label: "事業", icon: "◆" },
  rest: { label: "休養・ケア・求職", icon: "~" },
  retired: { label: "退職後", icon: "○" },
});
export function careerMap(game) {
  let retired = game.profile.age >= game.profile.retirementAge;
  let working = !["student", "notWorking"].includes(game.profile.occupation);
  return game.history.map((record) => {
    retired ||= record.choice === "retire" || record.age >= game.profile.retirementAge;
    if (["switch", "startup", "opportunity"].includes(record.choice)) working = true;
    const state = retired ? "retired"
      : record.choice === "switch" ? "change"
        : ["promote", "transfer", "internalVenture"].includes(record.choice) && record.outcome?.kind === "success" ? "promoted"
        : ["learn", "studyDaily", "demonstrate"].includes(record.choice) ? "learning"
          // Easing off while still paid is a working year (2026-10-22: a
          // résumé showed 15 rest years, most of them at work or the business).
          : ["rest", "recover"].includes(record.choice) && record.salary > 0 && record.employer?.kind !== "seeking"
            ? record.employer?.kind === "venture" ? "venture" : "employed"
          : ["rest", "careLeave", "recover"].includes(record.choice) || record.employer?.kind === "seeking" ? "rest"
            : record.employer?.kind === "venture" ? "venture"
              : !working ? (game.profile.occupation === "student" ? "learning" : "rest")
                : "employed";
    return {
      year: record.year, age: record.age, choice: record.choiceLabel, state,
      ...CAREER_STATES[state],
    };
  });
}

export const CAREER_QUESTIONS = Object.freeze({
  "age-30": "これからの仕事で、大切にしたいことは？",
  "age-40": "積み重ねた経験を、次は何に使いたい？",
  "age-50": "この先も続けたい仕事や、人とのつながりは？",
  "age-60": "働く時間と、自分の時間。これからどう過ごしたい？",
  retirement: "仕事に一区切り。これからの暮らしに持っていきたいものは？",
});
// Milestones refer to arrival at a year, unlike map tiles (completed years).
// Starting at a milestone does not interrupt setup. Legacy saves have no backlog
// of questions: the UI only asks for the milestone at the current step.
export function careerMilestones(game) {
  const start = game.profile.age, length = game.decisions.length;
  const milestones = [30, 40, 50, 60]
    .filter((age) => age > start && age <= start + length)
    .map((age) => ({ id: `age-${age}`, age, step: age - start }));
  if (start < game.profile.retirementAge) {
    const explicit = game.history.findIndex((h) => h.choice === "retire" || h.age >= game.profile.retirementAge);
    const automatic = Math.max(game.profile.retirementAge - start, game.retirementFrom ?? 0);
    const step = Math.min(explicit < 0 ? Infinity : explicit + 1, automatic);
    if (step > 0 && step <= length) {
      // Retirement and a decade in the same year share one pause.
      const sameYear = milestones.findIndex((m) => m.step === step);
      if (sameYear >= 0) milestones.splice(sameYear, 1);
      milestones.push({ id: "retirement", age: start + step, step });
    }
  }
  return milestones.sort((a, b) => a.step - b.step)
    .map((m) => ({ ...m, year: game.year - length + m.step, question: CAREER_QUESTIONS[m.id] }));
}
export function pendingCareerReflection(game) {
  return careerMilestones(game).find((m) => m.step === game.decisions.length &&
    !Object.hasOwn(game.reflections ?? {}, m.id)) ?? null;
}

export function careerRecord(game) {
  const map = careerMap(game), tenures = [];
  const yearsByState = Object.fromEntries(Object.keys(CAREER_STATES).map((key) => [key, 0]));
  for (const [i, h] of game.history.entries()) {
    const state = map[i].state;
    yearsByState[state]++;
    const nonworking = h.employer?.kind === "initial" && ["student", "notWorking"].includes(game.profile.occupation);
    const employer = state === "retired" ? "退職後の暮らし"
      : nonworking ? (game.profile.occupation === "student" ? "学びを中心に過ごす" : "仕事を離れて過ごす")
        // An unnamed first employer is 「いまの職場」 in play; in a résumé it is past.
        : h.employer?.kind === "initial" && h.employer.name === "いまの職場" ? "最初の勤務先"
        : h.employer?.name ?? "勤務先の記録なし";
    const role = state === "retired" || nonworking || h.employer?.kind === "seeking" ? null : h.employer?.role ?? null;
    const kind = state === "retired" ? "retired" : nonworking ? "nonworking" : h.employer?.kind ?? "unknown";
    // A stage or unit change inside the same employer starts a new line, so
    // staying for years still shows how the career moved.
    const inside = role && h.position && ["initial", "real", "fictional", "legacy"].includes(kind);
    const rank = inside && h.position.rank !== "unspecified" ? h.position.rank : null;
    const unit = inside ? h.position.unit || null : null;
    const last = tenures.at(-1);
    if (last && last.employer === employer && last.role === role && last.kind === kind &&
      last.rank === rank && last.unit === unit) {
      last.to = h.year;
      last.years++;
    } else tenures.push({ from: h.year, to: h.year, years: 1, employer, role, kind, rank, unit });
  }
  const turningPoints = new Set(["switch", "startup", "opportunity", "retire", "closeBusiness", "pivot", "expand", "demonstrate", "negotiate", "careLeave", "promote", "transfer", "internalVenture"]);
  const decisions = game.history.filter((h, i) => i === 0 || turningPoints.has(h.choice))
    .map((h) => ({ year: h.year, age: h.age, label: h.choiceLabel }));
  const reflections = careerMilestones(game).filter((m) => game.reflections?.[m.id])
    .map((m) => ({ ...m, text: game.reflections[m.id] }));
  return { map, tenures, yearsByState, decisions, reflections };
}
// An unknown starting stage with no promotion reads as a career fact, not as
// a missing form field (2026-10-22: the résumé showed 役職は未入力).
export const peakRankLabel = (rank, ranks) =>
  rank === "unspecified" ? "昇格の記録なし" : ranks[rank]?.label ?? "記録なし";
// A tenure within one calendar year reads 2035年, not 2035〜2035年.
// A story that ends without a career end is a death; before 70 it is sudden
// (2026-10-22: 「44歳、物語が完結した」 did not say what had happened).
export const deathHeadline = (age) =>
  age < 70 ? `${age}歳で、思いがけず人生の幕が下りた。` : `${age}歳で、人生の幕を閉じた。`;
export const yearSpan = (from, to) => from === to ? `${from}年` : `${from}〜${to}年`;
export const COMPANY_DISCOVERY_NOTE = "AIが挙げた候補です。実在・事業・募集・給与は確認していません。気になった会社は公式サイトなどで確かめてください。";

// Read-only projection of saved suggestions. Unknown metadata is not evidence
// that a company exists; a fictional label always wins when records disagree.
export function discoveredCompanies(game) {
  const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const clean = (value, max) => {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text && text.length <= max && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(text) ? text : null;
  };
  const g = object(game), profile = object(g.profile);
  const excluded = new Set();
  const exclude = (raw) => { const name = clean(raw, 60); if (name) excluded.add(employerKey(name)); };
  exclude(profile.company);
  exclude(object(g.employer).name);
  for (const h of Array.isArray(g.history) ? g.history : []) {
    const e = object(object(h).employer);
    if (!["seeking", "venture", "legacy"].includes(e.kind)) exclude(e.name);
  }
  const seen = object(g.careerSeen), scenes = object(g.scenes);
  const turns = [...new Set([...Object.keys(seen), ...Object.keys(scenes)])]
    .filter((key) => /^(?:0|[1-9]\d{0,2})$/.test(key) && Number(key) <= 110 &&
      (!Array.isArray(g.decisions) || Number(key) <= g.decisions.length))
    .sort((a, b) => Number(a) - Number(b));
  const companies = new Map();
  const add = (raw, turn, decision = {}) => {
    const name = clean(raw, 60);
    if (!name) return;
    const key = employerKey(name);
    if (!key || excluded.has(key)) return;
    const proposal = clean(decision.proposal, 300);
    const fictional = decision.candidateKind === "fictional";
    if (companies.has(key)) {
      const entry = companies.get(key);
      entry.proposal ??= proposal;
      entry.fictional ||= fictional;
      return;
    }
    if (companies.size >= 12) return;
    const entry = { name, proposal, fictional };
    if (Array.isArray(g.decisions) && Number.isInteger(g.year) &&
      g.year - g.decisions.length === 2026) entry.year = 2026 + turn;
    if (Number.isInteger(profile.age) && profile.age >= 0 && profile.age + turn <= 110)
      entry.age = profile.age + turn;
    companies.set(key, entry);
  };
  for (const key of turns) {
    const turn = Number(key);
    for (const name of Array.isArray(seen[key]) ? seen[key] : []) add(name, turn);
    const options = object(scenes[key]).options;
    for (const option of Array.isArray(options) ? options : []) {
      const d = object(object(option).decision);
      if (d.id === "switch") add(d.name, turn, d);
    }
  }
  return [...companies.values()];
}

export function careerRecordText(game, roles = {}, ranks = {}) {
  const record = careerRecord(game);
  const story = lifeStory(game, ranks);
  const discoveries = discoveredCompanies(game);
  const man = (n) => `${Math.round(n).toLocaleString("ja-JP")}万円`;
  const lines = [
    "Unwritten Life / わたしの履歴書", story.headline,
    `年収 ${man(story.stats.startIncome)} → ピーク ${man(story.stats.peakIncome)} / 純資産 ${man(story.stats.startNetWorth)} → ${man(story.stats.endNetWorth)}`,
    `いちばん上の役職 ${peakRankLabel(story.stats.peakRank, ranks)} / 転職 ${story.stats.moves}回・勤めた会社 ${story.stats.employers}社 / 家族 ${story.stats.partner ? "パートナーあり" : "パートナーなし"}・子ども${story.stats.children}人 / ${story.stats.housing === "own" ? "持ち家" : "賃貸"} / 学びの時間 ${story.stats.studyHours.toLocaleString("ja-JP")}時間`,
    ...story.chapters.flatMap((c) => ["", `【${c.label}】`, ...c.events.map((e) => `${e.year}年・${e.age}歳 ${e.text}`)]),
    "", "勤務先と役割",
    `${game.profile.age}歳から${game.age}歳まで・${game.decisions.length}年間。ゲーム内の架空の経歴で、実際の職務経歴を証明するものではありません。`,
    ...record.tenures.map((t) => `${yearSpan(t.from, t.to)}（${t.years}年） ${t.employer}${t.role ? " / " + (roles[t.role]?.label ?? t.role) : ""}${t.rank && t.rank !== "unspecified" ? " / " + (ranks[t.rank]?.label ?? t.rank) : ""}${t.unit ? "（" + t.unit + "）" : ""}`),
    "", "この人生で出会った会社", COMPANY_DISCOVERY_NOTE,
    ...(discoveries.length ? discoveries.flatMap((company) => [
      `${company.name}${company.fictional ? "（架空）" : ""}`,
      ...(company.proposal ? [`  ${company.proposal}`] : []),
    ]) : ["転職先の候補は挙がりませんでした。"]),
    "", "一年の主な活動（重複なし）",
    ...Object.entries(record.yearsByState).map(([key, years]) => `${CAREER_STATES[key].label}：${years}年`),
    "", "節目の一行",
    ...(record.reflections.length ? record.reflections.map((r) => `${r.year}年・${r.age}歳${r.id === "retirement" ? "（退職）" : ""} ${r.text}`) : ["記録なし"]),
    "", "キャリアマップ（1マスが1年）",
  ];
  for (let i = 0; i < record.map.length; i += 10) {
    const row = record.map.slice(i, i + 10);
    lines.push(`${row[0].year}〜${row.at(-1).year}年（${row[0].age}〜${row.at(-1).age}歳） ${row.map((t) => t.icon).join(" ")}`);
  }
  lines.push(Object.values(CAREER_STATES).map((s) => `${s.icon} ${s.label}`).join(" / "));
  return lines.join("\n");
}

// Employers offered by earlier versions. New candidates are always generated by
// AI from the player's inputs; these entries only let older saves replay.
export const LEGACY_EMPLOYERS = Object.freeze({
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
  nttdata: {
    name: "NTTデータ",
    aliases: ["株式会社NTTデータ", "NTT DATA"],
    kind: "real",
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
    sector: "care",
    companyType: "large",
    summary: "医療用医薬品の研究・開発などを行う製薬企業。",
    url: "https://www.chugai-pharm.co.jp/profile/index.html",
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
// Detailed labels map to the existing broad game roles; they add narrative
// context, not new or evidence-based pay/AI coefficients.
export const OCCUPATIONS = Object.freeze(
  Object.fromEntries(
    [
      ["software", "ソフトウェア・アプリ開発", "tech"],
      ["infrastructure", "インフラ・クラウド・SRE", "tech"],
      ["security", "セキュリティ", "tech"],
      ["data", "データ分析・AI・機械学習", "tech"],
      ["hardware", "機械・電気・ハードウェア設計", "tech"],
      ["research", "研究・開発", "tech"],
      ["product", "商品企画・プロダクト管理", "creative"],
      ["design", "デザイン・UX・映像制作", "creative"],
      ["writing", "編集・執筆・翻訳", "creative"],
      ["marketing", "マーケティング・広告", "marketing"],
      ["pr", "広報・PR", "marketing"],
      ["sales", "営業・事業開発", "people"],
      ["support", "顧客支援・カスタマーサクセス", "people"],
      ["teaching", "教育・研修・講師", "people"],
      ["service", "接客・販売・飲食", "people"],
      ["hr", "人事・採用・組織開発", "office"],
      ["accounting", "経理・財務・金融専門職", "office"],
      ["legal", "法務・総務・行政事務", "office"],
      ["office", "一般事務・業務支援", "office"],
      ["medical", "医療・保健", "care"],
      ["care", "介護・福祉", "care"],
      ["manufacturing", "製造・生産・品質管理", "physical"],
      ["logistics", "物流・運輸・配送", "physical"],
      ["construction", "建設・設備・保守", "physical"],
      ["agriculture", "農業・林業・漁業", "physical"],
      ["management", "経営・事業運営", "independent"],
      ["independent", "自営・フリーランス", "independent"],
      ["student", "学生・学習が中心", "other"],
      ["notWorking", "求職中・休職中・仕事以外が中心", "other"],
      ["other", "その他（下に自由に書けます）", "other"],
    ].map(([id, label, job]) => [id, { label, job }]),
  ),
);
export const PROFILE_INDUSTRIES = Object.freeze({
  software: "IT・ソフトウェア・インターネット",
  services: "SI・ITサービス・コンサルティング",
  finance: "銀行・証券・保険・金融",
  manufacturing: "製造・自動車・電機",
  health: "医薬品・医療機器・バイオ",
  medical: "医療・介護・福祉サービス",
  retail: "小売・卸売・EC",
  media: "広告・メディア・エンタメ",
  education: "教育・研究機関",
  logistics: "運輸・物流・倉庫",
  property: "建設・不動産・住宅",
  energy: "エネルギー・インフラ・通信",
  hospitality: "旅行・宿泊・飲食",
  agriculture: "農林水産・食品",
  public: "官公庁・自治体・非営利",
  professional: "専門サービス・士業・人材",
  other: "その他",
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
    startingWork: {
      occupation: OCCUPATIONS[game.profile.occupation]?.label ?? null,
      jobDetail: game.profile.jobDetail || null,
      industry: PROFILE_INDUSTRIES[game.profile.industry] ?? null,
      note: "開始時点の本人入力。転職・開業後の現職の詳細ではなく、能力の証拠でもない。",
    },
    ...(game.employer.kind === "initial"
      ? {
          occupation: OCCUPATIONS[game.profile.occupation]?.label ?? null,
          jobDetail: game.profile.jobDetail || null,
          industry: PROFILE_INDUSTRIES[game.profile.industry] ?? null,
          profileBasis:
            "本人が入力した開始時の仕事。企業の確認済み資料や能力の証拠ではない。",
        }
      : {}),
    note: "会社の規模、業界、仕事の形、職種・専門は別の軸。同じエンジニアでも一律の候補にしない。",
  };
}
function companyName(name) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|[\s・.,（）()]/g, "");
}
function careerIdentity(name) {
  return Object.values(LEGACY_EMPLOYERS).find((c) =>
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
    .replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)/gu, "")
    .replace(/[\s\p{P}]/gu, "");
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
    if (!query)
      throw new Error("「株式会社」などを除いた会社名を入力してください。");
    const params = {
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
    };
    let result = await wikidata(params);
    // Some directory labels omit a legal suffix. At most one second search;
    // keep the readable spelling instead of sending the normalized lowercase key.
    const shortName = name
      .trim()
      .replace(/株式会社|有限会社|合同会社|[（(](?:株|有)[）)]/gu, "")
      .trim();
    if (!result.search?.length && shortName && shortName !== name.trim())
      result = await wikidata({ ...params, search: shortName });
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
          if (candidates.some((c) => c.entityId === hit.id)) continue;
          candidates.push({
            name: String(
              entity.labels?.ja?.value ?? entity.labels?.en?.value ?? hit.label,
            ).slice(0, 60),
            url: u.href,
            description: String(description).slice(0, 180),
            directory: "Wikidataの公式サイト項目（候補）",
            known: false,
            entityId: hit.id,
            match: "外部ディレクトリの候補（会社の一致は未確認）",
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

// A pop "my resume" for the end of a working life: a few headline numbers and
// the turning points of each decade of age, including money, family and luck,
// not only titles. Plain data; the page and the copied text format it.
export function lifeStory(game, ranks = {}) {
  const level = (rank) => ranks[rank]?.level ?? 0;
  const events = [];
  let partner = game.profile.partner === "partner",
    children = game.profile.children,
    rank = game.profile.rank ?? "unspecified",
    peakRank = rank;
  for (const r of game.history) {
    const at = { year: r.year, age: r.age };
    if (r.choice === "switch" && r.employer?.kind !== "seeking")
      events.push({ ...at, kind: "work", text: `${r.employer.name}へ転職` });
    if (r.choice === "startup") events.push({ ...at, kind: "work", text: `${r.employer.name}を起業` });
    // Automatic re-employment is a move too (2026-10-21), not a promotion.
    const reemployed = r.outcome?.kind === "reemployed";
    if (reemployed) events.push({ ...at, kind: "work", text: `${r.employer?.name ?? "新しい勤務先"}に再就職` });
    if (r.position && r.position.rank !== rank) {
      if (level(r.position.rank) > level(peakRank)) peakRank = r.position.rank;
      const moved = r.choice === "switch" || reemployed;
      if (!moved && level(r.position.rank) >= level(rank))
        events.push({ ...at, kind: "rise", text: `${ranks[r.position.rank]?.label ?? r.position.rank}に昇格` });
      else if (moved && level(r.position.rank) > level(rank))
        events.push({ ...at, kind: "rise", text: `${ranks[r.position.rank]?.label ?? r.position.rank}として迎えられる` });
      rank = r.position.rank;
    }
    if (["transfer", "internalVenture"].includes(r.choice) && r.outcome?.kind === "success" && r.position?.unit)
      events.push({ ...at, kind: "work", text: `社内で「${r.position.unit}」へ` });
    if (r.incident)
      events.push({ ...at, kind: r.incident.tone === "good" ? "luck" : r.incident.tone === "hard" ? "hardship" : "work", text: r.incident.title });
    if (r.family?.partner && !partner) events.push({ ...at, kind: "family", text: "パートナーと暮らしはじめる" });
    if ((r.family?.childAges.length ?? children) > children)
      events.push({ ...at, kind: "family", text: `子どもを迎える（${r.family.childAges.length}人目）` });
    partner = r.family?.partner ?? partner;
    children = r.family?.childAges.length ?? children;
    if (r.choice === "home") events.push({ ...at, kind: "life", text: "家を買う" });
    if (r.choice === "move") events.push({ ...at, kind: "life", text: "住む地域を変える" });
    if (r.careerEnd) events.push({ ...at, kind: "end", text: r.careerEnd.title });
  }
  const chapters = [];
  for (const e of events) {
    const decade = Math.floor(e.age / 10) * 10;
    if (chapters.at(-1)?.decade !== decade) chapters.push({ decade, label: `${decade}代`, events: [] });
    chapters.at(-1).events.push(e);
  }
  const incomes = game.history.map((r) => r.income);
  const end = game.history.at(-1)?.careerEnd;
  return {
    startAge: game.profile.age,
    endAge: game.age,
    years: game.decisions.length,
    headline: end
      ? `${game.age}歳、${end.title}。`
      : game.ended
        ? deathHeadline(game.age)
        : `${game.age}歳、物語はまだ続いている。`,
    stats: {
      startIncome: game.profile.income,
      peakIncome: Math.max(game.profile.income, ...incomes),
      startNetWorth: game.profile.savings + game.profile.homeValue - game.profile.mortgage,
      endNetWorth: game.savings,
      peakRank,
      moves: game.history.filter((r) => r.choice === "switch").length,
      // The starting company counts even if the first year was spent moving.
      employers: new Set([
        ...(game.profile.company ? [game.profile.company] : []),
        ...careerRecord(game).tenures
          .filter((t) => !["retired", "nonworking", "seeking", "venture"].includes(t.kind))
          .map((t) => t.employer),
      ]).size,
      partner: game.family.partner,
      children: game.family.childAges.length,
      housing: game.housing,
      studyHours: game.studyHours,
      hardships: game.history.filter((r) => r.incident?.tone === "hard").length,
      luck: game.history.filter((r) => r.incident?.tone === "good").length,
    },
    chapters,
  };
}
