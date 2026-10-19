import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame, advance, availableChoices, encodeSave, decodeSave, replay,
  validateGeneratedScene, RANKS, STAY_ACTIONS, MAX_AGE,
  optionalProfileInputs, profileInputForLevel,
} from "../public/engine.js";
import { careerMap, careerRecord, careerRecordText } from "../public/careers.js";
import { storyRequest, sceneSchema } from "../public/story.js";

const profile = (extra = {}) => optionalProfileInputs(profileInputForLevel(
  { occupation: "software", company: "合成ソフト社", ...extra }, "advanced",
));
// Incidents are off so the in-company results are the only thing that moves.
const quiet = (p, seed) => createGame(p, "steady", seed, 0, 0, 0, 0, 0, 0, 0, MAX_AGE);
const option = (id, decision = { id, intent: `${id}を試す` }) => ({
  id, label: `合成の${id}`, hint: "負担がある", reason: "本人の条件", decision,
});
// Advance with an action until it succeeds, trying seeds in order.
function succeeded(p, decision) {
  for (let seed = 0; seed < 500; seed++) {
    const g = quiet(p, seed), next = advance(g, decision);
    if (next.history[0].outcome.kind === "success") return { g, next };
  }
  assert.fail("no success");
}

test("in-company steps are offered only while working for an employer", () => {
  const g = quiet(profile(), 1);
  for (const id of ["promote", "transfer", "internalVenture"]) assert.ok(availableChoices(g).includes(id), id);
  for (const p of [
    profile({ occupation: "student" }),
    profile({ occupation: "independent" }),
    profile({ age: 70, retirementAge: 65 }),
  ])
    for (const id of ["promote", "transfer", "internalVenture"])
      assert.ok(!availableChoices(quiet(p, 1)).includes(id), `${p.occupation} ${id}`);
  const business = advance(g, { id: "startup", venture: "ai", name: "合成事業" });
  assert.ok(!availableChoices(business).includes("promote"));
  const top = quiet(profile({ rank: "director" }), 1);
  assert.ok(!availableChoices(top).includes("promote"));
  assert.ok(availableChoices(top).includes("transfer"));
});

test("a promotion moves up the stages, raises pay and is recorded; a lead chooses manager or specialist", () => {
  const { g, next } = succeeded(profile({ rank: "staff" }), "promote");
  assert.equal(next.position.rank, "lead");
  assert.equal(next.position.since, g.year);
  assert.ok(next.salary > g.salary);
  assert.equal(next.history[0].position.rank, "lead");
  const lead = quiet(profile({ rank: "lead" }), 3);
  assert.throws(() => advance(lead, { id: "promote", intent: "昇格を目指す" }));
  for (const [track, rank] of [["manager", "manager"], ["specialist", "specialist"]]) {
    const result = succeeded(profile({ rank: "lead" }), { id: "promote", intent: "次の段階へ", track });
    assert.equal(result.next.position.rank, rank);
  }
  const failed = (() => {
    for (let seed = 0; seed < 500; seed++) {
      const start = quiet(profile({ rank: "staff" }), seed), after = advance(start, "promote");
      if (after.history[0].outcome.kind === "setback") return { start, after };
    }
  })();
  assert.equal(failed.after.position.rank, "staff");
  assert.match(failed.after.history[0].outcome.title, /見送られた/);
});

test("a transfer or an internal venture changes the unit; a job change keeps the stage and starts a new tenure", () => {
  const { next } = succeeded(profile(), { id: "transfer", intent: "データ基盤に移る", unit: "データ基盤チーム" });
  assert.equal(next.position.unit, "データ基盤チーム");
  assert.equal(next.employer.name, "合成ソフト社");
  assert.throws(() => advance(quiet(profile(), 1), { id: "transfer", intent: "移る" }));
  const venture = succeeded(profile(), { id: "internalVenture", intent: "新規事業へ", unit: "新しい予約サービス" });
  assert.equal(venture.next.position.unit, "新しい予約サービス");
  const promoted = succeeded(profile({ rank: "staff" }), "promote").next;
  const moved = advance(promoted, {
    id: "switch", target: "custom", name: "合成クラウド社", role: "tech", companyType: "unknown", facts: null,
  });
  assert.equal(moved.position.rank, "lead");
  assert.equal(moved.position.unit, "");
  assert.equal(moved.position.joined, promoted.year);
  assert.deepEqual(decodeSave(encodeSave(moved)), moved);
});

test("ten years at one company show stage and unit changes in the map, resume and its text", () => {
  let best = null;
  for (let seed = 0; seed < 80 && !best; seed++) {
    let g = quiet(profile({ rank: "staff" }), seed);
    for (let y = 0; y < 12; y++) {
      const ids = availableChoices(g);
      g = advance(g, y === 4 && ids.includes("transfer")
        ? { id: "transfer", intent: "別の仕事へ", unit: "顧客基盤チーム" }
        : ids.includes("promote")
          ? g.position.rank === "lead" ? { id: "promote", intent: "専門を深める", track: "specialist" } : "promote"
          : "focus");
    }
    const record = careerRecord(g);
    if (record.tenures.length >= 3 && g.position.rank !== "staff" && g.position.unit) best = g;
  }
  assert.ok(best, "no seed reached two stage changes");
  const record = careerRecord(best);
  assert.ok(record.tenures.every((t) => t.employer === "合成ソフト社"));
  assert.ok(record.tenures.some((t) => t.rank && t.rank !== "staff"));
  assert.ok(careerMap(best).some((tile) => tile.state === "promoted"));
  const text = careerRecordText(best, {}, RANKS);
  assert.match(text, /リーダー|専門職/);
  assert.match(text, /顧客基盤チーム/);
  assert.deepEqual(replay(best.profile, best.scenario, best.seed, best.decisions, {}, false, 0, 0, 0, 0, 0, 0, 0, MAX_AGE), best);
});

test("while working, the AI's four choices must include one way to build a career at the current company", () => {
  const g = quiet(profile(), 1);
  const scene = (ids) => ({
    title: "次の一年", body: "仕事と暮らしを考え、次の一年を選ぶ。直前の結果から考える。", insight: "架空の場面。",
    options: ids.map((id) => option(id)),
  });
  assert.throws(() => validateGeneratedScene(scene(["learn", "connect", "rest", "explore"]), g));
  validateGeneratedScene(scene(["learn", "connect", "rest", "focus"]), g);
  validateGeneratedScene({
    ...scene(["learn", "connect", "rest"]),
    options: [...scene(["learn", "connect", "rest"]).options,
      option("transfer", { id: "transfer", intent: "異動する", unit: "新しい部署" })],
  }, g);
  const retired = quiet(profile({ age: 70, retirementAge: 65 }), 1);
  validateGeneratedScene(scene(["learn", "connect", "rest", "explore"]), retired);
  // Older saves keep their rule until the boundary.
  const legacy = createGame(profile(), "steady", 1, 0, 0, 0, 0, 0, 0, 0, MAX_AGE, MAX_AGE);
  validateGeneratedScene(scene(["learn", "connect", "rest", "explore"]), legacy);
  assert.ok(!availableChoices(legacy).includes("promote"));
  for (const id of STAY_ACTIONS.filter((x) => availableChoices(g).includes(x))) assert.ok(id);
});

test("the AI receives the stage, unit and tenure, the stay rule, and fields for the new steps", () => {
  const g = advance(quiet(profile({ rank: "lead" }), 1), "focus");
  const { context, messages } = storyRequest(g);
  assert.equal(context.position.rank, "リーダー");
  assert.equal(context.position.yearsAtEmployer, 1);
  assert.deepEqual(context.position.nextRanks, ["管理職", "専門職"]);
  assert.match(context.position.note, /実際の会社の等級・役職名ではない/);
  const system = messages[0].content;
  assert.match(system, /少なくとも1案を、今の会社に残ってキャリアを築く案/);
  assert.match(system, /実際の人事制度・等級名・社内公募の有無・組織の内部事情を作らない/);
  const schema = JSON.stringify(sceneSchema(g));
  assert.match(schema, /"unit"/);
  assert.match(schema, /"track"/);
  const student = quiet(profile({ occupation: "student" }), 1);
  assert.equal(storyRequest(student).context.position, null);
});

test("older saves without the stage or its boundary load and keep their recorded years", () => {
  const g = advance(createGame(profile(), "steady", 4), "focus");
  const saved = JSON.parse(encodeSave(g));
  delete saved.careerPathFrom;
  delete saved.profile.rank;
  const migrated = decodeSave(JSON.stringify(saved));
  assert.equal(migrated.careerPathFrom, 1);
  assert.equal(migrated.profile.rank, "unspecified");
  for (const careerPathFrom of [null, -1, 1.5, MAX_AGE + 1, "0"])
    assert.throws(() => decodeSave(JSON.stringify({ ...saved, careerPathFrom })));
  assert.throws(() => decodeSave(JSON.stringify({ ...saved, profile: { ...saved.profile, rank: "ceo" } })));
});

test("promotions are for some: seats above are scarce, luck matters, and most people stay at a middle stage", () => {
  const reached = { lead: 0, manager: 0, director: 0 };
  let seatClosed = 0;
  const N = 150;
  for (let seed = 0; seed < N; seed++) {
    let g = quiet(profile({ rank: "staff", age: 25 }), seed);
    const seen = new Set();
    for (let y = 0; y < 30 && !g.ended; y++) {
      const ids = availableChoices(g);
      g = advance(g, y % 2 === 0 && ids.includes("promote")
        ? g.position.rank === "lead" ? { id: "promote", intent: "上を目指す", track: "manager" } : "promote"
        : "focus");
      seen.add(g.position.rank);
      if (/席が空かず/.test(g.history.at(-1).outcome?.title ?? "")) seatClosed++;
    }
    for (const rank of Object.keys(reached)) if (seen.has(rank)) reached[rank]++;
  }
  assert.ok(reached.lead / N > 0.85, `lead ${reached.lead}`);
  assert.ok(reached.manager / N > 0.3 && reached.manager / N < 0.75, `manager ${reached.manager}`);
  assert.ok(reached.director / N < 0.15, `director ${reached.director}`);
  assert.ok(seatClosed > 0);
});

test("a supportive boss raises the odds of the next promotion and a difficult one lowers them", () => {
  const odds = (incident) => {
    let total = 0;
    for (let seed = 0; seed < 200; seed++) {
      const g = quiet(profile({ rank: "staff" }), seed);
      // Only last year's incident differs; the stage has lasted long enough.
      const history = incident ? [{ incident: { id: incident, effects: {} } }] : [];
      total += advance({ ...g, history, position: { ...g.position, since: g.year - 3 } }, "promote")
        .history.at(-1).outcome.chance;
    }
    return total;
  };
  assert.ok(odds("goodTeam") > odds(null));
  assert.ok(odds("difficultBoss") < odds(null));
});

test("a move can be one stage up at another company, never two", () => {
  const lead = quiet(profile({ rank: "lead" }), 2);
  const move = (rank) => ({
    id: "switch", target: "custom", name: "合成エグゼクティブ社", role: "tech",
    companyType: "unknown", facts: null, rank,
  });
  const up = advance(lead, move("manager"));
  assert.equal(up.position.rank, "manager");
  assert.equal(up.position.since, lead.year);
  assert.equal(up.position.joined, lead.year);
  assert.throws(() => advance(lead, move("director")));
  assert.throws(() => advance(quiet(profile({ rank: "staff" }), 2), move("manager")));
  const same = advance(lead, move("lead"));
  assert.equal(same.position.rank, "lead");
  const context = storyRequest(lead, { mode: "career" }).context;
  assert.deepEqual(Object.keys(context.switchRanks), ["lead", "manager", "specialist"]);
  assert.match(storyRequest(lead, { mode: "career" }).messages[0].content, /switchRanksのキーから選ぶ/);
});
