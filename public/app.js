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
  replay,
  compareWorlds,
  eventFor,
  technologyAt,
  encodeSave,
  decodeSave,
  applyScene,
} from "./engine.js";
import { EMPLOYERS, VENTURES, careerCandidates } from "./careers.js";
import { storyRequest } from "./story.js";
const $ = (id) => document.getElementById(id),
  saveKey = "unwritten-life:v2",
  nf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const money = (n) => nf.format(Math.round(n / 10) * 10);
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
      "ローカルサーバーに接続できません。アプリを起動して再読み込みしてください。",
    );
  const data = await res.json();
  apiToken = data.token;
  aiState = data.ai;
  renderAI();
  return data;
}
async function api(path, body) {
  if (!apiToken) await status();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Unwritten-Token": apiToken,
    },
    body: JSON.stringify(body),
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
  const p = Object.fromEntries(new FormData($("profile-form")));
  for (const k of [
    "age",
    "income",
    "savings",
    "monthlyCost",
    "stocks",
    "rent",
    "homeValue",
    "mortgage",
    "mortgageYears",
    "mortgageRate",
    "retirementAge",
    "pension",
  ])
    p[k] = Number(p[k]);
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
function renderGame() {
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
    game.employer.name +
      (game.employer.kind === "fictional" || game.employer.kind === "venture"
        ? "（架空）"
        : game.employer.kind === "real"
          ? "（転職は仮想）"
          : ""),
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
  const card = $("event-card");
  card.replaceChildren();
  const resultCard = $("year-result");
  resultCard.replaceChildren();
  resultCard.hidden = !game.history.length;
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
      ["AIスキル", "skill", ""],
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
    const options = [...event.options];
    const extra = node("details"),
      extraButtons = node("div", undefined, "career-actions");
    extra.append(
      node("summary", "ほかの働き方・お金・暮らしの選択"),
      extraButtons,
    );
    for (const id of [
      "switch",
      "startup",
      "invest",
      "home",
      "move",
      "retire",
    ]) {
      if (
        availableChoices(game).includes(id) &&
        !options.some((o) => o.id === id)
      ) {
        const extraButton = node(
          "button",
          CHOICES[id].label + " ↗",
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
          game = advance(game, id);
          revision++;
          renderGame();
          moveToStory();
          void maybeGenerateScene();
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
        copy = node("span");
      copy.append(
        node("b", option.label),
        node(
          "small",
          `${option.hint}${event.generated ? " / 行動：" + c.label : ""}`,
        ),
      );
      button.append(
        node("span", c.icon, "choice-symbol"),
        copy,
        node("span", "↗", "choice-arrow"),
      );
      button.addEventListener("click", () => {
        if (!button.isConnected || game.ended || generating) return;
        if (["switch", "startup"].includes(option.id)) {
          openCareer(option.id);
          return;
        }
        const step = autoLocal() ? 1 : Number($("year-step").value);
        for (let i = 0; i < step && !game.ended; i++) {
          try {
            game = advance(game, option.id);
          } catch {
            break;
          }
        }
        revision++;
        renderGame();
        moveToStory();
        void maybeGenerateScene();
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
    row.append(year, text, node("span", h.choiceLabel, "history-choice"));
    history.append(row);
  }
  $("context-preview").textContent = JSON.stringify(
    storyRequest(game).context,
    null,
    2,
  );
  renderAI();
  persist();
}
function renderAI() {
  if (!aiState) return;
  const local = !aiState.cloud;
  $("auto-scene-label").hidden = !local || aiState.provider === "disabled";
  $("year-step").disabled = autoLocal();
  if (autoLocal()) $("year-step").value = "1";
  $("ai-status").classList.toggle("is-generating", generating);
  $("event-card").setAttribute("aria-busy", String(generating));
  $("ai-status").textContent = generating
    ? `${local ? "PC内のAI" : "接続したAI"}が、この結果から次の場面と選択肢を考えています…`
    : `${local ? "PC内" : "クラウド"}：${aiState.provider} / ${aiState.model} · ${aiState.calls}回 · 見積り予約 $${aiState.reservedUSD.toFixed(4)}`;
  $("cloud-consent-label").hidden = local;
  $("generate-button").disabled =
    generating || !game || game.ended || aiState.provider === "disabled";
  $("back-setup").disabled = generating;
  $("ai-accounting").textContent =
    `この起動中：${aiState.calls}/${aiState.requestCap}回、見積り予約 $${aiState.reservedUSD.toFixed(4)} / $${aiState.usdCap}。失敗した呼び出しも数えます。`;
}
function autoLocal() {
  return (
    $("auto-scene").checked &&
    aiState &&
    !aiState.cloud &&
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
  const current = revision;
  generating = true;
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
    });
    aiState = result.accounting;
    if (current === revision) {
      game = applyScene(game, result.scene);
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
    if (!remember) {
      try {
        localStorage.removeItem(saveKey);
      } catch {}
    }
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
  );
  revision++;
  renderGame();
  moveToStory();
});
$("compare-button").addEventListener("click", openComparison);
$("generate-button").addEventListener("click", generateScene);
function updateBudget() {
  const f = $("profile-form"),
    own = f.elements.housing.value === "own";
  $("home-fields").hidden = !own;
  $("rent-field").hidden = own;
  $("budget-summary").textContent =
    `仮の初期設定：金融資産 ${f.elements.savings.value}万円（うち株式 ${f.elements.stocks.value}万円）、生活費 ${f.elements.monthlyCost.value}万円/月 ＋ ${own ? "持ち家の維持・返済費" : "家賃 " + f.elements.rent.value + "万円/月"}。退職 ${f.elements.retirementAge.value}歳、65歳以降の収入 ${f.elements.pension.value}万円/年。任意項目で調整できます。`;
}
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
      ? "事業と名前を決めて、暮らしとのバランスを試してみよう。"
      : `${game.year}年の分岐。会社と役割の組み合わせが、その後の物語と収支を変えます。`;
  $("career-job-fields").hidden = mode !== "switch";
  $("career-venture-fields").hidden = mode !== "startup";
  $("career-error").textContent = "";
  $("career-name").value = "";
  $("career-url").value = "";
  $("career-type").value = "unknown";
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
}
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
      if (!$("venture-name").value.trim())
        throw new Error("あなたの事業に名前をつけてください。");
      decision = {
        id: "startup",
        venture: $("career-venture").value,
        name: $("venture-name").value,
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
    game = advance(game, decision);
    revision++;
    $("career-dialog").close();
    renderGame();
    moveToStory();
    void maybeGenerateScene();
    toast(
      "この分岐で1年進みました。会社と役割は、以後の人生にも引き継がれます。",
    );
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
    const rev = career ? ++careerResearchRevision : ++companyResearchRevision;
    const current = () =>
      rev === (career ? careerResearchRevision : companyResearchRevision);
    button.disabled = true;
    list.replaceChildren();
    message.textContent = "企業名から公式サイトを探しています…";
    async function load(candidate) {
      if (!current()) return;
      message.textContent = `${candidate.name}の公開ページを取得しています…`;
      try {
        const { facts } = await api("/api/company", { url: candidate.url });
        if (!current()) return;
        const prefix = career ? "career" : "company";
        $(prefix + "-url").value = facts.sources[0]?.url ?? candidate.url;
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
        message.textContent =
          "公式サイトの本文を取得しました。取得元と企業の一致を確認してチェックしてください。";
      } catch (error) {
        if (current())
          message.textContent = `${error.message} URLを指定する方法も使えます。`;
      }
    }
    try {
      const { candidates } = await api("/api/company/search", {
        name: name.value,
      });
      if (!current()) return;
      if (!candidates.length) {
        message.textContent =
          "公式サイトの候補が見つかりませんでした。企業の正式名称か、URL指定をお試しください。";
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
    }
  });
}
setupNameSearch();
setupNameSearch(true);
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
$("exchange-button").addEventListener("click", () => {
  if (!game || game.ended) return;
  const request = storyRequest(game);
  $("exchange-prompt").value = request.messages
    .map((m) => m.content)
    .join("\n\n");
  $("exchange-result").value = "";
  $("exchange-error").textContent = "";
  $("exchange-dialog").showModal();
});
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
    game = applyScene(game, JSON.parse(text));
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
readStoredGame();
updateBudget();
status().catch((error) => {
  $("ai-status").textContent = error.message;
});
