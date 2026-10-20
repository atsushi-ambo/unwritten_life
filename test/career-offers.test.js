import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, advanceDirection, advanceYears, incidentAt, incidentRates,
  pendingCareerOffer, onMentalLeave, availableChoices, validateGeneratedScene,
  encodeSave, decodeSave, replay, compareWorlds, MAX_AGE, RANKS, applyScene,
} from "../public/engine.js";
import { storyRequest, SCENE_STYLE, CAREER_DISCOVERY, groundScene } from "../public/story.js";
import { simulationProfile } from "../scripts/simulate-life-realism.mjs";
import { measureCareerVariety, measurePromotionOffers } from "../scripts/simulate-career-offers.mjs";
import { fourReply, readyAI, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const start = (seed = 42, extra = {}) => createGame(simulationProfile({ age: 35, ...extra }), "steady", seed);
const seasoned = (seed, extra = {}) => {
  const g = start(seed, extra);
  return { ...g, position: { ...g.position, since: g.year - 4, joined: g.year - 4 } };
};
const replayGame = (g, decisions = g.decisions) => replay(g.profile, g.scenario, g.seed,
  decisions, g.scenes, false, g.dynamicFrom, g.worldFrom, g.retirementFrom,
  g.careLeaveSalaryFrom, g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom,
  g.incidentFrom, g.careerPathFrom, g.careerEndFrom, g.payRealismFrom,
  g.lifeRealismFrom, g.offersFrom, decisions.length === g.decisions.length ? g.directionBlocks : undefined);
const within = (n, lo, hi, label) => assert.ok(n >= lo && n <= hi, `${label}: ${n}`);
function findIncident(id, make = start, predicate = () => true) {
  for (let seed = 1; seed < 30000; seed++) {
    const g = make(seed), incident = incidentAt(g, "focus");
    if (incident?.id === id && predicate(incident, g)) return g;
  }
  assert.fail(`no seed for ${id}`);
}
// A reproducible actual play (no mutated tenure) for save/cache/acceptance tests.
function promotionGame(rank = "staff") {
  for (let seed = 1; seed < 3000; seed++) {
    let g = start(seed, { rank });
    for (let y = 0; y < 12 && !g.ended; y++) {
      g = advance(g, "rest");
      if (pendingCareerOffer(g)?.id === "promotionOffer") return g;
    }
  }
  assert.fail("no promotion offer");
}

test("scout rates peak in the thirties, reflect skill/success/market, and seekers get exploratory contact", () => {
  const rate = (g) => incidentRates(g, "rest").scout;
  const g = seasoned(42);
  assert.ok(rate(g) > rate({ ...g, age: 25 }));
  assert.ok(rate(g) > rate({ ...g, age: 46 }));
  assert.ok(rate({ ...g, age: 46 }) > rate({ ...g, age: 57 }));
  assert.ok(rate({ ...g, skill: 85 }) > rate({ ...g, skill: 20 }));
  assert.ok(rate({ ...g, history: [{ outcome: { kind: "success" } }] }) > rate(g));
  const marketRates = Array.from({ length: 300 }, (_, n) => rate(seasoned(n)));
  assert.ok(Math.max(...marketRates) > Math.min(...marketRates) * 1.1);
  const seeking = { ...g, employer: { ...g.employer, kind: "seeking" } };
  assert.ok(rate(seeking) > rate(g));
  const s = findIncident("scout", (seed) => ({ ...start(seed), employer: { ...g.employer, kind: "seeking" } }));
  assert.equal(incidentAt(s, "focus").quality, "exploratory");
  const seen = { scout: 0, promotionOffer: 0, mentalLeave: 0 };
  for (let seed = 1; seed <= 20000; seed++) {
    const event = incidentAt(seasoned(seed), "rest");
    if (event?.id === "scout") seen.scout++;
    if (event?.id === "promotionOffer") seen.promotionOffer++;
    if (event?.effects.mentalLeave) seen.mentalLeave++;
  }
  within(seen.scout / 20000, 0.05, 0.1, "annual scout");
  within(seen.promotionOffer / 20000, 0.009, 0.025, "annual staff offer");
  within(seen.mentalLeave / 20000, 0.002, 0.009, "neutral mental leave");
});

test("promotion offers need stage and employer tenure; senior seats are scarce and success raises the rate", () => {
  const g = seasoned(5), rate = (x) => incidentRates(x, "focus").promotionOffer ?? 0;
  assert.equal(rate(start(5)), 0);
  assert.equal(rate({ ...g, position: { ...g.position, since: g.year - 2 } }), 0);
  assert.equal(rate({ ...g, position: { ...g.position, joined: g.year - 1 } }), 0);
  assert.equal(incidentRates(g, "switch").promotionOffer, undefined);
  assert.equal(incidentRates(g, "focus", g.employer, { promotion: "lead" }).promotionOffer, undefined);
  assert.equal(rate({ ...g, employer: { ...g.employer, kind: "seeking" } }), 0);
  assert.equal(rate({ ...g, retired: true }), 0);
  assert.equal(rate({ ...g, age: g.profile.retirementAge - 1 }), 0);
  assert.equal(incidentRates({ ...g, age: g.profile.retirementAge - 1 }, "focus").scout, undefined);
  assert.equal(rate(seasoned(5, { rank: "director" })), 0);
  assert.ok(rate(g) > rate(seasoned(5, { rank: "lead" })));
  assert.ok(rate(seasoned(5, { rank: "lead" })) > rate(seasoned(5, { rank: "manager" })));
  assert.ok(rate({ ...g, skill: 85, history: [{ outcome: { kind: "success" } }] }) > rate(g));
});

test("receiving/declining scouts changes no money; directions pause and the next scene must answer by a named switch", () => {
  const g = findIncident("scout"), heard = advance(g, "focus");
  const quiet = advance({ ...g, incidentFrom: MAX_AGE }, "focus");
  for (const key of ["cash", "income", "salary", "debt", "investments"]) assert.equal(heard[key], quiet[key], key);
  const declined = advance(heard, "rest"), noOffer = advance({ ...heard,
    history: heard.history.map((h) => ({ ...h, incident: undefined })) }, "rest");
  for (const key of ["cash", "income", "salary"]) assert.equal(declined[key], noOffer[key], key);
  assert.notEqual(pendingCareerOffer(declined), pendingCareerOffer(heard));
  for (const journey of [advanceDirection(g, "focus"), advanceYears(g, "focus", 5)]) assert.equal(journey.entries.length, 1);
  const request = storyRequest(heard), scene = fourReply(request.context);
  assert.equal(request.context.careerOffer.id, "scout");
  assert.equal(request.context.yearsSincePreviousDecision.at(-1).incident.id, "scout");
  validateGeneratedScene(scene, heard);
  assert.throws(() => validateGeneratedScene({ ...scene, body: "今の会社で働き続ける。" }, heard));
  assert.throws(() => validateGeneratedScene({ ...scene, options: fourReply(storyRequest(g).context).options }, heard));
  const accepted = advance(heard, scene.options.find((o) => o.id === "switch").decision);
  assert.equal(accepted.employer.name, "合成クラウド社");
  assert.deepEqual(decodeSave(encodeSave(accepted)), accepted);
  const two = structuredClone(scene);
  two.options[2] = { ...two.options[3], decision: { ...two.options[3].decision, name: "合成別社" } };
  validateGeneratedScene(two, heard);
  assert.throws(() => validateGeneratedScene(two, g));
  const future = structuredClone(scene);
  future.options[3].decision.candidateKind = "fictional";
  assert.throws(() => validateGeneratedScene(future, heard));
});

test("a recorded promotion can be accepted once with certainty or declined without losing the current role", () => {
  for (const rank of ["staff", "lead", "manager", "specialist"]) {
    const g = promotionGame(rank), offer = pendingCareerOffer(g), request = storyRequest(g, { mode: "career" });
    assert.equal(request.context.generationMode, "life");
    const scene = fourReply(request.context);
    validateGeneratedScene(scene, g, { mode: "career" });
    const option = scene.options.find((o) => o.id === "promote");
    const accepted = advance(g, option.decision);
    assert.equal(accepted.position.rank, offer.targetRank);
    assert.equal(accepted.history.at(-1).outcome.chance, 1);
    if (rank === "lead") {
      const otherTrack = offer.targetRank === "manager" ? "specialist" : "manager";
      const other = advance(g, { id: "promote", track: otherTrack, intent: "打診とは別の道を狙う" });
      assert.ok(other.history.at(-1).outcome.chance < 1);
    }
    const declined = advance(g, "rest");
    assert.equal(declined.position.rank, rank);
    assert.notEqual(pendingCareerOffer(declined), offer);
    assert.deepEqual(decodeSave(encodeSave(accepted)), accepted);
    assert.deepEqual(replayGame(accepted), accepted);
    const missing = structuredClone(scene);
    missing.options[3] = { id: "connect", label: "人と会う", hint: "時間を使う", reason: "相談", decision: { id: "connect", intent: "相談する" } };
    assert.throws(() => validateGeneratedScene(missing, g));
    assert.throws(() => validateGeneratedScene({ ...scene, options: scene.options.map((o) => o.id === "focus" ? missing.options[3] : o) }, g));
    assert.throws(() => validateGeneratedScene({ ...scene, body: "会社に残って次の仕事を考える。" }, g));
    assert.equal(pendingCareerOffer(replayGame(accepted, g.decisions)).targetRank, offer.targetRank);
  }
});

test("unrecorded offers are rejected and discovery guidance reaches both scene modes next to the style rules", () => {
  const g = start(), reply = fourReply(storyRequest(g).context);
  for (const body of ["スカウトの連絡が来た。", "上司から昇進の打診があった。"])
    assert.throws(() => validateGeneratedScene({ ...reply, body }, g));
  for (const mode of ["life", "career"]) {
    const system = storyRequest(g, { mode }).messages[0].content;
    assert.ok(system.includes(SCENE_STYLE + CAREER_DISCOVERY));
    for (const text of ["こんな会社あるんだ", "こんな方法もあるのか", "本人が入力した経験", "社内公募", "出向", "大学院", "記録にないスカウト", "2036"])
      assert.ok(system.includes(text), text);
    // The shared prompt never carries one player's field as the example.
    for (const text of ["Forward Deployed", "SRE", "IaC"]) assert.ok(!system.includes(text), text);
  }
  const bad = { ...reply, options: reply.options.map((o, i) => i === 3 ? { ...o, id: "studyDaily", decision: { id: "studyDaily", intent: "学ぶ" } } : o) };
  assert.throws(() => validateGeneratedScene(bad, g));
  const business = { ...reply, options: [reply.options[1], reply.options[2],
    { id: "startup", label: "事業を始める", hint: "費用", reason: "経験", decision: { id: "startup", venture: "ai", name: "合成事業" } },
    { id: "explore", label: "副業を試す", hint: "時間", reason: "経験", decision: { id: "explore", intent: "試す" } }] };
  assert.throws(() => validateGeneratedScene(business, g));
});

test("friction and mental leave reflect low reserves, transitions and repeated work; supportive teams reduce rates", () => {
  const g = seasoned(9), rates = (x, action = "rest") => incidentRates(x, action);
  const heavy = { ...g, health: 25, history: Array.from({ length: 3 }, () => ({ choice: "focus" })) };
  const promoted = { ...g, history: [{ outcome: { promotion: "lead" } }] };
  const moved = { ...g, history: [{ choice: "switch" }] };
  const supported = { ...heavy, history: [...heavy.history.slice(0, 2), { choice: "focus", incident: { id: "goodTeam" } }] };
  for (const id of ["difficultBoss", "harassment", "burnout"]) {
    assert.ok(rates(heavy, "focus")[id] > rates(g)[id], id);
    assert.ok(rates(promoted)[id] > rates(g)[id], id);
    assert.ok(rates(moved)[id] > rates(g)[id], id);
    assert.ok(rates(supported, "focus")[id] < rates(heavy, "focus")[id], id);
  }
});

test("mental leave can continue or recover in later years, without stacking pay cuts; depression is an engine fact", () => {
  let returned = false, continued = false;
  for (let seed = 1; seed <= 20000 && (!returned || !continued); seed++) {
    const g = start(seed);
    const incident = incidentAt(g, "focus");
    if (!incident?.effects.mentalLeave) continue;
    const leave = advance(g, "focus");
    assert.equal(onMentalLeave(leave), true);
    assert.ok(leave.salary < g.salary * 0.8);
    assert.ok(!availableChoices(leave).includes("promote"));
    assert.equal(storyRequest(leave).context.mentalLeave, true);
    const next = advance(leave, "rest");
    if (onMentalLeave(next)) {
      continued = true;
      assert.equal(next.history.at(-1).incident.id, "leaveContinues");
      assert.equal(next.salary, leave.salary);
    } else {
      returned = true;
      assert.equal(next.history.at(-1).incident.id, "returnToWork");
      within(next.salary / leave.salary, 1.2, 1.65, "restored salary");
    }
    assert.deepEqual(decodeSave(encodeSave(next)), next);
    assert.deepEqual(replayGame(next), next);
  }
  assert.ok(returned && continued);
  const depression = findIncident("burnout", start, (i) => i.diagnosis === "depression");
  assert.match(advance(depression, "focus").history[0].incident.title, /うつ病/);
});

test("continued mental leave restores the separate family-leave reduction and retains the age-60 pay rule", () => {
  for (const { extra, action, factor } of [
    { extra: { children: 1 }, action: "careLeave", factor: 1 / 0.85 },
    { extra: { age: 58, retirementAge: 65 }, action: "focus", factor: 0.75 },
  ]) {
    let checked = false;
    for (let seed = 1; seed < 20000 && !checked; seed++) {
      const g = start(seed, extra);
      if (!incidentAt(g, action)?.effects.mentalLeave) continue;
      const leave = advance(g, action), next = advance(leave, "rest");
      if (!onMentalLeave(next)) continue;
      assert.equal(next.salary, leave.salary * factor);
      assert.deepEqual(decodeSave(encodeSave(next)), next);
      checked = true;
    }
    assert.ok(checked, action);
  }
});

test("offersFrom preserves all old recorded years and current scenes, validates bounds, and survives replay/undo/comparison", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/offers-saves.json", import.meta.url)));
  for (const { id, save, historyHash } of fixtures) {
    assert.ok(!Object.hasOwn(save, "offersFrom"));
    const g = decodeSave(JSON.stringify(save));
    assert.equal(g.offersFrom, save.decisions.length + (save.scenes[String(save.decisions.length)] ? 1 : 0), id);
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash, id);
    assert.deepEqual(decodeSave(encodeSave(g)), g);
    assert.deepEqual(replayGame(g), g);
    assert.equal(replayGame(g, []).offersFrom, g.offersFrom);
    for (const world of compareWorlds(g)) assert.equal(world.offersFrom, g.offersFrom);
    if (id === "current-scene") {
      const next = advance(g, "promote"), old = advance({ ...g, offersFrom: MAX_AGE }, "promote");
      assert.deepEqual(next.history, old.history);
    }
  }
  const g = start(), saved = JSON.parse(encodeSave(g));
  assert.equal(g.offersFrom, 0);
  for (const value of [null, -1, 1.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(12).fill(0), value));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(12).fill(0), value));
    assert.throws(() => encodeSave({ ...g, offersFrom: value }));
    assert.throws(() => decodeSave(JSON.stringify({ ...saved, offersFrom: value })));
  }
});

test("offer scenes survive grounding and saving, and invalid boundaries consume no AI calls or reservations", async () => {
  const before = findIncident("scout"), g = advance(before, "focus");
  const raw = fourReply(storyRequest(g).context);
  const scene = groundScene({ ...raw, body: "スカウトの年収は1000万円。" }, g);
  assert.match(scene.body, /スカウト/);
  const savedScene = applyScene(g, validateGeneratedScene(scene, g));
  assert.deepEqual(decodeSave(encodeSave(savedScene)), savedScene);
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  const saved = JSON.parse(encodeSave(start()));
  for (const offersFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, offersFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const accounting = ai.status();
  for (const offersFrom of [null, -1, 1.5, MAX_AGE + 1, "0"])
    await assert.rejects(() => ai.generate(JSON.stringify({ ...saved, offersFrom })));
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, accounting.calls);
  assert.equal(ai.status().reservedUSD, accounting.reservedUSD);
});

test("a missing scout response is rejected without caching, and the sent prompt carries the discovery and offer facts", async () => {
  const g = advance(findIncident("scout"), "focus");
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    const messages = JSON.parse(options.body).messages;
    assert.ok(messages[0].content.includes(CAREER_DISCOVERY));
    const context = JSON.parse(messages.at(-1).content);
    assert.equal(context.careerOffer.id, "scout");
    const reply = fourReply(context);
    if (calls === 1) reply.options[3] = { id: "rest", label: "休む", hint: "休養", reason: "体調",
      decision: { id: "rest", intent: "休む" } };
    return { status: 200, text: ollamaText(reply) };
  });
  await assert.rejects(() => ai.generate(encodeSave(g)));
  assert.equal((await ai.generate(encodeSave(g))).cached, false);
  assert.equal((await ai.generate(encodeSave(g))).cached, true);
  assert.equal(calls, 2);
});

test("cohorts retain different careers and rare extremes with tolerant promotion and lifetime distributions", () => {
  const before = measurePromotionOffers({ seeds: 1000, from: MAX_AGE }), after = measurePromotionOffers({ seeds: 1000 });
  within(before.managerEver, 0.45, 0.68, "former manager ever");
  within(after.staffLead, 0.5, 0.68, "staff/lead at 50");
  within(after.managerSpecialist, 0.25, 0.35, "manager/specialist at 50");
  within(after.directorPrincipal, 0.03, 0.07, "director/principal at 50");
  assert.ok(after.managerEver < before.managerEver - 0.1);
  within(after.neverPromoted, 0.01, 0.1, "never promoted even when trying often");
  const cohorts = ["stay", "balanced", "mobile"].map((strategy) => measureCareerVariety({ seeds: 1000, strategy }));
  const [stay, balanced, mobile] = cohorts;
  within(stay.changes[0], 0.6, 0.8, "stayed with employer");
  for (const [i, [lo, hi]] of [[0.06, 0.16], [0.25, 0.43], [0.25, 0.43], [0.15, 0.34]].entries())
    within(balanced.changes[i], lo, hi, `balanced changes ${i}`);
  assert.ok(mobile.changes[3] > balanced.changes[3]);
  for (const c of cohorts) {
    within(c.promotions[0], c.strategy === "stay" ? 0.2 : 0.025,
      c.strategy === "stay" ? 0.4 : 0.16, `${c.strategy} no promotion`);
    within(c.scouts[0], 0.01, 0.09, `${c.strategy} no scout`);
    within(c.scouts[3], 0.55, 0.78, `${c.strategy} several scouts`);
    within(1 - c.leaves[0], 0.12, 0.3, `${c.strategy} any mental leave`);
    within(c.leaves[3], 0, 0.015, `${c.strategy} repeated mental leaves`);
    within(c.fastManager, 0.001, 0.05, `${c.strategy} early manager`);
    within(c.changesOverSix, 0, 0.13, `${c.strategy} extreme switching`);
    within(c.leaveOnsetRate, 0.003, 0.01, `${c.strategy} annual mental leave onset`);
    within(c.noPromotionOffer, 0.2, 0.65, `${c.strategy} no promotion offer`);
    for (const field of ["changes", "promotions", "scouts", "leaves"])
      within(c[field].reduce((a, b) => a + b), 0.999, 1.001, field);
  }
});
