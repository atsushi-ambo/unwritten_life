import test from "node:test";
import assert from "node:assert/strict";
import {
  JOBS, REGIONS, QUICK_PRESETS, createGame, optionalProfileInputs, profileInputForLevel,
  advance, eventFor, availableChoices, replay,
} from "../public/engine.js";

const sentences = (text) =>
  text.match(/[^。！？!?]+[。！？!?]*/gu)?.map((s) => s.trim()).filter(Boolean) ?? [];
const profile = (preset, job, extra = {}) => optionalProfileInputs({
  ...profileInputForLevel({}, "quick", preset), job, ...extra,
});
function checkProse(text) {
  assert.doesNotMatch(text, /賃貸等/);
  for (const { label } of Object.values(JOBS)) {
    for (const ending of ["に向き合った", "へ生かしたい", "に生かしたい", "を担っている"])
      assert.ok(!text.includes(label + ending), label + ending);
  }
  for (const { label } of Object.values(REGIONS).filter((r) => r.label.includes("・"))) {
    for (const ending of ["へ移り", "で暮らす", "の暮らしにも", "の借りている", "の自宅", "に買った家"])
      assert.ok(!text.includes(label + ending), label + ending);
  }
  for (const paragraph of text.split(/\n/u))
    assert.ok((paragraph.match(/迎えた/gu) ?? []).length < 2, text);
}
function worldSentences(g) {
  const world = g.history.at(-1)?.world;
  return sentences(`${world?.shock.body ?? ""} ${world?.frontier ?? ""}`);
}

test("eight-year local narratives across presets and every job remain natural, varied and replayable", () => {
  for (const preset of Object.keys(QUICK_PRESETS)) {
    for (const job of Object.keys(JOBS)) {
      for (const seed of [42, 2026]) {
        for (const plan of [Array(8).fill("studyDaily"),
          ["studyDaily", "focus", "invest", "connect", "rest", "learn", "focus", "invest"]]) {
          let g = createGame(profile(preset, job), "steady", seed);
          let previous = eventFor(g).body;
          checkProse(previous);
          for (const action of plan) {
            if (g.ended) break;
            const before = g;
            g = advance(g, availableChoices(g).includes(action) ? action : "rest");
            const scene = eventFor(g);
            const where = `${preset}/${job}/${seed}/${g.year}/${action}`;
            checkProse(scene.body);
            const episode = g.history.at(-1).episode;
            for (const text of [episode.title, episode.body, episode.next]) checkProse(text);
            const world = new Set([...worldSentences(before), ...worldSentences(g)]);
            const old = new Set(sentences(previous));
            assert.deepEqual(sentences(scene.body).filter((s) => old.has(s) && !world.has(s)), [], where);
            assert.deepEqual(eventFor(g), scene);
            previous = scene.body;
          }
          const restored = replay(g.profile, g.scenario, g.seed, g.decisions);
          assert.deepEqual(restored, g);
        }
      }
    }
  }
});

test("housing changes and children's stages appear without an annual family suffix", () => {
  let g = createGame(profile("family", "tech", { savings: 3000 }), "steady", 42);
  g = advance(g, "home");
  assert.match(eventFor(g).body, /買った家/);
  const moved = advance(createGame(profile("family", "tech"), "steady", 42), "move");
  assert.match(eventFor(moved).body, /へ移り/);
  g = advance(g, "rest");
  g = advance(g, "rest");
  assert.match(eventFor(g).body, /成長の節目/);
  assert.doesNotMatch(eventFor(g).body, /同じ一年の中にある/);
});

test("investment episode and action outcome describe allocating money", () => {
  const g = advance(createGame(profile("balanced", "tech"), "steady", 42), "invest");
  const record = g.history.at(-1);
  assert.match(record.outcome.title, /お金/);
  assert.match(record.episode.title, /お金/);
  assert.doesNotMatch(record.episode.body, /大切にしたい時間を、選んだ一年/);
  assert.match(record.episode.body, /現金の一部を株式へ配分/);
});
