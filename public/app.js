import {
  START_YEAR,
  YEARS,
  SCENARIOS,
  JOBS,
  REGIONS,
  PRIORITIES,
  CHOICES,
  createGame,
  advance,
  replay,
  compareWorlds,
  eventFor,
  technologyAt,
  encodeSave,
  decodeSave,
} from "./engine.js";

const $ = (id) => document.getElementById(id);
const saveKey = "unwritten-life:v1";
const nf = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const money = (value) => nf.format(Math.round(value / 10) * 10);
let game = null;
let remember = false;
let savedGame = null;
let noticeTimer;
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
  }, 4500);
}
function readStoredGame() {
  try {
    const raw = localStorage.getItem(saveKey);
    savedGame = raw ? decodeSave(raw) : null;
    $("resume-banner").hidden = !savedGame;
  } catch {
    savedGame = null;
    $("resume-banner").hidden = true;
    toast("保存データを読めませんでした。新しい物語は始められます。");
  }
}
function removeSave() {
  try {
    localStorage.removeItem(saveKey);
    savedGame = null;
    remember = false;
    $("remember").checked = false;
    $("resume-banner").hidden = true;
    $("game-delete-save").hidden = true;
    if (game) persist();
    toast("この端末の保存を削除しました。");
  } catch {
    toast(
      "ブラウザの設定により保存を削除できませんでした。サイトデータをご確認ください。",
    );
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
  const values = Object.fromEntries(new FormData($("profile-form")));
  for (const key of ["age", "income", "savings", "monthlyCost"])
    values[key] = Number(values[key]);
  return values;
}
function showGame(focus = false) {
  $("setup").hidden = true;
  $("game").hidden = false;
  renderGame();
  if (focus) {
    window.scrollTo({ top: 0, behavior: "instant" });
    $("chapter-title").focus({ preventScroll: true });
  }
}
function stat(label, value, unit, delta, metric) {
  const item = node("div", undefined, "stat"),
    line = node("div", undefined, "stat-line");
  line.append(node("span", label, "stat-name"));
  const amount = node("span", value, "stat-value");
  amount.append(node("small", unit));
  line.append(amount);
  item.append(line);
  if (metric !== undefined) {
    const bar = node("progress");
    bar.max = 100;
    bar.value = metric;
    bar.setAttribute("aria-label", label);
    item.append(bar);
  }
  item.append(node("div", delta ?? "", "stat-delta"));
  return item;
}
function renderGame() {
  const complete = game.decisions.length === YEARS;
  const previous =
    game.history.length > 1
      ? game.history.at(-2)
      : {
          income: game.profile.income,
          savings: game.profile.savings,
          health: 65,
          connection: 55,
          freedom: 55,
        };
  const change = (key, isMoney = false) => {
    if (!game.history.length) return "あなたの現在地";
    const value = game[key] - previous[key];
    const n = isMoney ? Math.round(value / 10) * 10 : Math.round(value);
    return n === 0
      ? "前年とほぼ同じ"
      : `${n > 0 ? "+" : "−"}${nf.format(Math.abs(n))}${isMoney ? "万円" : ""} / 前年比`;
  };
  $("chapter-label").textContent = complete
    ? "YOUR NEXT CHAPTER IS YOURS."
    : `CHAPTER ${String(game.decisions.length + 1).padStart(2, "0")} / ${YEARS}`;
  $("chapter-title").textContent = complete
    ? `${game.year}年。あなたの、ひとつの未来。`
    : `${game.year}年、${game.age}歳のあなた。`;
  const householdLabels = {
    solo: "ひとり暮らし",
    shared: "大切な人との暮らし",
    care: "育児やケアのある暮らし",
  };
  const companyLabels = {
    unknown: "",
    large: "大企業",
    small: "中小企業・スタートアップ",
    public: "公的機関・非営利",
    self: "自営・フリーランス",
  };
  const genderLabels = {
    undisclosed: "",
    woman: "女性",
    man: "男性",
    other: "性別：その他",
  };
  $("profile-caption").textContent = [
    REGIONS[game.profile.region].label,
    JOBS[game.profile.job].label,
    game.profile.company || companyLabels[game.profile.companyType],
    householdLabels[game.profile.household],
    genderLabels[game.profile.gender],
  ]
    .filter(Boolean)
    .join(" / ");
  $("world-badge").textContent = `AIの未来：${SCENARIOS[game.scenario].label}`;
  $("progress").value = game.decisions.length;
  $("stats").replaceChildren(
    stat(
      "年収（税引き前）",
      `約${money(game.income)}`,
      "万円",
      change("income", true),
    ),
    stat(
      "貯蓄 − 借入",
      `約${money(game.savings)}`,
      "万円",
      change("savings", true),
    ),
    stat(
      "心と体のゆとり",
      String(Math.round(game.health)),
      "/ 100",
      change("health"),
      game.health,
    ),
    stat(
      "人とのつながり",
      String(Math.round(game.connection)),
      "/ 100",
      change("connection"),
      game.connection,
    ),
    stat(
      "暮らしの自由",
      String(Math.round(game.freedom)),
      "/ 100",
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
  if (game.history.length)
    card.append(
      node(
        "p",
        `${game.history.at(-1).year}年の選択：${game.history.at(-1).note}`,
        "reflection",
      ),
    );
  if (complete) {
    card.append(
      node("p", "TWENTY YEARS, MANY SMALL CHOICES.", "eyebrow"),
      node("h2", "未来は、まだ続いている。"),
    );
    const counts = Object.keys(CHOICES)
      .map((key) => [key, game.decisions.filter((x) => x === key).length])
      .sort((a, b) => b[1] - a[1]);
    card.append(
      node(
        "p",
        `この20年、あなたがいちばん多く選んだのは「${CHOICES[counts[0][0]].label}」でした。大切にしたかった「${PRIORITIES[game.profile.priority]}」に、どれくらい近づけたでしょう。数字にはならなかった、あなたにだけ分かる変化もあるはずです。`,
      ),
    );
    card.append(
      node(
        "p",
        game.savings < 0
          ? "この設定では、生活費などが使えるお金を上回りました。初期の支出や選択を変えるとどうなるか、別の物語でも試せます。"
          : "ここにあるのは、いくつもの可能性のうちのひとつ。ちがう選択をしたあなたにも、会いにいけます。",
        "insight",
      ),
    );
    const actions = node("div", undefined, "ending-actions");
    const again = node("button", "同じ条件で、選びなおす ↗", "button primary");
    again.addEventListener("click", () => {
      game = createGame(game.profile, game.scenario, game.seed);
      showGame(true);
    });
    const compare = node("button", "別の世界を見てみる", "button secondary");
    compare.addEventListener("click", openComparison);
    actions.append(again, compare);
    card.append(actions);
  } else {
    const event = eventFor(game);
    card.append(
      node("p", `A PAGE FROM ${game.year}`, "eyebrow"),
      node("h2", event.title),
      node("p", event.body),
      node("p", `AI時代のひとこと / ${event.insight}`, "insight"),
    );
  }
  $("choice-title").parentElement.hidden = complete;
  const choices = $("choices");
  choices.replaceChildren();
  if (!complete)
    for (const [key, option] of Object.entries(CHOICES)) {
      const button = node("button", undefined, "choice");
      button.type = "button";
      button.dataset.choice = key;
      const copy = node("span");
      copy.append(node("b", option.label), node("small", option.hint));
      button.append(
        node("span", option.icon, "choice-symbol"),
        copy,
        node("span", "↗", "choice-arrow"),
      );
      button.addEventListener("click", () => {
        // Re-render synchronously; a detached button cannot make a second choice.
        if (!button.isConnected || game.decisions.length >= YEARS) return;
        game = advance(game, key);
        renderGame();
        $("chapter-title").focus({ preventScroll: true });
      });
      choices.append(button);
    }
  $("undo-button").disabled = game.decisions.length === 0;
  const history = $("history");
  history.replaceChildren();
  if (!game.history.length)
    history.append(node("p", "最初の一ページは、これから。", "empty-history"));
  for (const entry of [...game.history].reverse()) {
    const row = node("article", undefined, "history-row"),
      year = node("span", String(entry.year), "history-year");
    year.append(node("small", `${entry.age}歳`));
    const text = node("div");
    text.append(node("h3", entry.title), node("p", entry.note));
    row.append(
      year,
      text,
      node("span", CHOICES[entry.choice].label, "history-choice"),
    );
    history.append(row);
  }
  persist();
}
function openComparison() {
  $("compare-caption").textContent = game.decisions.length
    ? `${START_YEAR}年から${game.year}年まで、あなたが選んだ${game.decisions.length}年分の物語を3つの世界で比べます。`
    : "まだ最初の選択の前なので、3つの世界の現在地は同じです。何年か進めると、違いが見えてきます。";
  const grid = node("div", undefined, "comparison-grid");
  for (const world of compareWorlds(game)) {
    const def = SCENARIOS[world.scenario],
      result = node(
        "section",
        undefined,
        `world-result${world.scenario === game.scenario ? " current" : ""}`,
      );
    result.append(node("h3", def.label), node("p", def.detail, "world-desc"));
    const dl = node("dl");
    for (const [label, value, unit] of [
      ["年収", `約${money(world.income)}`, "万円"],
      ["貯蓄 − 借入", `約${money(world.savings)}`, "万円"],
      [
        "ゆとり / つながり / 自由",
        `${Math.round(world.health)} / ${Math.round(world.connection)} / ${Math.round(world.freedom)}`,
        "",
      ],
    ]) {
      const dd = node("dd", value, unit ? undefined : "metric-small");
      if (unit) dd.append(node("small", unit));
      dl.append(node("dt", label), dd);
    }
    result.append(dl);
    grid.append(result);
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
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    }
  });
}
$("profile-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("form-error").textContent = "";
  try {
    const profile = readProfile();
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    game = createGame(profile, profile.scenario, seed);
    remember = $("remember").checked;
    if (!remember) {
      try {
        localStorage.removeItem(saveKey);
        savedGame = null;
      } catch {
        /* No storage is needed to play. */
      }
    }
    showGame(true);
  } catch (error) {
    $("form-error").textContent = error.message;
  }
});
$("demo-button").addEventListener("click", () => {
  const profile = {
    age: 30,
    region: "city",
    job: "tech",
    income: 500,
    ai: "sometimes",
    priority: "balance",
    gender: "undisclosed",
    household: "solo",
    savings: 300,
    monthlyCost: 17,
    companyType: "unknown",
    company: "",
  };
  game = createGame(profile, "steady", 7612026);
  remember = false;
  showGame(true);
  toast("架空の30歳で体験中。データは保存しません。");
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
  $("game").hidden = true;
  $("setup").hidden = false;
  readStoredGame();
  $("profile-section").scrollIntoView({ behavior: "instant" });
});
$("undo-button").addEventListener("click", () => {
  if (!game.decisions.length) return;
  game = replay(
    game.profile,
    game.scenario,
    game.seed,
    game.decisions.slice(0, -1),
  );
  renderGame();
  $("chapter-title").focus({ preventScroll: true });
});
$("compare-button").addEventListener("click", openComparison);
let customCost = false;
$("monthly-cost").addEventListener("input", () => {
  customCost = true;
});
function updateSuggestedCost() {
  if (!customCost)
    $("monthly-cost").value = String(
      Math.round(
        REGIONS[$("region").value].cost *
          { solo: 1, shared: 1.5, care: 1.8 }[$("household").value] *
          10,
      ) / 10,
    );
}
$("region").addEventListener("change", updateSuggestedCost);
$("household").addEventListener("change", updateSuggestedCost);
function showBudgetSummary() {
  const form = $("profile-form");
  $("budget-summary").textContent =
    `初期設定：貯蓄 ${form.elements.savings.value}万円・生活費 ${form.elements.monthlyCost.value}万円/月。任意項目で調整できます。`;
}
$("profile-form").addEventListener("input", showBudgetSummary);
$("profile-form").addEventListener("change", showBudgetSummary);
readStoredGame();
