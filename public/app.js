import {
  START_YEAR,
  MAX_AGE,
  SCENARIOS,
  JOBS,
  REGIONS,
  PRIORITIES,
  CHOICES,
  decisionId,
  availableChoices,
  isRetiredAt,
  createGame,
  advance,
  advanceYears,
  optionalProfileInputs,
  PROFILE_DEFAULTS,
  profileInputForLevel,
  residenceName,
  replay,
  compareWorlds,
  eventFor,
  technologyAt,
  encodeSave,
  decodeSave,
  applyScene,
  recordCareerReflection,
  recordCareerSeen,
  careerSeenUntil,
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
  pendingCareerReflection,
  careerRecord,
  careerRecordText,
} from "./careers.js";
import {
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
let activeReflection = null;
let favoriteYears = new Set();
let favoritesOnly = false;
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
  generating = false,
  revision = 0,
  customCost = false,
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
  renderAI();
  return data;
}
async function api(path, body) {
  if (!apiToken) await status();
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
    $("quick-preset").value,
  );
  const p = optionalProfileInputs(raw, PROFILE_DEFAULTS);
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
function showGame(focus = false) {
  if (!aiReady()) {
    if (hosted) {
      toast("OpenAIの接続準備ができていません。少し待って再読み込みしてください。");
      return;
    }
    const next = game;
    pendingStart = () => {
      game = next;
      showGame(focus);
    };
    void openAISettings(true);
    return;
  }
  generationError = "";
  lastJourney = null;
  favoriteYears = new Set();
  favoritesOnly = false;
  revision++;
  $("setup").hidden = true;
  $("game").hidden = false;
  renderGame();
  if (focus) {
    window.scrollTo({ top: 0, behavior: "instant" });
    $("chapter-title").focus({ preventScroll: true });
  }
  if (!showReflection()) void maybeGenerateScene();
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
function renderCareerMap(container) {
  const tiles = careerMap(game);
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
  for (const tile of tiles) {
    const cell = node("li", undefined, `career-tile state-${tile.state}`);
    const icon = node("span", tile.icon);
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", `${tile.year}年・${tile.age}歳：${tile.label}。選択：${tile.choice}`);
    cell.title = icon.getAttribute("aria-label");
    cell.append(icon);
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
  container.append(grid, legend);
}
function renderCareerResume() {
  const record = careerRecord(game);
  const card = node("section", undefined, "career-resume");
  card.id = "ending-resume";
  card.setAttribute("aria-labelledby", "resume-title");
  const title = node("h3", "職務経歴書 / この世界で歩んだ道");
  title.id = "resume-title";
  card.append(title, node("p", `${game.profile.age}歳から${game.age}歳まで・${game.decisions.length}年間`, "resume-period"),
    node("p", "ゲーム内の架空の経歴です。実際の職務経歴を証明するものではありません。", "field-note"),
    node("h4", "勤務先と役割"));
  const timeline = node("ol", undefined, "resume-timeline");
  for (const t of record.tenures) {
    const row = node("li");
    row.append(node("small", `${t.from}〜${t.to}年 · ${t.years}年`), node("b", t.employer));
    if (t.role) row.append(node("span", JOBS[t.role]?.label ?? t.role));
    timeline.append(row);
  }
  const totals = node("dl", undefined, "resume-totals");
  for (const [key, years] of Object.entries(record.yearsByState)) {
    const row = node("div");
    row.append(node("dt", CAREER_STATES[key].label), node("dd", `${years}年`));
    totals.append(row);
  }
  const decisions = node("ul", undefined, "resume-decisions");
  for (const d of record.decisions) decisions.append(node("li", `${d.year}年・${d.age}歳 ${d.label}`));
  card.append(timeline, node("h4", "一年の主な活動"),
    node("p", "各年を主な活動で分類しています。学びや休養の年も、勤務先との在籍期間には含まれます。", "field-note"),
    totals, node("h4", "選んだ転機"), decisions);
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
  const text = careerRecordText(game, JOBS);
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
      status.textContent = "コピーできませんでした。下のテキストを選択してコピーできます。";
    }
  });
  card.append(map, reflections, copy, status, fallback);
  return card;
}
function renderHistory() {
  const history = $("history");
  history.replaceChildren();
  $("history-favorites-only").setAttribute("aria-pressed", String(favoritesOnly));
  const entries = [...game.history].reverse().filter((h) => !favoritesOnly || favoriteYears.has(h.year));
  $("history-filter-status").textContent = `${favoritesOnly ? "お気に入り" : "すべての記録"} ${entries.length}件 / ★ ${favoriteYears.size}件`;
  if (!entries.length)
    history.append(node("p", favoritesOnly ? "お気に入りの記録はまだありません。すべての記録で☆を選べます。" : "最初の一ページは、これから。", "empty-history"));
  for (const h of entries) {
    const row = node("article", undefined, "history-row"),
      year = node("div", String(h.year), "history-year"),
      text = node("div"),
      favorite = node("button", favoriteYears.has(h.year) ? "★" : "☆", "history-favorite");
    favorite.type = "button";
    favorite.dataset.year = h.year;
    favorite.setAttribute("aria-label", `${h.year}年の記録をお気に入り`);
    favorite.setAttribute("aria-pressed", String(favoriteYears.has(h.year)));
    favorite.addEventListener("click", () => {
      const index = [...history.querySelectorAll(".history-favorite")].indexOf(favorite);
      if (favoriteYears.has(h.year)) favoriteYears.delete(h.year);
      else favoriteYears.add(h.year);
      renderHistory();
      const next = history.querySelector(`button[data-year="${h.year}"]`) ?? history.querySelectorAll(".history-favorite")[Math.max(0, index - 1)];
      (next ?? $("history-favorites-only")).focus({ preventScroll: true });
    });
    year.append(node("small", `${h.age}歳`), favorite);
    text.append(node("h3", h.episode?.title ?? h.title), node("p", h.episode?.body ?? h.note));
    appendBudget(text, h, true);
    row.append(year, text, node("span", h.choiceLabel, "history-choice"));
    history.append(row);
  }
}
$("history-favorites-only").addEventListener("click", () => {
  favoritesOnly = !favoritesOnly;
  renderHistory();
});
function moveToStory() {
  if (window.matchMedia("(max-width: 640px)").matches)
    $("event-card").scrollIntoView({ block: "start", behavior: "instant" });
  $("chapter-title").focus({ preventScroll: true });
}
function commitChoice(decision, years = Number($("year-step").value)) {
  try {
    const journey = advanceYears(game, decision, years, { pauseAtMilestones: true });
    game = journey.game;
    lastJourney = journey;
    revision++;
    renderGame();
    showJourney(journey);
  } catch (error) {
    toast(error.message);
  }
}
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
    ["pension", "年金等（手取り）"],
    ["living", "生活費・子育て等"],
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
function showJourney(journey) {
  const first = journey.entries[0],
    last = journey.entries.at(-1);
  $("journey-title").textContent =
    journey.entries.length === 1
      ? `${first.year}年のキャリア記録。`
      : `${first.year}〜${last.year}年、キャリアと暮らしの記録。`;
  $("journey-caption").textContent =
    `選んだ方針：${first.choiceLabel}。${journey.stopReason || `${journey.entries.length}年分のキャリアと暮らしを振り返り、次の方針を選べます。`}`;
  const list = $("journey-years");
  list.replaceChildren();
  let previousIncome =
    game.history.at(-journey.entries.length - 1)?.income ?? game.profile.income;
  for (const h of journey.entries) {
    const row = node("article", undefined, "journey-year");
    row.append(
      node("p", `${h.year} / ${h.age}歳`, "eyebrow"),
      node("h3", h.episode?.title ?? h.outcome?.title ?? h.title),
      node("p", h.episode?.body ?? h.note),
    );
    const delta = Math.round(h.income) - Math.round(previousIncome);
    row.append(
      node(
        "small",
        `年収 ${nf.format(Math.round(h.income))}万円（${delta >= 0 ? "+" : ""}${delta}） · 純資産 ${nf.format(Math.round(h.savings))}万円 · スキル ${Math.round(h.skill)} · ゆとり ${Math.round(h.health)}`,
      ),
    );
    previousIncome = h.income;
    appendBudget(row, h);
    list.append(row);
  }
  $("journey-next").textContent = game.ended
    ? "キャリアの歩みを振り返る →"
    : `${game.year}年の選択へ →`;
  $("journey-dialog").showModal();
}
$("journey-next").addEventListener("click", () => {
  $("journey-dialog").close();
});
$("journey-dialog").addEventListener("close", () => {
  if (!showReflection()) {
    moveToStory();
    void maybeGenerateScene();
  }
});
function showReflection() {
  const milestone = game && pendingCareerReflection(game);
  if (!milestone) return false;
  if ($("reflection-dialog").open) return true;
  activeReflection = { ...milestone, revision };
  $("reflection-title").textContent = `${milestone.age}歳、${milestone.id === "retirement" ? "仕事の区切りに" : "キャリアの途中で"}。`;
  $("reflection-question").textContent = milestone.question;
  $("reflection-line").value = "";
  $("reflection-error").textContent = "";
  $("reflection-dialog").showModal();
  $("reflection-line").focus();
  return true;
}
function finishReflection(text) {
  if (!activeReflection || activeReflection.revision !== revision) return;
  try {
    game = recordCareerReflection(game, activeReflection.id, text);
  } catch (error) {
    $("reflection-error").textContent = error.message;
    return;
  }
  activeReflection = null;
  $("reflection-dialog").close();
  renderGame();
  moveToStory();
  void maybeGenerateScene();
}
$("reflection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  finishReflection($("reflection-line").value);
});
$("reflection-dialog").addEventListener("close", () => {
  if (activeReflection) finishReflection("");
});
$("journey-review").addEventListener("click", () => {
  if (lastJourney) showJourney(lastJourney);
});
function renderGame() {
  renderCareerMap($("career-map"));
  $("journey-review").hidden = !lastJourney;
  const complete = game.ended,
    initial = createGame(game.profile, game.scenario, game.seed),
    previous = game.history.length > 1 ? game.history.at(-2) : initial;
  const change = (key, monetary = false) => {
    if (!game.history.length) return "あなたの現在地";
    const d = game[key] - previous[key],
      n = monetary ? Math.round(d / 10) * 10 : Math.round(d);
    return n === 0
      ? "前年とほぼ同じ"
      : `${n > 0 ? "+" : "−"}${nf.format(Math.abs(n))}${monetary ? "万円" : ""} / 前年比`;
  };
  $("chapter-label").textContent = complete
    ? "A CAREER, A LIFE OF CHOICES."
    : `${game.decisions.length}年が経過 / ${game.retired ? "仕事の先の暮らし" : "積み重なる、あなたのキャリア"}`;
  $("chapter-title").textContent = complete
    ? `${game.age}歳。キャリアと暮らしの歩みを振り返る。`
    : `${game.year}年、${game.age}歳のキャリアと暮らし。`;
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
    game.housing === "own" ? "持ち家" : "賃貸等",
    game.retired
      ? "退職後"
      : game.employer.kind === "seeking"
        ? "仕事を探している"
        : "就業中",
  ]
    .filter(Boolean)
    .join(" / ");
  $("world-badge").textContent = `AIの未来：${SCENARIOS[game.scenario].label}`;
  $("progress").value = game.decisions.length;
  $("progress").max = MAX_AGE - game.profile.age;
  $("hud-year").textContent = `${game.year}年`;
  $("hud-age").textContent = `${game.age}歳`;
  $("hud-cash").textContent = `${money(game.cash)}万円`;
  $("hud-health").textContent = `${Math.round(game.health)} / 100`;
  $("stats").replaceChildren(
    stat(
      "年収（年金等含む）",
      `約${money(game.income)}`,
      "万円",
      change("income", true),
    ),
    stat(
      "純資産（借入控除後）",
      `約${money(game.savings)}`,
      "万円",
      change("savings", true),
    ),
    stat("手元の現金", money(game.cash), "万円"),
    stat("株式・投信", money(game.investments), "万円"),
    stat(
      "不動産 / 住宅ローン",
      `${money(game.homeValue)} / ${money(game.mortgage)}`,
      "万円",
    ),
    stat("その他の借入", money(game.debt), "万円"),
    stat("仕事とAIのスキル", String(Math.round(game.skill)), "/100"),
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
  );
  const level = technologyAt(game);
  $("ai-stage").textContent =
    level < 0.3 ? "広がりはじめ" : level < 0.6 ? "日常の中へ" : "社会の基盤へ";
  $("ai-progress").value = level;
  const worldPanel = $("world-context");
  worldPanel.replaceChildren();
  worldPanel.hidden = !worldEnabled(game);
  $("capability-progress").value = worldAt(game).capability;
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
  const resultCard = $("year-result");
  resultCard.replaceChildren();
  resultCard.hidden = !game.history.length || !!lastJourney;
  if (game.history.length) {
    const h = game.history.at(-1),
      before = game.history.at(-2) ?? initial;
    resultCard.append(
      node("p", `${h.year}年のキャリアと暮らし → この一年の結果`, "eyebrow"),
      node("p", `選んだこと：${h.choiceLabel}`, "result-choice"),
      node("h2", h.outcome?.title ?? h.choiceLabel),
      node("p", h.outcome?.body ?? h.note),
    );
    const changes = node("div", undefined, "result-changes");
    for (const [label, key, unit] of [
      ["年収", "income", "万円"],
      ["純資産", "savings", "万円"],
      ["ゆとり", "health", ""],
      ["つながり", "connection", ""],
      ["仕事・AIスキル", "skill", ""],
    ]) {
      const from = Math.round(before[key]),
        to = Math.round(game[key]),
        delta = to - from;
      changes.append(
        node(
          "span",
          `${label} ${nf.format(from)} → ${nf.format(to)}${unit}（${delta >= 0 ? "+" : ""}${nf.format(delta)}）`,
        ),
      );
    }
    resultCard.append(changes);
    appendBudget(resultCard, h);
    if (h.familyOutcome && h.familyOutcome !== h.outcome)
      resultCard.append(
        node(
          "p",
          `${h.familyOutcome.title} ${h.familyOutcome.body}`,
          "result-factors",
        ),
      );
    if (h.world) {
      const learning = h.studyHours - (game.history.at(-2)?.studyHours ?? 0);
      resultCard.append(
        node(
          "p",
          `外からの影響：${h.world.economy.label} / ${h.world.company.label} / ${h.world.shock.label}。収入・株式・生活費に反映。${learning ? ` 学びに${learning}時間を使い、スキルは蓄積。評価の結果は別に抽選。` : ""}${h.familyCost ? ` 新しく迎えた家族の追加費用：年${h.familyCost}万円。` : ""}`,
          "result-factors",
        ),
      );
      if (h.outcome?.chance !== undefined)
        resultCard.append(
          node(
            "p",
            `今回の取り組みが評価につながる抽選確率：${Math.round(h.outcome.chance * 100)}%（スキル・ゆとり・需要から決めたゲームの仮定）`,
            "field-note",
          ),
        );
    }
    if (h.businessSetup || h.businessOverhead || h.outcome?.extraCost)
      resultCard.append(
        node(
          "p",
          `開業費 ${h.businessSetup}万円 / 年間運営費 ${h.businessOverhead}万円 / 結果による追加費用 ${h.outcome?.extraCost ?? 0}万円`,
          "field-note",
        ),
      );
  }
  const choices = $("choices");
  choices.replaceChildren();
  $("career-actions").replaceChildren();
  if (complete) {
    card.append(
      node("p", "THE STORY OF YOUR WORKING LIFE.", "eyebrow"),
      node("h2", "働いた年月が、あなたに残したもの。"),
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
        "この最期はゲーム内の仮定から生まれた物語です。実際の寿命や死因を予測するものではありません。",
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
      );
      showGame(true);
    });
    compare.addEventListener("click", openComparison);
    actions.append(again, compare);
    card.append(actions);
  } else if (!eventFor(game).generated) {
    // Scenes and choices come from the connected AI only. Until it answers,
    // the year waits; there are no rule-written options to fall back to.
    card.append(node("p", `AIが考える場面 / ${game.year}`, "eyebrow"));
    if (generating) {
      card.append(
        node("h2", "次の一年を考えています…"),
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
            : "このゲームは毎年の場面と選択肢をAIで作ります。AIを接続すると、この年から続けられます。",
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
      if (option.reason)
        copy.append(node("small", `あなたとの接点：${option.reason}`));
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
  }
  $("choice-title").parentElement.hidden = complete || !eventFor(game).generated;
  $("undo-button").disabled = game.decisions.length === 0 || generating;
  renderHistory();
  $("context-preview").textContent = JSON.stringify(
    storyRequest(game, { catalog: knowledgeCatalog }).context,
    null,
    2,
  );
  renderKnowledge();
  renderAI();
  persist();
}
function aiReady() {
  return Boolean(aiState?.ready && (!aiState.cloud || hosted || cloudConsented));
}
function renderAI() {
  if (!aiState) return;
  const local = !aiState.cloud;
  const ready = aiReady();
  $("year-step").disabled = generating;
  $("ai-status").classList.toggle("is-generating", generating);
  $("event-card").setAttribute("aria-busy", String(generating));
  $("ai-status").textContent = generating
    ? `${local ? "PC内のAI" : "接続したAI"}が、この結果から次の場面と選択肢を考えています…`
    : !ready
      ? "AIが未接続です。「AIの接続」から使うAIを選んでください。"
      : aiState.subscription
        ? `サブスク：${aiState.provider === "codex-cli" ? "Codex CLI" : "Claude Code"} / ${aiState.model} · ${aiState.calls}/${aiState.requestCap}回（起動中）`
        : `${local ? "PC内" : "クラウド"}：${aiState.provider} / ${aiState.model} · ${aiState.calls}/${aiState.requestCap}回 · 見積り予約 $${aiState.reservedUSD.toFixed(4)} / $${aiState.usdCap}${hosted ? "（累計）" : ""}`;
  $("ai-setup-banner").classList.toggle("is-ready", ready);
  $("ai-setup-status").textContent = ready
    ? `✓ AI接続済み：${aiState.subscription ? (aiState.provider === "codex-cli" ? "Codex CLI" : "Claude Code") : aiState.provider} / ${aiState.model}`
    : hosted
      ? "OpenAIの接続準備ができていません。少し待って再読み込みしてください。"
      : "はじめる前に、場面と選択肢をつくるAIを接続してください。";
  $("ai-setup-button").hidden = hosted;
  $("ai-setup-button").textContent = ready ? "接続を変える ↗" : "AIを接続する ↗";
  $("career-generate").disabled =
    generating || !ready || !game || game.ended || isRetiredAt(game);
  $("career-compare-button").disabled =
    generating || !game || game.ended || isRetiredAt(game);
  $("back-setup").disabled = generating;
  $("ai-accounting").textContent = aiState.subscription
    ? `普段のCLIとサブスク枠を共有。この起動中 ${aiState.calls}/${aiState.requestCap}回（失敗も含む）。APIキーでの再試行やモデルの自動切り替えは行いません。`
    : `${hosted ? "このスマホ版の累計" : "この起動中"}：${aiState.calls}/${aiState.requestCap}回、見積り予約 $${aiState.reservedUSD.toFixed(4)} / $${aiState.usdCap}。失敗した呼び出しも数えます。${hosted ? " 再読み込みでも上限は戻りません。" : ""}`;
  renderAITiming();
}
function renderAITiming() {
  const el = $("ai-timing");
  const times = generationTimes.get(connectionKey(aiState)) ?? [];
  const last = times.length
    ? ` この画面で同じ接続先を使った前回の生成は約${Math.ceil(times.at(-1) / 1000)}秒でした（キャッシュを除く）。`
    : "";
  el.hidden = !generating && times.length === 0;
  el.textContent = generating
    ? `生成中 · 経過${Math.floor((performance.now() - generationStarted) / 1000)}秒。${aiState?.cloud ? "接続先のモデルや混雑で待ち時間が変わります。" : "初回のモデル読み込みや、PCのメモリ・他のアプリで待ち時間が変わります。"}${last}`
    : `文章と実行できる行動の形式を検証して取り込んでいます。内容の正確さや予測精度を保証する検査ではありません。${last}`;
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
    pendingCareerReflection(game) ||
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
    if (current === revision)
      generationError = `AIで場面を作れませんでした。${error.message}`;
    try {
      await status();
    } catch {}
  } finally {
    clearInterval(generationTimer);
    generating = false;
    if (game) renderGame();
  }
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
    );
    remember = $("remember").checked;
    showGame(true);
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
  showGame(true);
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
  const length = game.decisions.length - 1,
    scenes = Object.fromEntries(
      Object.entries(game.scenes).filter(([k]) => Number(k) <= length),
    );
  game = replay(
    game.profile,
    game.scenario,
    game.seed,
    game.decisions.slice(0, -1),
    scenes,
    false,
    game.dynamicFrom,
    game.worldFrom,
    game.retirementFrom,
    game.careLeaveSalaryFrom,
    game.prepayFrom,
    game.debtRepayFrom,
    game.salaryCapFrom,
  );
  const reached = new Set(careerMilestones(game).map((m) => m.id));
  game.reflections = Object.fromEntries(Object.entries(reflections).filter(([id]) => reached.has(id)));
  game.careerSeen = careerSeenUntil({ careerSeen: seen }, game.decisions.length);
  favoriteYears = new Set([...favoriteYears].filter((year) => year < game.year));
  revision++;
  renderGame();
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
    el.disabled = !!el.closest("[hidden]");
  $("quick-start").textContent = detailed
    ? "この私で、はじめる ↗"
    : "この設定ですぐ始める ↗";
}
function updateBudget() {
  updateProfileVisibility();
  const values = readProfile();
  $("quick-summary").textContent =
    `${values.age}歳 / ${JOBS[values.job].label}でスタート。年収${values.income}万円・資産${values.savings}万円など、選んだ人物のゲーム用設定を使います。`;
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
$("quick-preset").addEventListener("change", updateBudget);
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
function suggestedCost() {
  if (!customCost)
    $("monthly-cost").value = String(
      Math.round(
        ((12 * REGIONS[$("region").value].cost) / 17) *
          { solo: 1, shared: 1.5, care: 1.8 }[$("household").value] *
          10,
      ) / 10,
    );
  updateBudget();
}
$("region").addEventListener("change", suggestedCost);
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
  resetCareerResearch();
  $("career-title").textContent =
    mode === "startup"
      ? "まだない仕事を、自分でつくる。"
      : "次は、どこで働こう。";
  $("career-intro").textContent =
    mode === "startup"
      ? "事業を選ぶだけで始められます。名前をつけるのは任意です。"
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
function takeCareerDecision(decision) {
  if (generating || !availableChoices(game).includes(decisionId(decision)))
    throw new Error("今の状態では選べません。");
  $("career-dialog").close();
  commitChoice(decision, 1);
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
    button.disabled = generating;
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
  for (const id of ["ai-base-url", "ai-key", "ai-input-rate", "ai-output-rate", "ai-usd-cap"]) {
    $(id).closest("label").hidden = subscription;
    $(id).disabled = subscription;
  }
  $("ai-model").readOnly = subscription;
  $("ai-request-cap").max = subscription ? "20" : "300";
  if (subscription) $("ai-request-cap").value = Math.min(Number($("ai-request-cap").value) || 20, 20);
  $("local-model-field").hidden = !local;
  $("manual-model-field").hidden = local;
  $("model-list-controls").hidden = !local;
  $("ai-model").disabled = local;
  $("ai-local-model").disabled = !local;
  if (!local) return;
  const previous = $("ai-local-model").value || aiState?.model;
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
  "claude-cli": ["https://claude.ai", "haiku", 0, 0],
  openai: ["https://api.openai.com/v1", "gpt-6-luna", 0.1, 0.5],
  openrouter: ["https://openrouter.ai/api/v1", "openrouter/free", 0, 0],
};
function readAISettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(aiSettingsKey) ?? "null");
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved
      : null;
  } catch {
    return null;
  }
}
function cloudChoice() {
  const provider = $("ai-provider").value;
  if (["ollama", "lmstudio"].includes(provider)) return false;
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
    $("ai-required-note").hidden = !required;
    if (!hosted) {
      const saved = aiState.ready ? null : readAISettings();
      const source = saved && Object.hasOwn(presets, saved.provider) || saved?.provider === "custom" ? saved : aiState;
      for (const [field, key] of [
        ["ai-provider", "provider"],
        ["ai-model", "model"],
        ["ai-base-url", "baseURL"],
        ["ai-input-rate", "inputRate"],
        ["ai-output-rate", "outputRate"],
        ["ai-usd-cap", "usdCap"],
        ["ai-request-cap", "requestCap"],
      ])
        $(field).value = source[key] ?? aiState[key] ?? "";
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
  const data = await api("/api/ai/config", settings);
  aiState = data.ai;
  cloudConsented = Boolean(aiState.cloud && settings.consent);
  const { apiKey, ...remembered } = settings;
  try {
    localStorage.setItem(aiSettingsKey, JSON.stringify(remembered));
  } catch {}
  renderAI();
  return aiState;
}
$("ai-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("ai-error").textContent = "";
  try {
    if (cloudChoice() && !$("ai-consent").checked)
      throw new Error(
        "クラウドのAIへ送る内容への同意を入れてください。PC内のAI（Ollama・LM Studio）なら外部へ送りません。",
      );
    await configureAI({
      provider: $("ai-provider").value,
      model: ["ollama", "lmstudio"].includes($("ai-provider").value)
        ? $("ai-local-model").value
        : $("ai-model").value,
      baseURL: $("ai-base-url").value,
      apiKey: $("ai-key").value,
      inputRate: Number($("ai-input-rate").value),
      outputRate: Number($("ai-output-rate").value),
      usdCap: Number($("ai-usd-cap").value),
      requestCap: Number($("ai-request-cap").value),
      consent: cloudChoice() && $("ai-consent").checked,
    });
    $("ai-key").value = "";
    const start = pendingStart;
    $("ai-dialog").close();
    toast("AIを接続しました。");
    if (start) start();
    else if (game && !$("game").hidden) {
      generationError = "";
      renderGame();
      void maybeGenerateScene();
    }
  } catch (error) {
    $("ai-error").textContent = error.message;
  }
});
// Local AI and subscription CLIs need no secret, so the last working choice
// is reconnected on load. API keys are never stored and must be re-entered.
async function restoreAI() {
  if (hosted) return;
  const saved = readAISettings();
  if (aiState?.ready) {
    // The running server kept its connection across a page reload; keep the
    // consent given for that same cloud connection.
    cloudConsented = Boolean(
      aiState.cloud && saved?.consent &&
        saved.provider === aiState.provider && saved.model === aiState.model,
    );
    renderAI();
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
  } catch {
    renderAI();
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
updateBudget();
status()
  .then(restoreAI)
  .catch((error) => {
    $("ai-status").textContent = error.message;
    $("ai-setup-status").textContent = error.message;
  });
