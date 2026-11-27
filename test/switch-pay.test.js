import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, decodeSave, encodeSave, replay, rewindTo, compareWorlds, switchPayChange, MAX_AGE } from '../public/engine.js';
import { simulationProfile } from '../scripts/simulate-life-realism.mjs';
import { measureWorkLife } from '../scripts/simulate-switch-pay.mjs';

test('bands follow the 2024 labour survey shares of pay change after a move', () => {
  const draws = Array.from({ length: 10000 }, (_, k) => switchPayChange((k + 0.5) / 10000));
  const share = (f) => draws.filter(f).length / draws.length;
  assert.ok(Math.abs(share((r) => r >= 0.1) - 0.311) < 0.005);
  assert.ok(Math.abs(share((r) => r <= -0.1) - 0.217) < 0.005);
  assert.ok(Math.abs(share((r) => Math.abs(r) <= 0.01) - 0.284) < 0.005);
  assert.ok(draws.every((r) => r >= -0.3 && r <= 0.35));
});

test('synthetic careers land near the survey tails', () => {
  const { switchPay, switches } = measureWorkLife({ seeds: 300 });
  assert.ok(switches > 300);
  assert.ok(switchPay.up10 > 24 && switchPay.up10 < 36, `up10 ${switchPay.up10}`);
  assert.ok(switchPay.down10 > 17 && switchPay.down10 < 30, `down10 ${switchPay.down10}`);
});

test('older saves keep their recorded moves and the new rule starts at the boundary', () => {
  const move = { id: 'switch', target: 'custom', name: '合成勤務先', role: 'tech', companyType: 'small' };
  const fresh = createGame(simulationProfile({ age: 30 }), 'steady', 7919);
  const saved = JSON.parse(encodeSave(advance(fresh, move)));
  delete saved.switchPayFrom;
  const old = decodeSave(JSON.stringify(saved));
  assert.equal(old.switchPayFrom, 1);
  const legacy = advance(createGame(simulationProfile({ age: 30 }), 'steady', 7919,
    ...Array(22).fill(0), 'standard', 0, 110), move);
  assert.equal(old.salary, legacy.salary);
  assert.notEqual(advance(fresh, move).salary, legacy.salary);
});

test('switch pay boundary survives save, replay, rewind and comparison and rejects invalid values', () => {
  const profile = simulationProfile({ age: 30 });
  let g = createGame(profile, 'steady', 42, ...Array(22).fill(0), 'standard', 0, 7);
  g = advance(advance(g, 'rest'), 'rest');
  assert.deepEqual(decodeSave(encodeSave(g)), g);
  assert.deepEqual(replay(profile, g.scenario, g.seed, g.decisions, {}, false, ...Array(22).fill(0), undefined, g.era, 0, 7), g);
  assert.equal(rewindTo(g, 1).switchPayFrom, 7);
  for (const world of compareWorlds(g)) assert.equal(world.switchPayFrom, 7);
  const save = JSON.parse(encodeSave(g));
  for (const invalid of [-1, MAX_AGE + 1, 1.5, null]) {
    assert.throws(() => createGame(profile, 'steady', 42, ...Array(22).fill(0), 'standard', 0, invalid));
    assert.throws(() => encodeSave({ ...g, switchPayFrom: invalid }));
    assert.throws(() => decodeSave(JSON.stringify({ ...save, switchPayFrom: invalid })));
  }
});
