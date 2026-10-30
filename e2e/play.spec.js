import { test, expect } from "@playwright/test";
import { applyScene, choiceForecast, createGame, advance, pendingCareerOffer, profileInputForLevel, recordCareerReflection, encodeSave, decodeSave } from "../public/engine.js";

import { fourReply } from "../test/fixtures/ai-replies.js";
import { storyRequest } from "../public/story.js";

import { paceProfile } from "../scripts/simulate-pace.mjs";

const syntheticProfile = {
  age: 29, region: "city", job: "tech", income: 500, ai: "sometimes",
  priority: "balance", gender: "undisclosed", household: "solo",
  savings: 500, monthlyCost: 12, companyType: "small", company: "合成SI社",
};
const saveFile = (game) => ({ name: "synthetic-save.json", mimeType: "application/json", buffer: Buffer.from(encodeSave(game)) });
const quietGame = (profile = syntheticProfile) => createGame(profile, "steady", 42, 0, 0, 0, 0, 0, 0, 0, 110);
function offerGame(id) {
  let game = createGame({
    ...profileInputForLevel({}, "quick", { band: "new", region: "city" }),
    age: 35, rank: "lead", savings: 1500,
  }, "steady", id === "scout" ? 2 : 19);
  for (let year = 0; year < 12 && !game.ended; year++) {
    game = advance(game, "rest");
    if (pendingCareerOffer(game)?.id === id) return game;
  }
  throw Error(`Missing synthetic ${id}`);
}
async function finishDirection(page) {
  await page.locator("#journey-next").click();
  await expect(page.locator("#choices button").first()).toBeVisible();
}
async function expectFits(page) {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth > innerWidth,
    dialogs: [...document.querySelectorAll("dialog[open]")].some((d) => d.scrollWidth > d.clientWidth),
  }));
  expect(overflow).toEqual({ page: false, dialogs: false });
}

for (const value of ["", "200"]) test(`advanced partner income ${value || "blank"} fits 320px and persists separately`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page.locator('[data-profile-level="advanced"]').click();
  await page.locator('[name="partner"]').selectOption("partner");
  const income = page.getByRole("spinbutton", { name: "パートナーの年収（万円）" });
  await expect(income).toBeVisible();
  await expect(income).toHaveValue("");
  await expect(page.locator("#partner-income-hint")).toContainText("空欄は0万円");
  await income.fill(value);
  await expectFits(page);
  await page.locator('[data-profile-level="standard"]').click();
  // Hidden fields leave the accessibility tree, so check this one by name.
  const field = page.locator('[name="partnerIncome"]');
  await expect(field).toBeDisabled();
  await expect(field).toBeHidden();
  await page.locator('[data-profile-level="advanced"]').click();
  await expect(income).toHaveValue(value);
  await page.locator("#remember").check();
  await page.locator("#quick-start").click();
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")));
  expect(saved.profile.partnerIncome).toBe(Number(value));
  expect(saved.profile.income).toBe(500);
  expect(saved.familyFrom).toBe(0);
  expect(saved.growthFrom).toBe(0);
  expect(saved.cycleFrom).toBe(0);
  expect(saved.spendFrom).toBe(0);
  await expectFits(page);
});

test("partner income is a separate household budget line at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const game = advance(quietGame({ ...syntheticProfile, partner: "partner", partnerIncome: 200 }), "rest");
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  const year = page.locator("#journey-years .journey-year").first();
  await year.locator(".timeline-details > summary").click();
  const budget = year.locator(".budget-window");
  const row = budget.locator(".budget-list > div").filter({ hasText: "パートナー収入（手取り）" });
  await expect(row.locator("dd")).toHaveText("+152");
  // The top band shows the player's own pay (not the partner's), rounded to 10万円.
  await expect(page.locator("#hud-income")).toHaveText(`約${Math.round(game.income / 10) * 10}万円`);
  await expectFits(page);
});

test("mental leave shows sickness allowance separately from salary in the budget", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const game = advance(createGame(paceProfile(), "steady", 5819), "focus");
  expect(game.salary).toBe(0);
  expect(game.history[0].budget.sicknessAllowance).toBeGreaterThan(0);
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  const year = page.locator("#journey-years .journey-year").first();
  await year.locator(".timeline-details > summary").click();
  const budget = year.locator(".budget-window");
  await expect(budget).toContainText("傷病手当金（給与の約2/3、最長1年6か月）");
  await expect(budget).not.toContainText("労働収入（手取り）");
  // The budget lists signed amounts in 万円 (its heading says so).
  await expect(budget.locator("dd").first()).toHaveText(`+${Math.round(game.income)}`);
  await expectFits(page);
});

test("a fixed scout command opens AI company comparisons, closes without a decision and accepts a switch", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#remember").check();
  const initial = offerGame("scout");
  await page.locator("#import-save-file").setInputFiles(saveFile(initial));
  const command = page.locator('#choices [data-offer="scout"]');
  await expect(page.locator("#choices [data-choice]")).toHaveCount(4);
  await expect(command).toContainText("届いた話");
  await expect(command).toContainText("スカウトの話を聞く");
  expect(await command.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expectFits(page);
  if (isMobile) await command.tap();
  else {
    await page.locator("#choices button").first().focus();
    await page.keyboard.press("End");
    await expect(command).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(page.locator("#career-title")).toContainText("スカウト");
  const companies = page.locator("#career-offers .career-offer-button");
  await expect(companies).toHaveCount(4);
  await expect(companies.first()).toBeEnabled();
  await expectFits(page);
  await page.locator("#career-dialog [data-close]").click();
  await expect(page.locator("#career-dialog")).not.toBeVisible();
  await expect(command).toBeFocused();
  await expect(page.locator("#choices [data-choice]")).toHaveCount(4);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).decisions.length))
    .toBe(initial.decisions.length);
  await command[isMobile ? "tap" : "click"]();
  const company = await companies.first().locator("strong").textContent();
  await companies.first()[isMobile ? "tap" : "click"]();
  await expect(page.locator("#career-dialog")).not.toBeVisible();
  await finishDirection(page);
  const save = await page.evaluate(() => localStorage.getItem("unwritten-life:v2"));
  const accepted = decodeSave(save);
  expect(accepted.decisions[initial.decisions.length].id).toBe("switch");
  expect(accepted.history[initial.decisions.length].employer.name).toBe(company);
  expect(accepted.employer.name).toBe(company);
  await expect(command).toHaveCount(0);
  await expectFits(page);
});

test("a fixed promotion command accepts the offered rank; another choice lets the offer expire", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#remember").check();
  const initial = offerGame("promotionOffer"), target = pendingCareerOffer(initial).targetRank;
  await page.locator("#import-save-file").setInputFiles(saveFile(initial));
  const command = page.locator('#choices [data-offer="promotionOffer"]');
  await expect(page.locator("#choices [data-choice]")).toHaveCount(4);
  await expect(command).toContainText("打診を受ける");
  await expectFits(page);
  await command[isMobile ? "tap" : "click"]();
  await finishDirection(page);
  const accepted = decodeSave(await page.evaluate(() => localStorage.getItem("unwritten-life:v2")));
  expect(accepted.decisions[initial.decisions.length].id).toBe("promote");
  expect(accepted.history[initial.decisions.length].position.rank).toBe(target);
  expect(accepted.history[initial.decisions.length].outcome.chance).toBe(1);
  await expect(command).toHaveCount(0);
  await page.locator("#back-setup").click();
  await page.locator("#import-save-file").setInputFiles(saveFile(initial));
  await page.locator("#save-import-confirm").click();
  await page.locator('#choices [data-choice="focus"]')[isMobile ? "tap" : "click"]();
  await finishDirection(page);
  const declined = decodeSave(await page.evaluate(() => localStorage.getItem("unwritten-life:v2")));
  expect(declined.history[initial.decisions.length].position.rank).toBe(initial.position.rank);
  await expect(command).toHaveCount(0);
  await expectFits(page);
});

test("quick start uses age band and region estimates and starts with neutral family fields", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#quick-age-band")).toHaveValue("new");
  await expect(page.locator("#quick-region")).toHaveValue("city");
  await expect(page.locator("#quick-summary")).toContainText("22歳・地方の中心都市・IT・技術・研究でスタート。年収300万円・資産30万円");
  await page.locator("#quick-age-band").selectOption("20s");
  await page.locator("#quick-region").selectOption("metro");
  await expect(page.locator("#quick-summary")).toHaveText("25歳・大都市圏・IT・技術・研究でスタート。年収390万円・資産100万円など、年代と地域から決めたゲーム用の目安を使います。");
  await page.locator("#quick-job").selectOption("care");
  await expect(page.locator("#quick-summary")).toContainText("25歳・大都市圏・医療・介護・福祉でスタート。");
  await expectFits(page);
  await page.locator("#remember").check();
  await page.locator("#quick-start").click();
  await expect(page.locator("#hud-age")).toHaveText("25歳");
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).profile);
  expect([p.age, p.region, p.income, p.savings, p.monthlyCost, p.rent]).toEqual([25, "metro", 390, 100, 11, 9]);
  expect([p.household, p.partner, p.children]).toEqual(["solo", "unspecified", 0]);
  expect(p.job).toBe("care");
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

test("earlier directions fold away so only the current years and the choices stay open", async ({ page }) => {
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(quietGame()));
  await page.locator("#choices button").first().click();
  await finishDirection(page);
  await expect(page.locator("#journey-earlier")).toBeHidden();
  await page.locator("#choices button").first().click();
  await finishDirection(page);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(5);
  await expect(page.locator("#journey-earlier-summary")).toHaveText("これまでの5年を見る（2026〜2030年）");
  await expect(page.locator("#journey-earlier .journey-year").first()).toBeHidden();
  await page.locator("#journey-earlier-summary").click();
  await expect(page.locator("#journey-earlier .journey-year")).toHaveCount(5);
  await expect(page.locator("#journey-earlier .journey-year").first()).toBeVisible();
  // The duplicate career log below the choices is gone.
  await expect(page.locator("#history")).toHaveCount(0);
  await page.locator("#undo-button").click();
  await expect(page.locator("#journey-earlier")).toBeHidden();
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(5);
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
  game.careerSeen = { 0: ["発見用合成企業" + "A".repeat(40), "合成クラウド社"] };
  while (!game.ended) game = advance(game, "rest");
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  const card = page.locator("#ending-resume");
  await expect(card).toBeVisible();
  await expect(card.locator(".resume-timeline")).toContainText("合成クラウド社");
  await expect(card.locator(".career-reflections")).toContainText(line);
  await expect(card.locator(".resume-discoveries")).toContainText("この人生で出会った会社");
  await expect(card.locator(".resume-discoveries")).toContainText("発見用合成企業");
  await expect(card.locator(".resume-discoveries")).not.toContainText("合成クラウド社");
  await expect(card.locator("script")).toHaveCount(0);
  await expect(page.locator("#ending-map .career-tile")).toHaveCount(game.decisions.length);
  await page.locator("#copy-resume")[isMobile ? "tap" : "click"]();
  await expect(page.locator("#resume-copy-status")).toHaveText("コピーしました。");
  const text = await page.evaluate(() => window.__copiedResume);
  for (const expected of ["わたしの履歴書", "勤務先と役割", "合成クラウド社", "この人生で出会った会社", "発見用合成企業", line, "退職後", "キャリアマップ"])
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

for (const width of [320, 390]) test(`touch commands, inline checkpoints and year cards fit at ${width}px`, async ({ page, isMobile }) => {
  test.skip(!isMobile, "Touch interaction coverage uses the mobile projects");
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#remember").check();
  let game = quietGame({ ...syntheticProfile, age: 18 });
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
  await expect(page.locator("#hud-age")).toHaveText("29歳");
  await page.locator("#journey-next").tap();
  await expect(page.locator("#hud-age")).toHaveText("34歳");
  const checkpoint = page.locator('[data-milestone="age-30"]');
  const input = checkpoint.locator("input");
  await expect(input).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await input.tap();
  await input.fill("これからも自分のペースで学ぶ");
  await checkpoint.locator('button[type="submit"]').tap();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).reflections["age-30"]))
    .toBe("これからも自分のペースで学ぶ");
  await expect(page.locator("#choices button").first()).toBeVisible();
  const tiles = page.locator("#career-map .career-tile-button");
  await expect(tiles).toHaveCount(16);
  const layout = await tiles.evaluateAll((buttons) => buttons.map((b) => {
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }));
  expect(new Set(layout.map((r) => r.y)).size).toBeGreaterThan(1);
  expect(layout.every((r) => r.width >= 44 && r.height >= 44)).toBe(true);
  expect(await page.locator(".journey-year").last().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await tiles.last().tap();
  await expect(page.locator("#career-map .career-map-detail")).toHaveText(await tiles.last().getAttribute("aria-label"));
  await expect(tiles.last()).toHaveAttribute("aria-pressed", "true");
  // Years before the current direction fold into one tappable box.
  await page.locator("#journey-earlier-summary").tap();
  await expect(page.locator("#journey-earlier .journey-year").first()).toBeVisible();
  await expectFits(page);
});

test("inline milestones keep flowing, save an optional line, and undo a whole saved block", async ({ page }) => {
  await page.goto("/");
  await page.locator("#remember").check();
  await page.locator("#import-save-file").setInputFiles(saveFile(quietGame()));
  await page.locator("#choices button").first().click();
  await finishDirection(page);
  await expect(page.locator("#hud-age")).toHaveText("34歳");
  const checkpoint = page.locator('[data-milestone="age-30"]');
  await expect(checkpoint.locator("input")).toHaveAttribute("maxlength", "80");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expectFits(page);
  await checkpoint.locator("input").fill("余白のある仕事を続けたい");
  await checkpoint.locator('button[type="submit"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).reflections["age-30"]))
    .toBe("余白のある仕事を続けたい");
  await page.reload();
  await page.locator("#resume-button").click();
  await expect(checkpoint).toContainText("余白のある仕事を続けたい");
  await expect(checkpoint.locator("input")).toHaveCount(0);
  await page.locator("#undo-button").click();
  await expect(page.locator("#hud-age")).toHaveText("29歳");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).reflections)).toEqual({});
  await page.locator("#choices button").first().click();
  await finishDirection(page);
  // Leaving the input blank does not hold the next four directions back.
  await expect(checkpoint.locator("input")).toBeVisible();
  await expect(page.locator("#choices button")).toHaveCount(4);
  await checkpoint.getByRole("button", { name: "今は書かない" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("unwritten-life:v2")).reflections["age-30"])).toBe("");
  await expectFits(page);
});

test("five year cards reveal on the clock, support pause and speed, and overlap the next AI scene", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-10-20T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-20T00:00:01Z"));
  const requests = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/scene")) requests.push(JSON.parse(request.postData()).mode);
  });
  await page.goto("/");
  await page.locator("#remember").check();
  await page.locator("#import-save-file").setInputFiles(saveFile(quietGame({ ...syntheticProfile, age: 22 })));
  await page.locator("#choices button").first().click();
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await expect(page.locator("#hud-age")).toHaveText("22歳");
  await expect(page.locator("#progress")).toHaveJSProperty("value", 0);
  await expect(page.locator("#career-map .career-tile")).toHaveCount(0);
  // The second AI call finishes while the first year's card is still pending.
  await expect(page.locator("#choices button")).toHaveCount(4);
  await expect(page.locator("#choices")).toBeHidden();
  expect(requests).toEqual(["life", "life"]);
  await page.clock.runFor(5999);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(1);
  await expect(page.locator("#journey-years .journey-year").first()).toContainText("2026年 / 22歳");
  await expect(page.locator("#journey-years .journey-year").first()).toContainText(/年収.*純資産/);
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await expect(page.locator("#career-map .career-tile")).toHaveCount(1);
  await expect(page.locator("#progress")).toHaveJSProperty("value", 1);
  await page.locator("#timeline-pause").click();
  await expect(page.locator("#timeline-pause")).toHaveText("再開");
  await page.clock.runFor(60_000);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(1);
  await page.locator("#timeline-pause").click();
  await page.clock.runFor(6000);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(2);
  await expect(page.locator("#hud-year")).toHaveText("2027年");
  await expect(page.locator("#hud-age")).toHaveText("23歳");
  await expect(page.locator("#chapter-title")).toContainText("2027年、23歳");
  await expect(page.locator("#chapter-label")).toContainText("2年が経過");
  await expect(page.locator("#career-map .career-tile")).toHaveCount(2);
  await expect(page.locator("#progress")).toHaveJSProperty("value", 2);
  await page.locator("#timeline-speed").selectOption("2");
  await page.clock.runFor(3000);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(3);
  await page.locator("#timeline").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#timeline-pause")).toHaveText("再開");
  await page.clock.runFor(6000);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(3);
  await page.keyboard.press("Space");
  // Opening the comparison leaves the year clock running behind it.
  await page.locator("#career-compare-button").click();
  await expect(page.locator("#career-offers .career-offer-button")).toHaveCount(4);
  await page.clock.runFor(3000);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(4);
  await page.locator("#career-dialog [data-close]").click();
  await finishDirection(page);
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(5);
  await expect(page.locator("#choices button")).toHaveCount(4);
  await expect(page.locator("#timeline-controls")).toBeHidden();
  await expect(page.locator("#hud-year")).toHaveText("2031年");
  await expect(page.locator("#hud-age")).toHaveText("27歳");
  await expect(page.locator("#career-map .career-tile")).toHaveCount(5);
  await expect(page.locator("#progress")).toHaveJSProperty("value", 5);
  await expect(page.locator("#event-card")).toBeInViewport();
  expect(requests).toEqual(["life", "life", "career"]);
  expect(await page.evaluate(() => localStorage.getItem("unwritten-life:timeline-speed"))).toBe("2");
  await expectFits(page);
  await page.reload();
  await page.locator("#resume-button").click();
  await expect(page.locator("#timeline-speed")).toHaveValue("2");
  await page.locator("#undo-button").click();
  await expect(page.locator("#hud-age")).toHaveText("22歳");
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(0);
});

test("compact cards keep their full text folded and automatic following respects reflection focus", async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-10-20T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-20T00:00:01Z"));
  await page.addInitScript(() => {
    window.__timelineScrolls = [];
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      if (this.classList.contains("journey-year") || this.id === "event-card")
        window.__timelineScrolls.push({ target: this.id || this.dataset.year, behavior: options?.behavior });
      return scrollIntoView.call(this, options);
    };
  });
  await page.goto("/");
  await page.locator("#remember").check();
  await page.locator("#import-save-file").setInputFiles(saveFile(quietGame()));
  await page.locator("#choices button").first().click();
  await page.clock.runFor(6000);
  const rows = page.locator("#journey-years .journey-year");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toBeInViewport();
  expect(await page.evaluate(() => window.__timelineScrolls)).toEqual([{ target: "2026", behavior: "instant" }]);
  const input = rows.first().locator(".timeline-reflection input");
  await input.fill("入力中は読み進める位置を保つ");
  await page.clock.runFor(6000);
  await expect(rows).toHaveCount(2);
  await expect(input).toBeFocused();
  expect(await page.evaluate(() => window.__timelineScrolls.length)).toBe(1);
  await finishDirection(page);
  const original = decodeSave(await page.evaluate(() => localStorage.getItem("unwritten-life:v2")));
  for (let i = 0; i < 5; i++) {
    const row = rows.nth(i), details = row.locator(":scope > details.timeline-details");
    await expect(row.locator("details")).toHaveCount(1);
    await expect(details).not.toHaveAttribute("open");
    await expect(details.locator(":scope > summary")).toHaveText("詳しく見る");
    await expect(details.locator(".timeline-original")).toHaveText(original.history[i].episode.body);
    await expect(details.locator(".budget-window")).toContainText("家計の内訳");
    const prose = await row.evaluate((el) => [...el.children].filter((n) => n.tagName === "P" && !n.matches(".eyebrow, .timeline-direction"))
      .map((n) => ({ className: n.className, sentences: (n.textContent.match(/[^。！？\n]+[。！？]?/gu) ?? []).length })));
    expect(prose.length).toBeLessThanOrEqual(1);
    for (const paragraph of prose) {
      expect(paragraph.className).toBe("timeline-summary");
      expect(paragraph.sentences).toBeLessThanOrEqual(2);
    }
    await expect(row.locator(":scope > .timeline-direction")).toHaveCount(i === 0 ? 1 : 0);
  }
  await rows.first().locator("details > summary").click();
  await expect(rows.first().locator(".timeline-original")).toBeVisible();
  await expectFits(page);
});

test("after skipping the years a slow AI shows the waiting state then four directions", async ({ page }) => {
  let calls = 0, release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/scene", async (route) => {
    if (++calls === 2) await pending;
    await route.continue();
  });
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(quietGame()));
  await page.locator("#choices button").first().click();
  await expect.poll(() => calls).toBe(2);
  await page.locator("#journey-next").click();
  await expect(page.locator("#journey-years .journey-year")).toHaveCount(5);
  await expect(page.locator("#event-card")).toContainText("次の5年を考えています");
  await expect(page.locator("#choices button")).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expectFits(page);
  release();
  await expect(page.locator("#choices button")).toHaveCount(4);
  await expect(page.locator("#choices button").first()).toBeVisible();
  expect(calls).toBe(2);
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
  await page.locator("#import-save-file").setInputFiles(saveFile(quietGame()));
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await expect(page.locator("#chapter-label")).toContainText("あなたのキャリア");
  await expect(page.locator("#choice-title")).toHaveText("コマンド / 次の5年の方針");
  await expect(page.locator("#history")).toHaveCount(0);
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
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await expect(page.locator("#journey-next")).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("#career-map .career-tile")).toHaveCount(0);
  await finishDirection(page);
  await expect(page.locator("#hud-year")).toHaveText("2031年");
  await expect(page.locator("#career-map .career-tile")).toHaveCount(5);
  await expect(page.locator("#career-map [role=img]").first()).toHaveAttribute("aria-label", /2026年.*歳.*選択/);
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
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await finishDirection(page);
  await expect(page.locator("#hud-year")).not.toHaveText("2026年");
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
  await finishDirection(page);
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

test("career offers are generated by AI when the dialog opens and a choice advances one direction", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/scene")) requests.push(JSON.parse(request.postData()).mode);
  });
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(quietGame()));
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
  await expect(page.locator("#hud-year")).toHaveText("2026年");
  await finishDirection(page);
  await expect(page.locator("#hud-year")).toHaveText("2031年");
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


test("four cards show engine odds and low-health care commands remain usable without generated choices", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  let game = quietGame();
  while (game.health >= 29) game = advance(game, { id: "studyDaily", intent: "設計を学ぶ" });
  game = applyScene(game, fourReply(storyRequest(game).context));
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  const cards = page.locator("#choices .choice");
  await expect(cards).toHaveCount(4);
  for (const [i, option] of game.scenes[game.decisions.length].options.entries()) {
    const forecast = choiceForecast(game, option.decision ?? option.id);
    await expect(cards.nth(i).locator(".choice-odds")).toHaveText(forecast.successText);
    await expect(cards.nth(i).locator(".choice-risk")).toHaveText(forecast.riskText);
    if (forecast.chance !== null)
      await expect(cards.nth(i).locator(".choice-odds")).toHaveAttribute("data-probability", String(forecast.chance));
  }
  await expect(page.locator(".health-warning")).toContainText("ゆとりが少なく");
  for (const id of ["rest", "connect", "switch"])
    await expect(page.locator(`[data-care-action="${id}"]`)).toBeVisible();
  await expectFits(page);
  const pending = { ...game, scenes: {} };
  await page.route("**/api/scene", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "合成AI停止" }) }));
  await page.locator("#import-save-file").setInputFiles(saveFile(pending));
  await page.locator("#save-import-confirm").click();
  await expect(page.locator('[data-care-action="rest"]')).toBeVisible();
  await page.locator('[data-care-action="rest"]').click();
  await expect(page.locator("#journey-next")).toBeVisible();
});

test("ending shows turning point estimates", async ({ page }) => {
  const scene = { title: "選択", body: "次を考える", options: ["focus", "learn", "rest"].map((id) => ({ id, label: id === "focus" ? "仕事" : id === "learn" ? "学ぶ" : "休む", hint: "選ぶ" })) };
  let game = quietGame();
  while (!game.ended) game = advance(applyScene(game, scene), "focus");
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  await expect(page.locator("#ending-branches")).toContainText("人生の分岐点");
  await expect(page.locator("#ending-branches")).toContainText("当時の成功率");
  await expect(page.locator("#ending-branches")).toContainText("同じ運命で、その後5年を中立に過ごした場合の比較");
});


test("ending allows replay from a saved scene with another choice", async ({ page }) => {
  const scene = { title: "選択", body: "次を考える", options: ["focus", "learn", "rest"].map(id => ({ id, label: id === "focus" ? "仕事" : id === "learn" ? "学ぶ" : "休む", hint: "選ぶ" })) };
  let game = quietGame();
  while (!game.ended) game = advance(applyScene(game, scene), "focus");
  await page.goto("/");
  await page.locator("#import-save-file").setInputFiles(saveFile(game));
  await page.locator("#ending-branches").getByRole("button", { name: "この年から別の選択で再挑戦" }).first().click();
  await page.getByRole("dialog", { name: "やり直しの確認" }).getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(page.locator("#choices")).toContainText("学ぶ");
  await page.locator('#choices [data-choice="learn"]').click();
  await expect(page.locator("#journey-next")).toBeVisible();
});
