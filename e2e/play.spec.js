import { test, expect } from "@playwright/test";
import { createGame, advance, recordCareerReflection, encodeSave } from "../public/engine.js";

const syntheticProfile = {
  age: 29, region: "city", job: "tech", income: 500, ai: "sometimes",
  priority: "balance", gender: "undisclosed", household: "solo",
  savings: 500, monthlyCost: 12, companyType: "small", company: "合成SI社",
};
const saveFile = (game) => ({ name: "synthetic-save.json", mimeType: "application/json", buffer: Buffer.from(encodeSave(game)) });
async function expectFits(page) {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth > innerWidth,
    dialogs: [...document.querySelectorAll("dialog[open]")].some((d) => d.scrollWidth > d.clientWidth),
  }));
  expect(overflow).toEqual({ page: false, dialogs: false });
}

test("career log favorites filter the newest-first feed and disappear when their year is undone", async ({ page }) => {
  await page.goto("/");
  await page.locator("#demo-button").click();
  await page.locator("#choices button").first().click();
  await page.locator("#journey-next").click();
  const favorite = page.getByRole("button", { name: "2026年の記録をお気に入り", exact: true });
  await favorite.click();
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await page.locator("#history-favorites-only").click();
  await page.locator("#choices button").first().click();
  await page.locator("#journey-next").click();
  await expect(page.locator("#history .history-row")).toHaveCount(1);
  await expect(page.locator("#history")).toContainText("2026");
  await favorite.click();
  await expect(page.locator("#history .history-row")).toHaveCount(0);
  await expect(page.locator("#history-favorites-only")).toBeFocused();
  await page.locator("#history-favorites-only").click();
  await expect(page.locator("#history .history-row")).toHaveCount(2);
  await expect(page.locator("#history .history-row").first()).toContainText("2027");
  await page.getByRole("button", { name: "2027年の記録をお気に入り", exact: true }).click();
  await page.locator("#undo-button").click();
  await expect(page.locator("#history-filter-status")).toContainText("★ 0件");
  await expectFits(page);
});

test("ending resume shows the career map and milestone line, copies locally, and offers a clipboard fallback", async ({ page, baseURL }) => {
  const external = [], errors = [];
  await page.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === new URL(baseURL).origin) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      async writeText(text) {
        if (window.__clipboardDenied) throw Error("Clipboard unavailable");
        window.__copiedResume = text;
      },
    } });
  });
  let game = advance(createGame(syntheticProfile, "steady", 42), "rest");
  const line = "経験を、次の仕事へ。<script>一行</script>";
  game = recordCareerReflection(game, "age-30", line);
  game = advance(game, { id: "switch", target: "microsoft", role: "tech" });
  while (!game.ended) game = advance(game, "rest");
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  const card = page.locator("#ending-resume");
  await expect(card).toBeVisible();
  await expect(card.locator(".resume-timeline")).toContainText("Microsoft");
  await expect(card.locator(".career-reflections")).toContainText(line);
  await expect(card.locator("script")).toHaveCount(0);
  await expect(page.locator("#ending-map .career-tile")).toHaveCount(game.decisions.length);
  await page.locator("#copy-resume").click();
  await expect(page.locator("#resume-copy-status")).toHaveText("コピーしました。");
  const text = await page.evaluate(() => window.__copiedResume);
  for (const expected of ["職務経歴書", "Microsoft", line, "退職後", "キャリアマップ"])
    expect(text).toContain(expected);
  await page.evaluate(() => { window.__clipboardDenied = true; });
  await page.locator("#copy-resume").click();
  await expect(page.locator("#resume-copy-fallback")).toBeVisible();
  await expect(page.locator("#resume-copy-fallback")).toHaveValue(text);
  await expectFits(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("career milestones pause multi-year play, save one optional line, and support undo and skip", async ({ page }) => {
  await page.goto("/");
  await page.locator("#remember").check();
  await page.locator("#import-save-file").setInputFiles(saveFile(createGame(syntheticProfile)));
  await page.locator("#year-step").selectOption("10");
  await page.locator("#choices button").first().click();
  await expect(page.locator("#hud-age")).toHaveText("30歳");
  await expect(page.locator("#career-map .career-tile")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("#reflection-dialog")).toBeVisible();
  await expect(page.locator("#reflection-line")).toBeFocused();
  await expect(page.locator("#reflection-line")).toHaveAttribute("maxlength", "80");
  await expectFits(page);
  await page.locator("#reflection-line").fill("余白のある仕事を続けたい");
  await page.locator("#reflection-form button[type=submit]").click();
  await expect(page.locator("#reflection-dialog")).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).reflections["age-30"])).toBe("余白のある仕事を続けたい");
  await page.reload();
  await page.locator("#resume-button").click();
  await expect(page.locator("#reflection-dialog")).toBeHidden();
  await page.locator("#undo-button").click();
  await expect(page.locator("#hud-age")).toHaveText("29歳");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).reflections)).toEqual({});
  await page.locator("#choices button").first().click();
  await page.locator("#journey-next").click();
  await expect(page.locator("#reflection-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#reflection-dialog")).toBeHidden();
  // The dialog hides before its async close event records the skip.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).reflections["age-30"])).toBe("");
  await expectFits(page);
});

test("local play advances, undo restores state, and mobile commands fit without external traffic", async ({ page, baseURL }) => {
  const external = [], errors = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator("#demo-button").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await expect(page.locator("#chapter-label")).toContainText("あなたのキャリア");
  await expect(page.locator("#choice-title")).toHaveText("コマンド / 今年のキャリアと暮らし");
  await expect(page.locator(".journal h2")).toHaveText("これまでのキャリアと暮らし。");
  const original = await page.locator(".journey-hud").textContent();
  await expect(page.locator("#choices button")).toHaveCount(4);
  const commands = page.locator("#choices button");
  await commands.first().focus();
  await expect(commands.first().locator(".command-cursor")).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(commands.last()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(commands.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(commands.last()).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.locator("#hud-year")).toHaveText("2027年");
  await expect(page.locator("#journey-next")).toBeVisible();
  await expect(page.locator("#journey-title")).toHaveText("2026年のキャリア記録。");
  await expect(page.locator("#career-map .career-tile")).toHaveCount(1);
  await expect(page.locator("#career-map [role=img]")).toHaveAttribute("aria-label", /2026年.*歳.*選択/);
  await page.locator("#journey-next").click();
  await page.locator("#undo-button").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await expect(page.locator(".journey-hud")).toHaveText(original);
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    commands: [...document.querySelectorAll("#choices button")].map((b) => b.getBoundingClientRect().height),
    saved: Object.keys(localStorage),
  }));
  expect(layout.overflow).toBe(false);
  expect(layout.commands.every((height) => height >= 44)).toBe(true);
  expect(layout.saved).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("opt-in save resumes the same year and deletion removes the saved game", async ({ page }) => {
  await page.goto("/");
  await page.locator("#remember").check();
  await page.locator("#quick-start").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await page.locator("#choices button").first().click();
  await expect(page.locator("#hud-year")).toHaveText("2027年");
  await page.locator("#journey-next").click();
  const status = await page.locator(".journey-hud").textContent();
  await page.reload();
  await page.locator("#resume-button").click();
  await expect(page.locator(".journey-hud")).toHaveText(status);
  await page.locator("#game-delete-save").click();
  expect(await page.evaluate(() => localStorage.getItem("unwritten-life:v2"))).toBeNull();
  await page.reload();
  await expect(page.locator("#resume-banner")).toBeHidden();
});

test("save files download and restore the current game, with confirmation and opt-in storage", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator("#demo-button").click();
  await page.locator("#choices button").first().click();
  await page.locator("#journey-next").click();
  const status = await page.locator(".journey-hud").textContent();
  const downloading = page.waitForEvent("download");
  await page.locator("#game-export-save").click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^unwritten-life-save-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  expect(JSON.parse(buffer.toString()).version).toBe(2);
  const save = { name: "save.json", mimeType: "application/json", buffer };

  // Reload into an empty browser session and import without enabling storage.
  await page.reload();
  await page.locator("#import-save-file").setInputFiles(save);
  await expect(page.locator(".journey-hud")).toHaveText(status);
  expect(await page.evaluate(() => localStorage.getItem("unwritten-life:v2"))).toBeNull();
  await page.locator("#undo-button").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await page.locator("#import-save-file").setInputFiles(save);
  await expect(page.locator("#save-import-dialog")).toBeVisible();
  await page.locator("#save-import-dialog [data-close]").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await page.locator("#import-save-file").setInputFiles(save);
  await page.locator("#save-import-confirm").click();
  await expect(page.locator(".journey-hud")).toHaveText(status);

  await page.reload();
  await page.locator("#remember").check();
  await page.locator("#import-save-file").setInputFiles(save);
  await expect(page.locator(".journey-hud")).toHaveText(status);
  expect(await page.evaluate(() => localStorage.getItem("unwritten-life:v2"))).toBe(buffer.toString());
  await page.reload();
  await page.locator("#resume-button").click();
  await expect(page.locator(".journey-hud")).toHaveText(status);
  expect(errors).toEqual([]);
});

test("corrupt current saves retain the legacy backup and download the exact recovery data", async ({ page }) => {
  await page.goto("/");
  const raw = '{"version":2,"broken":"<script>救出データ</script>"';
  await page.evaluate((value) => {
    localStorage.setItem("unwritten-life:v2", value);
    localStorage.setItem("unwritten-life:v1", '{"legacy":true}');
  }, raw);
  await page.reload();
  await expect(page.locator("#legacy-banner")).toBeVisible();
  await expect(page.locator("#corrupt-save-banner")).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.locator("#export-corrupt-save").click();
  const stream = await (await downloading).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe(raw);
  expect(await page.evaluate(() => localStorage.getItem("unwritten-life:v2"))).toBe(raw);
});

test("career interests survive profile tier changes and reach the existing AI context", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-profile-level="standard"]').click();
  await page.locator(".profile-notes summary").click();
  const interests = page.locator('[name="careerInterests"]');
  await interests.fill("事業会社のAI推進、外資SaaS");
  await page.locator('[data-profile-level="quick"]').click();
  await expect(interests).toBeHidden();
  await page.locator('[data-profile-level="advanced"]').click();
  await expect(interests).toHaveValue("事業会社のAI推進、外資SaaS");
  await page.locator('[data-profile-level="standard"]').click();
  await expect(interests).toHaveValue("事業会社のAI推進、外資SaaS");
  await page.locator("#quick-start").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await page.locator("#career-compare-button").click();
  await page.locator("#career-exchange").click();
  await expect(page.locator("#exchange-prompt")).toHaveValue(/careerInterests/);
  // Career offers get one interest item per year, never the whole list.
  await expect(page.locator("#exchange-prompt")).toHaveValue(/"careerInterests":"(?:事業会社のAI推進|外資SaaS)"/);
});

test("rule career fallback opens by keyboard and remains usable without AI", async ({ page }) => {
  await page.goto("/");
  await page.locator("#demo-button").click();
  await page.locator("#career-compare-button").click();
  await expect(page.locator("#career-generate")).toBeVisible();
  await expect(page.locator("#career-exchange")).toBeVisible();
  const fallback = page.locator("#career-rule-fallback");
  const cards = fallback.locator(".career-offer-button");
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toBeHidden();
  const summary = fallback.locator(":scope > summary");
  await expect(summary).toHaveText("AIを使わずに選ぶ（ルールで用意した仮の候補）");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(cards.first()).toBeVisible();
  await cards.first().click();
  await expect(page.locator("#career-dialog")).toBeHidden();
  await expect(page.locator("#hud-year")).toHaveText("2027年");
});
