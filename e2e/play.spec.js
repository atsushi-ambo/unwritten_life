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

test("quick start uses age band and region estimates and starts with neutral family fields", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#quick-age-band")).toHaveValue("new");
  await expect(page.locator("#quick-region")).toHaveValue("city");
  await expect(page.locator("#quick-summary")).toContainText("22歳・地方の中心都市でスタート。年収300万円・資産30万円");
  await page.locator("#quick-age-band").selectOption("20s");
  await page.locator("#quick-region").selectOption("metro");
  await expect(page.locator("#quick-summary")).toHaveText("25歳・大都市圏でスタート。年収390万円・資産100万円など、年代と地域から決めたゲーム用の目安を使います。");
  await expectFits(page);
  await page.locator("#remember").check();
  await page.locator("#quick-start").click();
  await expect(page.locator("#hud-age")).toHaveText("25歳");
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).profile);
  expect([p.age, p.region, p.income, p.savings, p.monthlyCost, p.rent]).toEqual([25, "metro", 390, 100, 11, 9]);
  expect([p.household, p.partner, p.children]).toEqual(["solo", "unspecified", 0]);
  await expectFits(page);
});

test("detailed municipality inference can be revealed, overridden, and recomputed on a new municipality", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-profile-level="standard"]').click();
  const municipality = page.locator("#municipality"), region = page.locator("#region");
  await expect(region).toBeHidden();
  await expect(page.locator("#region-inference")).toContainText("市区町村が未入力のため、家賃・生活費は「地方の中心都市」の目安で計算します");
  await municipality.fill("埼玉県久喜市");
  await expect(region).toHaveValue("metro");
  await expect(region).toBeHidden();
  await expect(region).toBeEnabled();
  await expect(page.locator("#region-inference")).toContainText("家賃・生活費は「大都市圏」の目安で計算します");
  await expect(page.locator("#budget-summary")).toContainText("生活費 15.5万円/月 ＋ 家賃 9万円/月");
  await expectFits(page);
  await page.getByRole("button", { name: "変更", exact: true }).click();
  await expect(region).toBeVisible();
  await expect(region).toBeFocused();
  await region.selectOption("rural");
  await expect(page.locator("#region-inference")).toContainText("地方の市町村");
  await page.locator('[data-profile-level="quick"]').click();
  await expect(region).toBeDisabled();
  await page.locator('[data-profile-level="standard"]').click();
  await expect(region).toBeVisible();
  await expect(region).toHaveValue("rural");
  await municipality.fill("宮城県仙台市");
  await expect(region).toHaveValue("city");
  await expect(region).toBeVisible();
  await municipality.fill("どこか");
  await expect(region).toBeVisible();
  await expect(region).toHaveValue("city");
  await expect(page.locator("#region-inference")).toContainText("市区町村から判定できないため");
  await municipality.fill("");
  await expect(region).toBeVisible();
  await municipality.fill("埼玉県久喜市");
  await expect(region).toHaveValue("metro");
  await expect(region).toBeVisible();
  await page.locator("#remember").check();
  await page.locator("#quick-start").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).profile);
  expect([p.region, p.municipality, p.monthlyCost, p.rent]).toEqual(["metro", "埼玉県久喜市", 15.5, 9]);
});

test("an inferred region submits while hidden and keeps advanced financial entries", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-profile-level="advanced"]').click();
  await page.locator("#monthly-cost").fill("27.3");
  await page.locator('[name="rent"]').fill("8.1");
  await page.locator("#municipality").fill("長野県軽井沢町");
  await expect(page.locator("#region")).toBeHidden();
  await expect(page.locator("#region")).toHaveValue("rural");
  await page.locator("#municipality").fill("埼玉県久喜市");
  await expect(page.locator("#region")).toBeHidden();
  await expect(page.locator("#region")).toHaveValue("metro");
  await expect(page.locator("#monthly-cost")).toHaveValue("27.3");
  await expect(page.locator('[name="rent"]')).toHaveValue("8.1");
  await expectFits(page);
  await page.locator("#remember").check();
  await page.locator("#quick-start").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).profile);
  expect([p.region, p.municipality, p.monthlyCost, p.rent]).toEqual(["metro", "埼玉県久喜市", 27.3, 8.1]);
});

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

test("ending resume shows the career map and milestone line, copies locally, and offers a clipboard fallback", async ({ page, baseURL, isMobile }) => {
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
  game = advance(game, { id: "switch", target: "custom", name: "合成クラウド社", role: "tech", companyType: "unknown", facts: null });
  while (!game.ended) game = advance(game, "rest");
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  const card = page.locator("#ending-resume");
  await expect(card).toBeVisible();
  await expect(card.locator(".resume-timeline")).toContainText("合成クラウド社");
  await expect(card.locator(".career-reflections")).toContainText(line);
  await expect(card.locator("script")).toHaveCount(0);
  await expect(page.locator("#ending-map .career-tile")).toHaveCount(game.decisions.length);
  await page.locator("#copy-resume")[isMobile ? "tap" : "click"]();
  await expect(page.locator("#resume-copy-status")).toHaveText("コピーしました。");
  const text = await page.evaluate(() => window.__copiedResume);
  for (const expected of ["職務経歴書", "合成クラウド社", line, "退職後", "キャリアマップ"])
    expect(text).toContain(expected);
  await page.evaluate(() => { window.__clipboardDenied = true; });
  await page.locator("#copy-resume")[isMobile ? "tap" : "click"]();
  await expect(page.locator("#resume-copy-fallback")).toBeVisible();
  await expect(page.locator("#resume-copy-fallback")).toHaveValue(text);
  await expect(page.locator("#resume-copy-fallback")).toBeFocused();
  expect(await page.locator("#resume-copy-fallback").evaluate((el) => [el.selectionStart, el.selectionEnd, el.readOnly]))
    .toEqual([0, text.length, true]);
  // Clipboard API can be absent, as well as present but denied.
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
  await page.locator("#copy-resume")[isMobile ? "tap" : "click"]();
  await expect(page.locator("#resume-copy-fallback")).toHaveValue(text);
  await expectFits(page);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [320, 390]) test(`touch commands, map labels and checkpoint submission fit at ${width}px`, async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch interaction coverage uses the mobile projects");
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#remember").check();
  let game = createGame({ ...syntheticProfile, age: 18 }, "steady", 42);
  while (game.age < 29) game = advance(game, "rest");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  await expectFits(page);
  const commands = page.locator("#choices button");
  await expect(commands).toHaveCount(4);
  const sizes = await commands.evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height));
  expect(sizes.every((height) => height >= 44)).toBe(true);
  await page.evaluate(() => {
    document.addEventListener("pointerdown", (event) => {
      const button = event.target.closest("#choices .choice");
      if (button) window.__tappedCommand = {
        active: button.dataset.active,
        cursor: getComputedStyle(button.querySelector(".command-cursor")).visibility,
      };
    });
  });
  await commands.first().tap();
  expect(await page.evaluate(() => window.__tappedCommand)).toEqual({ active: "true", cursor: "visible" });
  await expect(page.locator("#hud-age")).toHaveText("30歳");
  await page.locator("#journey-next").tap();
  const dialog = page.locator("#reflection-dialog"), input = page.locator("#reflection-line");
  await expect(dialog).toBeVisible();
  await input.tap();
  await input.fill("これからも自分のペースで学ぶ");
  // Playwright does not open the native iOS keyboard. Shrink only the visual
  // viewport (not the layout viewport), matching its important layout effect.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, value: 380 });
    Object.defineProperty(window.visualViewport, "offsetTop", { configurable: true, value: 24 });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  const visible = await page.evaluate(() => {
    const input = document.querySelector("#reflection-line").getBoundingClientRect();
    const submit = document.querySelector("#reflection-form button[type=submit]").getBoundingClientRect();
    return [input, submit].every((r) => r.top >= 24 && r.bottom <= 404);
  });
  expect(visible).toBe(true);
  await expect(input).toBeFocused();
  await page.locator("#reflection-form button[type=submit]").tap();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).reflections["age-30"]))
    .toBe("これからも自分のペースで学ぶ");
  const tiles = page.locator("#career-map .career-tile-button");
  await expect(tiles).toHaveCount(12);
  const layout = await tiles.evaluateAll((buttons) => buttons.map((b) => {
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  expect(new Set(layout.map((r) => r.y)).size).toBeGreaterThan(1);
  expect(layout.every((r) => r.width >= 44 && r.height >= 44)).toBe(true);
  await tiles.last().tap();
  await expect(page.locator("#career-map .career-map-detail")).toHaveText(await tiles.last().getAttribute("aria-label"));
  await expect(tiles.last()).toHaveAttribute("aria-pressed", "true");
  const favorite = page.locator("#history .history-favorite").first();
  await favorite.tap();
  await expect(page.locator("#history .history-favorite").first()).toHaveAttribute("aria-pressed", "true");
  await expectFits(page);
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

test("career interests survive profile tier changes and reach the AI context", async ({ page }) => {
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
  await expect(page.locator("#context-preview")).toContainText("事業会社のAI推進、外資SaaS");
});

test("career offers are generated by AI when the dialog opens and a choice advances one year", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/scene")) requests.push(JSON.parse(request.postData()).mode);
  });
  await page.goto("/");
  await page.locator("#demo-button").click();
  await expect(page.locator("#choices button")).toHaveCount(4);
  await page.locator("#career-compare-button").click();
  const cards = page.locator("#career-offers .career-offer-button");
  await expect(cards).toHaveCount(4);
  await expect(page.locator("#career-generation-status")).toContainText("AIが作った4択");
  await expect(page.locator("#career-rule-fallback")).toHaveCount(0);
  await expect(page.locator("#career-exchange")).toHaveCount(0);
  expect(requests).toEqual(["life", "career"]);
  await expectFits(page);
  await cards.first().click();
  await expect(page.locator("#career-dialog")).toBeHidden();
  await expect(page.locator("#hud-year")).toHaveText("2027年");
});

test("safe areas protect edge content in portrait and landscape while retaining normal spacing", async ({ page }) => {
  for (const width of [390, 640, 844, 1024, 1440]) {
    await page.setViewportSize({ width, height: 390 });
    await page.goto("/");
    const result = await page.evaluate(() => {
      document.querySelector("#notice").textContent = "Synthetic notice";
      const edges = [
        ...[...document.querySelectorAll(".wrap, .mobile-edition-banner, dialog, #notice")]
          .map((element) => ({ element, sides: ["Left", "Right"] })),
        ...[...document.querySelectorAll("body, dialog")]
          .map((element) => ({ element, sides: ["Top", "Bottom"] })),
        { element: document.querySelector(".journey-footer"), sides: ["Bottom"] },
      ];
      const read = () => edges.flatMap(({ element, sides }) => sides.map((side) => ({
        target: element.id || element.className || element.tagName,
        side, padding: parseFloat(getComputedStyle(element)[`padding${side}`]),
      })));
      const normal = read();
      // Browsers do not emulate a physical notch. Supply asymmetric insets to
      // the real stylesheet, keeping its cascade and media queries intact.
      const insets = { Left: 59, Right: 47, Top: 44, Bottom: 34 };
      const substitute = (rules) => {
        for (const rule of rules) {
          if (rule.cssRules) substitute(rule.cssRules);
          if (rule.style) rule.style.cssText = rule.style.cssText.replace(
            /env\(safe-area-inset-(left|right|top|bottom)\)/g,
            (_, side) => `${insets[side[0].toUpperCase() + side.slice(1)]}px`,
          );
        }
      };
      for (const sheet of document.styleSheets) substitute(sheet.cssRules);
      return { normal, protected: read(), insets, noticeBottom: parseFloat(getComputedStyle(document.querySelector("#notice")).bottom) };
    });
    expect(result.normal.find((edge) => edge.target.includes("wrap")).padding).toBe(width <= 640 ? 16 : width <= 960 ? 28 : 48);
    expect(result.protected).toEqual(result.normal.map((edge) => ({
      ...edge, padding: Math.max(edge.padding, result.insets[edge.side]),
    })));
    expect(result.noticeBottom).toBeGreaterThanOrEqual(result.insets.Bottom);
    await expectFits(page);
  }
});

test("without a connected AI the game asks for one before it starts", async ({ page, baseURL }) => {
  test.skip(new URL(baseURL).port !== "4397", "The phone edition has a fixed OpenAI connection.");
  await page.route("**/api/status", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, ai: { ...data.ai, ready: false } } });
  });
  await page.goto("/");
  await expect(page.locator("#ai-setup-status")).toContainText("AIを接続してください");
  await page.locator("#demo-button").click();
  await expect(page.locator("#ai-dialog")).toBeVisible();
  await expect(page.locator("#ai-required-note")).toBeVisible();
  await expect(page.locator("#ai-provider option[value=disabled]")).toHaveCount(0);
  await expect(page.locator("#game")).toBeHidden();
  await expect(page.locator("#ai-type-local")).not.toBeChecked();
  await expect(page.locator("#ai-submit")).toBeDisabled();
  await page.unroute("**/api/status");
  await page.locator("#ai-type-local").check();
  await page.locator("#ai-provider").selectOption("ollama");
  await expect(page.locator("#ai-local-model option")).toHaveCount(1);
  await page.locator("#ai-form button[type=submit]").click();
  await expect(page.locator("#ai-dialog")).toBeHidden();
  await expect(page.locator("#game")).toBeVisible();
  await expect(page.locator("#choices button")).toHaveCount(4);
});
