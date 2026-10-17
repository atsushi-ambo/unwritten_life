import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import { makeDirectorySearch } from "../public/careers.js";
import {
  createGame,
  optionalProfileInputs,
  profileInputForLevel,
  profileStoryContext,
} from "../public/engine.js";

// Execute the actual UI handler with a minimal DOM adapter. No browser storage,
// personal profiles, arbitrary page fetches or paid AI requests are involved.
async function harness({ standalone = false, api } = {}) {
  const elements = new Map();
  function node(tag, text = "") {
    return {
      tag,
      textContent: text,
      value: "",
      checked: false,
      hidden: false,
      children: [],
      listeners: {},
      append(...items) {
        this.children.push(...items);
      },
      replaceChildren(...items) {
        this.children = items;
      },
      addEventListener(type, fn) {
        this.listeners[type] = fn;
      },
      querySelectorAll(tag) {
        return this.children.flatMap((c) => [
          ...(c.tag === tag ? [c] : []),
          ...c.querySelectorAll(tag),
        ]);
      },
    };
  }
  const $ = (id) => {
    if (!elements.has(id)) elements.set(id, node("div"));
    return elements.get(id);
  };
  const context = createContext({
    $,
    node,
    URL,
    Date,
    Boolean,
    standalone,
    hosted: false,
    profileLevel: "standard",
    companyResearchRevision: 0,
    careerResearchRevision: 0,
    companySources: [],
    careerSources: [],
    api,
    makeDirectorySearch,
    browserDirectoryText: async () => {
      throw Error("unexpected network");
    },
    sourceLinks: (el, sources) =>
      el.replaceChildren(...sources.map((s) => node("a", s.url))),
    renderCareer() {},
    updateBudget() {},
  });
  const code = await readFile(
    new URL("../public/app.js", import.meta.url),
    "utf8",
  );
  runInContext(
    code.slice(
      code.indexOf("function setupNameSearch("),
      code.indexOf("setupNameSearch();"),
    ),
    context,
  );
  runInContext("setupNameSearch(); setupNameSearch(true);", context);
  return { $, context };
}

test("one company candidate waits for acceptance; reviewed information then reaches the story", async () => {
  const { $, context } = await harness({ standalone: true });
  $("company-name").value = "キンドリルジャバン";
  await $("company-search").listeners.click();
  assert.match($("research-status").textContent, /この会社で合っていますか/);
  assert.equal($("company-summary").value, "");
  assert.equal($("company-confirmed").checked, false);
  const buttons = $("company-candidates").querySelectorAll("button");
  assert.equal(buttons.length, 1);
  await buttons[0].listeners.click();
  assert.equal($("company-name").value, "キンドリルジャパン株式会社");
  assert.match($("company-summary").value, /ITインフラ/);
  assert.equal($("company-confirmed").checked, true);
  const game = createGame(
    optionalProfileInputs({
      ...profileInputForLevel({}, "standard"),
      company: $("company-name").value,
      companyFacts: {
        summary: $("company-summary").value,
        sector: $("company-sector").value,
        confirmed: $("company-confirmed").checked,
        sources: context.companySources,
      },
    }),
  );
  assert.ok(
    profileStoryContext(game).threads.some(
      (t) => t.id === "company" && /キンドリル/.test(t.detail),
    ),
  );
});

test("official body acquisition only follows explicit acceptance and still requires content review", async () => {
  const calls = [];
  const { $ } = await harness({
    api: async (path) => {
      calls.push(path);
      return path.endsWith("search")
        ? {
            candidates: [
              {
                name: "合成企業",
                url: "https://official.example.com/about",
                description: "日本の会社",
                known: false,
              },
            ],
          }
        : {
            facts: {
              summary: "合成の公式本文",
              sources: [
                {
                  url: "https://official.example.com/about",
                  checkedAt: "2026-10-17",
                },
              ],
            },
          };
    },
  });
  $("company-name").value = "合成";
  await $("company-search").listeners.click();
  assert.deepEqual(calls, ["/api/company/search"]);
  await $("company-candidates").querySelectorAll("button")[0].listeners.click();
  assert.deepEqual(calls, ["/api/company/search", "/api/company"]);
  assert.equal($("company-summary").value, "合成の公式本文");
  assert.equal($("company-confirmed").checked, false);
  assert.match($("research-status").textContent, /チェック/);
});

test("changing a company invalidates old candidates and delayed page responses", async () => {
  let release,
    pageCalls = 0;
  const { $, context } = await harness({
    api: async (path) => {
      if (path.endsWith("search"))
        return {
          candidates: [
            {
              name: "合成企業",
              url: "https://official.example.com",
              description: "日本の会社",
              known: false,
            },
          ],
        };
      pageCalls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  $("company-name").value = "合成";
  await $("company-search").listeners.click();
  const accept = $("company-candidates").querySelectorAll("button")[0];
  $("company-name").value = "別の会社";
  await accept.listeners.click();
  assert.equal(pageCalls, 0);
  $("company-name").value = "合成";
  const loading = accept.listeners.click();
  assert.equal(pageCalls, 1);
  context.companyResearchRevision++;
  $("company-name").value = "別の会社";
  release({ facts: { summary: "前の会社の本文", sources: [] } });
  await loading;
  assert.equal($("company-name").value, "別の会社");
  assert.equal($("company-summary").value, "");
  assert.equal($("company-confirmed").checked, false);
});

test("a failed page fetch keeps the candidate actionable for a retry", async () => {
  let pages = 0;
  const { $ } = await harness({
    api: async (path) => {
      if (path.endsWith("search"))
        return {
          candidates: [
            {
              name: "合成企業",
              url: "https://official.example.com",
              description: "日本の会社",
              known: false,
            },
          ],
        };
      if (++pages === 1) throw Error("接続に失敗");
      return { facts: { summary: "再取得した本文", sources: [] } };
    },
  });
  $("company-name").value = "合成";
  await $("company-search").listeners.click();
  const accept = $("company-candidates").querySelectorAll("button")[0];
  await accept.listeners.click();
  assert.match($("research-status").textContent, /接続に失敗/);
  assert.equal(accept.disabled, false);
  await accept.listeners.click();
  assert.equal($("company-summary").value, "再取得した本文");
});
