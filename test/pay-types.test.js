import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, payType, payTypeLabel, salaryCeiling, incidentRates } from '../public/engine.js';
import { simulationProfile } from '../scripts/simulate-life-realism.mjs';

test('treatment table, large employer and labels', () => {
  for (const [workModel, values] of Object.entries({ services: [.97, 1, 1.25], product: [1.05, 1.15, 1.1], inhouse: [1, .9, .9], public: [.93, .5, .7], self: [1, 1, 1], unknown: [1, 1, 1] })) {
    const t = payType({ workModel });
    assert.deepEqual([t.pay, t.stability, t.load], values);
    assert.ok(Object.values(t.stars).every(n => n >= 1 && n <= 5));
  }
  assert.equal(payType({ workModel: 'services', companyType: 'large' }).stability, .85);
  assert.equal(payTypeLabel({ workModel: 'unknown' }), '');
  assert.match(payTypeLabel({ workModel: 'public' }), /^給与.+ 安定.+ ゆとり.+$/);
});

test('boundary gates both ceiling branches and incident rates', () => {
  const g = createGame(simulationProfile({ workModel: 'product' }), 'steady', 42);
  const old = { ...g, payTypeFrom: 110 }, active = { ...g, payTypeFrom: 0 };
  for (const payRealismFrom of [0, 110]) {
    const a = salaryCeiling({ ...active, payRealismFrom });
    const b = salaryCeiling({ ...old, payRealismFrom });
    assert.equal(a, Math.round(b * 1.05));
  }
  const before = incidentRates(old, 'focus'), after = incidentRates(active, 'focus');
  assert.equal(after.layoff, before.layoff * 1.15);
  assert.equal(after.burnout, before.burnout * 1.1);
  assert.deepEqual(incidentRates({ ...old, employer: { ...old.employer, workModel: 'unknown' } }, 'focus'), before);
});
