import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBook, recordGame, validateBook, bookView, bookBaseline } from '../public/book.js';
import { CHOICES, INCIDENTS } from '../public/engine.js';
test('discoveries are deduplicated and presented with labels', () => {
  const choice = Object.keys(CHOICES)[0], incident = Object.keys(INCIDENTS)[0];
  const game = { profile: { company: '架空会社' }, employer: { name: '架空会社' }, careerSeen: { 0: ['候補社', '候補社'] }, decisions: [choice], scenes: { 0: { options: [{ id: choice }] } }, history: [{ choice, incident: { id: incident } }] };
  const first = recordGame(emptyBook(), game, new Set());
  const b = recordGame(first.book, game, first.baseline).book;
  assert.deepEqual(b.companies, ['架空会社', '候補社']);
  assert.deepEqual(b.choices, [choice]);
  const view = bookView(b);
  assert.ok(view.choices.items.includes(CHOICES[choice].label));
  assert.ok(view.incidents.items.includes(INCIDENTS[incident].title));
  assert.ok(view.choices.items.includes('？？？'));
  assert.ok(!view.choices.items.includes(choice));
});
test('invalid values are dropped and limits enforced', () => {
  const b = validateBook({ companies: [...Array.from({ length: 210 }, (_, i) => `会社${i}`), 'x'.repeat(61), null], choices: ['unknown', {}, ...Object.keys(CHOICES)], incidents: ['unknown', ...Object.keys(INCIDENTS)] });
  assert.equal(b.companies.length, 200);
  assert.equal(b.choices.length, Object.keys(CHOICES).length);
  assert.equal(b.incidents.length, Object.keys(INCIDENTS).length);
  assert.deepEqual(validateBook(null), emptyBook());
});
test('baseline skips existing occurrences and records only newly revealed years', () => {
  const ids = Object.keys(INCIDENTS);
  const game = { profile: { company: '初期' }, history: [{ incident: { id: ids[0] } }, { incident: { id: ids[1] } }] };
  const baseline = bookBaseline(game, { end: 1, includeCurrent: false });
  const result = recordGame(emptyBook(), game, baseline, { end: 2, includeCurrent: false });
  assert.deepEqual(result.book.incidents, [ids[1]]);
});
test('deletion permits a repeated discovery at a new position and resume does not restore old ones', () => {
  const id = Object.keys(INCIDENTS)[0];
  const game = { history: [{ incident: { id } }] };
  const first = recordGame(emptyBook(), game, new Set());
  assert.deepEqual(recordGame(emptyBook(), game, first.baseline).book, emptyBook());
  const later = { history: [...game.history, { incident: { id } }] };
  assert.deepEqual(recordGame(emptyBook(), later, first.baseline).book.incidents, [id]);
  assert.deepEqual(recordGame(emptyBook(), later, bookBaseline(later)).book, emptyBook());
});
