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
        const previous = this.listeners[type];
        this.listeners[type] = previous
          ? (event) => { previous(event); return fn(event); }
          : fn;
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
    companyURLResearchRevision: 0,
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
    document: { querySelector: $ },
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
  runInContext(
    code.slice(
      code.indexOf('for (const id of [\n  "company-summary"'),
      code.indexOf("function resetCareerResearch()"),
    ),
    context,
  );
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

test("PC uses current built-in candidates without depending on an older running server catalog", async () => {
  const { $ } = await harness({
    api: async () => {
      throw Error("old server must not be called");
    },
  });
  $("company-name").value = "キンドリルジャパン株式会社";
  await $("company-search").listeners.click();
  assert.match($("research-status").textContent, /この会社で合っていますか/);
  await $("company-candidates").querySelectorAll("button")[0].listeners.click();
  assert.equal($("company-confirmed").checked, true);
  assert.match($("company-summary").value, /ITインフラ/);
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

for (const edited of ["company-url", "company-summary"]) {
  test(`editing ${edited} rejects a delayed direct research response`, async () => {
    let release, requested;
    const { $, context } = await harness({
      api: async (_path, body) => {
        requested = body.url;
        return new Promise((resolve) => { release = resolve; });
      },
    });
    $("company-url").value = "https://a.example.com";
    const loading = $("research-button").listeners.click();
    assert.equal(requested, "https://a.example.com");
    $(edited).value = edited === "company-url"
      ? "https://b.example.com"
      : "自分で確認して編集した本文";
    $(edited).listeners.input();
    const message = $("research-status").textContent;
    release({ facts: { summary: "Aの本文", sources: [{ url: requested }] } });
    await loading;
    assert.equal($("company-summary").value,
      edited === "company-summary" ? "自分で確認して編集した本文" : "");
    assert.equal($("research-status").textContent, message);
    assert.equal(context.companySources.length, 0);
    assert.equal($("company-confirmed").checked, false);
    assert.equal($("research-button").disabled, false);
  });
}

test("direct research checks the requested URL even without an input event, and applies matching responses", async () => {
  let release;
  const { $, context } = await harness({
    api: async () => new Promise((resolve) => { release = resolve; }),
  });
  $("company-url").value = "https://a.example.com";
  const stale = $("research-button").listeners.click();
  $("company-url").value = "https://b.example.com";
  release({ facts: { summary: "Aの本文", sources: [] } });
  await stale;
  assert.equal($("company-summary").value, "");
  const matching = $("research-button").listeners.click();
  release({ facts: { summary: "Bの本文", sources: [{ url: "https://b.example.com" }] } });
  await matching;
  assert.equal($("company-summary").value, "Bの本文");
  assert.equal(context.companySources[0].url, $("company-url").value);
});

test("editing the URL also invalidates a delayed accepted company candidate", async () => {
  let release;
  const { $, context } = await harness({
    api: async (path) => path.endsWith("search")
      ? { candidates: [{ name: "合成企業", url: "https://a.example.com", description: "会社", known: false }] }
      : new Promise((resolve) => { release = resolve; }),
  });
  $("company-name").value = "合成";
  await $("company-search").listeners.click();
  const candidate = $("company-candidates").querySelectorAll("button")[0];
  const loading = candidate.listeners.click();
  assert.equal(candidate.disabled, true);
  $("company-url").value = "https://b.example.com";
  $("company-url").listeners.input();
  release({ facts: { summary: "Aの本文", sources: [] } });
  await loading;
  assert.equal($("company-url").value, "https://b.example.com");
  assert.equal($("company-summary").value, "");
  assert.equal(context.companySources.length, 0);
  assert.equal(candidate.disabled, false);
  const retry = candidate.listeners.click();
  release({ facts: { summary: "選び直したAの本文", sources: [] } });
  await retry;
  assert.equal($("company-summary").value, "選び直したAの本文");
});

for (const edited of ["company-summary", "company-sector"]) {
  test(`editing ${edited} keeps already-displayed company candidates selectable`, async () => {
    const { $ } = await harness({ standalone: true });
    $("company-name").value = "キンドリルジャパン株式会社";
    await $("company-search").listeners.click();
    $(edited).value = edited === "company-summary" ? "編集中の本文" : "tech";
    $(edited).listeners.input();
    await $("company-candidates").querySelectorAll("button")[0].listeners.click();
    assert.match($("company-summary").value, /ITインフラ/);
    assert.equal($("company-confirmed").checked, true);
  });
}

test("editing during a candidate body fetch preserves the edit and re-enables the candidate for retry", async () => {
  let release;
  const { $ } = await harness({
    api: async (path) => path.endsWith("search")
      ? { candidates: [{ name: "合成企業", url: "https://a.example.com", description: "会社", known: false }] }
      : new Promise((resolve) => { release = resolve; }),
  });
  $("company-name").value = "合成";
  await $("company-search").listeners.click();
  const candidate = $("company-candidates").querySelectorAll("button")[0];
  const loading = candidate.listeners.click();
  $("company-summary").value = "編集中の本文";
  $("company-summary").listeners.input();
  release({ facts: { summary: "古い取得結果", sources: [] } });
  await loading;
  assert.equal($("company-summary").value, "編集中の本文");
  assert.equal(candidate.disabled, false);
  const retry = candidate.listeners.click();
  release({ facts: { summary: "再取得した本文", sources: [] } });
  await retry;
  assert.equal($("company-summary").value, "再取得した本文");
});
