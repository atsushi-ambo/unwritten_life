import { emptyBook, recordGame, validateBook, bookView, bookBaseline } from "./book.js";
import {
  START_YEAR,
  MAX_AGE,
  SCENARIOS,
  JOBS,
  RANKS,
  inCompany,
  REGIONS,
  regionFromMunicipality,
  PRIORITIES,
  CHOICES,
  decisionId,
  choiceForecast,
  branchReview,
  rewindTo,
  displayIntention,
  displayEpisode,
  availableChoices,
  isRetiredAt,
  createGame,
  advanceDirection,
  previousDirectionStep,
  optionalProfileInputs,
  PROFILE_DEFAULTS,
  profileInputForLevel,
  residenceName,
  replay,
  compareWorlds,
  eventFor,
  encodeSave,
  decodeSave,
  applyScene,
  recordCareerReflection,
  recordCareerSeen,
  careerSeenUntil,
  directionSpan,
  pendingCareerOffer,
} from "./engine.js";
import {
  VENTURES,
  workContext,
  makeDirectorySearch,
  browserDirectoryText,
  OCCUPATIONS,
  PROFILE_INDUSTRIES,
  CAREER_STATES,
  careerMap,
  careerMilestones,
  careerRecord,
  careerRecordText,
  discoveredCompanies,
  COMPANY_DISCOVERY_NOTE,
  lifeStory,
  shareCardContent,
  wrapCardText,
  peakRankLabel,
  yearSpan,
  deathHeadline,
} from "./careers.js";
import {
  ERAS,
  worldAt,
  worldEnabled,
  TONES,
  opportunityAt,
  KNOWLEDGE,
  KNOWLEDGE_REVISION,
  knowledgeFor,
  loadKnowledge,
} from "./world.js";
import { storyRequest } from "./story.js";
let knowledgeCatalog = KNOWLEDGE;
let lastJourney = null;
let timelineShown = 0, timelinePaused = false, timelineTimer;
let profileLevel = "quick";
const $ = (id) => document.getElementById(id),
  saveKey = "unwritten-life:v2",
  nf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const money = (n) => nf.format(Math.round(n / 10) * 10);
const hosted = document.documentElement.dataset.edition === "mobile-cloud";
let game = null,
  remember = false,
  savedGame = null,
  corruptSave = null,
  pendingImportedGame = null,
  saveImportRevision = 0,
  noticeTimer,
  companySources = [],
  apiToken = "",
  aiState = null,
  serverStale = false,
  aiTesting = false,
  generating = false,
  revision = 0,
  customCost = false,
  regionRevealed = false,
  moneyBreakdownOpen = false,
  manualRegion = false,
  careerMode = "switch",
  careerSources = [],
  careerResearchRevision = 0,
  companyResearchRevision = 0,
  companyURLResearchRevision = 0,
  modelListRevision = 0;
let generationStarted = 0,
  generationTimer;
let careerDraft = null,
  careerGenerating = false,
  careerError = "",
  generationError = "",
  cloudConsented = false,
  pendingStart = null;
const bookKey = "unwritten-life:book:v1";
let book = emptyBook(), savedBook = emptyBook(), bookLoaded = false, bookSeen = new Set();
function loadBook() {
  if (bookLoaded) return;
  bookLoaded = true;
  try {
    const saved = validateBook(JSON.parse(localStorage.getItem(bookKey) || "null"));
    savedBook = saved;
    book = validateBook(Object.fromEntries(Object.keys(saved).map((key) => [key, [...saved[key], ...book[key]]])));
  } catch { /* Keep the in-memory discoveries. */ }
}
function updateBook() {
  if (remember) loadBook();
  const before = JSON.stringify(book);
  const options = { end: timelineShown, includeCurrent: !timelineRevealing() };
  const result = recordGame(book, game, bookSeen, options);
  if (remember) savedBook = recordGame(savedBook, game, bookSeen, options).book;
  book = result.book;
  bookSeen = result.baseline;
  if (before !== JSON.stringify(book)) {
    $("book-notice").textContent = "図鑑に追加";
    clearTimeout(window.bookNoticeTimer);
    window.bookNoticeTimer = setTimeout(() => { $("book-notice").textContent = ""; }, 3000);
  }
  if (remember) try { localStorage.setItem(bookKey, JSON.stringify(savedBook)); } catch { toast("図鑑を保存できませんでした。"); }
}
function renderBook() {
  const view = bookView(book), content = $("book-content");
  content.replaceChildren(node("p", view.note, "field-note"));
  for (const [key, title] of [["companies", "会社"], ["choices", "方法と道"], ["incidents", "できごと"]]) {
    const shelf = view[key], section = node("section"), list = node("ul");
    section.append(node("h3", `${title}（${key === "companies" ? shelf.total : book[key].length + " / " + shelf.total}）`));
    for (const item of shelf.items) list.append(node("li", item));
    if (!shelf.items.length) list.append(node("li", "？？？"));
    section.append(list); content.append(section);
  }
}
$("book-button").addEventListener("click", () => { renderBook(); $("book-dialog").showModal(); });
$("book-export").addEventListener("click", () => downloadSave(JSON.stringify(book, null, 2), "unwritten-life-book.json"));
$("book-delete").addEventListener("click", () => $("book-delete-dialog").showModal());
$("book-delete-confirm").addEventListener("click", () => {
  try {
    localStorage.removeItem(bookKey);
    localStorage.removeItem("unwritten-life:book-cleared:v1");
    book = emptyBook(); savedBook = emptyBook(); bookLoaded = true; renderBook(); $("book-delete-dialog").close(); toast("図鑑を削除しました。"); }
  catch { toast("図鑑を削除できませんでした。"); }
});
const aiSettingsKey = "unwritten-life:ai";
const generationTimes = new Map();
const connectionKey = (state) =>
  JSON.stringify([state?.provider, state?.baseURL, state?.model]);
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function toast(text) {
  $("notice").textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    $("notice").textContent = "";
  }, 5500);
}
const staleNotice = "アプリが更新されています。ターミナルでサーバーを止めて start.command（npm run play）で起動し直してください。";
async function status() {
  const res = await fetch("/api/status");
  if (!res.ok)
    throw new Error(
      hosted
        ? "AIサーバーに接続できません。少し待って再読み込みしてください。"
        : "ローカルサーバーに接続できません。アプリを起動して再読み込みしてください。",
    );
  const data = await res.json();
  apiToken = data.token;
  aiState = data.ai;
  serverStale = !hosted && (data.stale === true || !data.serverRevision);
  $("server-update-notice").hidden = !serverStale;
  $("server-update-notice").textContent = serverStale ? staleNotice : "";
  renderAI();
  return data;
}
async function api(path, body) {
  if (!apiToken) await status();
  if (!hosted && serverStale) throw new Error(staleNotice);
  if (hosted && path !== "/api/scene")
    throw new Error("このスマホ版では接続設定と企業ページの取得は使えません。");
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Unwritten-Token": apiToken,
    },
    body: JSON.stringify(
      hosted ? { ...body, requestId: crypto.randomUUID() } : body,
    ),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("アプリを再読み込みし、もう一度お試しください。");
  }
  if (!res.ok) throw new Error(data.error ?? "処理に失敗しました。");
  return data;
}
function readStoredGame() {
  let raw = null;
  corruptSave = null;
  $("corrupt-save-banner").hidden = true;
  try {
    raw = localStorage.getItem(saveKey);
    savedGame = raw ? decodeSave(raw) : null;
    $("resume-banner").hidden = !savedGame;
  } catch {
    savedGame = null;
    corruptSave = raw;
    $("resume-banner").hidden = true;
    $("corrupt-save-banner").hidden = !corruptSave;
    toast("保存データを読めませんでした。元データは保持しています。");
  }
  try {
    $("legacy-banner").hidden = !localStorage.getItem("unwritten-life:v1");
  } catch {
    $("legacy-banner").hidden = true;
  }
}
function removeSave() {
  try {
    localStorage.removeItem(saveKey);
    localStorage.removeItem("unwritten-life:v1");
    savedGame = null;
    corruptSave = null;
    remember = false;
    $("remember").checked = false;
    $("resume-banner").hidden = true;
    $("legacy-banner").hidden = true;
    $("corrupt-save-banner").hidden = true;
    if (game) persist();
    toast("この端末の保存を削除しました。");
  } catch {
    toast("削除できませんでした。ブラウザのサイトデータをご確認ください。");
  }
}
function persist() {
  $("game-delete-save").hidden = !remember;
  if (!remember) {
    $("save-status").textContent = "保存オフ · 閉じると消えます";
    return;
  }
  try {
    localStorage.setItem(saveKey, encodeSave(game));
    savedGame = game;
    $("save-status").textContent = "✓ この端末に保存しました";
  } catch {
    $("save-status").textContent = "保存できませんでした";
    toast("保存できません。空き容量やブラウザの設定をご確認ください。");
  }
}
function readProfile() {
  const raw = profileInputForLevel(
    Object.fromEntries(new FormData($("profile-form"))),
    profileLevel,
    { band: $("quick-age-band").value, region: $("quick-region").value },
  );
  const p = optionalProfileInputs(
    raw,
    profileLevel === "quick"
      ? PROFILE_DEFAULTS
      : { ...PROFILE_DEFAULTS, ...regionCosts(raw.region, raw.household) },
  );
  const summary = $("company-summary").value.trim();
  p.companyFacts =
    profileLevel !== "quick" && p.company && summary
      ? {
          summary,
          sector: $("company-sector").value,
          confirmed: $("company-confirmed").checked,
          sources: companySources,
        }
      : null;
  return p;
}
function showGame(focus = false, fresh = false) {
  if (serverStale) { toast(staleNotice); return; }
  if (!aiReady()) {
    if (hosted) {
      toast("OpenAIの接続準備ができていません。少し待って再読み込みしてください。");
      return;
    }
    const next = game;
    pendingStart = () => {
      game = next;
      showGame(focus, fresh);
    };
    void openAISettings(true);
    return;
  }
  generationError = "";
  bookSeen = fresh ? new Set() : bookBaseline(game);
  lastJourney = null;
  revision++;
  resetTimeline();
  $("setup").hidden = true;
  $("game").hidden = false;
  renderGame();
  if (focus) {
    // A resumed game opens at its latest years, not at the top of the page.
    if (game.history.length) $("timeline").scrollIntoView({ block: "start", behavior: "instant" });
    else window.scrollTo({ top: 0, behavior: "instant" });
    $("chapter-title").focus({ preventScroll: true });
  }
  void maybeGenerateScene();
}
function stat(label, value, unit, delta, metric) {
  const el = node("div", undefined, "stat"),
    line = node("div", undefined, "stat-line"),
    amount = node("span", value, "stat-value");
  amount.append(node("small", unit));
  line.append(node("span", label, "stat-name"), amount);
  el.append(line);
  if (metric !== undefined) {
    const bar = node("progress");
    bar.max = 100;
    bar.value = metric;
    bar.setAttribute("aria-label", label);
    el.append(bar);
  }
  if (delta) el.append(node("div", delta, "stat-delta"));
  return el;
}
function renderCareerMap(container, state = game) {
  const tiles = careerMap(state);
  container.replaceChildren(
    node("h3", "キャリアマップ"),
    node("p", `過ごした${tiles.length}年 · 1マスが1年`, "field-note"),
  );
  if (!tiles.length) {
    container.append(node("p", "最初の一年から、道が続きます。", "field-note"));
    return;
  }
  const grid = node("ol", undefined, "career-map-grid");
  grid.setAttribute("aria-label", "一年ごとのキャリアの歩み");
  const detail = node("p", "マスをタップすると、その年のキャリアを読めます。", "career-map-detail field-note");
  detail.setAttribute("role", "status");
  for (const tile of tiles) {
    const cell = node("li", undefined, `career-tile state-${tile.state}`);
    const icon = node("span", tile.icon);
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", `${tile.year}年・${tile.age}歳：${tile.label}。選択：${tile.choice}`);
    const button = node("button", undefined, "career-tile-button");
    button.type = "button";
    button.setAttribute("aria-label", icon.getAttribute("aria-label"));
    button.setAttribute("aria-pressed", "false");
    const select = () => {
      for (const sibling of grid.querySelectorAll("button")) sibling.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", "true");
      detail.textContent = icon.getAttribute("aria-label");
    };
    button.addEventListener("click", select);
    button.addEventListener("focus", select);
    button.append(icon);
    cell.append(button);
    if (tile.age % 10 === 0) {
      const age = node("small", `${tile.age}歳`, "map-age");
      age.setAttribute("aria-hidden", "true");
      cell.append(age);
    }
    grid.append(cell);
  }
  const legend = node("ul", undefined, "career-map-legend");
  for (const [key, state] of Object.entries(CAREER_STATES)) {
    const item = node("li");
    const icon = node("span", state.icon, `state-${key}`);
    icon.setAttribute("aria-hidden", "true");
    item.append(icon, document.createTextNode(state.label));
    legend.append(item);
  }
  container.append(grid, detail, legend);
}
// The pop summary at the top of the ending: headline numbers, then the
// turning points of each decade (work, money, family and luck).
function renderLifeStory() {
  const story = lifeStory(game, RANKS);
  const section = node("section", undefined, "life-story");
  const title = node("h3", "わたしの履歴書");
  title.id = "life-story-title";
  section.setAttribute("aria-labelledby", title.id);
  section.append(title, node("p", story.headline, "life-story-headline"));
  const s = story.stats,
    tiles = node("dl", undefined, "life-story-stats");
  for (const [label, value, note] of [
    ["年収", `${money(s.startIncome)}→${money(s.peakIncome)}万円`, "はじめ → ピーク"],
    ["純資産", `${money(s.startNetWorth)}→${money(s.endNetWorth)}万円`, "はじめ → おわり"],
    ["いちばん上の役職", peakRankLabel(s.peakRank, RANKS), ""],
    ["転職", `${s.moves}回`, `勤めた会社 ${s.employers}社`],
    ["家族", s.partner ? "パートナーあり" : "パートナーなし", `子ども ${s.children}人`],
    ["住まい", s.housing === "own" ? "持ち家" : "賃貸", ""],
    ["学びの時間", `${nf.format(s.studyHours)}時間`, ""],
    ["思いがけない出来事", `つらい ${s.hardships} · うれしい ${s.luck}`, ""],
  ]) {
    const tile = node("div");
    tile.append(node("dt", label), node("dd", value));
    if (note) tile.append(node("small", note));
    tiles.append(tile);
  }
  section.append(tiles);
  const icons = { work: "■", rise: "▲", luck: "★", hardship: "●", family: "♡", life: "⌂", end: "○" };
  for (const chapter of story.chapters) {
    const box = node("section", undefined, "life-story-chapter");
    box.append(node("h4", chapter.label));
    const list = node("ul");
    for (const e of chapter.events) {
      const item = node("li", undefined, `event-${e.kind}`);
      const icon = node("span", icons[e.kind], "life-story-icon");
      icon.setAttribute("aria-hidden", "true");
      item.append(icon, node("small", `${e.year}年・${e.age}歳`), node("span", e.text));
      list.append(item);
    }
    box.append(list);
    section.append(box);
  }
  if (!story.chapters.length)
    section.append(node("p", "大きな転機のない、穏やかな歩みでした。", "field-note"));
  return section;
}
function renderShareCard() {
  const section = node("section");
  const save = node("button", "カードを画像で保存", "button");
  save.type = "button";
  save.id = "save-timeline-card";
  const share = node("button", "カードを共有", "button");
  share.type = "button";
  const status = node("p", "", "field-note");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const story = lifeStory(game, RANKS);
  // Career-end titles may contain an employer name; reconstruct those headlines.
  const end = game.history.at(-1)?.careerEnd;
  const titles = { leaveBusiness: "事業を離れ、仕事に区切りをつけた", stepDown: `${peakRankLabel(game.position?.rank, RANKS)}を退任し、仕事に区切りをつけた`, early: "早めに仕事から離れ、次の暮らしへ進んだ", retire: "定年を迎え、仕事から退いた" };
  const headline = end ? `${game.age}歳、${titles[end.reason] ?? "仕事に区切りをつけた"}。` : story.headline;
  const data = shareCardContent(story, peakRankLabel(story.stats.peakRank, RANKS), headline);
  const summary = node("p", `画像の説明：Unwritten Life。${data.headline} 年収 ${data.income}、純資産 ${data.netWorth}、いちばん上の役職 ${data.rank}、転職 ${data.moves}。${data.points.join("、")}。ゲーム内の架空の経歴です。`, "field-note");
  const filename = "unwritten-life-card.png";
  const makeBlob = () => new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200; canvas.height = 630;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#243f35"; ctx.fillRect(0, 0, 1200, 630);
      ctx.fillStyle = "#e4d8ad"; ctx.font = "bold 25px system-ui, sans-serif"; ctx.fillText("UNWRITTEN LIFE", 60, 55);
      const draw = (text, x, y, width, size, lines = 1, color = "#fffef9") => {
        ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.fillStyle = color;
        wrapCardText(text, width, lines, (s) => ctx.measureText(s).width).forEach((line, i) => ctx.fillText(line, x, y + i * (size + 8)));
      };
      draw(data.headline, 60, 110, 1080, 36, 2);
      draw("年収（はじめ → ピーク）", 60, 225, 500, 21, 1, "#e4d8ad");
      draw(data.income, 60, 270, 500, 30);
      draw("純資産（はじめ → おわり）", 620, 225, 520, 21, 1, "#e4d8ad");
      draw(data.netWorth, 620, 270, 520, 30);
      draw("いちばん上の役職", 60, 325, 500, 21, 1, "#e4d8ad");
      draw(data.rank, 60, 365, 500, 27, 2);
      draw(`転職 ${data.moves}`, 620, 345, 520, 27);
      draw("人生の転機", 60, 445, 1080, 21, 1, "#e4d8ad");
      data.points.forEach((point, i) => draw(point, 60, 485 + i * 32, 1080, 21));
      draw("ゲーム内の架空の経歴です。", 60, 600, 1080, 18, 1, "#dcded2");
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG")), "image/png");
    } catch (error) { reject(error); }
  });
  const download = (blob) => {
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  save.addEventListener("click", async () => {
    status.textContent = "画像を作成しています。";
    try { download(await makeBlob()); status.textContent = "ダウンロードを開始しました。"; }
    catch { status.textContent = "画像を作成できませんでした。"; }
  });
  share.hidden = true;
  if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && typeof File !== "undefined") {
    try { share.hidden = !navigator.canShare({ files: [new File([], filename, { type: "image/png" })] }); } catch { /* unsupported */ }
  }
  // Safari needs the click's user activation for navigator.share, so the PNG is
  // prepared ahead of time and the click only awaits an already settled promise.
  let ready = null;
  if (!share.hidden) { ready = makeBlob(); ready.catch(() => { ready = null; }); }
  share.addEventListener("click", async () => {
    status.textContent = "画像を作成しています。";
    try {
      const blob = await (ready ?? makeBlob());
      try { await navigator.share({ files: [new File([blob], filename, { type: "image/png" })] }); status.textContent = "共有画面を開きました。"; }
      catch { download(blob); status.textContent = "ダウンロードを開始しました。"; }
    } catch { status.textContent = "画像を作成できませんでした。"; }
  });
  section.append(save, share, status, summary, node("p", "会社名や名前、AIが生成した場面の文章は含まれません。画像は端末内で作成します。", "field-note"));
  return section;
}
function renderCareerResume() {
  const record = careerRecord(game);
  const card = node("section", undefined, "career-resume");
  card.id = "ending-resume";
  card.setAttribute("aria-labelledby", "resume-title");
  // One résumé: the life story above, then where and as what. The turning
  // points are already in the story's decades, so they are not listed again.
  const title = node("h3", "勤務先と役割");
  title.id = "resume-title";
  card.append(renderLifeStory(), renderShareCard(), title, node("p", `${game.profile.age}歳から${game.age}歳まで・${game.decisions.length}年間。ゲーム内の架空の経歴で、実際の職務経歴を証明するものではありません。`, "resume-period"));
  const timeline = node("ol", undefined, "resume-timeline");
  for (const t of record.tenures) {
    const row = node("li");
    row.append(node("small", `${yearSpan(t.from, t.to)} · ${t.years}年`), node("b", t.employer));
    if (t.role)
      row.append(
        node(
          "span",
          [JOBS[t.role]?.label ?? t.role, t.rank && t.rank !== "unspecified" ? RANKS[t.rank].label : "", t.unit ?? ""]
            .filter(Boolean)
            .join(" · "),
        ),
      );
    timeline.append(row);
  }
  const totals = node("dl", undefined, "resume-totals");
  for (const [key, years] of Object.entries(record.yearsByState)) {
    const row = node("div");
    row.append(node("dt", CAREER_STATES[key].label), node("dd", `${years}年`));
    totals.append(row);
  }
  const discoveries = node("section", undefined, "resume-discoveries");
  discoveries.append(node("h4", "この人生で出会った会社"), node("p", COMPANY_DISCOVERY_NOTE, "field-note"));
  const companies = discoveredCompanies(game);
  if (companies.length) {
    const list = node("ul", undefined, "resume-discovery-list");
    for (const company of companies) {
      const row = node("li");
      row.append(node("b", `${company.name}${company.fictional ? "（架空）" : ""}`));
      if (company.proposal) row.append(node("small", company.proposal));
      list.append(row);
    }
    discoveries.append(list);
  } else discoveries.append(node("p", "転職先の候補は挙がりませんでした。", "field-note"));
  card.append(timeline, discoveries, node("h4", "一年の主な活動"),
    node("p", "各年を主な活動で分類しています。学びや休養の年も、勤務先との在籍期間には含まれます。", "field-note"),
    totals);
  const map = node("section", undefined, "career-map ending-map");
  map.id = "ending-map";
  map.setAttribute("aria-label", "生涯のキャリアマップ");
  renderCareerMap(map);
  const reflections = node("section", undefined, "career-reflections");
  reflections.append(node("h4", "節目の一行"));
  for (const r of record.reflections) {
    const line = node("blockquote");
    line.append(node("p", r.text), node("small", `${r.year}年・${r.age}歳${r.id === "retirement" ? "・退職の節目" : ""}`));
    reflections.append(line);
  }
  if (!record.reflections.length) reflections.append(node("p", "一行の記録はありません。", "field-note"));
  const copy = node("button", "テキストをコピー", "button primary");
  copy.type = "button";
  copy.id = "copy-resume";
  const status = node("p", "", "field-note");
  status.id = "resume-copy-status";
  status.setAttribute("role", "status");
  const fallback = node("textarea");
  fallback.id = "resume-copy-fallback";
  fallback.readOnly = true;
  fallback.hidden = true;
  fallback.rows = 8;
  fallback.setAttribute("aria-label", "コピー用の職務経歴書テキスト");
  const text = careerRecordText(game, JOBS, RANKS);
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      fallback.hidden = true;
      status.textContent = "コピーしました。";
    } catch {
      fallback.hidden = false;
      fallback.value = text;
      fallback.focus();
      fallback.select();
      fallback.setSelectionRange(0, text.length);
      status.textContent = "コピーできませんでした。下のテキストを選択してコピーできます。";
    }
  });
  const branches = node("section");
  branches.id = "ending-branches";
  branches.append(node("h4", "人生の分岐点"));
  const points = branchReview(game);
  if (!points.length) branches.append(node("p", "振り返れる成功率の記録はありません。", "field-note"));
  for (const point of points) {
    const item = node("section");
    item.append(node("h5", `${point.age}歳・${point.label}`),
      node("p", `当時の成功率 ${(point.chance * 100).toFixed(1)}% · 結果 ${point.success ? "成功" : "不成立"}`));
    if (point.alternatives.length) {
      item.append(node("p", "その年に提示されていた選択肢の初年度の成功率"));
      if (point.selectedForecast) item.append(node("p", `選んだ行動：${point.selectedForecast.successText}`));
      for (const alt of point.alternatives) item.append(node("p", `${alt.label}：${alt.forecast?.successText ?? "条件が確定していないか、実行できないため計算できません"}`));
    }
    if (point.comparison) {
      const c = point.comparison;
      item.append(node("p", c.score < 50 ? `「${c.label}」との比較：大差なし（差はいずれも50万円未満）` : `比較する別の選択肢：${c.label}`),
        node("p", `実際に選んだ行動：5年後の純資産 ${money(c.actual.savings)}万円・年収 ${money(c.actual.income)}万円`),
        node("p", `別の選択肢：5年後の純資産 ${money(c.alternative.savings)}万円・年収 ${money(c.alternative.income)}万円`));
    } else item.append(node("p", "5年後の比較を計算できませんでした。"));
    const retry = node("button", "この年から別の選択で再挑戦");
    retry.type = "button";
    retry.addEventListener("click", () => confirmRewind(point.step));
    item.append(retry);
    branches.append(item);
  }
  branches.append(node("p", "推定。同じ運命で、その後5年を中立に過ごした場合の比較。実際の人生はこうならない。選択した年を含む5年間を計算し、以後は休む行動で継続します。", "field-note"));
  const years = node("section");
  years.append(node("h4", "年齢を選んでやり直す"));
  game.decisions.forEach((_, step) => {
    const button = node("button", `${game.history[step]?.age ?? game.profile.age + step}歳からやり直す`);
    button.type = "button";
    button.addEventListener("click", () => confirmRewind(step));
    years.append(button);
  });
  card.append(map, branches, years, reflections, copy, status, fallback);
  return card;
}
function confirmRewind(step) {
  const dialog = node("dialog");
  dialog.setAttribute("aria-label", "やり直しの確認");
  dialog.append(node("h3", "この年からやり直しますか？"),
    node("p", "この年以降の選択と場面は消えます。端末への保存を有効にしている場合、その保存もやり直し後の状態に置き換わります。いまの結末を残すには、先にセーブを書き出してください。"));
  const save = node("button", "いまの結末を保存"), cancel = node("button", "キャンセル"), retry = node("button", "やり直す");
  for (const button of [save, cancel, retry]) button.type = "button";
  save.addEventListener("click", () => exportSave(game));
  cancel.addEventListener("click", () => dialog.close());
  retry.addEventListener("click", () => {
    try {
      game = rewindTo(game, step);
      lastJourney = null;
      revision++;
      clearTimeout(timelineTimer);
      resetTimeline();
      dialog.close();
      renderGame();
      moveToStory();
    } catch (error) { toast(error.message); }
  });
  dialog.addEventListener("close", () => dialog.remove());
  dialog.append(save, cancel, retry);
  document.body.append(dialog);
  dialog.showModal();
}
function moveToStory() {
  if (window.matchMedia("(max-width: 640px)").matches)
    $("event-card").scrollIntoView({ block: "start", behavior: "instant" });
  $("chapter-title").focus({ preventScroll: true });
}
function commitChoice(decision) {
  if (generating || timelineRevealing()) return;
  try {
    const journey = advanceDirection(game, decision);
    game = journey.game;
    lastJourney = journey;
    revision++;
    timelinePaused = false;
    foldEarlierYears();
    renderGame();
    scheduleYear();
    void maybeGenerateScene();
  } catch (error) {
    toast(error.message);
  }
}
function selectCommand(event) {
  const button = event.target.closest(".choice");
  if (!button || button.disabled) return;
  for (const command of $("choices").querySelectorAll("button"))
    command.dataset.active = String(command === button);
}
function appendCareerOfferCommand(choices) {
  const offer = pendingCareerOffer(game);
  if (!offer) return;
  const currentRevision = revision,
    scout = offer.id === "scout",
    button = node("button", undefined, "choice choice-offer"),
    copy = node("span");
  button.type = "button";
  button.dataset.offer = offer.id;
  button.disabled = generating;
  copy.append(
    node("small", "届いた話", "choice-offer-label"),
    node("b", scout ? "スカウトの話を聞く" : "打診を受ける"),
    node("small", scout
      ? "企業と役割を比べる。閉じると、元の4択に戻れます。"
      : `${RANKS[offer.targetRank].label}への打診。この年に受けると昇格します。`),
  );
  const cursor = node("span", "▶", "command-cursor"),
    symbol = node("span", "✉", "choice-symbol");
  cursor.setAttribute("aria-hidden", "true");
  symbol.setAttribute("aria-hidden", "true");
  button.append(cursor, symbol, copy);
  button.addEventListener("click", () => {
    if (!button.isConnected || revision !== currentRevision || generating ||
      timelineRevealing() || pendingCareerOffer(game) !== offer) return;
    if (scout) openCareer("switch");
    else commitChoice({ id: "promote", track: RANKS[offer.targetRank].track, intent: "昇進の打診を受ける" });
  });
  choices.append(button);
}
// Safari does not always focus buttons after a tap. Track the pointer as well
// as keyboard focus so the cursor still marks the chosen command.
$("choices").addEventListener("pointerdown", selectCommand);
$("choices").addEventListener("focusin", selectCommand);
$("choices").addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
  const buttons = [...$("choices").querySelectorAll("button:not(:disabled)")];
  const index = buttons.indexOf(document.activeElement);
  if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0
    : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].focus();
});
function appendBudget(parent, h, collapsed = false) {
  if (!h.budget) return;
  const box = node(collapsed ? "details" : "div", undefined, "budget-window"),
    signed = (value) => {
      const rounded = Math.round(value) || 0;
      return `${rounded === 0 ? "±" : rounded > 0 ? "+" : "−"}${nf.format(Math.abs(rounded))}`;
    };
  box.append(
    node(
      collapsed ? "summary" : "p",
      "家計の内訳（現金・万円）",
      "budget-title",
    ),
  );
  const list = node("dl", undefined, "budget-list");
  for (const [key, label] of [
    ["income", "労働収入（手取り）"],
    ["partnerIncome", "パートナー収入（手取り）"],
    ["pension", "年金等（手取り）"],
    ["sicknessAllowance", "傷病手当金（給与の約2/3、最長1年6か月）"],
    ["living", "生活費・子育て等"],
    ["lifestyle", "収入に合わせて増えた生活費"],
    ["housing", "住居費・購入費（ローン除く）"],
    ["loanInterest", "ローン利息"],
    ["loanPrincipal", "ローン元金（繰り上げ含む）"],
    ["investment", "株式等の購入・売却"],
    ["other", "行動・事業費等と臨時収入"],
    ["borrowing", "不足分の借入"],
    ["debtRepayment", "借入の返済"],
    ["net", "現金の増減"],
  ]) {
    if (!h.budget[key] && key !== "net") continue;
    const row = node("div", undefined, key === "net" ? "budget-net" : "");
    row.append(node("dt", label), node("dd", signed(h.budget[key])));
    list.append(row);
  }
  box.append(
    list,
    node(
      "p",
      "表示は四捨五入。評価損益と借入利息は現金の増減に含みません。",
      "field-note",
    ),
  );
  if (h.investmentGain || h.propertyGain)
    box.append(
      node(
        "p",
        `評価損益：株式等 ${signed(h.investmentGain)}万円 / 住宅 ${signed(h.propertyGain)}万円`,
        "field-note",
      ),
    );
  if (h.debtInterest)
    box.append(
      node("p", `借入利息（残高へ加算）：${signed(-h.debtInterest)}万円`, "field-note"),
    );
  if (h.prepayment !== undefined)
    box.append(
      node(
        "p",
        `元金返済のうち繰り上げ ${nf.format(Math.round(h.prepayment))}万円`,
        "field-note",
      ),
    );
  parent.append(box);
}
// A chance incident is shown apart from the chosen action, with the game's
// assumed odds, so a hard year reads as luck rather than as the player's fault.
function incidentNote(h) {
  if (!h.incident) return null;
  const percent = (p) => `${(p * 100).toFixed(p < 0.01 ? 1 : 0)}%`;
  const box = node("div", undefined, `incident-note tone-${h.incident.tone}`);
  box.append(
    node("p", `思いがけない出来事：${h.incident.title}`, "incident-title"),
    node("p", h.incident.body),
    node(
      "small",
      `この年に何か思いがけない出来事が起きる確率は${percent(h.incident.yearChance)}、この出来事そのものは${percent(h.incident.chance)}でした（ゲームの仮定）。`,
    ),
  );
  return box;
}
function timelineRevealing() {
  return !!game && timelineShown < game.history.length;
}
// The engine has already finished the block. Only these status fields and map
// tiles follow the reveal cursor; saves and AI requests keep using game.
function revealedTimelineState(current, shown) {
  if (shown >= current.history.length) return current;
  const initial = createGame(current.profile, current.scenario, current.seed, ...Array(22).fill(0), current.era);
  const entry = current.history[shown - 1];
  // Cards carry the age during their year. Before the block's first card is
  // out, show where the player stood when choosing: the year after the last
  // earlier card.
  const before = entry && shown <= (current.directionBlocks?.at(-1)?.[0] ?? -1)
    ? { year: entry.year + 1, age: entry.age + 1 } : {};
  return {
    ...initial,
    ...entry,
    ...before,
    history: current.history.slice(0, shown),
    decisions: current.decisions.slice(0, shown),
    retired: entry ? entry.choice === "retire" || entry.age >= current.profile.retirementAge : initial.retired,
    ended: false,
  };
}
function renderRevealedStatus() {
  const state = revealedTimelineState(game, timelineShown),
    initial = createGame(game.profile, game.scenario, game.seed, ...Array(22).fill(0), game.era),
    previous = state.history.at(-2) ?? initial;
  renderCareerMap($("career-map"), state);
  $("chapter-label").textContent = state.ended
    ? "A CAREER, A LIFE OF CHOICES."
    : `${state.decisions.length}年が経過 / ${state.retired ? "仕事の先の暮らし" : "積み重なる、あなたのキャリア"}`;
  $("chapter-title").textContent = state.ended
    ? `${state.age}歳。キャリアと暮らしの歩みを振り返る。`
    : `${state.year}年、${state.age}歳のキャリアと暮らし。`;
  $("progress").value = state.decisions.length;
  $("progress").max = MAX_AGE - game.profile.age;
  $("hud-year").textContent = `${state.year}年`;
  $("hud-age").textContent = `${state.age}歳`;
  for (const [id, key, caption] of [["hud-income", "income", "年金等を含む"], ["hud-savings", "savings", "借入を差し引いた額"]]) {
    const delta = Math.round((state[key] - previous[key]) / 10) * 10;
    $(id).textContent = `約${money(state[key])}万円`;
    $(id).title = caption + (state.history.length
      ? `（${delta ? `${delta > 0 ? "+" : "−"}${nf.format(Math.abs(delta))}万円 / 前年比` : "前年とほぼ同じ"}）` : "");
  }
}
function timelineSentences(text = "") {
  return (text.replace(/選んだ方針は「[^」]*」。?/gu, "").match(/[^。！？\n]+[。！？]?/gu) ?? [])
    .map((sentence) => sentence.trim()).filter(Boolean);
}
function timelineSummary(entry, previous) {
  const used = new Set([previous?.outcome?.body, previous?.episode?.body, previous?.note]
    .flatMap((text) => timelineSentences(text)).map((text) => text.replace(/\s/gu, "")));
  // Episode openings describe the year; its later detours and intentions are
  // invitations for another choice, so they belong in the full text only.
  const candidates = [...timelineSentences(entry.outcome?.body),
    ...timelineSentences(entry.episode?.body ?? entry.note).slice(0, 1)];
  const summary = [];
  for (const sentence of candidates) {
    const key = sentence.replace(/\s/gu, "");
    if (used.has(key)) continue;
    used.add(key);
    summary.push(sentence);
    if (summary.length === 2) break;
  }
  return summary.join("");
}
// Only the current direction's years stay open; earlier ones fold into one
// box, so the choices stay close (2026-10-22: after 15 years they were
// 5,900px down, below a second log that repeated the same years).
function foldEarlierYears() {
  const earlier = $("journey-earlier-years");
  earlier.append(...[...$("journey-years").children]);
  $("journey-years").replaceChildren();
  updateEarlierYears();
}
function updateEarlierYears() {
  const rows = [...$("journey-earlier-years").children];
  $("journey-earlier").hidden = !rows.length;
  $("journey-earlier-summary").textContent = rows.length
    ? `これまでの${rows.length}年を見る（${rows[0].dataset.year}〜${rows.at(-1).dataset.year}年）` : "";
}
function appendTimelineYear(h, index, target = $("journey-years")) {
  const before = game.history[index - 1] ?? createGame(game.profile, game.scenario, game.seed, ...Array(22).fill(0), game.era);
  const row = node("article", undefined, "journey-year");
  row.dataset.year = h.year;
  row.append(
    node("p", `${h.year}年 / ${h.age}歳`, "eyebrow"),
    node("h3", (h.incident?.id === "layoff" && index >= game.lifeRealismFrom) ||
      (["scout", "promotionOffer", "burnout", "leaveContinues", "returnToWork"].includes(h.incident?.id) && index >= game.offersFrom)
      ? h.incident.title : h.outcome?.title ?? h.episode?.title ?? h.title),
  );
  if (index === 0 || game.directionBlocks?.some(([start]) => start === index))
    row.append(node("p", `選んだ方針は「${displayIntention(h)}」。`, "timeline-direction"));
  const summary = timelineSummary(h, game.history[index - 1]);
  if (summary) row.append(node("p", summary, "timeline-summary"));
  const incident = incidentNote(h);
  if (incident) row.append(incident);
  const signed = (n) => `${n >= 0 ? "+" : "−"}${nf.format(Math.abs(n))}`;
  row.append(node("small",
    `年収 ${nf.format(Math.round(h.income))}万円（${signed(Math.round(h.income) - Math.round(before.income))}） · 純資産 ${nf.format(Math.round(h.savings))}万円（${signed(Math.round(h.savings) - Math.round(before.savings))}）`,
  ));
  const details = node("details", undefined, "timeline-details"),
    original = displayEpisode(h);
  details.append(node("summary", "詳しく見る"), node("p", original, "timeline-original"));
  if (h.outcome?.body && !original.includes(h.outcome.body))
    details.append(node("p", h.outcome.body));
  if (h.employer.name !== before.employer.name)
    details.append(node("p", `勤務先：${before.employer.name} → ${h.employer.name}`));
  if (h.position && before.position && h.position.rank !== before.position.rank)
    details.append(node("p", `役割：${RANKS[before.position.rank].label} → ${RANKS[h.position.rank].label}`));
  if (h.choice === "move") {
    const decision = game.decisions[index];
    details.append(node("p", `住まいの移動：${typeof decision === "object" && decision.region ? REGIONS[decision.region].label : h.note}`));
  }
  if (h.familyOutcome && h.familyOutcome !== h.outcome)
    details.append(node("p", `${h.familyOutcome.title} ${h.familyOutcome.body}`));
  appendBudget(details, h);
  row.append(details);
  for (const milestone of careerMilestones(game).filter((m) => m.step === index + 1))
    appendReflection(row, milestone);
  target.append(row);
  return row;
}
function appendReflection(row, milestone) {
  const box = node("section", undefined, "timeline-reflection");
  box.dataset.milestone = milestone.id;
  box.append(node("h4", `${milestone.age}歳、ひと息の一行`), node("p", milestone.question));
  if (Object.hasOwn(game.reflections, milestone.id)) {
    box.append(node("p", game.reflections[milestone.id] || "この節目は、書かずに通り過ぎました。", "field-note"));
  } else {
    const form = node("form"), label = node("label", "いまの気持ち（任意・80文字まで）", "field-label"),
      input = node("input"), save = node("button", "一行を残す", "button secondary small"),
      skip = node("button", "今は書かない", "text-button"), error = node("p", "", "error");
    input.id = `reflection-${milestone.id}`;
    input.type = "text";
    input.maxLength = 80;
    input.autocomplete = "off";
    input.setAttribute("aria-describedby", "reflection-note");
    label.htmlFor = input.id;
    save.type = "submit";
    skip.type = "button";
    error.setAttribute("role", "alert");
    const finish = (text) => {
      if (!box.isConnected) return;
      try {
        game = recordCareerReflection(game, milestone.id, text);
        form.replaceChildren(node("p", text || "この節目は、書かずに通り過ぎました。", "field-note"));
        persist();
        // The ending résumé (and its copy text) was built before this line.
        $("ending-resume")?.replaceWith(renderCareerResume());
      } catch (e) { error.textContent = e.message; }
    };
    form.addEventListener("submit", (event) => { event.preventDefault(); finish(input.value); });
    skip.addEventListener("click", () => finish(""));
    form.append(label, input, save, skip, error);
    box.append(form);
  }
  row.append(box);
}
function resetTimeline() {
  clearTimeout(timelineTimer);
  timelinePaused = false;
  timelineUserScrolledUpAt = -Infinity;
  timelineShown = game?.history.length ?? 0;
  $("journey-years").replaceChildren();
  $("journey-earlier-years").replaceChildren();
  const history = game?.history ?? [],
    open = game?.directionBlocks?.at(-1)?.[0] ?? Math.max(0, history.length - 5);
  for (const [index, h] of history.entries())
    appendTimelineYear(h, index, index < open ? $("journey-earlier-years") : $("journey-years"));
  updateEarlierYears();
}
function renderTimelineControls() {
  const revealing = timelineRevealing();
  $("timeline").hidden = !game.history.length;
  $("timeline-controls").hidden = !revealing;
  $("timeline-pause").textContent = timelinePaused ? "再開" : "一時停止";
  $("timeline-pause").setAttribute("aria-pressed", String(timelinePaused));
  $("timeline-speed").value = String(timelineSpeed);
  $("timeline-status").textContent = revealing
    ? `${timelineShown - (game.history.length - lastJourney.entries.length)} / ${lastJourney.entries.length}年${timelinePaused ? " · 一時停止中" : " · 年月が流れています"}`
    : lastJourney?.stopReason || `ここまでの年月を振り返り、${directionSpan(game)}の方針を選べます。`;
}
function scheduleYear() {
  clearTimeout(timelineTimer);
  if (timelinePaused || !timelineRevealing()) return;
  timelineTimer = setTimeout(() => {
    const row = appendTimelineYear(game.history[timelineShown], timelineShown);
    timelineShown++;
    updateBook();
    renderRevealedStatus();
    if (timelineRevealing()) {
      renderTimelineControls();
      scrollTimelineTo(row);
      scheduleYear();
    } else {
      renderGame();
      scrollTimelineTo($("event-card"));
    }
  }, 6000 / timelineSpeed);
}
function toggleTimelinePause() {
  if (!timelineRevealing()) return;
  timelinePaused = !timelinePaused;
  renderTimelineControls();
  scheduleYear();
}
// Only real input counts as reading back: a scroll event alone may be a dialog
// restoring its position or the layout shifting, not the player.
let timelineUserScrolledUpAt = -Infinity, timelineTouchY = null,
  timelineScrollbarHeld = false, timelineLastScrollY = window.scrollY;
function scrollTimelineTo(element) {
  const now = performance.now();
  if (now - timelineUserScrolledUpAt < 4000 || document.querySelector("dialog[open]") ||
    document.activeElement?.closest("input, textarea, select, [contenteditable]")) return;
  element.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
// A scrollbar drag has no wheel or touch event: count an upward scroll only
// while the pointer is held on the scrollbar (beyond the page's width).
window.addEventListener("pointerdown", (event) => {
  timelineScrollbarHeld = event.clientX >= document.documentElement.clientWidth;
}, { passive: true });
window.addEventListener("pointerup", () => { timelineScrollbarHeld = false; }, { passive: true });
window.addEventListener("scroll", () => {
  const y = window.scrollY;
  if (timelineScrollbarHeld && y < timelineLastScrollY) timelineUserScrolledUpAt = performance.now();
  timelineLastScrollY = y;
}, { passive: true });
window.addEventListener("wheel", (event) => {
  if (event.deltaY < 0) timelineUserScrolledUpAt = performance.now();
}, { passive: true });
window.addEventListener("touchstart", (event) => { timelineTouchY = event.touches[0]?.clientY ?? null; }, { passive: true });
window.addEventListener("touchmove", (event) => {
  const y = event.touches[0]?.clientY;
  if (timelineTouchY !== null && y > timelineTouchY) timelineUserScrolledUpAt = performance.now();
  timelineTouchY = y ?? null;
}, { passive: true });
document.addEventListener("keydown", (event) => {
  if (["ArrowUp", "PageUp", "Home"].includes(event.key) &&
    !event.target.closest("input, textarea, select, button, [contenteditable]"))
    timelineUserScrolledUpAt = performance.now();
});
let timelineSpeed = 1;
try { if (localStorage.getItem("unwritten-life:timeline-speed") === "2") timelineSpeed = 2; } catch {}
$("timeline-pause").addEventListener("click", toggleTimelinePause);
$("timeline-speed").addEventListener("change", () => {
  timelineSpeed = $("timeline-speed").value === "2" ? 2 : 1;
  try { localStorage.setItem("unwritten-life:timeline-speed", String(timelineSpeed)); } catch {}
  scheduleYear();
});
$("journey-next").addEventListener("click", () => {
  clearTimeout(timelineTimer);
  while (timelineRevealing()) {
    appendTimelineYear(game.history[timelineShown], timelineShown);
    timelineShown++;
  }
  timelinePaused = false;
  renderGame();
  scrollTimelineTo($("event-card"));
});
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
    !timelineRevealing() || document.querySelector("dialog[open]") ||
    event.target.closest("input, textarea, select, button, [contenteditable]")) return;
  event.preventDefault();
  toggleTimelinePause();
});
function appendChoiceForecast(container, decision) {
  // Legacy unconfigured career cards open a form; the destination is not yet known.
  if (["switch", "startup"].includes(decision) && typeof decision === "string") {
    container.append(node("small", "初年度の成功率・リスク：選ぶ企業・事業が決まった段階で確認できます（この画面では未表示）", "choice-odds"));
    return;
  }
  const forecast = choiceForecast(game, decision);
  const odds = node("small", forecast.successText, "choice-odds");
  if (forecast.chance !== null) odds.dataset.probability = String(forecast.chance);
  container.append(odds, node("small", forecast.riskText, "choice-risk"),
    node("small", forecast.note, "choice-odds-note"));
}
function renderCareActions() {
  const container = $("career-actions");
  if (game.ended) return;
  if (game.health < 30) {
    const warning = node("p", game.health < 10
      ? "心と体のゆとりがとても少なくなっています。休養や人との時間を選べます。"
      : "心と体のゆとりが少なくなっています。休養や働き方の見直しを考えられます。", "health-warning");
    warning.setAttribute("role", "status");
    container.append(warning);
  }
  const actions = node("div", undefined, "care-actions");
  for (const [id, label] of [["rest", "休養する"], ["connect", "つながりを育てる"], ["switch", "仕事を探す・転職先を選ぶ"]]) {
    const button = node("button", label, "button secondary small");
    button.type = "button";
    button.dataset.careAction = id;
    button.disabled = generating || timelineRevealing() || !availableChoices(game).includes(id);
    button.title = !availableChoices(game).includes(id) ? "今の状態では選べません" : CHOICES[id].hint;
    button.addEventListener("click", () => {
      if (button.disabled || !button.isConnected || game.ended) return;
      if (id === "switch") openCareer(id);
      else commitChoice(id);
    });
    actions.append(button);
  }
  container.append(actions);
}
function renderGame() {
  updateBook();
  renderRevealedStatus();
  renderTimelineControls();
  const revealing = timelineRevealing();
  $("event-card").hidden = revealing;
  $("choices").hidden = revealing;
  $("career-actions").hidden = revealing;
  const complete = game.ended,
    initial = createGame(game.profile, game.scenario, game.seed, ...Array(22).fill(0), game.era),
    previous = game.history.length > 1 ? game.history.at(-2) : initial;
  const change = (key, monetary = false) => {
    if (!game.history.length) return "";
    const d = game[key] - previous[key],
      n = monetary ? Math.round(d / 10) * 10 : Math.round(d);
    return n === 0
      ? "前年とほぼ同じ"
      : `${n > 0 ? "+" : "−"}${nf.format(Math.abs(n))}${monetary ? "万円" : ""} / 前年比`;
  };
  $("profile-caption").textContent = [
    residenceName(game),
    JOBS[game.employer.role].label,
    workContext(game).model !== "unknown" ? workContext(game).description : "",
    game.employer.name +
      (game.employer.kind === "fictional" || game.employer.kind === "venture"
        ? "（架空）"
        : game.employer.kind === "real"
          ? "（転職は仮想）"
          : ""),
    game.employer.unverifiedCandidate ? "企業・職務はAI未確認" : "",
    inCompany(game) && game.position.rank !== "unspecified"
      ? `${RANKS[game.position.rank].label}${game.position.unit ? `・${game.position.unit}` : ""}`
      : inCompany(game) && game.position.unit
        ? game.position.unit
        : "",
    game.housing === "own" ? "持ち家" : "賃貸等",
    game.retired
      ? "退職後"
      : game.employer.kind === "seeking"
        ? "仕事を探している"
        : "就業中",
  ]
    .filter(Boolean)
    .join(" / ");
  $("world-badge").textContent = `AIの未来：${SCENARIOS[game.scenario].label} / 景気の背景：${ERAS[game.era ?? "standard"].label}`;
  // Income and net worth sit in the top band; the sidebar keeps the four
  // indicators and folds the money breakdown away.
  const breakdown = node("details", undefined, "money-breakdown");
  breakdown.open = moneyBreakdownOpen;
  breakdown.addEventListener("toggle", () => { moneyBreakdownOpen = breakdown.open; });
  breakdown.append(
    node("summary", "お金の内訳"),
    stat("手元の現金", money(game.cash), "万円"),
    stat("株式・投信", money(game.investments), "万円"),
    stat(
      "不動産 / 住宅ローン",
      `${money(game.homeValue)} / ${money(game.mortgage)}`,
      "万円",
    ),
    stat("その他の借入", money(game.debt), "万円"),
  );
  $("stats").replaceChildren(
    stat("仕事とAIのスキル", String(Math.round(game.skill)), "/100", change("skill"), game.skill),
    stat(
      "心と体のゆとり",
      String(Math.round(game.health)),
      "/100",
      change("health"),
      game.health,
    ),
    stat(
      "人とのつながり",
      String(Math.round(game.connection)),
      "/100",
      change("connection"),
      game.connection,
    ),
    stat(
      "暮らしの自由",
      String(Math.round(game.freedom)),
      "/100",
      change("freedom"),
      game.freedom,
    ),
    breakdown,
  );
  const worldPanel = $("world-context");
  worldPanel.replaceChildren();
  worldPanel.hidden = !worldEnabled(game);
  if (worldEnabled(game)) {
    const w = worldAt(game),
      f = game.family;
    worldPanel.append(
      node(
        "p",
        `${TONES[game.profile.tone]} / ${w.since}〜${w.until}年の架空の局面`,
        "eyebrow",
      ),
      node("h2", w.shock.label),
    );
    const tags = node("div", undefined, "world-tags");
    tags.append(node("span", w.economy.label), node("span", w.company.label));
    worldPanel.append(tags, node("p", w.shock.body));
    if (w.frontier) worldPanel.append(node("p", w.frontier, "insight"));
    worldPanel.append(
      node(
        "p",
        `${f.partner ? "パートナーあり" : game.profile.partner === "unspecified" ? "パートナー未設定" : "パートナーなし"} / 子ども ${f.childAges.length}人${f.childAges.length ? `（${f.childAges.join("・")}歳）` : ""} / 希望 ${f.desired === null ? "まだ未定" : `合計${f.desired}人`} / 学習の累計 ${nf.format(game.studyHours)}時間`,
        "field-note",
      ),
    );
  }
  const card = $("event-card");
  card.replaceChildren();
  const choices = $("choices");
  choices.replaceChildren();
  $("career-actions").replaceChildren();
  renderCareActions();
  if (complete) {
    const end = game.history.at(-1)?.careerEnd;
    card.append(
      node("p", "THE STORY OF YOUR WORKING LIFE.", "eyebrow"),
      node("h2", end ? `${game.age}歳、${end.title}。` : deathHeadline(game.age)),
    );
    const counts = Object.keys(CHOICES)
      .map((k) => [k, game.decisions.filter((x) => decisionId(x) === k).length])
      .sort((a, b) => b[1] - a[1]);
    card.append(
      node(
        "p",
        `${game.profile.age}歳から${game.age}歳まで、${game.decisions.length}年間を過ごしました。いちばん多く選んだのは「${CHOICES[counts[0][0]].label}」。仕事で得た経験やつながりは、大切にしたかった「${PRIORITIES[game.profile.priority]}」や、仕事を離れた後の暮らしに何を残したでしょう。`,
      ),
      node(
        "p",
        end
          ? "キャリアの区切りまでを描くゲームです。この先の暮らしは、ここまでの歩みと手元の資産の上に続いていきます。結果はゲーム内の仮定から生まれた物語です。"
          : "この最期はゲーム内の仮定から生まれた物語です。実際の寿命や死因を予測するものではありません。",
        "insight",
      ),
    );
    card.append(renderCareerResume());
    const actions = node("div", undefined, "ending-actions"),
      again = node("button", "同じ条件で、選びなおす ↗", "button primary"),
      compare = node("button", "別のAIの未来と比べる", "button secondary");
    again.addEventListener("click", () => {
      game = createGame(
        game.profile,
        game.scenario,
        game.seed,
        game.dynamicFrom,
        game.worldFrom,
        game.retirementFrom,
        game.careLeaveSalaryFrom,
        game.prepayFrom,
        game.debtRepayFrom,
        game.salaryCapFrom,
        game.incidentFrom,
        game.careerPathFrom,
        game.careerEndFrom,
        game.payRealismFrom,
        game.lifeRealismFrom,
        game.offersFrom,
        game.paceFrom,
        game.reemploymentPayFrom,
        game.driftFrom,
        game.familyFrom,
        game.growthFrom,
        game.cycleFrom,
        game.spendFrom,
        game.oddsFrom,
        game.lifeEventsFrom,
        game.era,
      );
      showGame(true);
    });
    compare.addEventListener("click", openComparison);
    actions.append(again, compare);
    card.append(actions);
  } else if (!eventFor(game).generated) {
    // Story choices wait for AI; permanent care/search commands remain available.
    card.append(node("p", `AIが考える場面 / ${game.year}`, "eyebrow"));
    if (generating) {
      card.append(
        node("h2", `${directionSpan(game)}を考えています…`),
        node(
          "p",
          "これまでの選択と結果、仕事・家計・家族の条件から、AIが場面と4つの選択肢をつくっています。",
        ),
      );
    } else {
      const ready = aiReady();
      card.append(
        node(
          "h2",
          ready ? "場面を作れませんでした" : "AIの接続が必要です",
        ),
        node(
          "p",
          ready
            ? generationError ||
                "AIの返答を待っています。もう一度生成してください。"
            : "このゲームは5年ごとの場面と方針をAIで作ります。AIを接続すると、この年から続けられます。",
        ),
      );
      const actions = node("div", undefined, "scene-retry");
      const retry = node(
        "button",
        ready ? "もう一度生成する ✳" : "AIを接続する ↗",
        "button primary small",
      );
      retry.type = "button";
      retry.addEventListener("click", () =>
        ready ? generateScene() : openAISettings(),
      );
      actions.append(retry);
      if (ready) {
        const settings = node("button", "AIの接続を変える ↗", "text-button");
        settings.type = "button";
        settings.addEventListener("click", () => openAISettings());
        actions.append(settings);
      }
      card.append(actions);
    }
  } else {
    const event = eventFor(game);
    card.append(
      node("p", `AIが作った架空の場面 / ${game.year}`, "eyebrow"),
      node("h2", event.title),
      node("p", event.body),
      node("p", event.insight, "insight"),
    );
    if (event.profileBasis?.length) {
      const basis = node("details", undefined, "profile-basis");
      basis.append(node("summary", "この場面に反映したプロフィール"));
      const list = node("ul");
      for (const item of event.profileBasis)
        list.append(node("li", `${item.label}：${item.detail}`));
      basis.append(list);
      card.append(basis);
    }
    const options = [...event.options];
    const extra = node("details"),
      extraButtons = node("div", undefined, "career-actions");
    extra.append(
      node("summary", "ほかの働き方・お金・暮らしの選択"),
      extraButtons,
    );
    for (const id of availableChoices(game)) {
      if (!options.some((o) => o.id === id)) {
        const extraButton = node(
          "button",
          (id === "opportunity"
            ? (opportunityAt(game)?.label ?? CHOICES[id].label)
            : CHOICES[id].label) + " ↗",
          "text-button",
        );
        extraButton.disabled = generating;
        extraButton.title = CHOICES[id].hint;
        extraButton.addEventListener("click", () => {
          if (generating) return;
          if (["switch", "startup"].includes(id)) {
            openCareer(id);
            return;
          }
          commitChoice(id);
        });
        extraButtons.append(extraButton);
      }
    }
    if (extraButtons.children.length) $("career-actions").append(extra);
    for (const option of options) {
      const button = node("button", undefined, "choice");
      button.type = "button";
      button.disabled = generating;
      button.dataset.choice = option.id;
      const c = CHOICES[option.id],
        offer = option.id === "opportunity" ? opportunityAt(game) : null,
        copy = node("span");
      copy.append(
        node("b", option.label),
        node(
          "small",
          `${option.hint}${offer ? ` / 開業費${offer.setup}万円・年間運営費${VENTURES[offer.venture].overhead}万円` : ""} / 行動：${c.label}`,
        ),
      );
      appendChoiceForecast(copy, option.decision ?? option.id);
      if (option.reason)
        copy.append(node("small", `あなたとの接点：${option.reason}`));
      // Ending the career ends the story; say so in the game's own words.
      if (option.id === "retire")
        copy.append(node("small", "選ぶとキャリアの物語が終わります", "choice-ending-note"));
      // While job-seeking, these years pause the search (no re-employment).
      if (game.employer.kind === "seeking" && ["rest", "recover", "careLeave"].includes(option.id))
        copy.append(node("small", "この1年は仕事探しを休みます", "choice-pause-note"));
      if (option.decision?.id === "switch")
        copy.append(
          node(
            "small",
            `候補：${option.decision.name} / ${JOBS[option.decision.role].label}（架空の転職・AIの候補は未確認）`,
          ),
        );
      button.append(
        node("span", "▶", "command-cursor"),
        node("span", c.icon, "choice-symbol"),
        copy,
        node("span", "↗", "choice-arrow"),
      );
      button.querySelector(".command-cursor").setAttribute("aria-hidden", "true");
      button.querySelector(".choice-symbol").setAttribute("aria-hidden", "true");
      button.addEventListener("click", () => {
        if (!button.isConnected || game.ended || generating) return;
        if (option.decision) {
          commitChoice(option.decision);
          return;
        }
        if (["switch", "startup"].includes(option.id)) {
          openCareer(option.id);
          return;
        }
        commitChoice(option.id);
      });
      choices.append(button);
    }
    appendCareerOfferCommand(choices);
  }
  $("choice-title").parentElement.hidden = revealing || complete || !eventFor(game).generated;
  $("choice-title").textContent = `コマンド / ${directionSpan(game)}の方針`;
  $("undo-button").disabled = game.decisions.length === 0 || generating;
  $("context-preview").textContent = JSON.stringify(
    storyRequest(game, { catalog: knowledgeCatalog }).context,
    null,
    2,
  );
  renderKnowledge();
  renderAI();
  for (const button of $("career-offers").querySelectorAll(".career-offer-button"))
    button.disabled = generating || revealing;
  persist();
}
function aiReady() {
  return Boolean(!serverStale && !aiTesting && aiState?.ready && (!aiState.cloud || hosted || cloudConsented));
}
function renderAI() {
  if (!aiState) return;
  const local = !aiState.cloud;
  const ready = aiReady();
  for (const id of ["quick-start", "demo-button", "resume-button"]) $(id).disabled = serverStale;
  if (serverStale) $("ai-submit").disabled = true;
  $("ai-status").classList.toggle("is-generating", generating);
  $("event-card").setAttribute("aria-busy", String(generating));
  $("ai-status").textContent = serverStale ? staleNotice : generating
    ? `${local ? "PC内のAI" : "接続したAI"}が、この結果から次の場面と選択肢を考えています…`
    : !ready
      ? "AIが未接続です。「AIの接続」から使うAIを選んでください。"
      : aiState.subscription
        ? `サブスク：${aiState.provider === "codex-cli" ? "Codex CLI" : "Claude Code"} / ${aiState.model} · ${aiState.calls}回（暴走防止上限 ${aiState.requestCap}回）`
        : local ? `PC内：${aiState.provider} / ${aiState.model} · ${aiState.calls}/${aiState.requestCap}回（API課金なし）`
        : `${local ? "PC内" : "クラウド"}：${aiState.provider} / ${aiState.model} · ${aiState.calls}/${aiState.requestCap}回 · 見積り予約 $${aiState.reservedUSD.toFixed(4)} / $${aiState.usdCap}${hosted ? "（累計）" : ""}`;
  $("ai-setup-banner").classList.toggle("is-ready", ready);
  $("ai-setup-status").textContent = serverStale ? staleNotice : ready
    ? `✓ AI接続済み：${aiState.subscription ? (aiState.provider === "codex-cli" ? "Codex CLI" : "Claude Code") : aiState.provider} / ${aiState.model}`
    : hosted
      ? "OpenAIの接続準備ができていません。少し待って再読み込みしてください。"
      : "はじめる前に、場面と選択肢をつくるAIを接続してください。";
  $("ai-setup-button").hidden = hosted || serverStale;
  $("ai-setup-button").textContent = ready ? "接続を変える ↗" : "AIを接続する ↗";
  $("career-generate").disabled =
    generating || !ready || !game || game.ended || isRetiredAt(game);
  $("career-compare-button").disabled =
    generating || !game || game.ended || isRetiredAt(game);
  $("back-setup").disabled = generating;
  $("ai-accounting").textContent = aiState.subscription
    ? `普段のCLIと契約の利用枠を共有。この起動中 ${aiState.calls}回（失敗も含む）、暴走防止上限 ${aiState.requestCap}回。接続確認は回数に含みません。APIキーでの再試行やモデルの自動切り替えは行いません。`
    : local ? `この起動中：${aiState.calls}/${aiState.requestCap}回。API課金なし。接続確認は回数に含みません。`
    : `${hosted ? "このスマホ版の累計" : "この起動中"}：${aiState.calls}/${aiState.requestCap}回、見積り予約 $${aiState.reservedUSD.toFixed(4)} / $${aiState.usdCap}。失敗した呼び出しも数えます。${hosted ? "" : " 接続確認も見積り費用を予約します（回数には含みません）。"}${hosted ? " 再読み込みでも上限は戻りません。" : ""}`;
  renderAITiming();
}
function renderAITiming() {
  const el = $("ai-timing");
  const times = generationTimes.get(connectionKey(aiState)) ?? [];
  // Only the wait is worth a line; the rest stays out of the way.
  el.hidden = !generating;
  el.textContent = generating
    ? `経過${Math.floor((performance.now() - generationStarted) / 1000)}秒${times.length ? `（前回は約${Math.ceil(times.at(-1) / 1000)}秒）` : ""}`
    : "";
}
async function maybeGenerateScene() {
  const current = revision;
  if (!aiState) {
    try {
      await status();
    } catch {
      return;
    }
  }
  if (
    current !== revision ||
    $("game").hidden ||
    !game ||
    game.ended ||
    generating ||
    !aiReady() ||
    eventFor(game).generated
  )
    return;
  await generateScene();
}
async function generateScene() {
  if (!game || game.ended || generating) return;
  if (!aiReady()) {
    openAISettings();
    return;
  }
  const current = revision;
  const timingKey = connectionKey(aiState);
  let retry = false;
  generationStarted = performance.now();
  generating = true;
  generationError = "";
  generationTimer = setInterval(renderAITiming, 1000);
  renderGame();
  $("undo-button").disabled = true;
  try {
    const result = await api("/api/scene", {
      save: encodeSave({ ...game, reflections: {} }),
      cloudConsent: true,
      choiceVersion: 1,
      mode: "life",
    });
    aiState = result.accounting;
    if (current === revision) {
      game = applyScene(game, result.scene);
      if (!result.cached) {
        const times = generationTimes.get(timingKey) ?? [];
        times.push(performance.now() - generationStarted);
        generationTimes.set(timingKey, times.slice(-5));
        if (generationTimes.size > 20)
          generationTimes.delete(generationTimes.keys().next().value);
      }
    }
  } catch (error) {
    // A local model costs nothing to ask again, and small ones often miss the
    // reply format: retry once on a rejected reply. Paid connections, network
    // errors and timeouts still wait for the player.
    retry = current === revision && generateScene.retried !== revision &&
      aiState && !aiState.cloud && !aiState.subscription &&
      /採用しませんでした|有効な文章|JSON形式になりませんでした/.test(error.message);
    if (retry) generateScene.retried = revision;
    else if (current === revision)
      generationError = `AIで場面を作れませんでした。${error.message}`;
    try {
      await status();
    } catch {}
  } finally {
    clearInterval(generationTimer);
    generating = false;
    if (game) renderGame();
  }
  if (retry) await generateScene();
}
function openComparison() {
  $("compare-caption").textContent =
    `同じ初期条件・同じ選択・同じ偶然で、AIの普及速度を変えた比較です。別世界では終わりを迎えた年や選べる行動が異なるため、その時点までの結果を示します。`;
  const grid = node("div", undefined, "comparison-grid");
  for (const g of compareWorlds(game)) {
    const def = SCENARIOS[g.scenario],
      section = node(
        "section",
        undefined,
        `world-result${g.scenario === game.scenario ? " current" : ""}`,
      ),
      dl = node("dl");
    section.append(
      node("h3", def.label),
      node(
        "p",
        `${g.year}年 / ${g.age}歳 / ${g.ended ? "キャリアと人生の完結" : g.comparisonBlocked ? "実行条件の違いでここまで" : "この時点まで"}`,
        "world-desc",
      ),
    );
    for (const [name, value, unit] of [
      ["年収", money(g.income), "万円"],
      ["純資産", money(g.savings), "万円"],
      [
        "ゆとり / つながり / 自由",
        `${Math.round(g.health)} / ${Math.round(g.connection)} / ${Math.round(g.freedom)}`,
        "",
      ],
    ]) {
      const dd = node("dd", value, unit ? undefined : "metric-small");
      if (unit) dd.append(node("small", unit));
      dl.append(node("dt", name), dd);
    }
    section.append(dl);
    grid.append(section);
  }
  $("comparison").replaceChildren(grid);
  $("compare-dialog").showModal();
}
for (const [trigger, dialog] of [
  ["about-button", "about-dialog"],
  ["assumptions-button", "assumptions-dialog"],
])
  $(trigger).addEventListener("click", () => $(dialog).showModal());
for (const dialog of document.querySelectorAll("dialog")) {
  dialog
    .querySelector("[data-close]")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
}
$("profile-form").addEventListener("submit", (e) => {
  e.preventDefault();
  $("form-error").textContent = "";
  try {
    const p = readProfile();
    game = createGame(
      p,
      p.scenario,
      crypto.getRandomValues(new Uint32Array(1))[0],
      ...Array(22).fill(0),
      new FormData(e.currentTarget).get("era"),
    );
    remember = $("remember").checked;
    showGame(true, true);
  } catch (error) {
    $("form-error").textContent = error.message;
  }
});
$("demo-button").addEventListener("click", () => {
  game = createGame(
    {
      age: 30,
      region: "city",
      job: "tech",
      income: 500,
      savings: 500,
      stocks: 150,
      monthlyCost: 12,
      housing: "rent",
      rent: 7,
      ai: "sometimes",
      priority: "balance",
      gender: "undisclosed",
      household: "solo",
      companyType: "small",
      company: "みどりテクノロジー（架空）",
      pension: 180,
    },
    "steady",
    7612026,
  );
  remember = false;
  showGame(true, true);
  toast("架空の人物で体験中。保存はオフです。");
});
$("resume-button").addEventListener("click", () => {
  if (savedGame) {
    game = savedGame;
    remember = true;
    $("remember").checked = true;
    showGame(true);
  }
});
$("delete-save").addEventListener("click", removeSave);
$("game-delete-save").addEventListener("click", removeSave);
$("back-setup").addEventListener("click", () => {
  if (generating) return;
  revision++;
  clearTimeout(timelineTimer);
  $("game").hidden = true;
  $("setup").hidden = false;
  readStoredGame();
  $("profile-section").scrollIntoView({ behavior: "instant" });
});
$("undo-button").addEventListener("click", () => {
  if (!game.decisions.length || generating) return;
  lastJourney = null;
  const reflections = game.reflections,
    seen = game.careerSeen;
  const length = previousDirectionStep(game),
    blocks = game.directionBlocks?.filter(([, end]) => end <= length),
    scenes = Object.fromEntries(
      Object.entries(game.scenes).filter(([k]) => Number(k) <= length),
    );
  game = replay(
    game.profile,
    game.scenario,
    game.seed,
    game.decisions.slice(0, length),
    scenes,
    false,
    game.dynamicFrom,
    game.worldFrom,
    game.retirementFrom,
    game.careLeaveSalaryFrom,
    game.prepayFrom,
    game.debtRepayFrom,
    game.salaryCapFrom,
    game.incidentFrom,
    game.careerPathFrom,
    game.careerEndFrom,
    game.payRealismFrom,
    game.lifeRealismFrom,
    game.offersFrom,
    game.paceFrom,
    game.reemploymentPayFrom,
    game.driftFrom,
    game.familyFrom,
    game.growthFrom,
    game.cycleFrom,
    game.spendFrom,
    game.oddsFrom,
    game.lifeEventsFrom,
    blocks,
    game.era,
  );
  const reached = new Set(careerMilestones(game).map((m) => m.id));
  game.reflections = Object.fromEntries(Object.entries(reflections).filter(([id]) => reached.has(id)));
  game.careerSeen = careerSeenUntil({ careerSeen: seen }, game.decisions.length);
  bookSeen = bookBaseline(game);
  revision++;
  resetTimeline();
  renderGame();
  void maybeGenerateScene();
  moveToStory();
});
$("compare-button").addEventListener("click", openComparison);
function updateProfileVisibility() {
  const f = $("profile-form"),
    detailed = profileLevel !== "quick",
    advanced = profileLevel === "advanced";
  const occupation = f.elements.occupation.value;
  const working = !["student", "notWorking"].includes(occupation);
  const own = f.elements.housing.value === "own";
  $("quick-fields").hidden = detailed;
  $("quick-summary").hidden = detailed;
  $("profile-standard").hidden = !detailed;
  $("profile-advanced").hidden = !advanced;
  $("child-stage-field").hidden = Number(f.elements.children.value) === 0;
  $("home-fields").hidden = !own;
  $("rent-field").hidden = own;
  for (const el of f.querySelectorAll("[data-loan-field]"))
    el.hidden = !own || Number(f.elements.mortgage.value) <= 0;
  $("company-field").hidden = !working;
  $("industry-field").hidden = !working;
  for (const el of f.querySelectorAll("[data-company-config]"))
    el.hidden = !working || occupation === "independent";
  $("company-research-panel").hidden =
    !detailed || !working || !$("company-name").value.trim();
  $("company-search").disabled =
    !detailed ||
    !working ||
    !$("company-name").value.trim() ||
    $("company-search").textContent.includes("調べています");
  for (const el of f.querySelectorAll("input,select,textarea"))
    // The inferred region stays part of FormData while its control is hidden.
    el.disabled = el.id === "region" ? !detailed : !!el.closest("[hidden]");
  $("quick-start").textContent = detailed
    ? "この私で、はじめる ↗"
    : "この設定ですぐ始める ↗";
}
function updateBudget() {
  updateProfileVisibility();
  const values = readProfile();
  $("quick-summary").textContent =
    `${values.age}歳・${REGIONS[values.region].label}・${JOBS[values.job].label}でスタート。年収${values.income}万円・資産${values.savings}万円など、年代と地域から決めたゲーム用の目安を使います。`;
  $("budget-summary").textContent =
    `このゲームの初期設定：年収 ${values.income}万円、金融資産 ${values.savings}万円（うち株式 ${values.stocks}万円）、生活費 ${values.monthlyCost}万円/月 ＋ ${values.housing === "own" ? "持ち家の維持・返済費" : "家賃 " + values.rent + "万円/月"}。未入力はゲーム用の仮値です。実際の資産を入力する必要はありません。`;
}
for (const [id, occupation] of Object.entries(OCCUPATIONS)) {
  const option = node("option", occupation.label);
  option.value = id;
  $("occupation").append(option);
}
for (const [id, label] of Object.entries(PROFILE_INDUSTRIES)) {
  const option = node("option", label);
  option.value = id;
  $("industry").append(option);
}
for (const button of document.querySelectorAll("[data-profile-level]")) {
  button.addEventListener("click", () => {
    profileLevel = button.dataset.profileLevel;
    for (const b of document.querySelectorAll("[data-profile-level]"))
      b.setAttribute("aria-pressed", String(b === button));
    $("form-error").textContent = "";
    updateBudget();
  });
}
for (const id of ["quick-age-band", "quick-region"])
  $(id).addEventListener("change", updateBudget);
function knowledgeItem(fact) {
  const item = node("p"),
    link = node(
      fact.url ? "a" : "span",
      `${fact.source} / 確認 ${fact.checkedAt}`,
    );
  if (fact.url) {
    link.href = fact.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  item.append(
    node(
      "b",
      `${fact.kind === "game-rule" ? "ゲームの仮定" : fact.year} / ${fact.title}`,
    ),
    node("br"),
    node("span", fact.detail + " "),
    link,
  );
  return item;
}
function renderKnowledge() {
  const catalog = $("knowledge-catalog");
  catalog.replaceChildren();
  for (const [kind, title] of [
    ["history", "過去の観測・出来事"],
    ["game-rule", "ゲーム独自の仮定"],
  ]) {
    catalog.append(node("h4", title));
    knowledgeCatalog
      .filter((r) => r.kind === kind)
      .forEach((r) => catalog.append(knowledgeItem(r)));
  }
  const selected = $("knowledge-selected");
  selected.replaceChildren();
  if (game) {
    const refs = knowledgeFor(game, { catalog: knowledgeCatalog });
    const entries = [...refs.historical, ...refs.rules];
    $("knowledge-selected-title").textContent =
      `${game.year}年のあなたに関連する資料 · ${entries.length}件`;
    entries.forEach((r) => selected.append(knowledgeItem(r)));
  }
}
renderKnowledge();
$("knowledge-status").textContent =
  `内蔵の知識 ${knowledgeCatalog.length}件を利用中。端末内のDBを準備しています。`;
loadKnowledge().then((loaded) => {
  knowledgeCatalog = loaded.catalog;
  const counts = (kind) =>
    knowledgeCatalog.filter((r) => r.kind === kind).length;
  $("knowledge-status").textContent =
    `${loaded.storage === "indexeddb" ? "端末内の知識DBに保存済み" : "端末でDB保存を利用できないため、内蔵資料を使用中"} · 歴史${counts("history")}件 / ゲームの仮定${counts("game-rule")}件 · ${KNOWLEDGE_REVISION}`;
  renderKnowledge();
});
$("monthly-cost").addEventListener("input", () => {
  customCost = true;
});
function regionCosts(region, household = "solo") {
  return {
    monthlyCost: Math.round(
      ((12 * REGIONS[region].cost) / 17) *
      { solo: 1, shared: 1.5, care: 1.8 }[household] * 10,
    ) / 10,
    rent: { metro: 9, city: 7, rural: 5 }[region],
  };
}
function suggestedCost() {
  const costs = regionCosts($("region").value, $("household").value);
  $("profile-form").elements.rent.placeholder = `未入力なら仮の${costs.rent}万円`;
  if (!customCost) $("monthly-cost").value = String(costs.monthlyCost);
  updateBudget();
}
function updateMunicipalityRegion() {
  // The area select stays hidden unless asked for: a blank or unreadable
  // municipality falls back to 地方の中心都市, and the line says why.
  const text = $("municipality").value.trim(),
    inferred = regionFromMunicipality(text);
  if (!manualRegion) $("region").value = inferred ?? "city";
  $("region-field").hidden = !regionRevealed;
  $("region-inference-text").textContent = `${
    manualRegion || inferred ? "" : text ? "市区町村から判定できないため、" : "市区町村が未入力のため、"
  }家賃・生活費は「${REGIONS[$("region").value].label}」の目安で計算します`;
  suggestedCost();
}
$("municipality").addEventListener("input", () => {
  manualRegion = false;
  updateMunicipalityRegion();
});
$("change-region").addEventListener("click", () => {
  regionRevealed = true;
  updateMunicipalityRegion();
  $("region").focus();
});
$("region").addEventListener("change", () => {
  manualRegion = true;
  updateMunicipalityRegion();
});
$("household").addEventListener("change", suggestedCost);
$("profile-form").addEventListener("input", updateBudget);
$("profile-form").addEventListener("change", updateBudget);
for (const id of [
  "company-summary",
  "company-name",
  "company-sector",
  "company-url",
])
  $(id).addEventListener("input", () => {
    companyURLResearchRevision++;
    $("company-confirmed").checked = false;
    $("research-status").textContent =
      "会社情報を変更しました。内容を確認し、「物語に反映する」をチェックしてください。";
  });
$("company-name").addEventListener("input", () => {
  companyResearchRevision++;
  $("company-candidates").replaceChildren();
  companySources = [];
  $("company-summary").value = "";
  $("company-sources").replaceChildren();
  $("company-confirmed").checked = false;
  $("research-status").textContent = "会社名から候補を検索してください。";
  $("company-research-panel").open = false;
  updateBudget();
});
$("company-confirmed").addEventListener("change", () => {
  if (
    $("company-confirmed").checked &&
    (!$("company-summary").value.trim() || !companySources.length)
  ) {
    $("company-confirmed").checked = false;
    $("research-status").textContent =
      "先に会社の候補を選び、出典のある会社情報を取得してください。";
    return;
  }
  $("research-status").textContent = $("company-confirmed").checked
    ? "✓ この会社情報を物語に反映します。"
    : "会社名のみで開始します。事業・特徴の情報は物語に反映しません。";
});
document.querySelector(".company-research").hidden = true;
$("company-name").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    $("company-search").click();
  }
});
$("research-button").addEventListener("click", async () => {
  const button = $("research-button"),
    current = ++companyURLResearchRevision,
    requestedURL = $("company-url").value;
  button.disabled = true;
  $("research-status").textContent = "指定した公開ページを取得しています。";
  try {
    const { facts } = await api("/api/company", {
      url: requestedURL,
    });
    if (
      current !== companyURLResearchRevision ||
      requestedURL !== $("company-url").value
    )
      return;
    $("company-summary").value = facts.summary;
    companySources = facts.sources;
    $("company-sources").replaceChildren();
    for (const source of companySources) {
      const a = node(
        "a",
        `${source.title || source.url} / 取得日 ${source.checkedAt}`,
      );
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      $("company-sources").append(a);
    }
    $("company-confirmed").checked = false;
    $("research-status").textContent =
      "本文を取得しました。内容と会社の一致を確認し、必要に応じて編集してください。";
  } catch (error) {
    if (
      current === companyURLResearchRevision &&
      requestedURL === $("company-url").value
    )
      $("research-status").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
function resetCareerResearch() {
  careerResearchRevision++;
  careerSources = [];
  $("career-candidates").replaceChildren();
  $("career-summary").value = "";
  $("career-confirmed").checked = false;
  $("career-research-status").textContent = "";
}
function openCareer(mode) {
  if (!game || game.ended || generating || isRetiredAt(game)) return;
  careerMode = mode;
  const scout = mode === "switch" && pendingCareerOffer(game)?.id === "scout";
  resetCareerResearch();
  $("career-title").textContent =
    mode === "startup"
      ? "まだない仕事を、自分でつくる。"
      : scout ? "届いたスカウトを、検討する。" : "次は、どこで働こう。";
  $("career-intro").textContent =
    mode === "startup"
      ? "事業を選ぶだけで始められます。名前をつけるのは任意です。"
      : scout
        ? `${game.year}年に応答できるスカウトです。AIが考える企業と役割を比べ、会社を選ぶと転職します。閉じて元の4択を選ぶこともできます。採用や好条件を保証する話ではありません。`
        : `${game.year}年の分岐。会社と役割の組み合わせが、その後の物語と収支を変えます。`;
  $("career-job-fields").hidden = mode !== "switch";
  $("career-venture-fields").hidden = mode !== "startup";
  $("career-error").textContent = "";
  $("career-name").value = "";
  $("career-url").value = "";
  $("career-type").value = "unknown";
  $("career-offer-section").hidden = mode !== "switch";
  $("career-form").hidden = mode === "switch";
  $("career-manual-toggle").setAttribute("aria-expanded", "false");
  if (careerDraft?.revision !== revision) careerError = "";
  renderCareerOffers();
  $("career-role").replaceChildren();
  $("career-sector").replaceChildren();
  const unknown = node("option", "わからない");
  unknown.value = "unknown";
  $("career-sector").append(unknown);
  for (const [id, job] of Object.entries(JOBS)) {
    const o = node("option", job.label);
    o.value = id;
    $("career-sector").append(o);
    if (!["other", "independent"].includes(id))
      $("career-role").append(o.cloneNode(true));
  }
  $("career-role").value = ["other", "independent"].includes(game.employer.role)
    ? "people"
    : game.employer.role;
  $("career-venture").replaceChildren();
  for (const [id, v] of Object.entries(VENTURES)) {
    const o = node(
      "option",
      `${v.label}${game.cash < v.setup ? "（資金不足）" : ""}`,
    );
    o.value = id;
    o.disabled = game.cash < v.setup;
    $("career-venture").append(o);
  }
  $("career-venture").value = Object.keys(VENTURES).find(
    (id) => game.cash >= VENTURES[id].setup,
  );
  $("venture-name").value = "";
  renderCareer();
  $("career-dialog").showModal();
  if (mode === "switch" && aiReady() && careerDraft?.revision !== revision)
    void generateCareerChoices();
}
async function generateCareerChoices() {
  if (!game || game.ended || isRetiredAt(game) || generating) return;
  if (!aiReady()) {
    $("career-dialog").close();
    openAISettings();
    return;
  }
  const current = revision;
  careerGenerating = true;
  careerError = "";
  generating = true;
  generationStarted = performance.now();
  generationTimer = setInterval(renderAITiming, 1000);
  renderGame();
  renderCareerOffers();
  try {
    const result = await api("/api/scene", {
      save: encodeSave({ ...game, reflections: {} }),
      cloudConsent: true,
      choiceVersion: 1,
      mode: "career",
    });
    aiState = result.accounting;
    if (current === revision) {
      careerDraft = { revision: current, scene: result.scene };
      game = recordCareerSeen(
        game,
        result.scene.options
          .filter((o) => o.decision?.id === "switch")
          .map((o) => o.decision.name),
      );
      persist();
    }
  } catch (error) {
    if (current === revision)
      careerError = `転職の4択を作れませんでした。${error.message}`;
    try {
      await status();
    } catch {}
  } finally {
    clearInterval(generationTimer);
    careerGenerating = false;
    generating = false;
    renderGame();
    renderCareerOffers();
  }
}
$("career-generate").addEventListener("click", generateCareerChoices);
$("career-dialog").addEventListener("close", () => {
  if (game && pendingCareerOffer(game)?.id === "scout" && !timelineRevealing())
    $("choices").querySelector('[data-offer="scout"]')?.focus();
});
function takeCareerDecision(decision) {
  if (generating || timelineRevealing() || !availableChoices(game).includes(decisionId(decision)))
    throw new Error("今の状態では選べません。");
  $("career-dialog").close();
  commitChoice(decision);
}
function renderCareerOffers() {
  const container = $("career-offers");
  container.replaceChildren();
  const currentRevision = revision;
  if (careerMode !== "switch") return;
  const generated =
    careerDraft?.revision === revision ? careerDraft.scene : null;
  $("career-generation-status").textContent = careerGenerating
    ? "AIがプロフィール・仕事の形・直前の結果から、企業と役割を考えています…"
    : generated
      ? "AIが作った4択です。企業名・職務の提案は未確認のゲーム内設定で、実際の求人ではありません。"
      : careerError || "AIが、あなたの経験・関心・暮らしから4つの道を考えます。";
  if (careerGenerating || !generated) return;
  const offers = generated.options.map((o) => ({
        label: o.label,
        company: o.id === "switch" ? o.decision.name : game.employer.name,
        kind: o.decision.candidateKind,
        work: o.decision.proposal ?? o.decision.intent ?? o.label,
        reason: o.reason,
        tradeoff: o.hint,
        decision: o.decision,
      }));
  for (const offer of offers) {
    const card = node("article", undefined, "career-offer");
    const button = node("button", undefined, "career-offer-button");
    button.type = "button";
    button.disabled = generating || timelineRevealing();
    button.append(
      node("small", offer.label, "career-offer-label"),
      node("strong", offer.company),
      node("span", offer.work),
    );
    button.addEventListener("click", () => {
      if (revision !== currentRevision || generating) return;
      try {
        takeCareerDecision(offer.decision);
      } catch (error) {
        toast(error.message);
      }
    });
    appendChoiceForecast(button, offer.decision);
    card.append(button);
    const details = node("details", undefined, "career-offer-details");
    details.append(
      node("summary", "経験との接点・気になる点"),
      node("p", offer.reason),
      node("p", offer.tradeoff),
    );
    if (offer.kind === "fictional")
      card.append(node("small", "この世界で生まれた架空の企業"));
    else if (offer.kind === "real")
      card.append(node("small", "AIが挙げた候補。実在・事業・職務は未確認"));
    card.append(details);
    container.append(card);
  }
}
$("career-manual-toggle").addEventListener("click", () => {
  $("career-form").hidden = !$("career-form").hidden;
  $("career-manual-toggle").setAttribute(
    "aria-expanded",
    String(!$("career-form").hidden),
  );
});
$("career-compare-button").addEventListener("click", () => {
  if (!game || game.ended || isRetiredAt(game) || generating) return;
  openCareer("switch");
});
function renderCareer() {
  const preview = $("career-preview");
  preview.replaceChildren();
  $("career-future").textContent =
    careerMode === "switch"
      ? game.year < 2036
        ? "2036年以降は、この世界で生まれた架空の企業もAIの候補に加わります。"
        : "AIの候補には、この世界で生まれた架空の企業も含まれます。"
      : "転職すると自分の事業から離れます。退職すると運営と事業収入を止めます。事業売却益は仮定しません。";
  if (careerMode === "startup") {
    const v = VENTURES[$("career-venture").value];
    preview.append(node("b", "自分が起こす架空の事業"), node("p", v.detail));
    $("career-cost").textContent =
      `手元現金 ${money(game.cash)}万円 / 初期費用 ${v.setup}万円 ＋ 年間運営費 ${v.overhead}万円。初年の事業収入は今の労働収入の30〜85%を基準に変動（収入ゼロなら年120万円を基準）。以後もAIの需要・競争と経験で上下します。すべてゲームの仮定です。`;
  } else {
    preview.append(
      node("b", "入力した企業への、架空の転職"),
      node(
        "p",
        "会社名だけでは事業内容を判断しません。公開情報を加えると、確認した事業分野もその後に反映します。",
      ),
    );
    for (const s of careerSources) {
      const a = node("a", `${s.title || s.url} / 取得 ${s.checkedAt}`);
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      preview.append(a);
    }
    $("career-cost").textContent =
      "移行費用30万円。収入は現在の労働収入・経験・職種変更・年ごとの偶然から上下します。会社のタイプと事業分野が、以後のAIの影響を変えます。職種変更時は移行の負担があり、収入ゼロなら仮の年180万円を基準にします。実際の募集や年収データは使っていません。";
  }
}
$("career-venture").addEventListener("change", () => {
  resetCareerResearch();
  renderCareer();
});
for (const id of ["career-name", "career-url"])
  $(id).addEventListener("input", () => {
    resetCareerResearch();
    renderCareer();
  });
for (const id of ["career-summary", "career-sector"])
  $(id).addEventListener("input", () => {
    $("career-confirmed").checked = false;
  });
$("career-research").addEventListener("click", async () => {
  const button = $("career-research"),
    rev = ++careerResearchRevision;
  button.disabled = true;
  $("career-research-status").textContent =
    "指定した公開ページを取得しています。";
  try {
    const { facts } = await api("/api/company", { url: $("career-url").value });
    if (rev !== careerResearchRevision) return;
    careerSources = facts.sources;
    $("career-summary").value = facts.summary;
    $("career-confirmed").checked = false;
    $("career-research-status").textContent =
      "取得元と企業の一致・内容を確認してからチェックしてください。";
    renderCareer();
  } catch (e) {
    if (rev === careerResearchRevision)
      $("career-research-status").textContent = e.message;
  } finally {
    button.disabled = false;
  }
});
$("career-form").addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    if (generating || !availableChoices(game).includes(careerMode))
      throw new Error("今の状態では選べません。");
    let decision;
    if (careerMode === "startup") {
      decision = {
        id: "startup",
        venture: $("career-venture").value,
        name:
          $("venture-name").value.trim() ||
          {
            ai: "つなぐAI相談室",
            studio: "灯りゲーム工房",
            community: "まちの手サポート",
            agriculture: "みのり循環農園",
          }[$("career-venture").value],
      };
    } else {
      decision = {
        id: "switch",
        target: "custom",
        role: $("career-role").value,
      };
      if (!$("career-name").value.trim())
        throw new Error("転職先の企業名を入力してください。");
      const summary = $("career-summary").value.trim();
      if (
        summary &&
        (!$("career-confirmed").checked || !careerSources.length)
      )
        throw new Error(
          "公開ページを取得し、企業と内容の一致を確認してください。資料なしでも企業名だけで進められます。",
        );
      Object.assign(decision, {
        name: $("career-name").value,
        companyType: $("career-type").value,
        facts: summary
          ? {
              summary,
              sector: $("career-sector").value,
              confirmed: true,
              sources: careerSources,
            }
          : null,
      });
    }
    takeCareerDecision(decision);
  } catch (error) {
    $("career-error").textContent = error.message;
  }
});
function sourceLinks(container, sources) {
  container.replaceChildren();
  for (const source of sources) {
    const a = node(
      "a",
      `${source.title || source.url} / 取得 ${source.checkedAt}`,
    );
    a.href = source.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    container.append(a);
  }
}
function setupNameSearch(career = false) {
  const button = $(career ? "career-search" : "company-search"),
    name = $(career ? "career-name" : "company-name"),
    list = $(career ? "career-candidates" : "company-candidates"),
    message = $(career ? "career-research-status" : "research-status");
  button.addEventListener("click", async () => {
    const prefix = career ? "career" : "company";
    const originalLabel = button.textContent;
    const rev = career ? ++careerResearchRevision : ++companyResearchRevision;
    let requestedName = name.value,
      loading = false;
    const current = () =>
      rev === (career ? careerResearchRevision : companyResearchRevision) &&
      name.value === requestedName &&
      (career || (profileLevel !== "quick" && !$("company-field").hidden));
    button.disabled = true;
    button.textContent = "調べています…";
    if (!career) {
      companyURLResearchRevision++;
      $("company-research-panel").hidden = false;
      $("company-research-panel").open = true;
    }
    list.replaceChildren();
    $(prefix + "-confirmed").checked = false;
    $(prefix + "-summary").value = "";
    if (career) careerSources = [];
    else {
      companySources = [];
      $("company-sources").replaceChildren();
    }
    message.textContent = "企業名から会社情報と公式サイトを探しています…";
    async function load(candidate) {
      if (!current() || loading) return;
      loading = true;
      const candidateButtons = [...list.querySelectorAll("button")],
        researchRevision = career ? 0 : ++companyURLResearchRevision,
        requestedURL = $(prefix + "-url").value;
      const canApply = () => current() && (career || (
        researchRevision === companyURLResearchRevision &&
        requestedURL === $(prefix + "-url").value
      ));
      for (const el of candidateButtons) el.disabled = true;
      message.textContent = `${candidate.name}の公開ページを取得しています…`;
      try {
        let facts;
        const directoryOnly = hosted;
        if (directoryOnly) {
          facts = {
            summary: candidate.description,
            sector: candidate.sector ?? "unknown",
            sources: [
              {
                url: candidate.directoryURL,
                title: `${candidate.name} / Wikidataの会社概要（公式本文は未取得）`,
                checkedAt: new Date().toISOString().slice(0, 10),
              },
            ],
          };
        } else ({ facts } = await api("/api/company", { url: candidate.url }));
        if (!canApply()) return;
        // Identity was explicitly accepted by the player.
        name.value = requestedName = candidate.name;
        $(prefix + "-url").value = candidate.url;
        $(prefix + "-summary").value = facts.summary;
        $(prefix + "-sector").value = candidate.sector ?? "unknown";
        $(prefix + "-confirmed").checked = false;
        if (career) {
          careerSources = facts.sources;
          $("career-research-details").open = true;
          renderCareer();
        } else {
          companySources = facts.sources;
          sourceLinks($("company-sources"), facts.sources);
        }
        list.replaceChildren(
          node(
            "p",
            `${candidate.name} / ${candidate.description}`,
            "field-note",
          ),
        );
        const officialLink = node("a", "選んだ会社の公式サイトを開く ↗");
        officialLink.href = candidate.url;
        officialLink.target = "_blank";
        officialLink.rel = "noopener noreferrer";
        list.append(officialLink);
        message.textContent = directoryOnly
          ? "会社を選びました。Wikidataの概要を表示しています（公式本文は未取得）。内容を確認し、下の「物語に反映する」をチェックしてください。"
          : "公式サイトの本文を取得しました。取得元と内容を確認し、下の「物語に反映する」をチェックしてください。";
        if (!career) updateBudget();
      } catch (error) {
        if (canApply())
          message.textContent = `${error.message} URLを指定する方法も使えます。`;
      } finally {
        loading = false;
        for (const el of candidateButtons) el.disabled = false;
      }
    }
    try {
      const candidates = hosted
        ? await makeDirectorySearch({ transport: browserDirectoryText })(
            requestedName,
          )
        : (await api("/api/company/search", { name: requestedName }))
            .candidates;
      if (!current()) return;
      if (!candidates.length) {
        message.textContent =
          "候補が見つかりませんでした。略称・英語名、または「株式会社」を除いた名前でも試せます。見つからない場合は会社名だけで始められます。";
        return;
      }
      message.textContent =
        "この会社で合っていますか？ 事業と公式サイトを確認して選んでください。違う場合は会社名を直して再検索できます。";
      for (const c of candidates) {
        const card = node("article", "", "company-candidate");
        card.append(
          node("strong", c.name),
          node("p", c.match ?? "会社名の候補", "field-note"),
          node("p", c.description),
        );
        const link = node("a", `公式サイト候補：${new URL(c.url).hostname} ↗`);
        link.href = c.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.append(link);
        const b = node(
          "button",
          "この会社で合っています。情報を取得",
          "button secondary small",
        );
        b.type = "button";
        b.addEventListener("click", () => load(c));
        card.append(b);
        list.append(card);
      }
    } catch (error) {
      if (current()) message.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}
setupNameSearch();
setupNameSearch(true);
function renderLocalGuide() {
  const computer = $("guide-computer").value;
  const memory = Number($("guide-memory").value);
  let advice;
  if (computer === "other")
    advice =
      "このPCでは未検証です。搭載メモリに加えて、GPUの種類・VRAM・CPUで速度が大きく変わるため、Macの実測からは推奨を決められません。ダウンロード前にモデルの要件を確認してください。";
  else if (computer !== "apple" || !Number.isFinite(memory))
    advice =
      "PCの種類とメモリを選ぶと、候補を絞る目安を表示します。確認できている実測はApple M5・32GBです。";
  else if (memory <= 8)
    advice =
      "このメモリ容量での動作は未検証です。OSや他のアプリの余裕が少なくなり、小型モデルでも日本語や4択の質は別に確認が必要です。APIや手動交換も選べます。";
  else if (memory < 32)
    advice =
      "この容量での最低要件は未検証です。8B級はファイルが小さくても、日本語や最新4択の安定性を別に確認する必要があります。Gemma 4 12BはM5・32GBで確認していますが、16・24GBでの動作は確認できていません。";
  else
    advice =
      "M5・32GBではGemma 4 12B Q4_K_Mを候補にしています。最新の個人向け4択で5場面を生成できましたが、内容には誤りも残ります。Muse Glimmer 30B（約18GB）とGLM-4.7-Flash（約19GB）はローカル配布がありますが、このゲームでは未実測です。他のチップ・容量での動作は未検証です。";
  $("guide-recommendation").textContent = advice;
  const id = $("ai-local-model").value;
  let selected = "";
  if (/^qwen3\.8:27b(?:-mtp)?-q4_K_M$/.test(id))
    selected =
      "選択中の27BモデルはM5・32GBでswapが約2〜3GiB増えたため、普段のゲーム用にはおすすめしていません。モデルは自動で変更しません。";
  else if (id === "gemma4:12b-it-q4_K_M")
    selected =
      "選択中：今回比較した中でおすすめのGemma 4 12Bです。M5・32GBの最新4択で中央値41秒（37〜65秒）。OS・GPUなどもメモリを使うため、約8GBのファイルが収まるだけでは動作判断できません。";
  else if (id === "qwen3:8b")
    selected =
      "選択中：Qwen3 8Bです。最新4択では3回中2回を受け入れ、3回目は不正な返答で停止しました。旧形式の中央値19秒とは指示が違い、場面の具体性や条件の反映にも弱点があります。";
  else if (id)
    selected =
      "選択中のモデルは今回のゲーム用比較の対象外です。モデル名やファイル容量だけでは、日本語の質・速さ・必要メモリは判断できません。";
  $("guide-selected-model").textContent = selected;
}
for (const id of ["guide-computer", "guide-memory", "ai-local-model"])
  $(id).addEventListener("change", renderLocalGuide);
renderLocalGuide();
async function refreshModels() {
  const rev = ++modelListRevision,
    provider = $("ai-provider").value;
  const local = ["ollama", "lmstudio"].includes(provider);
  const subscription = ["codex-cli", "claude-cli"].includes(provider);
  $("subscription-note").hidden = !subscription;
  $("api-cost-note").hidden = local || subscription || !provider;
  for (const id of ["ai-base-url", "ai-key", "ai-input-rate", "ai-output-rate", "ai-usd-cap"]) {
    $(id).closest("label").hidden = local || subscription || !provider;
    $(id).disabled = local || subscription || !provider;
  }
  $("ai-request-cap").max = local || subscription ? "5000" : "300";
  $("local-model-field").hidden = !local;
  $("manual-model-field").hidden = local || subscription || !provider;
  $("subscription-model-field").hidden = !subscription;
  $("model-list-controls").hidden = !local;
  $("ai-model").disabled = local || subscription || !provider;
  $("ai-local-model").disabled = !local;
  $("ai-subscription-model").disabled = !subscription;
  $("ai-submit").disabled = aiTesting || !provider || !selectedConnectionType();
  if (subscription) {
    const selected = $("ai-model").value;
    $("ai-subscription-model").replaceChildren();
    for (const id of aiState?.subscriptionModels?.[provider] ?? []) {
      const option = node("option", id);
      option.value = id;
      $("ai-subscription-model").append(option);
    }
    if ((aiState?.subscriptionModels?.[provider] ?? []).includes(selected)) $("ai-subscription-model").value = selected;
  }
  if (!local) return;
  // The server's unverified default (qwen3:8b) is not a choice the player
  // made, so it must not hide the recommended model when that is installed.
  // A model saved in this browser for this provider still wins.
  const saved = readAISettings();
  const previous = $("ai-local-model").value || (aiState?.ready ? aiState.model : "") ||
    (saved?.provider === provider && typeof saved.model === "string" ? saved.model : "");
  $("ai-local-model").replaceChildren();
  renderLocalGuide();
  $("model-list-status").textContent =
    "ダウンロード済みモデルを読み込んでいます…";
  $("refresh-models").disabled = true;
  try {
    const { models } = await api("/api/ai/models", { provider });
    if (rev !== modelListRevision) return;
    for (const m of models) {
      const o = node(
        "option",
        `${m.id}${m.size ? `（${(m.size / 1e9).toFixed(1)} GB）` : ""}`,
      );
      o.value = m.id;
      $("ai-local-model").append(o);
    }
    if (models.some((m) => m.id === previous))
      $("ai-local-model").value = previous;
    else if (models.some((m) => m.id === "gemma4:12b-it-q4_K_M"))
      $("ai-local-model").value = "gemma4:12b-it-q4_K_M";
    renderLocalGuide();
    $("model-list-status").textContent = models.length
      ? `${models.length}個のモデルから選べます。ダウンロードや課金は行いません。`
      : "ダウンロード済みモデルがありません。Ollama等でモデルを取得した後、この一覧を更新してください。";
  } catch (error) {
    if (rev === modelListRevision)
      $("model-list-status").textContent = error.message;
  } finally {
    if (rev === modelListRevision) $("refresh-models").disabled = false;
  }
}
$("refresh-models").addEventListener("click", refreshModels);
const presets = {
  ollama: ["http://127.0.0.1:11434", "qwen3:8b", 0, 0],
  lmstudio: ["http://127.0.0.1:1234/v1", "local-model", 0, 0],
  "codex-cli": ["https://chatgpt.com", "gpt-6.1-sol", 0, 0],
  "claude-cli": ["https://claude.ai", "sonnet", 0, 0],
  openai: ["https://api.openai.com/v1", "gpt-6-luna", 0.1, 0.5],
  openrouter: ["https://openrouter.ai/api/v1", "openrouter/free", 0, 0],
};
const providerChoices = {
  local: [["ollama", "Ollama"], ["lmstudio", "LM Studio"]],
  subscription: [["codex-cli", "Codex CLI（ChatGPT）"], ["claude-cli", "Claude Code"]],
  api: [["openai", "OpenAI API"], ["openrouter", "OpenRouter"], ["custom", "OpenAI互換API"]],
};
function connectionType(provider) {
  return Object.keys(providerChoices).find((type) => providerChoices[type].some(([id]) => id === provider)) ?? "";
}
function selectedConnectionType() {
  return ["local", "subscription", "api"].find((type) => $("ai-type-" + type).checked) ?? "";
}
function selectConnectionType(type, provider = "") {
  for (const id of ["local", "subscription", "api"]) $("ai-type-" + id).checked = id === type;
  $("ai-provider").replaceChildren();
  const empty = node("option", type ? "接続先を選んでください" : "接続方式を先に選んでください");
  empty.value = "";
  $("ai-provider").append(empty);
  for (const [id, label] of providerChoices[type] ?? []) {
    const option = node("option", label);
    option.value = id;
    $("ai-provider").append(option);
  }
  $("ai-provider").disabled = !type;
  $("ai-provider").value = provider;
}
for (const type of ["local", "subscription", "api"]) $("ai-type-" + type).addEventListener("change", () => {
  selectConnectionType(type);
  $("ai-key").value = "";
  $("ai-consent").checked = false;
  $("ai-request-cap").value = type === "api" ? 100 : 1000;
  renderConsent();
  void refreshModels();
});
function readAISettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(aiSettingsKey) ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
    // Older settings forced every subscription to at most 20 calls.
    if (!saved.type && ["codex-cli", "claude-cli"].includes(saved.provider) && saved.requestCap <= 20)
      saved.requestCap = 1000;
    return saved;
  } catch {
    return null;
  }
}
function cloudChoice() {
  const provider = $("ai-provider").value;
  if (!provider || ["ollama", "lmstudio"].includes(provider)) return false;
  if (provider !== "custom") return true;
  try {
    return !["127.0.0.1", "localhost"].includes(
      new URL($("ai-base-url").value).hostname,
    );
  } catch {
    return true;
  }
}
function renderConsent() {
  $("ai-consent-label").hidden = !cloudChoice();
  $("ai-consent").disabled = !cloudChoice();
}
async function openAISettings(required = false) {
  try {
    await status();
    if (serverStale) throw new Error(staleNotice);
    $("ai-required-note").hidden = !required;
    if (!hosted) {
      const saved = aiState.ready ? null : readAISettings();
      const source = saved && (Object.hasOwn(presets, saved.provider) || saved.provider === "custom") ? saved : aiState.ready ? aiState : {};
      selectConnectionType(connectionType(source.provider), source.provider ?? "");
      for (const [field, key] of [
        ["ai-model", "model"],
        ["ai-base-url", "baseURL"],
        ["ai-input-rate", "inputRate"],
        ["ai-output-rate", "outputRate"],
        ["ai-usd-cap", "usdCap"],
        ["ai-request-cap", "requestCap"],
      ])
        $(field).value = source[key] ?? aiState[key] ?? "";
      $("ai-request-cap").value = source.requestCap ?? (connectionType(source.provider) === "api" ? 100 : 1000);
      $("ai-local-model").value = source.model ?? "";
      $("ai-base-url").readOnly = $("ai-provider").value !== "custom";
      $("ai-consent").checked = cloudConsented;
      renderConsent();
    }
    $("ai-error").textContent = "";
    $("ai-key").value = "";
    if (!$("ai-dialog").open) $("ai-dialog").showModal();
    if (!hosted) void refreshModels();
  } catch (error) {
    pendingStart = null;
    toast(error.message);
  }
}
$("ai-settings-button").addEventListener("click", () => openAISettings());
$("ai-setup-button").addEventListener("click", () => openAISettings());
$("ai-dialog").addEventListener("close", () => {
  pendingStart = null;
});
$("ai-base-url").addEventListener("input", renderConsent);
$("ai-provider").addEventListener("change", () => {
  const preset = presets[$("ai-provider").value];
  $("ai-request-cap").value = selectedConnectionType() === "api" ? 100 : 1000;
  $("ai-test-status").textContent = "";
  if (preset) {
    $("ai-base-url").value = preset[0];
    $("ai-model").value = preset[1];
    $("ai-input-rate").value = preset[2];
    $("ai-output-rate").value = preset[3];
  }
  $("ai-base-url").readOnly = $("ai-provider").value !== "custom";
  $("ai-key").value = "";
  $("ai-consent").checked = false;
  renderConsent();
  void refreshModels();
});
async function configureAI(settings) {
  if (aiTesting) throw new Error("接続を確認しています。完了までお待ちください。");
  aiTesting = true;
  $("ai-submit").disabled = true;
  $("ai-type-choice").disabled = true;
  $("ai-test-status").textContent = "接続を確認しています…AIに短い文章を作ってもらっています";
  try {
    await status();
    if (serverStale) throw new Error(staleNotice);
    const data = await api("/api/ai/config", settings);
    aiState = data.ai;
    if (!aiState.ready || !aiState.verifiedAt) throw new Error("AIの生成を確認できませんでした。");
    cloudConsented = Boolean(aiState.cloud && settings.consent);
    const { apiKey, ...remembered } = settings;
    try { localStorage.setItem(aiSettingsKey, JSON.stringify(remembered)); } catch {}
    $("ai-test-status").textContent = `✓ ${aiState.model} の生成を確認しました（${Number(aiState.verificationSeconds ?? 0).toFixed(1)}秒）`;
    return aiState;
  } catch (error) {
    if (aiState) aiState.ready = false;
    $("ai-test-status").textContent = "";
    throw error;
  } finally {
    aiTesting = false;
    $("ai-submit").disabled = serverStale || !selectedConnectionType() || !$("ai-provider").value;
    $("ai-type-choice").disabled = false;
    renderAI();
  }
}
$("ai-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (aiTesting) return;
  $("ai-error").textContent = "";
  try {
    const type = selectedConnectionType(), provider = $("ai-provider").value;
    if (!type || connectionType(provider) !== type) throw new Error("接続方式と接続先を選んでください。");
    if (cloudChoice() && !$("ai-consent").checked)
      throw new Error("クラウドのAIへ送る内容への同意を入れてください。PC内のAI（Ollama・LM Studio）なら外部へ送りません。");
    await configureAI({
      type, provider,
      model: type === "local" ? $("ai-local-model").value : type === "subscription" ? $("ai-subscription-model").value : $("ai-model").value,
      baseURL: $("ai-base-url").value,
      apiKey: type === "api" ? $("ai-key").value : "",
      inputRate: type === "api" ? Number($("ai-input-rate").value) : 0,
      outputRate: type === "api" ? Number($("ai-output-rate").value) : 0,
      usdCap: Number($("ai-usd-cap").value) || 1,
      requestCap: Number($("ai-request-cap").value),
      consent: cloudChoice() && $("ai-consent").checked,
    });
    const start = pendingStart;
    $("ai-dialog").close();
    toast($("ai-test-status").textContent);
    if (start) start();
    else if (game && !$("game").hidden) {
      generationError = "";
      renderGame();
      void maybeGenerateScene();
    }
  } catch (error) {
    $("ai-error").textContent = error.message;
  } finally {
    $("ai-key").value = "";
  }
});
// Local AI and subscription CLIs need no secret, so the last working choice
// is reconnected on load. API keys are never stored and must be re-entered.
async function restoreAI() {
  if (hosted) return;
  const saved = readAISettings();
  if (serverStale) return;
  if (aiState?.ready && !["ollama", "lmstudio", "codex-cli", "claude-cli"].includes(aiState.provider)) {
    // An API key can stay in the running server, but is never persisted in the browser.
    if (!saved || saved.provider !== aiState.provider || saved.model !== aiState.model || aiState.cloud && !saved.consent) return;
    try { await configureAI({ ...saved, apiKey: "" }); }
    catch (error) { $("ai-setup-status").textContent = error.message; }
    return;
  }
  if (
    !saved ||
    !["ollama", "lmstudio", "codex-cli", "claude-cli"].includes(saved.provider)
  )
    return;
  try {
    const { consent, ...settings } = saved;
    if (["codex-cli", "claude-cli"].includes(saved.provider) && !consent) return;
    await configureAI({ ...settings, consent });
  } catch (error) {
    renderAI();
    $("ai-setup-status").textContent = error.message;
    $("ai-error").textContent = error.message;
  }
}
function downloadSave(raw, filename) {
  const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json" }),
    ),
    a = node("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportSave(currentGame) {
  if (!currentGame) return;
  try {
    downloadSave(
      encodeSave(currentGame),
      `unwritten-life-save-${new Date().toISOString().slice(0, 10)}.json`,
    );
  } catch {
    toast("セーブを書き出せませんでした。");
  }
}
function finishSaveImport() {
  if (!pendingImportedGame) return;
  if (generating) {
    toast("AIの生成が終わってからセーブを読み込んでください。");
    return;
  }
  if ($("game").hidden) remember = $("remember").checked;
  game = pendingImportedGame;
  pendingImportedGame = null;
  $("save-import-dialog").close();
  showGame(true);
  toast("セーブを読み込みました。");
}
async function importSaveFile(file) {
  const current = ++saveImportRevision;
  pendingImportedGame = null;
  if (!file) return;
  try {
    if (generating)
      throw new Error("AIの生成が終わってからセーブを読み込んでください。");
    if (file.size > 1024 * 1024)
      throw new Error("ファイルが大きすぎます。1 MB以下のセーブを選んでください。");
    let imported;
    try {
      imported = decodeSave(await file.text());
    } catch {
      throw new Error(
        "セーブを読み込めませんでした。書き出したJSONファイルか、データが壊れていないか確認してください。",
      );
    }
    if (current !== saveImportRevision) return;
    pendingImportedGame = imported;
    if (game || savedGame) {
      $("save-import-description").textContent =
        `${imported.year}年・${imported.age}歳のセーブに置き換えます。現在の物語を残す場合は、先にセーブを書き出してください。`;
      $("save-import-dialog").showModal();
    } else finishSaveImport();
  } catch (error) {
    if (current === saveImportRevision) toast(error.message);
  }
}
$("export-save").addEventListener("click", () => exportSave(savedGame));
$("game-export-save").addEventListener("click", () => exportSave(game));
for (const id of ["import-save", "game-import-save"])
  $(id).addEventListener("click", () => {
    if (generating) {
      toast("AIの生成が終わってからセーブを読み込んでください。");
      return;
    }
    $("import-save-file").click();
  });
$("import-save-file").addEventListener("change", async () => {
  const file = $("import-save-file").files[0];
  $("import-save-file").value = "";
  await importSaveFile(file);
});
$("save-import-confirm").addEventListener("click", finishSaveImport);
$("save-import-dialog").addEventListener("close", () => {
  pendingImportedGame = null;
});
$("export-corrupt-save").addEventListener("click", () => {
  if (!corruptSave) return;
  try {
    downloadSave(corruptSave, "unwritten-life-save-recovery.json");
  } catch {
    toast("元データを書き出せませんでした。");
  }
});
$("export-legacy").addEventListener("click", () => {
  try {
    const raw = localStorage.getItem("unwritten-life:v1");
    if (!raw) return;
    downloadSave(raw, "unwritten-life-v1-backup.json");
  } catch {
    toast("書き出せませんでした。");
  }
});
if (hosted) {
  $("ai-form").hidden = true;
  $("ai-description").textContent =
    "このスマホ版は、あなた専用のOpenAI接続で毎年の場面と選択肢を自動で作ります。プロフィールと選択履歴をOpenAIへ送ります。累計の見積り上限$5まで。自動再試行はしません。セーブはこの端末内です。";
  for (const id of ["research-button", "career-research"])
    if ($(id)) $(id).hidden = true;
  for (const el of document.querySelectorAll("[data-pc-only]"))
    el.hidden = true;
}
readStoredGame();
loadBook();
updateMunicipalityRegion();
status()
  .then(restoreAI)
  .catch((error) => {
    $("ai-status").textContent = error.message;
    $("ai-setup-status").textContent = error.message;
  });

if (!hosted) setInterval(() => { if (!aiTesting) void status().catch(() => {}); }, 5000);
