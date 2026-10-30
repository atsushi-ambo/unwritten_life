import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { branchReview, choiceForecast, createGame, advance, advanceDirection, pendingCareerOffer, availableChoices, decisionId,
  validateGeneratedScene, recordCareerReflection, encodeSave, JOBS, RANKS } from "../public/engine.js";
import { storyRequest } from "../public/story.js";
import { fourReply } from "./fixtures/ai-replies.js";
import { careerMap, careerRecord, careerRecordText, discoveredCompanies, COMPANY_DISCOVERY_NOTE, lifeStory, shareCardContent, wrapCardText, CAREER_STATES, peakRankLabel, yearSpan, deathHeadline } from "../public/careers.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const profile = { age: 29, region: "city", job: "tech", ai: "daily", priority: "balance", gender: "undisclosed", household: "solo", companyType: "small" };

// Small DOM substitute for exercising real handlers without ports or browser
// permissions. Layout and native keyboard activation remain Playwright's job.
function harness(game) {
  let focused, copied, denied = false;
  class Element {
    constructor(tag, text = "", className = "") {
      Object.assign(this, { tag, text, className, children: [], attributes: {}, dataset: {}, handlers: {}, isConnected: true });
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ""; this.children = children; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    addEventListener(key, handler) { this.handlers[key] = handler; }
    focus() { focused = this; }
    select() { this.selected = true; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
    set textContent(value) { this.text = value; this.children = []; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    querySelectorAll(selector) {
      return this.all().filter((c) => selector === "button" ? c.tag === "button"
        : selector === "button:not(:disabled)" ? c.tag === "button" && !c.disabled
        : selector.startsWith(".") ? c.className.split(" ").includes(selector.slice(1))
          : selector.startsWith("#") ? c.id === selector.slice(1)
            : c.tag === "button" && String(c.dataset.year) === selector.match(/data-year="(\d+)"/)?.[1]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  }
  const node = (...args) => new Element(...args), elements = new Map();
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, node("div"));
    return elements.get(id);
  };
  const context = createContext({
    game, node, $, branchReview, choiceForecast, JOBS, RANKS, careerMap, careerRecord, careerRecordText, discoveredCompanies, COMPANY_DISCOVERY_NOTE, lifeStory, shareCardContent, wrapCardText, CAREER_STATES, peakRankLabel, yearSpan, deathHeadline,
    money: (n) => String(Math.round(n)), nf: new Intl.NumberFormat("ja-JP"),
    favoriteYears: new Set(), favoritesOnly: false, appendBudget() {},
    document: { createTextNode: (text) => node("#text", text), get activeElement() { return focused; } },
    navigator: { clipboard: { async writeText(text) { if (denied) throw Error("denied"); copied = text; } } },
  });
  runInContext(app.slice(app.indexOf("function appendChoiceForecast("), app.indexOf("function renderCareActions(")), context);
  runInContext(app.slice(app.indexOf("function renderCareerMap("), app.indexOf("function moveToStory()")), context);
  return { $, context, node, get focused() { return focused; }, get copied() { return copied; }, denyClipboard() { denied = true; } };
}

test("map labels, resume copy and selectable fallback use the actual UI handlers", async () => {
  const game = recordCareerReflection(advance(createGame(profile), "rest"), "age-30", "自分用の一行");
  const h = harness(game), card = runInContext("renderCareerResume()", h.context);
  const tile = card.querySelector(".career-tile");
  assert.match(tile.children[0].getAttribute("aria-label"), /2026年・29歳.*選択/);
  assert.ok(card.textContent.includes("自分用の一行"));
  await card.querySelector("#copy-resume").handlers.click();
  assert.equal(h.copied, careerRecordText(game, JOBS, RANKS));
  assert.equal(card.querySelector("#resume-copy-status").textContent, "コピーしました。");
  h.denyClipboard();
  await card.querySelector("#copy-resume").handlers.click();
  const fallback = card.querySelector("#resume-copy-fallback");
  assert.equal(fallback.hidden, false);
  assert.equal(fallback.readOnly, true);
  assert.equal(fallback.value, h.copied);
  assert.equal(fallback.selected, true);
  assert.equal(fallback.selectionStart, 0);
  assert.equal(fallback.selectionEnd, fallback.value.length);
  assert.equal(h.focused, fallback);
  runInContext("delete navigator.clipboard", h.context);
  await card.querySelector("#copy-resume").handlers.click();
  assert.equal(fallback.hidden, false);
  assert.equal(fallback.value, h.copied);
});

test("resume discoveries render literal text, fictional labels and an empty field note", () => {
  const game = createGame(profile);
  let h = harness(game), card = runInContext("renderCareerResume()", h.context);
  assert.ok(card.querySelector(".resume-discoveries").textContent.includes("転職先の候補は挙がりませんでした。"));
  game.scenes = { 0: { options: [{ decision: {
    id: "switch", name: "<script>合成企業</script>", candidateKind: "fictional", proposal: "<img>経験を活かす",
  } }] } };
  h = harness(game);
  card = runInContext("renderCareerResume()", h.context);
  const section = card.querySelector(".resume-discoveries");
  assert.ok(section.textContent.includes("<script>合成企業</script>（架空）"));
  assert.ok(section.textContent.includes("<img>経験を活かす"));
  assert.ok(section.textContent.includes(COMPANY_DISCOVERY_NOTE));
  assert.ok(!section.all().some((el) => ["script", "img", "a"].includes(el.tag)));
});

test("map years reveal their labels on tap and keyboard focus without hover", () => {
  const game = advance(advance(createGame(profile), "rest"), "studyDaily");
  const h = harness(game), container = h.node("section");
  h.context.container = container;
  runInContext("renderCareerMap(container)", h.context);
  const buttons = container.querySelectorAll("button"), detail = container.querySelector(".career-map-detail");
  buttons[0].handlers.click();
  assert.equal(detail.textContent, buttons[0].getAttribute("aria-label"));
  assert.equal(buttons[0].getAttribute("aria-pressed"), "true");
  buttons[1].handlers.focus();
  assert.equal(detail.textContent, buttons[1].getAttribute("aria-label"));
  assert.equal(buttons[0].getAttribute("aria-pressed"), "false");
  assert.equal(buttons[1].getAttribute("aria-pressed"), "true");
});

test("command cursor follows touch even when Safari leaves keyboard focus elsewhere", () => {
  const h = harness(createGame(profile)), buttons = [h.node("button"), h.node("button")];
  h.$("choices").append(...buttons);
  runInContext(app.slice(app.indexOf("function selectCommand("), app.indexOf("function appendBudget(")), h.context);
  h.$("choices").handlers.pointerdown({ target: { closest: () => buttons[1] } });
  assert.equal(buttons[0].dataset.active, "false");
  assert.equal(buttons[1].dataset.active, "true");
  h.$("choices").handlers.focusin({ target: { closest: () => buttons[0] } });
  assert.equal(buttons[0].dataset.active, "true");
  assert.equal(buttons[1].dataset.active, "false");
});


test("command arrow keys wrap focus, Home and End jump, and modified keys retain native behavior", () => {
  const h = harness(createGame(profile)), buttons = Array.from({ length: 4 }, () => h.node("button"));
  h.$("choices").append(...buttons);
  runInContext(app.slice(app.indexOf('$("choices").addEventListener("keydown"'), app.indexOf("function appendBudget(")), h.context);
  const press = (key, options = {}) => {
    let prevented = false;
    h.$("choices").handlers.keydown({ key, preventDefault() { prevented = true; }, ...options });
    return prevented;
  };
  buttons[0].focus();
  assert.equal(press("ArrowUp"), true);
  assert.equal(h.focused, buttons[3]);
  press("ArrowDown");
  assert.equal(h.focused, buttons[0]);
  press("End");
  assert.equal(h.focused, buttons[3]);
  press("Home");
  assert.equal(h.focused, buttons[0]);
  assert.equal(press("ArrowDown", { ctrlKey: true }), false);
  assert.equal(press("Enter"), false);
});

test("fixed offer commands open scouts without advancing and accept promotions in the offered track", () => {
  for (const id of ["scout", "promotionOffer"]) {
    let game;
    for (let seed = 1; seed < 1000 && !game; seed++) {
      let g = createGame({ ...profile, age: 35, rank: "lead", income: 500, savings: 1500 }, "steady", seed);
      for (let year = 0; year < 12 && !g.ended; year++) {
        g = advance(g, "rest");
        if (pendingCareerOffer(g)?.id === id) { game = g; break; }
      }
    }
    assert.ok(game);
    const h = harness(game), opened = [], committed = [], offer = pendingCareerOffer(game);
    Object.assign(h.context, {
      pendingCareerOffer, revision: 1, generating: false, timelineRevealing: () => false,
      openCareer: (mode) => opened.push(mode), commitChoice: (decision) => committed.push(decision),
    });
    runInContext(app.slice(app.indexOf("function appendCareerOfferCommand("), app.indexOf("// Safari does not always")), h.context);
    runInContext('appendCareerOfferCommand($("choices"))', h.context);
    const button = h.$("choices").children[0];
    assert.equal(button.type, "button");
    assert.equal(button.dataset.offer, id);
    assert.match(button.textContent, /届いた話/);
    assert.equal(button.querySelector(".command-cursor").getAttribute("aria-hidden"), "true");
    const saved = encodeSave(game);
    button.handlers.click();
    assert.equal(encodeSave(h.context.game), saved);
    if (id === "scout") {
      assert.deepEqual(opened, ["switch"]);
      const scene = validateGeneratedScene(fourReply(storyRequest(game, { mode: "career" }).context,
        { offerResponses: false }), game, { mode: "career" });
      let closed = false;
      h.$("career-dialog").close = () => { closed = true; };
      Object.assign(h.context, {
        availableChoices, decisionId, careerMode: "switch", careerGenerating: false,
        careerError: "", careerDraft: { revision: 1, scene },
        commitChoice: (decision) => {
          committed.push(decision);
          h.context.game = advanceDirection(h.context.game, decision).game;
        },
        toast: (message) => assert.fail(message),
      });
      runInContext(app.slice(app.indexOf("function takeCareerDecision("), app.indexOf('$("career-manual-toggle").addEventListener')), h.context);
      runInContext("renderCareerOffers()", h.context);
      const companies = h.$("career-offers").querySelectorAll(".career-offer-button");
      assert.equal(companies.length, 4);
      companies[0].handlers.click();
      assert.equal(closed, true);
      assert.equal(committed[0].id, "switch");
      assert.equal(h.context.game.history[game.decisions.length].employer.name, scene.options[0].decision.name);
      assert.equal(h.context.game.employer.name, scene.options[0].decision.name);
    } else {
      assert.equal(committed.length, 1);
      const journey = advanceDirection(game, committed[0]);
      assert.equal(journey.entries[0].position.rank, offer.targetRank);
      assert.equal(journey.entries[0].outcome.chance, 1);
    }
    h.context.game = advance(game, "rest");
    h.$("choices").replaceChildren();
    runInContext('appendCareerOfferCommand($("choices"))', h.context);
    assert.equal(h.$("choices").children.length, 0);
    // A detached or expired command cannot act again.
    button.handlers.click();
    assert.equal(id === "scout" ? opened.length : committed.length, 1);
  }
});
