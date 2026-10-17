import {
  START_YEAR,
  MAX_AGE,
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
  applyScene,
} from "./engine.js";
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
  customCost = false;
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
    JOBS[game.profile.job].label,
    game.careerMoves ? "新しい職場（仮想）" : game.profile.company,
    game.housing === "own" ? "持ち家" : "賃貸等",
    game.retired ? "退職後" : "就業中",
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
  if (game.history.length)
    card.append(
      node(
        "p",
        `${game.history.at(-1).year}年の選択：${game.history.at(-1).note}`,
        "reflection",
      ),
    );
  const choices = $("choices");
  choices.replaceChildren();
  if (complete) {
    card.append(
      node("p", "THE PAGES OF YOUR LIFE.", "eyebrow"),
      node("h2", "あなたが選んだ時間が、ここにある。"),
    );
    const counts = Object.keys(CHOICES)
      .map((k) => [k, game.decisions.filter((x) => x === k).length])
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
      game = createGame(game.profile, game.scenario, game.seed);
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
    for (const option of event.options) {
      const button = node("button", undefined, "choice");
      button.type = "button";
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
        const step = Number($("year-step").value);
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
  $("ai-status").textContent = generating
    ? "PCで場面を生成中です。初回はモデルの読み込みに時間がかかります。"
    : `${local ? "PC内" : "クラウド"}：${aiState.provider} / ${aiState.model} · ${aiState.calls}回 · 見積り予約 $${aiState.reservedUSD.toFixed(4)}`;
  $("cloud-consent-label").hidden = local;
  $("generate-button").disabled =
    generating || !game || game.ended || aiState.provider === "disabled";
  $("back-setup").disabled = generating;
  $("ai-accounting").textContent =
    `この起動中：${aiState.calls}/${aiState.requestCap}回、見積り予約 $${aiState.reservedUSD.toFixed(4)} / $${aiState.usdCap}。失敗した呼び出しも数えます。`;
}
async function generateScene() {
  if (!game || game.ended || generating) return;
  const current = revision;
  generating = true;
  renderAI();
  for (const b of $("choices").querySelectorAll("button")) b.disabled = true;
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
    toast(error.message);
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
  const company = f.elements.company.value;
  $("company-search").href =
    `https://www.google.com/search?q=${encodeURIComponent(company + " 公式 会社概要 AI 戦略")}`;
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
  companySources = [];
  $("company-summary").value = "";
  $("company-sources").replaceChildren();
  $("company-confirmed").checked = false;
});
$("research-button").addEventListener("click", async () => {
  const button = $("research-button");
  button.disabled = true;
  $("research-status").textContent = "指定した公開ページを取得しています。";
  try {
    const { facts } = await api("/api/company", {
      url: $("company-url").value,
    });
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
});
$("ai-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("ai-error").textContent = "";
  try {
    const data = await api("/api/ai/config", {
      provider: $("ai-provider").value,
      model: $("ai-model").value,
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
