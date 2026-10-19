import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { createGame, advance, recordCareerReflection, encodeSave, JOBS, RANKS } from "../public/engine.js";
import { careerMap, careerRecord, careerRecordText, CAREER_STATES } from "../public/careers.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const profile = { age: 29, region: "city", job: "tech", ai: "daily", priority: "balance", gender: "undisclosed", household: "solo", companyType: "small" };

// Small DOM substitute for exercising real handlers without ports or browser
// permissions. Layout and native keyboard activation remain Playwright's job.
function harness(game) {
  let focused, copied, denied = false;
  class Element {
    constructor(tag, text = "", className = "") {
      Object.assign(this, { tag, text, className, children: [], attributes: {}, dataset: {}, handlers: {} });
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ""; this.children = children; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key]; }
    addEventListener(key, handler) { this.handlers[key] = handler; }
    focus() { focused = this; }
    select() { this.selected = true; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(""); }
    set textContent(value) { this.text = value; this.children = []; }
    all() { return this.children.flatMap((c) => [c, ...c.all()]); }
    querySelectorAll(selector) {
      return this.all().filter((c) => selector === "button:not(:disabled)" ? c.tag === "button" && !c.disabled
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
    game, node, $, JOBS, RANKS, careerMap, careerRecord, careerRecordText, CAREER_STATES,
    favoriteYears: new Set(), favoritesOnly: false, appendBudget() {},
    document: { createTextNode: (text) => node("#text", text), get activeElement() { return focused; } },
    navigator: { clipboard: { async writeText(text) { if (denied) throw Error("denied"); copied = text; } } },
  });
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
  assert.equal(h.focused, fallback);
});

test("favorites filter a newest-first log without changing a save, and preserve usable focus", () => {
  const game = advance(advance(createGame(profile), "rest"), "studyDaily"), before = encodeSave(game);
  const h = harness(game);
  runInContext("renderHistory()", h.context);
  const buttons = h.$("history").querySelectorAll(".history-favorite");
  assert.deepEqual(buttons.map((b) => b.dataset.year), [2027, 2026]);
  buttons[1].handlers.click();
  assert.equal(h.focused.dataset.year, 2026);
  h.$("history-favorites-only").handlers.click();
  assert.equal(h.$("history-favorites-only").getAttribute("aria-pressed"), "true");
  assert.deepEqual(h.$("history").querySelectorAll(".history-favorite").map((b) => b.dataset.year), [2026]);
  h.$("history").querySelector(".history-favorite").handlers.click();
  assert.equal(h.$("history").querySelectorAll(".history-favorite").length, 0);
  assert.equal(h.focused, h.$("history-favorites-only"));
  assert.equal(encodeSave(h.context.game), before);
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
