import test from "node:test";
import assert from "node:assert/strict";
import { shareCardContent, wrapCardText } from "../public/careers.js";

test("card text wraps and truncates within its width", () => {
  const lines = wrapCardText("長い見出しと役職名が続きます", 4, 2, (s) => Array.from(s).length);
  assert.deepEqual(lines, ["長い見出", "しと役…"]);
  assert.ok(lines.every((line) => Array.from(line).length <= 4));
});
test("card turning points are capped and exclude employer names", () => {
  const story = { headline: "人生の物語", stats: { startIncome: 400, peakIncome: 600, startNetWorth: 0, endNetWorth: 100, moves: 2 }, chapters: [{ events: Array.from({ length: 5 }, (_, age) => ({ age, kind: "work", text: "秘密会社へ転職" })) }] };
  const card = shareCardContent(story, "役職なし");
  assert.equal(card.points.length, 3);
  assert.doesNotMatch(JSON.stringify(card), /秘密会社/);
});
