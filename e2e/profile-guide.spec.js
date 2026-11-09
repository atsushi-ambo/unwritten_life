import { test, expect } from "@playwright/test";

test("guided quick start needs no scrolling, goes back, and starts through the shared profile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#guide-open").click();
  const guide = page.locator("#profile-guide");
  await expect(guide).toBeVisible();
  await expect(page.locator("#guide-progress")).toHaveText("1 / 1");
  await page.locator("#guide-input-age-band").selectOption("30s");
  await page.locator("#guide-input-region-quick").selectOption("city");
  await page.locator("#guide-input-job").selectOption("people");
  await page.locator("#guide-input-goal").selectOption("growth");
  await page.locator("#guide-input-tone").selectOption("realistic");
  await expect(page.locator("#guide-next")).toHaveText("この設定で物語を始める");
  expect(await guide.evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
  await page.locator("#guide-next").click();
  await expect(guide).toBeHidden();
  await expect(page.locator("#hud-age")).toHaveText("35歳");
  await expect(page.locator("#choices button")).toHaveCount(4);
});

test("guided detailed edits retain the original form and restore company controls on Escape", async ({ page }) => {
  await page.goto("/");
  await page.locator("#guide-open").click();
  await page.locator("#guide-mode").selectOption("standard");
  await page.locator("#guide-input-age").fill("34");
  await page.locator("#guide-input-municipality").fill("テスト市");
  await page.locator("#guide-input-occupation").selectOption("office");
  await page.locator("#guide-input-company").fill("合成会社");
  await expect(page.locator("#profile-guide #company-search")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#profile-guide")).toBeHidden();
  await expect(page.locator("#company-name")).toHaveValue("合成会社");
  await expect(page.locator('#profile-form [name="age"]')).toHaveValue("34");
  await expect(page.locator("#profile-form #company-search")).toBeVisible();
  expect(await page.locator("#company-search").count()).toBe(1);
});

test("speech is explicit, local by default, and late results cannot edit another step", async ({ page }) => {
  await page.addInitScript(() => {
    window.__voiceStarts = 0; window.__voiceAborts = 0;
    window.SpeechRecognition = class {
      processLocally = false;
      constructor() { window.__voice = this; }
      start() { window.__voiceStarts++; }
      abort() { window.__voiceAborts++; }
    };
  });
  await page.goto("/");
  await page.locator("#guide-open").click();
  await page.locator("#guide-mode").selectOption("standard");
  await expect(page.locator("#guide-input-municipality")).toBeVisible();
  expect(await page.evaluate(() => window.__voiceStarts)).toBe(0);
  await page.locator('[data-guide-field="municipality"]').getByRole("button", { name: "音声で入力", exact: true }).click();
  expect(await page.evaluate(() => window.__voice.processLocally)).toBe(true);
  await page.evaluate(() => window.__voice.onresult({ results: [[{ transcript: "合成テスト市" }]] }));
  await expect(page.locator("#guide-input-municipality")).toHaveValue("合成テスト市");
  await page.locator("#guide-next").click();
  await page.evaluate(() => window.__voice.onresult({ results: [[{ transcript: "遅れた結果" }]] }));
  await expect(page.locator("#municipality")).toHaveValue("合成テスト市");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__voiceAborts)).toBeGreaterThan(0);
});

test("company identification fills business, source and industry inside the guide", async ({ page }) => {
  const extraRequests = [];
  page.on("request", (r) => { if (r.url().includes("should-not-load.example")) extraRequests.push(r.url()); });
  const wikiHTML = '<img src="https://should-not-load.example/pixel"><iframe src="https://should-not-load.example/frame"></iframe><table class="infobox"><tr><th>事業内容</th><td>ITインフラの構築と運用サービスを提供する会社です。</td></tr><tr><th>外部リンク</th><td><a href="https://official.example.com/">公式</a></td></tr></table>';
  await page.route("**/api/company/search", (route) => route.fulfill({ json: { candidates: [{ name: "合成社", url: "https://official.example.com/", description: "日本の企業", directoryURL: "https://www.wikidata.org/wiki/Q123" }] } }));
  await page.route("**/api/company", (route) => route.fulfill({ json: { facts: { summary: "合成社はITインフラの構築と運用サービスを提供する会社です。", sector: "tech", industry: "services", sources: [{ url: "https://official.example.com/company", title: "合成社の会社概要", checkedAt: "2026-11-09" }] } } }));
  await page.route("**/w/api.php?**", (route) => {
    const u = new URL(route.request().url());
    return route.fulfill({ headers: { "Access-Control-Allow-Origin": "*" }, json: u.hostname === "ja.wikipedia.org" ? { parse: { text: { "*": wikiHTML } } }
      : u.searchParams.get("action") === "wbsearchentities" ? { search: [{ id: "Q123", label: "合成社" }] }
      : { entities: { Q123: { labels: { ja: { value: "合成社" } }, descriptions: { ja: { value: "日本の企業" } }, claims: {}, sitelinks: { jawiki: { title: "合成社" } } } } } });
  });
  await page.goto("/");
  await page.locator("#remember").check();
  await page.locator("#guide-open").click();
  await page.locator("#guide-mode").selectOption("standard");
  await page.locator("#guide-input-municipality").fill("テスト市");
  await page.locator("#guide-input-occupation").selectOption("office");
  await page.locator("#guide-input-company").fill("合成社");
  await page.locator("#company-search").click();
  await page.getByRole("button", { name: "この会社で合っています。情報を取得", exact: true }).click();
  await expect(page.locator("#company-summary")).toHaveValue(/ITインフラ/);
  await expect(page.locator("#industry")).toHaveValue("services");
  await expect(page.locator("#company-sector")).toHaveValue("tech");
  await expect(page.locator("#company-confirmed")).not.toBeChecked();
  await expect(page.locator("#company-sources a")).toHaveCount(1);
  await expect(page.locator("#guide-input-company")).toHaveValue("合成社");
  await page.locator("#company-confirmed").check();
  await page.locator("#guide-next").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#profile-form #company-research-panel")).toHaveCount(1);
  await expect(page.locator("#company-confirmed")).toBeChecked();
  expect(extraRequests).toEqual([]);
  await page.locator('#guide-open').click();
  await page.locator('#guide-mode').selectOption('standard');
  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-progress')).toHaveText('2 / 2');
  await page.locator('#guide-next').click();
  await expect(page.locator('#hud-age')).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('unwritten-life:v2')));
  expect(saved.profile.companyFacts.confirmed).toBe(true);
  expect(saved.profile.companyFacts.summary).toMatch(/ITインフラ/);
});

test("online speech requires permission and typing cancels an outstanding recognition", async ({ page }) => {
  await page.addInitScript(() => {
    window.__voiceStarts = 0;
    window.SpeechRecognition = class {
      constructor() { window.__voice = this; }
      start() { window.__voiceStarts++; }
      abort() {}
    };
  });
  await page.goto("/"); await page.locator("#guide-open").click();
  await page.locator("#guide-mode").selectOption("standard");
  await page.locator('[data-guide-field="municipality"]').getByRole("button", { name: "音声で入力", exact: true }).click();
  expect(await page.evaluate(() => window.__voiceStarts)).toBe(0);
  await page.locator('[data-guide-field="municipality"] .guide-online input').check();
  await page.locator('[data-guide-field="municipality"]').getByRole("button", { name: "音声で入力", exact: true }).click();
  expect(await page.evaluate(() => window.__voiceStarts)).toBe(1);
  await page.locator("#guide-input-municipality").fill("手入力した街");
  await page.evaluate(() => window.__voice.onresult({ results: [[{ transcript: "遅れた認識結果" }]] }));
  await expect(page.locator("#guide-input-municipality")).toHaveValue("手入力した街");
  await page.keyboard.press("Escape");
});

test("unsupported speech offers keyboard dictation without requesting a microphone", async ({ page }) => {
  await page.addInitScript(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  await page.goto("/"); await page.locator("#guide-open").click();
  await page.locator("#guide-mode").selectOption("standard");
  await expect(page.locator('[data-guide-field="municipality"]').getByRole("button", { name: "音声で入力", exact: true })).toBeDisabled();
  await expect(page.locator('[data-guide-field="municipality"] .guide-voice')).toContainText("OSやキーボード");
});

test("grouped work fields hide irrelevant company input and retain edits when the job changes", async ({page}) => {
 await page.goto('/'); await page.locator('#guide-open').click();
 await page.locator('#guide-mode').selectOption('standard');
 await page.locator('#guide-input-company').fill('合成社');
 await page.locator('#guide-input-occupation').selectOption('student');
 await expect(page.locator('#guide-input-company')).toBeHidden();
 await page.locator('#guide-input-occupation').selectOption('office');
 await expect(page.locator('#guide-input-company')).toHaveValue('合成社');
 await page.keyboard.press('Escape');
});

test("compact guide has one, two or three pages and preserves optional notes across modes", async ({page}) => {
 await page.goto('/'); await page.locator('#guide-open').click();
 await expect(page.locator('#guide-progress')).toHaveText('1 / 1');
 await page.locator('#guide-mode').selectOption('standard');
 await expect(page.locator('#guide-input-age')).toBeVisible();
 await expect(page.locator('#guide-input-occupation')).toBeVisible();
 await page.locator('#guide-next').click();
 await expect(page.locator('#guide-progress')).toHaveText('2 / 2');
 await page.locator('[data-guide-extra] > summary').click();
 await page.locator('#guide-input-notes').fill('架空の経験メモ');
 await page.locator('#guide-back').click();
 await page.locator('#guide-next').click();
 await expect(page.locator('[data-guide-extra] > summary')).toContainText('入力済み 1項目');
 await page.locator('#guide-mode').selectOption('advanced');
 await page.locator('#guide-next').click(); await page.locator('#guide-next').click();
 await expect(page.locator('#guide-progress')).toHaveText('3 / 3');
 await expect(page.locator('#guide-next')).toContainText('物語を始める');
});
