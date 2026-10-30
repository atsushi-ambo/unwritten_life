import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import {
  displayIntention, displayEpisode, createGame, advance, advanceDirection, previousDirectionStep, availableChoices, decisionId, directionSpan, incidentAt,
  recordCareerReflection, careerSeenUntil, replay, encodeSave, RANKS, REGIONS, MAX_AGE,
} from "../public/engine.js";
import { careerMilestones, careerMap, CAREER_STATES } from "../public/careers.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const base = () => createGame({ age: 29, job: "tech", company: "合成社", income: 500,
  savings: 1000, ai: "daily", region: "city", priority: "balance",
  gender: "undisclosed", household: "solo", companyType: "small" }, "steady", 42,
  0, 0, 0, 0, 0, 0, 0, 110);

// Exercise the actual timeline handlers with synthetic state and a controllable
// clock. Native focus, animation and mobile layout are covered by Playwright.
function harness({ storedSpeed = null, storageDenied = false, reducedMotion = false } = {}) {
  class Element {
    constructor(tag, text = "", className = "") {
      Object.assign(this, { tag, text, className, children: [], dataset: {}, attributes: {}, handlers: {}, isConnected: true, scrolls: [] });
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ""; this.children = children; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    addEventListener(key, fn) { this.handlers[key] = fn; }
    getAttribute(key) { return this.attributes[key]; }
    querySelectorAll(selector) {
      return this.all().filter((n) => selector === "button" ? n.tag === "button" : n.className.split(" ").includes(selector.slice(1)));
    }
    closest(selector) { return selector.split(", ").includes(this.tag) ? this : null; }
    scrollIntoView(options) { this.scrolls.push(options); }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
    set textContent(text) { this.text = text; this.children = []; }
  }
  const node = (...args) => new Element(...args), elements = new Map(), timers = new Map(), stored = new Map();
  let id = 0, requests = 0, saves = 0, now = 0;
  const $ = (key) => {
    if (!elements.has(key)) elements.set(key, node("div"));
    return elements.get(key);
  };
  const context = createContext({
    $, node, displayIntention, displayEpisode, game: base(), RANKS, REGIONS, MAX_AGE, careerMap, CAREER_STATES, createGame, advanceDirection, previousDirectionStep, directionSpan,
    availableChoices, decisionId, recordCareerReflection, careerMilestones, careerSeenUntil, replay,
    timelineShown: 0, timelinePaused: false, timelineTimer: undefined, lastJourney: null,
    generating: false, revision: 1, favoriteYears: new Set(),
    money: (n) => new Intl.NumberFormat("ja-JP").format(Math.round(n / 10) * 10),
    nf: new Intl.NumberFormat("ja-JP"), toast: (message) => assert.fail(message),
    localStorage: {
      getItem() { if (storageDenied) throw Error("denied"); return storedSpeed; },
      setItem(key, value) { if (storageDenied) throw Error("denied"); stored.set(key, value); },
    },
    document: {
      documentElement: { clientWidth: 1280 },
      handlers: {}, activeElement: null, createTextNode: (text) => node("#text", text),
      addEventListener(key, fn) {
        const previous = this.handlers[key];
        this.handlers[key] = (event) => { previous?.(event); fn(event); };
      },
      querySelector: () => null,
    },
    window: { scrollY: 0, handlers: {}, addEventListener(key, fn) { this.handlers[key] = fn; }, matchMedia: () => ({ matches: reducedMotion }) },
    performance: { now: () => now },
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { fn, ms }); return key; },
    clearTimeout: (key) => timers.delete(key),
    maybeGenerateScene() { requests++; }, moveToStory() {},
    persist() { saves++; },
    renderGame() { runInContext("renderRevealedStatus(); renderTimelineControls()", context); context.persist(); },
  });
  for (const [start, end] of [
    ["function commitChoice(", "function selectCommand("],
    ["function appendBudget(", "function renderGame()"],
    ["function renderCareerMap(", "function renderLifeStory()"],
    ['$("undo-button").addEventListener', '$("compare-button").addEventListener'],
  ]) runInContext(app.slice(app.indexOf(start), app.indexOf(end)), context);
  return { $, context, stored, node,
    get requests() { return requests; }, get saves() { return saves; },
    get timer() { return [...timers.values()][0]; },
    year() { const [key, timer] = [...timers.entries()][0]; timers.delete(key); now += timer.ms; timer.fn(); },
    elapse(ms) { now += ms; },
    choose() { runInContext('commitChoice({ id: "learn", intent: "設計を学ぶ" })', context); },
  };
}

test("a direction calculates five years and starts one AI request before revealing each annual card", () => {
  const h = harness();
  h.choose();
  assert.equal(h.context.game.decisions.length, 5);
  assert.equal(h.requests, 1);
  assert.equal(h.$("journey-years").children.length, 0);
  assert.equal(h.timer.ms, 6000);
  for (let count = 1; count <= 5; count++) {
    h.year();
    assert.equal(h.$("journey-years").children.length, count);
  }
  assert.equal(h.$("timeline-controls").hidden, true);
  assert.equal(h.timer, undefined);
  assert.equal(h.requests, 1);
  assert.match(h.$("journey-years").textContent, /2026年 \/ 29歳.*年収.*純資産/);
});

test("pause, resume, Space, speed and skip use the real clock handlers without extra requests", () => {
  const h = harness(); h.choose(); h.year();
  h.$("timeline-pause").handlers.click();
  assert.equal(h.timer, undefined);
  assert.equal(h.$("timeline-pause").textContent, "再開");
  const event = { code: "Space", target: { closest: () => null }, preventDefault() { this.prevented = true; } };
  h.context.document.handlers.keydown(event);
  assert.equal(event.prevented, true);
  assert.equal(h.timer.ms, 6000);
  h.$("timeline-speed").value = "2";
  h.$("timeline-speed").handlers.change();
  assert.equal(h.timer.ms, 3000);
  assert.equal(h.stored.get("unwritten-life:timeline-speed"), "2");
  h.year();
  h.$("timeline-pause").handlers.click();
  h.$("journey-next").handlers.click();
  assert.equal(h.$("journey-years").children.length, 5);
  assert.equal(h.$("timeline-controls").hidden, true);
  assert.equal(h.timer, undefined);
  assert.equal(h.requests, 1);
});

test("typing Space or opening a dialog never changes pause state or stops the year clock", () => {
  const h = harness(); h.choose();
  const keydown = h.context.document.handlers.keydown;
  keydown({ code: "Space", target: { closest: () => ({}) }, preventDefault() { assert.fail(); } });
  h.context.document.querySelector = () => ({});
  keydown({ code: "Space", target: { closest: () => null }, preventDefault() { assert.fail(); } });
  assert.equal(h.context.timelinePaused, false);
  h.year();
  assert.equal(h.$("journey-years").children.length, 1);
  assert.ok(h.timer);
});

test("inline reflection input neither blocks the timeline nor sends another AI request", () => {
  const h = harness(); h.choose(); h.year();
  const reflection = h.$("journey-years").all().find((n) => n.dataset.milestone === "age-30");
  const form = reflection.all().find((n) => n.tag === "form"), input = form.all().find((n) => n.tag === "input");
  assert.equal(input.maxLength, 80);
  input.value = "自分のペースで学びたい";
  form.handlers.submit({ preventDefault() {} });
  assert.equal(h.context.game.reflections["age-30"], input.value);
  assert.match(reflection.textContent, /自分のペースで学びたい/);
  h.year();
  assert.equal(h.$("journey-years").children.length, 2);
  h.$("journey-next").handlers.click();
  assert.equal(h.requests, 1);
  assert.ok(h.saves > 0);
  h.$("undo-button").handlers.click();
  assert.equal(h.context.game.age, 29);
  assert.equal(h.context.game.decisions.length, 0);
  assert.deepEqual(JSON.parse(encodeSave(h.context.game)).directionBlocks, []);
  assert.equal(h.$("journey-years").children.length, 0);
  assert.deepEqual(Object.keys(h.context.game.reflections), []);
});

test("skipping an inline reflection persists the same empty record while leaving the clock running", () => {
  const h = harness(); h.choose(); h.year();
  const reflection = h.$("journey-years").all().find((n) => n.dataset.milestone === "age-30");
  reflection.all().find((n) => n.tag === "button" && n.textContent === "今は書かない").handlers.click();
  assert.equal(h.context.game.reflections["age-30"], "");
  assert.ok(h.timer);
});

test("speed restores safely and storage refusal does not prevent play", () => {
  for (const options of [{ storedSpeed: "2" }, { storedSpeed: "bad" }, { storageDenied: true }]) {
    const h = harness(options); h.choose();
    assert.equal(h.timer.ms, options.storedSpeed === "2" ? 3000 : 6000);
    h.$("timeline-speed").value = "2";
    h.$("timeline-speed").handlers.change();
    assert.equal(h.timer.ms, 3000);
    h.$("journey-next").handlers.click();
    assert.equal(h.context.game.decisions.length, 5);
  }
});

test("undo during the reveal cancels its timer and restores the preceding block", () => {
  const h = harness(); h.choose(); h.$("journey-next").handlers.click();
  h.choose(); h.year();
  assert.equal(h.context.game.decisions.length, 10);
  // The previous direction's years fold away; only the new block is open.
  assert.equal(h.$("journey-earlier-years").children.length, 5);
  assert.equal(h.$("journey-earlier").hidden, false);
  assert.match(h.$("journey-earlier-summary").textContent, /これまでの5年を見る（2026〜2030年）/);
  assert.equal(h.$("journey-years").children.length, 1);
  h.$("undo-button").handlers.click();
  assert.equal(h.context.game.decisions.length, 5);
  assert.equal(h.$("journey-years").children.length, 5);
  assert.equal(h.timer, undefined);
  assert.equal(h.context.timelineShown, 5);
  assert.equal(h.$("journey-earlier-years").children.length, 0);
  assert.equal(h.$("journey-earlier").hidden, true);
});

test("HUD, header, progress and career map follow the last revealed entry without changing game", () => {
  const h = harness(); h.choose();
  const game = h.context.game, save = encodeSave(game);
  assert.equal(h.$("hud-year").textContent, "2026年");
  assert.equal(h.$("hud-age").textContent, "29歳");
  assert.equal(h.$("progress").value, 0);
  assert.equal(h.$("career-map").all().filter((n) => n.className.startsWith("career-tile ")).length, 0);
  for (let shown = 1; shown < 5; shown++) {
    h.year();
    const entry = game.history[shown - 1];
    assert.equal(h.$("hud-year").textContent, `${entry.year}年`);
    assert.equal(h.$("hud-age").textContent, `${entry.age}歳`);
    assert.equal(h.$("hud-income").textContent, `約${h.context.money(entry.income)}万円`);
    assert.equal(h.$("hud-savings").textContent, `約${h.context.money(entry.savings)}万円`);
    assert.equal(h.$("chapter-title").textContent, `${entry.year}年、${entry.age}歳のキャリアと暮らし。`);
    assert.ok(h.$("chapter-label").textContent.startsWith(`${shown}年が経過`));
    assert.equal(h.$("progress").value, shown);
    assert.equal(h.$("career-map").all().filter((n) => n.className.startsWith("career-tile ")).length, shown);
    // An AI completion rerenders the page while the reveal is still in progress.
    h.context.renderGame();
    assert.equal(h.$("hud-year").textContent, `${entry.year}年`);
    assert.equal(h.context.game, game);
    assert.equal(encodeSave(game), save);
  }
  h.year();
  assert.equal(h.$("hud-year").textContent, `${game.year}年`);
  assert.equal(h.$("hud-age").textContent, `${game.age}歳`);
  assert.equal(h.$("progress").value, 5);
  assert.equal(encodeSave(game), save);
  h.choose(); h.year(); h.$("journey-next").handlers.click();
  assert.equal(h.$("hud-year").textContent, `${h.context.game.year}年`);
  assert.equal(h.$("hud-income").textContent, `約${h.context.money(h.context.game.income)}万円`);
  assert.equal(h.$("progress").value, 10);
});

test("timeline summaries remove repeated learning prose, intentions and detours without editing history", () => {
  const h = harness();
  const repeated = "1日1時間、年間365時間。ITの仕事に生かしたいが、今年は目に見える評価につながらなかった。学んだ力は残る。";
  const extra = "いつもと違う道を歩いた。別の街で暮らしたら、毎日の仕事も変わるだろうか。選んだ方針は「ITを学ぶ」。";
  const previous = { outcome: { body: repeated }, episode: { body: `去年のノートを開いた。${repeated}${extra}` } };
  const entry = { outcome: { body: repeated }, episode: { body: `次に学びたい課題が見えてきた。${repeated}${extra}` } };
  const original = JSON.stringify(entry);
  Object.assign(h.context, { entry, previous });
  assert.equal(runInContext("timelineSummary(entry, previous)", h.context), "次に学びたい課題が見えてきた。");
  assert.equal(JSON.stringify(entry), original);
  entry.outcome.body += "新しい仕事を任された。相談できる仲間も増えた。三つ目の出来事。";
  assert.equal(runInContext("timelineSummary(entry, previous)", h.context), "新しい仕事を任された。相談できる仲間も増えた。");
  entry.outcome.body = " 1日1時間、 年間365時間。";
  entry.episode.body = previous.episode.body;
  assert.equal(runInContext("timelineSummary(entry, previous)", h.context), "");
});

test("timeline card headings expose scout and promotion offers above the routine work outcome", () => {
  const h = harness();
  for (const id of ["scout", "promotionOffer"]) {
    let result;
    for (let seed = 1; seed < 3000 && !result; seed++) {
      let g = createGame({ ...base().profile, age: 30, rank: "staff" }, "steady", seed);
      for (let year = 0; year < 10 && !g.ended; year++) {
        g = advance(g, "rest");
        if (g.history.at(-1).incident?.id === id) { result = g; break; }
      }
    }
    assert.ok(result, id);
    h.context.game = result;
    h.context.entry = result.history.at(-1);
    h.context.index = result.history.length - 1;
    runInContext("appendTimelineYear(entry, index)", h.context);
    const row = h.$("journey-years").children.at(-1);
    assert.equal(row.children.find((n) => n.tag === "h3").textContent, result.history.at(-1).incident.title);
    assert.ok(row.textContent.includes(id === "scout" ? "スカウト" : "昇進の打診"));
  }
});

test("cards expose only a short summary, with original prose and budget inside one collapsed details", () => {
  const h = harness(); h.choose(); h.$("journey-next").handlers.click();
  const saved = encodeSave(h.context.game);
  for (const [index, row] of h.$("journey-years").children.entries()) {
    const details = row.children.find((n) => n.tag === "details");
    assert.equal(row.all().filter((n) => n.tag === "details").length, 1);
    assert.equal(details.open, undefined);
    assert.equal(details.children[0].textContent, "詳しく見る");
    assert.ok(details.textContent.includes(h.context.game.history[index].episode.body));
    assert.ok(details.textContent.includes("家計の内訳"));
    const prose = row.children.filter((n) => n.tag === "p" && n.className !== "eyebrow" && n.className !== "timeline-direction");
    assert.ok(prose.length <= 1);
    for (const paragraph of prose) {
      assert.equal(paragraph.className, "timeline-summary");
      h.context.text = paragraph.textContent;
      assert.ok(runInContext("timelineSentences(text).length", h.context) <= 2);
    }
    assert.equal(row.children.filter((n) => n.className === "timeline-direction").length, index === 0 ? 1 : 0);
  }
  assert.equal(encodeSave(h.context.game), saved);
  h.choose(); h.year();
  assert.equal(h.$("journey-years").children.at(-1).children.filter((n) => n.className === "timeline-direction").length, 1);
});

test("automatic reveal and the final decision scroll smoothly, or instantly with reduced motion", () => {
  for (const reducedMotion of [false, true]) {
    const h = harness({ reducedMotion }); h.choose(); h.year();
    assert.equal(h.$("journey-years").children[0].scrolls[0].behavior, reducedMotion ? "instant" : "smooth");
    h.$("journey-next").handlers.click();
    assert.equal(h.$("event-card").scrolls[0].behavior, reducedMotion ? "instant" : "smooth");
  }
});

test("recent upward scrolling suspends automatic following, including during a smooth scroll", () => {
  const h = harness(); h.choose(); h.year();
  h.$("timeline-speed").value = "2"; h.$("timeline-speed").handlers.change();
  h.context.window.handlers.wheel({ deltaY: -100 });
  h.year();
  assert.equal(h.$("journey-years").children[1].scrolls.length, 0);
  h.year();
  assert.equal(h.$("journey-years").children[2].scrolls.length, 1);
  h.context.window.handlers.touchstart({ touches: [{ clientY: 100 }] });
  h.context.window.handlers.touchmove({ touches: [{ clientY: 150 }] });
  h.$("journey-next").handlers.click();
  assert.equal(h.$("event-card").scrolls.length, 0);
});

test("reflection focus prevents scrolling for both cards and the next decision", () => {
  const h = harness(); h.choose(); h.year();
  h.context.document.activeElement = h.$("journey-years").all().find((n) => n.tag === "input");
  h.year();
  assert.equal(h.$("journey-years").children[1].scrolls.length, 0);
  h.$("journey-next").handlers.click();
  assert.equal(h.$("event-card").scrolls.length, 0);
});

test("scrollbar and keyboard navigation suspend following without mistaking layout changes for user input", () => {
  const h = harness(); h.choose(); h.year();
  // An upward scroll without input (a dialog restoring its position, layout
  // changes) is not the player reading back.
  h.context.window.scrollY = 600;
  h.context.window.handlers.scroll();
  h.context.window.scrollY = 550;
  h.context.window.handlers.scroll();
  assert.equal(runInContext("timelineUserScrolledUpAt", h.context), -Infinity);
  h.elapse(1600);
  // Dragging the scrollbar up is.
  h.context.window.handlers.pointerdown({ clientX: h.context.document.documentElement.clientWidth + 4 });
  h.context.window.scrollY = 300;
  h.context.window.handlers.scroll();
  h.context.window.handlers.pointerup();
  h.$("journey-next").handlers.click();
  assert.equal(h.$("event-card").scrolls.length, 0);
  h.choose();
  h.context.document.handlers.keydown({ key: "PageUp", target: { closest: () => null } });
  h.$("journey-next").handlers.click();
  assert.equal(h.$("event-card").scrolls.length, 0);
});

test("an ending heading stays hidden until the final recorded year has been revealed", () => {
  const h = harness();
  h.context.game = createGame({ ...base().profile, age: 62, retirementAge: 65 }, "steady", 42, 0, 0, 0, 0, 0, 0, 0, 110);
  h.choose();
  assert.ok(h.context.game.ended);
  h.year();
  assert.equal(h.$("chapter-title").textContent, "2026年、62歳のキャリアと暮らし。");
  assert.ok(h.$("chapter-label").textContent.startsWith("1年が経過"));
  h.$("journey-next").handlers.click();
  assert.equal(h.$("chapter-title").textContent, "65歳。キャリアと暮らしの歩みを振り返る。");
  assert.equal(h.$("hud-year").textContent, "2029年");
});

test("annual cards name the layoff and the automatic hire in consecutive years", () => {
  const h = harness();
  let lost, found;
  for (let seed = 1; seed < 20000; seed++) {
    const g = createGame(base().profile, "steady", seed);
    if (incidentAt(g, "focus")?.id !== "layoff") continue;
    const loss = advanceDirection(g, "focus");
    const hire = advanceDirection(loss.game, "learn");
    if (hire.entries[0].outcome?.kind === "reemployed") { lost = loss; found = hire; break; }
  }
  assert.ok(found);
  h.context.game = found.game;
  const lossCard = runInContext("appendTimelineYear(game.history[0], 0)", h.context);
  const hireCard = runInContext("appendTimelineYear(game.history[1], 1)", h.context);
  assert.equal(lossCard.children.find((n) => n.tag === "h3").textContent, lost.entries[0].incident.title);
  assert.equal(hireCard.children.find((n) => n.tag === "h3").textContent, "次の仕事が決まった");
  assert.match(hireCard.textContent, /勤務先：次の仕事を探している → 新しい勤務先/);
});
