import { test, expect } from "@playwright/test";

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
  const original = await page.locator(".journey-hud").textContent();
  await expect(page.locator("#choices button")).toHaveCount(4);
  await page.locator("#choices button").first().click();
  await expect(page.locator("#hud-year")).toHaveText("2027年");
  await expect(page.locator("#journey-next")).toBeVisible();
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
