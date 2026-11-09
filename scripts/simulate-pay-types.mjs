import { pathToFileURL } from 'node:url';
import { createGame, incidentRates, salaryCeiling } from '../public/engine.js';
import { simulationProfile } from './simulate-life-realism.mjs';

// Synthetic first-year expected incident rates and ceilings, not real statistics.
export function measurePayTypes(seeds = 1000) {
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error('seeds must be 1..10000');
  const result = {};
  for (const workModel of ['services', 'product', 'inhouse', 'public', 'self', 'unknown']) {
    let layoff = 0, burnout = 0, ceiling = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const g = createGame(simulationProfile({ workModel }), 'steady', seed * 7919);
      const rates = incidentRates(g, 'focus');
      layoff += rates.layoff ?? 0; burnout += rates.burnout ?? 0; ceiling += salaryCeiling(g);
    }
    result[workModel] = { seeds, averageLayoffRate: layoff / seeds, averageBurnoutRate: burnout / seeds, averageCeiling: ceiling / seeds };
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(measurePayTypes(Number(process.argv[2] ?? 1000)), null, 2));
