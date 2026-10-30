import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchReview, createGame, advance, applyScene, choiceForecast } from '../public/engine.js';

const profile = { age: 30, region: 'city', job: 'tech', income: 500, ai: 'sometimes', priority: 'balance', gender: 'undisclosed', household: 'solo', savings: 500, stocks: 100, monthlyCost: 12, rent: 7, housing: 'rent', companyType: 'unknown', company: '', pension: 180 };
const scene = { title: '選択', body: '次を考える', options: ['focus', 'learn', 'rest'].map(id => ({ id, label: id === 'focus' ? '仕事' : id === 'learn' ? '学ぶ' : '休む', hint: '選ぶ' })) };

test('分岐を決定的に再生し元のゲームを変えず、成功率は当時の予測と一致する', () => {
  const before = applyScene(createGame(profile, 'steady', 567), scene);
  let game = advance(before, 'focus');
  assert.ok(['success', 'setback'].includes(game.history[0].outcome.kind));
  const saved = structuredClone(game);
  const result = branchReview(game);
  assert.deepEqual(game, saved);
  assert.deepEqual(result, branchReview(game));
  assert.equal(result[0].alternatives.find(a => a.label === '学ぶ').forecast.chance, choiceForecast(before, 'learn').chance);
  assert.ok(result[0].comparison);
});

test('実行不能な選択肢を除外し、旧セーブでも落ちない', () => {
  let game = advance(applyScene(createGame({ ...profile, savings: 20, stocks: 0 }, 'steady', 567), scene), 'focus');
  game.scenes['0'].options.push({ id: 'startup', label: '高額な起業', decision: { id: 'startup', venture: 'agriculture', name: '事業' } });
  assert.equal(branchReview(game)[0].alternatives.find(a => a.label === '高額な起業').forecast, null);
  assert.notEqual(branchReview(game)[0].comparison?.label, '高額な起業');
  delete game.oddsFrom;
  assert.deepEqual(branchReview(game), []);
});
