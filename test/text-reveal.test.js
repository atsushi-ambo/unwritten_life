import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { revealCount, revealEnabled } from '../public/text-reveal.js';
test('文字送りは5秒以内に終わりスキップできる', () => {
  assert.equal(revealCount(1000, 4999), 999);
  assert.equal(revealCount(1000, 5000), 1000);
  assert.equal(revealCount(100, 0, true), 100);
});
test('動きを抑える設定を既定に使い保存した設定を優先する', () => {
  assert.equal(revealEnabled(null, true), false);
  assert.equal(revealEnabled(null, false), true);
  assert.equal(revealEnabled('on', true), true);
  assert.equal(revealEnabled('off', false), false);
});
