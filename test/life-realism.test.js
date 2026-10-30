import test from "node:test";
import { lifeStory } from "../public/careers.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createGame, advance, advanceDirection, decisionId, replay, compareWorlds,
  encodeSave, decodeSave, validateGeneratedScene, MAX_AGE, incidentAt, RANKS,
} from "../public/engine.js";
import { storyRequest } from "../public/story.js";
import { measureLifeRealism, simulationProfile } from "../scripts/simulate-life-realism.mjs";
import { readyAI, fourReply, replyFor, ollamaText } from "./fixtures/ai-replies.js";

const start = (seed = 42, extra = {}) => createGame(simulationProfile(extra), "steady", seed);
const quiet = (seed = 42, extra = {}) => ({ ...start(seed, extra), incidentFrom: MAX_AGE });
const seeking = (seed, age = 35) => ({ ...quiet(seed, { age, rank: "manager" }), salary: 0, income: 0,
  employer: { kind: "seeking", id: "seeking", name: "次の仕事を探している", role: "other",
    companyType: "unknown", facts: null, lastSalary: 500, lastRole: "tech" } });
const replayGame = (g, decisions = g.decisions, scenes = g.scenes) => replay(
  g.profile, g.scenario, g.seed, decisions, scenes, false, g.dynamicFrom, g.worldFrom,
  g.retirementFrom, g.careLeaveSalaryFrom, g.prepayFrom, g.debtRepayFrom, g.salaryCapFrom,
  g.incidentFrom, g.careerPathFrom, g.careerEndFrom, g.payRealismFrom, g.lifeRealismFrom, g.offersFrom, g.paceFrom, g.reemploymentPayFrom, g.driftFrom, g.familyFrom, g.growthFrom, g.cycleFrom, g.spendFrom, g.oddsFrom, g.lifeEventsFrom,
  decisions.length === g.decisions.length ? g.directionBlocks : undefined);
const within = (value, low, high, label) => assert.ok(value >= low && value <= high, `${label}: ${value}`);

test("automatic re-employment has bounded age-dependent first and later year rates", () => {
  for (const [age, first, later] of [[35, 0.65, 0.75], [55, 0.39, 0.45], [60, 0.195, 0.225]]) {
    let hired = 0, remaining = 0, laterHired = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const firstYear = advance(seeking(seed * 7919, age), "learn");
      if (firstYear.employer.kind !== "seeking") {
        hired++;
        assert.equal(firstYear.employer.name, "新しい勤務先");
        assert.equal(firstYear.employer.role, "tech");
        assert.equal(firstYear.employer.companyType, "unknown");
        within(firstYear.salary, 400, 500, "re-employment salary");
        assert.ok(["manager", "lead"].includes(firstYear.position.rank));
        assert.equal(firstYear.history.at(-1).outcome.kind, "reemployed");
        assert.match(firstYear.history.at(-1).episode.title, /次の仕事が決まった/);
        assert.doesNotMatch(firstYear.history.at(-1).episode.body, /まだ次の仕事にはつながっていない/);
      } else if (!firstYear.ended) {
        // The loss year itself is a seeking record; after one unsuccessful
        // search year there are two. Use a synthetic loss snapshot here.
        const loss = { ...firstYear.history[0], year: firstYear.year - 2 };
        const waiting = { ...firstYear, history: [loss, ...firstYear.history] };
        remaining++;
        if (advance(waiting, "connect").employer.kind !== "seeking") laterHired++;
      }
    }
    within(hired / 2000, first - 0.035, first + 0.035, `first year age ${age}`);
    within(laterHired / remaining, later - 0.06, later + 0.06, `later year age ${age}`);
  }
});

test("rest, recovery, care, retirement, moves and business starts bypass the automatic hire", () => {
  const g = { ...seeking(42, 50), family: { ...seeking(42).family, childAges: [10] } };
  for (const id of ["rest", "recover", "careLeave", "retire"])
    assert.notEqual(advance(g, id).history.at(-1).outcome?.kind, "reemployed", id);
  for (const decision of [{ id: "switch", target: "toyota", role: "tech" },
    { id: "startup", venture: "ai", name: "合成事業" }])
    assert.notEqual(advance(g, decision).history.at(-1).outcome?.kind, "reemployed");
  assert.equal(advance({ ...g, lifeRealismFrom: MAX_AGE }, "learn").employer.kind, "seeking");
  assert.equal(advance({ ...g, age: 65 }, "learn").employer.kind, "seeking");
});

test("closing a venture preserves the actual pre-startup pay and role for the next job", () => {
  const previous = advance(quiet(7), { id: "switch", target: "custom", name: "合成制作社",
    role: "creative", companyType: "small" });
  let g = advance(previous, { id: "startup", venture: "studio", name: "合成スタジオ" });
  if (g.employer.kind === "venture") g = advance(g, "closeBusiness");
  assert.equal(g.employer.lastSalary, previous.salary);
  assert.equal(g.employer.lastRole, "creative");
  for (let year = 0; year < 10 && g.employer.kind === "seeking" && !g.ended; year++)
    g = advance(g, "connect");
  assert.equal(g.employer.role, "creative");
  within(g.salary, previous.salary * 0.8, previous.salary, "pay after venture closure");
  assert.deepEqual(decodeSave(encodeSave(g)), g);
});

test("layoff and subsequent hire stop in their own years, reach the next scene and replay exactly", () => {
  let loss, hired;
  for (let seed = 1; seed < 20000; seed++) {
    const g = start(seed);
    if (incidentAt(g, "focus")?.id !== "layoff") continue;
    const laid = advanceDirection(g, "focus");
    const found = advanceDirection(laid.game, { id: "learn", intent: "設計を学びながら探す" });
    if (found.entries[0].outcome?.kind === "reemployed" && !found.entries[0].incident && !found.game.ended) { loss = laid; hired = found; break; }
  }
  assert.ok(hired);
  assert.equal(loss.entries.length, 1);
  assert.equal(loss.game.salary, 0);
  assert.match(loss.stopReason, /思いがけない出来事/);
  assert.equal(storyRequest(loss.game).context.yearsSincePreviousDecision[0].incident.id, "layoff");
  assert.equal(hired.entries.length, 1);
  assert.match(hired.stopReason, /次の仕事が決まり/);
  assert.equal(hired.entries[0].year, loss.entries[0].year + 1);
  assert.equal(storyRequest(hired.game).context.yearsSincePreviousDecision[0].outcome.kind, "reemployed");
  assert.equal(storyRequest(hired.game).context.currentEmployer, "新しい勤務先");
  assert.deepEqual(decodeSave(encodeSave(hired.game)), hired.game);
  assert.deepEqual(replayGame(hired.game), hired.game);
});

test("study directions work from year two, retaining the original intention across a boundary", () => {
  for (const id of ["learn", "studyDaily"]) {
    const g = quiet();
    const run = advanceDirection(g, { id, intent: "顧客の設計を学ぶ" });
    assert.deepEqual(run.game.decisions.map(decisionId), [id, "focus", "focus", "focus", "focus"]);
    assert.ok(run.entries.every((h) => h.intention === "顧客の設計を学ぶ"));
    assert.equal(run.game.studyHours, id === "learn" ? 90 : 365);
    const old = advanceDirection({ ...g, lifeRealismFrom: MAX_AGE }, id);
    assert.deepEqual(old.game.decisions.map(decisionId), [id, ...Array(4).fill("studyDaily")]);
    const crossing = advanceDirection({ ...g, lifeRealismFrom: 2 }, id);
    assert.deepEqual(crossing.game.decisions.map(decisionId), [id, "studyDaily", "focus", "focus", "focus"]);
  }
});

test("life scene study limits activate at the boundary and a rejected reply is not cached", async () => {
  const g = quiet(), reply = fourReply(storyRequest(g).context);
  const two = { ...reply, options: reply.options.map((o, i) => i === 2
    ? { ...o, id: "studyDaily", decision: { id: "studyDaily", intent: "語学を学ぶ" } } : o) };
  assert.throws(() => validateGeneratedScene(two, g));
  const plain = { ...two, options: two.options.map(({ decision, ...o }) => o) };
  assert.throws(() => validateGeneratedScene(plain, g, { personalized: false }));
  validateGeneratedScene(two, { ...g, lifeRealismFrom: 1 });
  validateGeneratedScene(reply, g);
  let calls = 0;
  const ai = await readyAI(async (_url, options) => ({ status: 200,
    text: ollamaText(++calls === 1 ? two : replyFor(options)) }));
  // The existing client retry test covers the single local-only retry. The
  // server rejects the invalid scene and allows that next request to succeed.
  await assert.rejects(() => ai.generate(encodeSave(g)), /採用しませんでした/);
  await ai.generate(encodeSave(g));
  assert.equal(calls, 2);
  // The specialized career comparison still has three switch offers.
  validateGeneratedScene(fourReply(storyRequest(g, { mode: "career" }).context), g, { mode: "career" });
});

test("life prompts vary study, keep work central and gate business proposals on cash and experience", () => {
  const run = advanceDirection(quiet(), { id: "learn", intent: "設計の基礎を学ぶ" });
  const request = storyRequest(run.game), system = request.messages[0].content;
  assert.equal(request.context.previousDirection.action, "learn");
  assert.match(system, /学習（learn・studyDaily）は合わせて多くても1案/);
  assert.match(system, /次の4択に再びAIの学習を出さない/);
  assert.match(system, /多くの人の主な活動は仕事/);
  assert.match(system, /起業・副業.*合わせて多くても1案/);
  assert.match(system, /AIはその人の仕事や出来事に直接関係するときだけ/);
  assert.ok(storyRequest(quiet()).context.startupReadiness.eligibleVentures.length);
  for (const g of [quiet(42, { savings: 70 }), quiet(42, { occupation: "student", age: 22 })]) {
    const { context } = storyRequest(g);
    assert.deepEqual(context.startupReadiness.eligibleVentures, []);
    assert.ok(!context.allowedActions.some((a) => a.id === "startup"));
    const reply = fourReply(context);
    const startup = { ...reply, options: reply.options.map((o, i) => i === 3
      ? { ...o, id: "startup", decision: { id: "startup", venture: "ai", name: "合成事業" } } : o) };
    assert.throws(() => validateGeneratedScene(startup, g));
    if (g.cash >= 60) validateGeneratedScene(startup, { ...g, lifeRealismFrom: MAX_AGE });
  }
});

test("pre-change snapshots retain every recorded year and their saved two-study current scene", () => {
  // Frozen with engine.js from be259de, before life-realism changes. The
  // hashes cover complete annual records, including all balances and prose.
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/life-realism-saves.json", import.meta.url)));
  for (const { id, save, historyHash, salary, cash, employer } of fixtures) {
    const g = decodeSave(JSON.stringify(save));
    assert.equal(g.lifeRealismFrom, save.decisions.length + (save.scenes[String(save.decisions.length)] ? 1 : 0), id);
    assert.equal(createHash("sha256").update(JSON.stringify(g.history)).digest("hex"), historyHash, id);
    assert.equal(g.salary, salary, id);
    assert.equal(g.cash, cash, id);
    assert.deepEqual(g.employer, employer, id);
    assert.deepEqual(decodeSave(encodeSave(g)), g, id);
    assert.deepEqual(replayGame(g), g, id);
    for (const world of compareWorlds(g)) assert.equal(world.lifeRealismFrom, g.lifeRealismFrom);
    if (id === "current-two-study-scene") {
      validateGeneratedScene(g.scenes["0"], g);
      const next = advance(g, "learn");
      assert.equal(next.decisions.length, next.lifeRealismFrom);
      assert.throws(() => validateGeneratedScene(g.scenes["0"], next));
    }
  }
});

test("life boundaries validate all entry points and survive undo and comparisons", () => {
  const g = quiet(), saved = JSON.parse(encodeSave(g));
  assert.equal(g.lifeRealismFrom, 0);
  for (const value of [null, -1, 1.5, MAX_AGE + 1, "0", NaN]) {
    assert.throws(() => createGame(g.profile, "steady", 42, ...Array(11).fill(0), value));
    assert.throws(() => replay(g.profile, "steady", 42, [], {}, false, ...Array(11).fill(0), value));
    assert.throws(() => encodeSave({ ...g, lifeRealismFrom: value }));
    assert.throws(() => decodeSave(JSON.stringify({ ...saved, lifeRealismFrom: value })));
  }
  const next = advance({ ...g, lifeRealismFrom: 1 }, "focus");
  assert.equal(replayGame(next, []).lifeRealismFrom, 1);
  for (const world of compareWorlds(next)) assert.equal(world.lifeRealismFrom, 1);
});

test("AI cache keys distinguish life boundaries and invalid values consume no calls", async () => {
  let calls = 0;
  const ai = await readyAI(async (_url, options) => {
    calls++;
    return { status: 200, text: ollamaText(replyFor(options)) };
  });
  const saved = JSON.parse(encodeSave(quiet()));
  for (const lifeRealismFrom of [0, 1, MAX_AGE]) {
    const save = JSON.stringify({ ...saved, lifeRealismFrom });
    assert.equal((await ai.generate(save)).cached, false);
    assert.equal((await ai.generate(save)).cached, true);
  }
  const accounting = ai.status();
  for (const lifeRealismFrom of [null, -1, 1.5, MAX_AGE + 1, "0"])
    await assert.rejects(() => ai.generate(JSON.stringify({ ...saved, lifeRealismFrom })));
  assert.equal(calls, 3);
  assert.equal(ai.status().calls, accounting.calls);
});

test("startup, promotion and negotiation cohorts stay within calibrated ranges", () => {
  const before = measureLifeRealism({ seeds: 1000, from: MAX_AGE });
  const after = measureLifeRealism({ seeds: 1000 });
  assert.equal(before.firstYearFailure, 0);
  within(before.survivedFiveYears, 0.82, 0.94, "former survival");
  within(after.firstYearFailure, 0.08, 0.18, "first-year closure");
  within(after.survivedFiveYears, 0.4, 0.6, "five-year survival");
  within(after.doubledWithinTenYears, 0.003, 0.1, "rare double income");
  for (const result of [before, after]) {
    within(result.managerBy50, 0.45, 0.68, "manager by 50");
    within(result.directorBy50, 0.02, 0.09, "director by 50");
    within(result.negotiateSuccess, 0.45, 0.67, "negotiate success");
  }
  for (const key of ["managerBy50", "directorBy50", "negotiateSuccess"])
    assert.equal(after[key], before[key], key);
});

test("re-employment at a lower stage reads as a re-employment, never a promotion", () => {
  let found;
  for (let seed = 1; seed < 800 && !found; seed++) {
    let g = start(seed, { rank: "manager" });
    for (let k = 0; k < 12 && !g.ended; k++) {
      g = advanceDirection(g, k % 2 ? "learn" : "focus").game;
      const h = g.history.find((x) => x.outcome?.kind === "reemployed" && x.position?.rank !== "manager");
      if (h) { found = g; break; }
    }
  }
  assert.ok(found, "no seed was re-employed at a lower stage");
  const events = lifeStory(found, RANKS).chapters.flatMap((c) => c.events.map((e) => e.text));
  assert.ok(events.some((t) => t.endsWith("に再就職")), events.join(" / "));
  assert.ok(!events.some((t) => /リーダーに昇格|担当に昇格/.test(t)), events.join(" / "));
});
