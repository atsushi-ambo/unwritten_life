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
  createGame,
  advance,
  advanceYears,
  optionalProfileInputs,
  PROFILE_DEFAULTS,
  replay,
  compareWorlds,
  eventFor,
  technologyAt,
  encodeSave,
  decodeSave,
  applyScene,
  validateGeneratedScene,
} from "./engine.js";
import {
  EMPLOYERS,
  VENTURES,
  careerCandidates,
  careerOffers,
  workContext,
  makeDirectorySearch,
  browserDirectoryText,
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
let profileDefaults = { ...PROFILE_DEFAULTS };
const $ = (id) => document.getElementById(id),
  saveKey = "unwritten-life:v2",
  nf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const money = (n) => nf.format(Math.round(n / 10) * 10);
const standalone = document.documentElement.dataset.edition === "mobile";
const hosted = document.documentElement.dataset.edition === "mobile-cloud";
let game = null,
  remember = false,
  savedGame = null,
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
  modelListRevision = 0;
let generationStarted = 0,
  generationTimer;
let serverCareerOffers = false;
let serverPersonalizedChoices = false,
  careerDraft = null,
  careerGenerating = false,
  exchangeMode = "life",
  exchangeRevision = 0;
function needsChoiceServerUpdate() {
  return (
    !standalone &&
    aiState &&
    aiState.provider !== "disabled" &&
    !serverPersonalizedChoices
  );
}
function needsCareerServerUpdate() {
  return (
    !standalone &&
    !serverCareerOffers &&
    game &&
    (game.profile.job === "marketing" ||
      game.decisions.some(
        (d) =>
          typeof d === "object" &&
          (d.role === "marketing" ||
            ["nttdata", "mizuho", "chugai"].includes(d.target)),
      ))
  );
}
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
  if (standalone) {
    aiState = {
      provider: "disabled",
      model: "AI未接続",
      cloud: false,
      calls: 0,
      reservedUSD: 0,
      usdCap: 0,
      requestCap: 0,
      baseURL: "",
      inputRate: 0,
      outputRate: 0,
    };
    renderAI();
    return { ai: aiState };
  }
  const res = await fetch("/api/status");
  if (!res.ok)
    throw new Error(
      hosted
        ? "AIサーバーに接続できません。少し待って再読み込みしてください。AIなしでは続けられます。"
        : "ローカルサーバーに接続できません。アプリを起動して再読み込みしてください。",
    );
  const data = await res.json();
  serverCareerOffers = data.engineRevision === "career-offers-v1";
  serverPersonalizedChoices = data.choicesRevision === "personalized-four-v1";
  apiToken = data.token;
  aiState = data.ai;
  renderAI();
  return data;
}
async function api(path, body) {
  if (standalone)
    throw new Error(
      "スマホ体験版ではAI自動接続と企業ページの取得は使えません。ゲームはAIなしで進められます。手動交換は利用できます。",
    );
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
  try {
    const raw = localStorage.getItem(saveKey);
    savedGame = raw ? decodeSave(raw) : null;
    $("resume-banner").hidden = !savedGame;
    if (localStorage.getItem("unwritten-life:v1"))
      $("legacy-banner").hidden = false;
  } catch {
    savedGame = null;
    $("resume-banner").hidden = true;
    toast("保存データを読めませんでした。元データは保持しています。");
  }
}
function removeSave() {
  try {
    localStorage.removeItem(saveKey);
    localStorage.removeItem("unwritten-life:v1");
    savedGame = null;
    remember = false;
    $("remember").checked = false;
    $("resume-banner").hidden = true;
    $("legacy-banner").hidden = true;
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
  const p = optionalProfileInputs(
    Object.fromEntries(new FormData($("profile-form"))),
    profileDefaults,
  );
  if (p.housing === "rent") {
    p.homeValue = 0;
    p.mortgage = 0;
  } else p.rent = 0;
  const summary = $("company-summary").value.trim();
  p.companyFacts = summary
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
  lastJourney = null;
  revision++;
  $("setup").hidden = true;
  $("game").hidden = false;
  renderGame();
  void maybeGenerateScene();
  if (focus) {
    window.scrollTo({ top: 0, behavior: "instant" });
    $("chapter-title").focus({ preventScroll: true });
  }
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
function moveToStory() {
  if (window.matchMedia("(max-width: 640px)").matches)
    $("event-card").scrollIntoView({ block: "start", behavior: "instant" });
  $("chapter-title").focus({ preventScroll: true });
}
function commitChoice(decision) {
  try {
    const journey = advanceYears(game, decision, Number($("year-step").value));
    game = journey.game;
    lastJourney = journey;
    revision++;
    renderGame();
    showJourney(journey);
  } catch (error) {
    toast(error.message);
  }
}
function showJourney(journey) {
  const first = journey.entries[0],
    last = journey.entries.at(-1);
  $("journey-title").textContent =
    journey.entries.length === 1
      ? `${first.year}年、こんな一年だった。`
      : `${first.year}〜${last.year}年、あなたが過ごした時間。`;
  $("journey-caption").textContent =
    `選んだ方針：${first.choiceLabel}。${journey.stopReason || `${journey.entries.length}年分のできごとを振り返り、次の方針を選べます。`}`;
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
    list.append(row);
  }
  $("journey-next").textContent = game.ended
    ? "この人生を振り返る →"
    : `${game.year}年の選択へ →`;
  $("journey-dialog").showModal();
}
$("journey-next").addEventListener("click", () => {
  $("journey-dialog").close();
  moveToStory();
  void maybeGenerateScene();
});
$("journey-review").addEventListener("click", () => {
  if (lastJourney) showJourney(lastJourney);
});
function renderGame() {
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
    ? "A LIFE, WITH MANY CHOICES."
    : `${game.decisions.length}年が経過 / ${game.retired ? "仕事の先の暮らし" : "まだ続く、あなたの人生"}`;
  $("chapter-title").textContent = complete
    ? `${game.age}歳。ひとつの人生の、終わり。`
    : `${game.year}年、${game.age}歳のあなた。`;
  $("profile-caption").textContent = [
    REGIONS[game.region].label,
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
      node("p", `${h.year}年の選択 → この一年の結果`, "eyebrow"),
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
      node("p", "THE PAGES OF YOUR LIFE.", "eyebrow"),
      node("h2", "あなたが選んだ時間が、ここにある。"),
    );
    const counts = Object.keys(CHOICES)
      .map((k) => [k, game.decisions.filter((x) => decisionId(x) === k).length])
      .sort((a, b) => b[1] - a[1]);
    card.append(
      node(
        "p",
        `${game.profile.age}歳から${game.age}歳まで、${game.decisions.length}年間を過ごしました。いちばん多く選んだのは「${CHOICES[counts[0][0]].label}」。大切にしたかった「${PRIORITIES[game.profile.priority]}」と、どんな関係を作れたでしょう。`,
      ),
      node(
        "p",
        "この最期はゲーム内の仮定から生まれた物語です。実際の寿命や死因を予測するものではありません。",
        "insight",
      ),
    );
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
      );
      showGame(true);
    });
    compare.addEventListener("click", openComparison);
    actions.append(again, compare);
    card.append(actions);
  } else {
    const event = eventFor(game);
    card.append(
      node(
        "p",
        `${event.generated ? "AIが作った架空の場面" : "あなたの条件を反映した場面"} / ${game.year}`,
        "eyebrow",
      ),
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
      basis.append(
        list,
        node(
          "p",
          "端末内ではメモのキーワードから話題を拾います。経験や能力は推定せず、文章全体の解釈には接続したAIを使います。",
          "field-note",
        ),
      );
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
      if (
        availableChoices(game).includes(id) &&
        !options.some((o) => o.id === id)
      ) {
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
          `${option.hint}${offer ? ` / 開業費${offer.setup}万円・年間運営費${VENTURES[offer.venture].overhead}万円` : ""}${event.generated ? " / 行動：" + c.label : ""}`,
        ),
      );
      if (option.reason)
        copy.append(node("small", `あなたとの接点：${option.reason}`));
      if (option.decision?.id === "switch")
        copy.append(
          node(
            "small",
            `候補：${option.decision.name ?? EMPLOYERS[option.decision.target]?.name} / ${JOBS[option.decision.role].label}（架空の転職・AIの候補は未確認）`,
          ),
        );
      button.append(
        node("span", c.icon, "choice-symbol"),
        copy,
        node("span", "↗", "choice-arrow"),
      );
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
  $("choice-title").parentElement.hidden = complete;
  $("undo-button").disabled = game.decisions.length === 0 || generating;
  const history = $("history");
  history.replaceChildren();
  if (!game.history.length)
    history.append(node("p", "最初の一ページは、これから。", "empty-history"));
  for (const h of [...game.history].reverse()) {
    const row = node("article", undefined, "history-row"),
      year = node("span", String(h.year), "history-year"),
      text = node("div");
    year.append(node("small", `${h.age}歳`));
    text.append(node("h3", h.title), node("p", h.note));
    if (h.episode) {
      text.replaceChildren(
        node("h3", h.episode.title),
        node("p", h.episode.body),
      );
    }
    row.append(year, text, node("span", h.choiceLabel, "history-choice"));
    history.append(row);
  }
  $("context-preview").textContent = JSON.stringify(
    storyRequest(game, { catalog: knowledgeCatalog }).context,
    null,
    2,
  );
  renderKnowledge();
  renderAI();
  persist();
}
function renderAI() {
  if (!aiState) return;
  const local = !aiState.cloud;
  $("auto-scene-label").hidden = !local || aiState.provider === "disabled";
  $("year-step").disabled = generating;
  $("ai-status").classList.toggle("is-generating", generating);
  $("event-card").setAttribute("aria-busy", String(generating));
  $("ai-status").textContent = generating
    ? `${local ? "PC内のAI" : "接続したAI"}が、この結果から次の場面と選択肢を考えています…`
    : `${local ? "PC内" : "クラウド"}：${aiState.provider} / ${aiState.model} · ${aiState.calls}${hosted ? "/" + aiState.requestCap : ""}回 · 見積り予約 $${aiState.reservedUSD.toFixed(4)}${hosted ? " / $" + aiState.usdCap + "（累計）" : ""}`;
  if (!generating && aiState.provider === "disabled")
    $("ai-status").textContent =
      "端末内の物語で進行中。好きなAIで展開を作るボタンから、AIも使えます。";
  if (needsCareerServerUpdate())
    $("ai-status").textContent +=
      " 新しい企業・職種のAI生成は、PC版のサーバーを次に起動した後に使えます。今はAIなしで続けられます。";
  if (needsChoiceServerUpdate())
    $("ai-status").textContent +=
      " 新しいプロフィール別4択は、更新したPCサーバーの次回起動後に使えます。今はAIなし・手動交換で続けられます。";
  $("cloud-consent-label").hidden = local;
  $("generate-button").disabled = generating || !game || game.ended;
  const manualAI =
    aiState.provider === "disabled" ||
    needsChoiceServerUpdate() ||
    needsCareerServerUpdate();
  $("generate-button").textContent = manualAI
    ? "好きなAIで展開を作る ↗"
    : "この場面をAIで生成 ✳";
  $("exchange-button").hidden = manualAI;
  $("career-generate").disabled =
    generating || !game || game.ended || game.retired;
  $("career-generate").textContent = manualAI
    ? "好きなAIで4択を作る ↗"
    : "AIで4択を生成 ✳";
  $("career-exchange").disabled =
    generating || !game || game.ended || game.retired;
  $("career-consent-label").hidden = local;
  $("career-compare-button").disabled =
    generating || !game || game.ended || game.retired;
  $("back-setup").disabled = generating;
  $("ai-accounting").textContent =
    `${hosted ? "この体験版の累計" : "この起動中"}：${aiState.calls}/${aiState.requestCap}回、見積り予約 $${aiState.reservedUSD.toFixed(4)} / $${aiState.usdCap}。失敗した呼び出しも数えます。${hosted ? " 再読み込みでも上限は戻りません。" : ""}`;
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
function autoLocal() {
  return (
    $("auto-scene").checked &&
    aiState &&
    !aiState.cloud &&
    !needsCareerServerUpdate() &&
    !needsChoiceServerUpdate() &&
    aiState.provider !== "disabled"
  );
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
    !autoLocal() ||
    eventFor(game).generated
  )
    return;
  await generateScene();
}
$("auto-scene").addEventListener("change", () => {
  renderAI();
  void maybeGenerateScene();
});
async function generateScene() {
  if (!game || game.ended || generating) return;
  if (
    !aiState ||
    aiState.provider === "disabled" ||
    needsCareerServerUpdate() ||
    needsChoiceServerUpdate()
  ) {
    openExchange();
    return;
  }
  const current = revision;
  const timingKey = connectionKey(aiState);
  generationStarted = performance.now();
  generating = true;
  generationTimer = setInterval(renderAITiming, 1000);
  renderAI();
  for (const b of document.querySelectorAll(
    "#choices button, #career-actions button",
  ))
    b.disabled = true;
  $("undo-button").disabled = true;
  try {
    const result = await api("/api/scene", {
      save: encodeSave(game),
      cloudConsent: $("cloud-consent").checked,
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
      renderGame();
      toast(
        `場面を生成しました（${result.model}${result.cached ? "・キャッシュ" : ""}）。`,
      );
    }
  } catch (error) {
    toast(
      `AI生成を完了できませんでした。今回は条件に応じた選択肢で続けられます。${error.message}`,
    );
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
        `${g.year}年 / ${g.age}歳 / ${g.ended ? "物語の終わり" : g.comparisonBlocked ? "実行条件の違いでここまで" : "この時点まで"}`,
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
  );
  revision++;
  renderGame();
  moveToStory();
});
$("compare-button").addEventListener("click", openComparison);
$("generate-button").addEventListener("click", generateScene);
function updateBudget() {
  const f = $("profile-form"),
    values = optionalProfileInputs(
      Object.fromEntries(new FormData(f)),
      profileDefaults,
    ),
    own = f.elements.housing.value === "own";
  $("home-fields").hidden = !own;
  $("rent-field").hidden = own;
  $("quick-summary").textContent =
    `${values.age}歳 / ${JOBS[f.elements.job.value].label}でスタート。年収・資産・会社名は任意。お金が未入力なら年収${values.income}万円・資産${values.savings}万円などの仮値を使います。`;
  $("budget-summary").textContent =
    `このゲームの初期設定：年収 ${values.income}万円、金融資産 ${values.savings}万円（うち株式 ${values.stocks}万円）、生活費 ${values.monthlyCost}万円/月 ＋ ${own ? "持ち家の維持・返済費" : "家賃 " + values.rent + "万円/月"}。空欄の項目は選んだ現在地の仮値です。実際の資産を入力する必要はありません。`;
}
for (const button of document.querySelectorAll("[data-profile-level]")) {
  button.addEventListener("click", () => {
    const level = button.dataset.profileLevel;
    $("quick-start").hidden = level !== "quick";
    $("profile-standard").open = level !== "quick";
    $("profile-advanced").open = level === "advanced";
    for (const b of document.querySelectorAll("[data-profile-level]"))
      b.setAttribute("aria-pressed", String(b === button));
  });
}
$("quick-preset").addEventListener("change", () => {
  const presets = {
    balanced: {
      age: 30,
      region: "city",
      income: 500,
      savings: 300,
      household: "solo",
      partner: "unspecified",
      children: 0,
      monthlyCost: 12,
      rent: 7,
    },
    starter: {
      age: 23,
      region: "metro",
      income: 300,
      savings: 80,
      household: "solo",
      partner: "solo",
      children: 0,
      monthlyCost: 12,
      rent: 8,
    },
    experienced: {
      age: 40,
      region: "metro",
      income: 700,
      savings: 1000,
      household: "solo",
      partner: "unspecified",
      children: 0,
      monthlyCost: 15,
      rent: 10,
    },
    family: {
      age: 35,
      region: "city",
      income: 550,
      savings: 500,
      household: "care",
      partner: "partner",
      children: 2,
      childStage: "young",
      childrenWish: "two",
      monthlyCost: 24,
      rent: 9,
    },
    later: {
      age: 55,
      region: "city",
      income: 650,
      savings: 1800,
      household: "shared",
      partner: "partner",
      children: 0,
      monthlyCost: 20,
      rent: 9,
    },
  };
  const f = $("profile-form");
  profileDefaults = {
    ...PROFILE_DEFAULTS,
    ...presets[$("quick-preset").value],
  };
  // Presets replace their visible assumptions; detailed company/assets remain user controlled.
  for (const [k, v] of Object.entries({
    childStage: "school",
    childrenWish: "undecided",
    ...presets[$("quick-preset").value],
  }))
    f.elements[k].value = String(v);
  if (Number(f.elements.stocks.value) > Number(f.elements.savings.value))
    f.elements.stocks.value = "0";
  customCost = true;
  updateBudget();
});
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
    ["company", "企業の公開情報のスナップショット"],
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
    const entries = [...refs.historical, ...refs.companies, ...refs.rules];
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
    `${loaded.storage === "indexeddb" ? "端末内の知識DBに保存済み" : "端末でDB保存を利用できないため、内蔵資料を使用中"} · 歴史${counts("history")}件 / 企業${counts("company")}件 / ゲームの仮定${counts("game-rule")}件 · ${KNOWLEDGE_REVISION}`;
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
    $("company-confirmed").checked = false;
  });
$("company-name").addEventListener("input", () => {
  companyResearchRevision++;
  $("company-candidates").replaceChildren();
  companySources = [];
  $("company-summary").value = "";
  $("company-sources").replaceChildren();
  $("company-confirmed").checked = false;
  document.querySelector(".company-research").hidden = true;
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
    current = ++companyResearchRevision;
  button.disabled = true;
  $("research-status").textContent = "指定した公開ページを取得しています。";
  try {
    const { facts } = await api("/api/company", {
      url: $("company-url").value,
    });
    if (current !== companyResearchRevision) return;
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
  renderCareerOffers();
  $("career-target").replaceChildren();
  for (const c of careerCandidates(game)) {
    const o = node(
      "option",
      `${c.name}${c.kind === "fictional" ? "（未来の架空企業）" : "（実在企業）"}`,
    );
    o.value = c.id;
    $("career-target").append(o);
  }
  const custom = node("option", "ほかの実在企業を入力する");
  custom.value = "custom";
  $("career-target").append(custom);
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
  if (mode === "switch" && autoLocal() && careerDraft?.revision !== revision)
    void generateCareerChoices();
}
async function generateCareerChoices() {
  if (
    game &&
    !game.ended &&
    !game.retired &&
    !generating &&
    (!aiState || aiState.provider === "disabled" || needsChoiceServerUpdate())
  ) {
    openExchange("career");
    return;
  }
  if (
    !game ||
    game.ended ||
    game.retired ||
    generating ||
    needsChoiceServerUpdate()
  )
    return;
  const current = revision;
  careerGenerating = true;
  generating = true;
  generationStarted = performance.now();
  generationTimer = setInterval(renderAITiming, 1000);
  renderGame();
  renderCareerOffers();
  try {
    const result = await api("/api/scene", {
      save: encodeSave(game),
      cloudConsent: $("career-consent").checked,
      choiceVersion: 1,
      mode: "career",
    });
    aiState = result.accounting;
    if (current === revision)
      careerDraft = { revision: current, scene: result.scene };
  } catch (error) {
    toast(`転職4択を生成できませんでした。${error.message}`);
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
$("career-exchange").addEventListener("click", () => openExchange("career"));
function takeCareerDecision(decision) {
  if (generating || !availableChoices(game).includes(decisionId(decision)))
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
      : "まだAIでは生成していません。以下はゲームのルールで用意した候補です。上のAI生成・手動交換で、固定リストにない候補も作れます。";
  const offers = generated
    ? generated.options.map((o) => ({
        label: o.label,
        company:
          o.id === "switch"
            ? (o.decision.name ?? EMPLOYERS[o.decision.target]?.name)
            : game.employer.name,
        kind: o.decision.candidateKind,
        work: o.decision.proposal ?? o.decision.intent ?? o.label,
        reason: o.reason,
        tradeoff: o.hint,
        decision: o.decision,
      }))
    : careerOffers(game);
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
    if (offer.source) {
      const link = node(
        "a",
        `公式の事業情報 ↗ / 確認 ${offer.source.checkedAt}`,
      );
      link.href = offer.source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      details.append(link);
    } else if (offer.kind === "fictional")
      card.append(node("small", "この世界で生まれた架空の企業"));
    else if (generated && offer.kind === "real")
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
  if (!game || game.ended || game.retired || generating) return;
  openCareer("switch");
});
function renderCareer() {
  const preview = $("career-preview");
  preview.replaceChildren();
  $("career-custom").hidden =
    careerMode !== "switch" || $("career-target").value !== "custom";
  $("career-future").textContent =
    careerMode === "switch"
      ? game.year < 2036
        ? "2036年になると、この世界で生まれた架空の企業も候補に加わります。"
        : "未来の架空企業も登場。実在企業の事業情報は2026年時点の資料を使っています。"
      : "転職すると自分の事業から離れます。退職すると運営と事業収入を止めます。事業売却益は仮定しません。";
  if (careerMode === "startup") {
    const v = VENTURES[$("career-venture").value];
    preview.append(node("b", "自分が起こす架空の事業"), node("p", v.detail));
    $("career-cost").textContent =
      `手元現金 ${money(game.cash)}万円 / 初期費用 ${v.setup}万円 ＋ 年間運営費 ${v.overhead}万円。初年の事業収入は今の労働収入の30〜85%を基準に変動（収入ゼロなら年120万円を基準）。以後もAIの需要・競争と経験で上下します。すべてゲームの仮定です。`;
  } else {
    const c = EMPLOYERS[$("career-target").value];
    if (c) {
      preview.append(
        node(
          "b",
          c.kind === "real" ? "確認した公開情報" : "この未来の、架空の設定",
        ),
        node("p", c.summary),
      );
      if (c.url) {
        const a = node("a", `公式の出典 ↗ / 確認 ${c.checkedAt}`);
        a.href = c.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        preview.append(a);
      }
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
    }
    $("career-cost").textContent =
      "移行費用30万円。収入は現在の労働収入・経験・職種変更・年ごとの偶然から上下します。会社のタイプと事業分野が、以後のAIの影響を変えます。職種変更時は移行の負担があり、収入ゼロなら仮の年180万円を基準にします。実際の募集や年収データは使っていません。";
  }
}
for (const id of ["career-target", "career-venture"])
  $(id).addEventListener("change", () => {
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
        target: $("career-target").value,
        role: $("career-role").value,
      };
      if (decision.target === "custom") {
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
    const originalLabel = button.textContent;
    const rev = career ? ++careerResearchRevision : ++companyResearchRevision;
    const current = () =>
      rev === (career ? careerResearchRevision : companyResearchRevision);
    button.disabled = true;
    button.textContent = "調べています…";
    if (!career) document.querySelector(".company-research").hidden = false;
    list.replaceChildren();
    message.textContent = "企業名から会社情報と公式サイトを探しています…";
    async function load(candidate) {
      if (!current()) return;
      message.textContent = `${candidate.name}の公開ページを取得しています…`;
      try {
        let facts,
          directoryOnly = false;
        if (candidate.known || standalone || hosted) {
          directoryOnly = !candidate.known;
          facts = {
            summary: candidate.description,
            sector: candidate.sector ?? "unknown",
            sources: [
              {
                url: candidate.known ? candidate.url : candidate.directoryURL,
                title: candidate.known
                  ? `${candidate.name} / 公式事業資料（内蔵）`
                  : `${candidate.name} / Wikidataの会社概要（公式本文は未取得）`,
                checkedAt:
                  candidate.checkedAt ?? new Date().toISOString().slice(0, 10),
              },
            ],
          };
        } else ({ facts } = await api("/api/company", { url: candidate.url }));
        if (!current()) return;
        const prefix = career ? "career" : "company";
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
        const officialLink = node("a", "候補の公式サイトを開く ↗");
        officialLink.href = candidate.url;
        officialLink.target = "_blank";
        officialLink.rel = "noopener noreferrer";
        list.append(officialLink);
        message.textContent = directoryOnly
          ? "Wikidataの会社概要と公式サイト候補を取得しました。公式ページの本文は未取得です。同じ会社か確認して使えます。"
          : candidate.known
            ? `内蔵の公式事業資料を表示しました（確認 ${candidate.checkedAt}）。同じ会社か確認して使えます。`
            : "公式サイトの本文を取得しました。取得元と企業の一致を確認して使えます。";
      } catch (error) {
        if (current())
          message.textContent = `${error.message} URLを指定する方法も使えます。`;
      }
    }
    try {
      const candidates =
        standalone || hosted
          ? await makeDirectorySearch({ transport: browserDirectoryText })(
              name.value,
            )
          : (await api("/api/company/search", { name: name.value })).candidates;
      if (!current()) return;
      if (!candidates.length) {
        message.textContent =
          "会社の候補が見つかりませんでした。正式名称を試すか、会社名だけのまま始められます。";
        return;
      }
      if (candidates.length === 1) await load(candidates[0]);
      else {
        message.textContent =
          "同名・関連する候補があります。調べたい企業を選んでください。";
        for (const c of candidates) {
          const b = node(
            "button",
            `${c.name} — ${c.description} / ${new URL(c.url).hostname}`,
            "button secondary small",
          );
          b.type = "button";
          b.addEventListener("click", async () => {
            for (const el of list.querySelectorAll("button"))
              el.disabled = true;
            await load(c);
          });
          list.append(b);
        }
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
      "このメモリ容量では今回比較したモデルをおすすめできません。OSや他のアプリの余裕が少なくなります。より小さいモデルは、このゲームの日本語と選択肢の質をまだ検証していません。APIや手動交換も選べます。";
  else if (memory < 32)
    advice =
      "まずは軽めのQwen3 8Bを検討する目安です。この容量では未検証なので、動作や文章の質を保証しません。Gemma 4 12Bは32GBのMacで確認済みですが、16・24GBでの最低要件は確認できていません。";
  else
    advice =
      "候補はGemma 4 12B Q4_K_M（文章とのバランス）とQwen3 8B（速さ）です。実測済みはM5・32GBで、他のチップ・容量では未検証です。メモリが多くても、大きいモデルほど速く良い選択肢を作れるとは限りません。";
  $("guide-recommendation").textContent = advice;
  const id = $("ai-local-model").value;
  let selected = "";
  if (/^qwen3\.8:27b(?:-mtp)?-q4_K_M$/.test(id))
    selected =
      "選択中の27BモデルはM5・32GBでswapが約2〜3GiB増えたため、普段のゲーム用にはおすすめしていません。モデルは自動で変更しません。";
  else if (id === "gemma4:12b-it-q4_K_M")
    selected =
      "選択中：今回比較した中でおすすめのGemma 4 12Bです。M5・32GBで中央値31秒。OS・GPUなどもメモリを使うため、約8GBのファイルが収まるだけでは動作判断できません。";
  else if (id === "qwen3:8b")
    selected =
      "選択中：軽めのQwen3 8Bです。M5・32GBで中央値19秒でしたが、場面の具体性や条件の反映には改善の余地がありました。";
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
  openai: ["https://api.openai.com/v1", "gpt-6-luna", 0.1, 0.5],
  openrouter: ["https://openrouter.ai/api/v1", "openrouter/free", 0, 0],
};
$("ai-settings-button").addEventListener("click", async () => {
  try {
    await status();
    for (const [field, key] of [
      ["ai-provider", "provider"],
      ["ai-model", "model"],
      ["ai-base-url", "baseURL"],
      ["ai-input-rate", "inputRate"],
      ["ai-output-rate", "outputRate"],
      ["ai-usd-cap", "usdCap"],
      ["ai-request-cap", "requestCap"],
    ])
      $(field).value = aiState[key] ?? "";
    $("ai-base-url").readOnly = aiState.provider !== "custom";
    $("ai-error").textContent = "";
    $("ai-key").value = "";
    $("ai-dialog").showModal();
    void refreshModels();
  } catch (error) {
    toast(error.message);
  }
});
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
  void refreshModels();
});
$("ai-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("ai-error").textContent = "";
  try {
    const data = await api("/api/ai/config", {
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
    });
    $("ai-key").value = "";
    aiState = data.ai;
    $("cloud-consent").checked = false;
    renderAI();
    $("ai-dialog").close();
    toast("AIの接続設定を更新しました。");
  } catch (error) {
    $("ai-error").textContent = error.message;
  }
});
function openExchange(mode = "life") {
  if (!game || game.ended) return;
  exchangeMode = mode;
  exchangeRevision = revision;
  const request = storyRequest(game, {
    personalized: true,
    mode,
    catalog: knowledgeCatalog,
  });
  $("exchange-prompt").value = request.messages
    .map((m) => m.content)
    .join("\n\n");
  $("exchange-result").value = "";
  $("exchange-error").textContent = "";
  $("exchange-dialog").showModal();
}
$("exchange-button").addEventListener("click", () => openExchange());
$("copy-prompt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("exchange-prompt").value);
    toast("コピーしました。送信先のAIは自分で選んでください。");
  } catch {
    toast("文章を選択してコピーしてください。");
  }
});
$("import-scene").addEventListener("click", () => {
  try {
    const text = $("exchange-result")
      .value.replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "");
    if (exchangeRevision !== revision)
      throw new Error(
        "ゲームが進んだため、現在の場面で依頼文を作り直してください。",
      );
    const scene = validateGeneratedScene(JSON.parse(text), game, {
      personalized: true,
      mode: exchangeMode,
    });
    if (exchangeMode === "career") {
      careerDraft = { revision, scene };
      renderCareerOffers();
    } else game = applyScene(game, scene);
    renderGame();
    $("exchange-dialog").close();
    toast("AIの場面を取り込みました。");
  } catch (error) {
    $("exchange-error").textContent =
      error instanceof SyntaxError
        ? "JSON形式を確認してください。"
        : error.message;
  }
});
$("export-legacy").addEventListener("click", () => {
  try {
    const raw = localStorage.getItem("unwritten-life:v1");
    if (!raw) return;
    const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      ),
      a = node("a");
    a.href = url;
    a.download = "unwritten-life-v1-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    toast("書き出せませんでした。");
  }
});
if (standalone || hosted) {
  $("ai-form").hidden = true;
  $("ai-description").textContent = hosted
    ? "OpenAIで場面と選択肢を生成できます。送信内容を確認し、同意を入れて生成ボタンを押してください。累計の見積り上限$0.10・100回まで。自動生成と自動再試行はしません。セーブはこの端末内です。"
    : "AI未接続でも、各年のできごとと選択の結果が続きます。AIを使う場合は、依頼文をコピーして好きなAIの返答を取り込めます。PCのOllamaやAPIキーとは自動接続しません。";
  $("auto-scene").checked = false;
  for (const id of ["research-button", "career-research"])
    if ($(id)) $(id).hidden = true;
  for (const el of document.querySelectorAll("[data-pc-only]"))
    el.hidden = true;
}
readStoredGame();
updateBudget();
status().catch((error) => {
  $("ai-status").textContent = error.message;
});
