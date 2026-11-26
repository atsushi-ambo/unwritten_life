import { pathToFileURL } from 'node:url';
import { createGame, advance, pendingCareerOffer, onMentalLeave, MAX_AGE } from '../public/engine.js';
import { simulationProfile } from './simulate-life-realism.mjs';

const move = (n) => ({ id: 'switch', target: 'custom', name: `合成勤務先${n}`, role: 'tech', companyType: 'small' });

export function measureWorkLife({ seeds = 2000, switchPayFrom = 0 } = {}) {
  const incidents = {}, pay = { up10: 0, up: 0, same: 0, down: 0, down10: 0 };
  let workingYears = 0, switches = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let g = createGame(simulationProfile({ age: 25 }), 'steady', seed * 7919,
      ...Array(22).fill(0), 'standard', 0, switchPayFrom);
    for (let year = 0; !g.ended && g.age < 60; year++) {
      const action = onMentalLeave(g) ? 'rest' : g.employer.kind === 'seeking' ? move(year)
        : pendingCareerOffer(g)?.id === 'scout' && year % 2 === 0 ? move(year)
          : ['focus', 'learn', 'focus', 'rest', 'connect'][year % 5];
      const before = g.salary;
      g = advance(g, action);
      const h = g.history.at(-1);
      if (h.employer?.kind !== 'seeking') workingYears++;
      if (h.incident) {
        const id = h.incident.id + (h.incident.severe ? 'Severe' : '');
        incidents[id] = (incidents[id] ?? 0) + 1;
      }
      if (h.choice === 'switch' && before > 0) {
        switches++;
        const r = g.salary / before - 1;
        pay[r >= 0.1 ? 'up10' : r > 0.01 ? 'up' : r >= -0.01 ? 'same' : r > -0.1 ? 'down' : 'down10']++;
      }
    }
  }
  const share = (n, d) => Math.round((1000 * n) / d) / 10;
  return {
    seeds, workingYears, switches,
    switchPay: Object.fromEntries(Object.entries(pay).map(([k, v]) => [k, share(v, switches)])),
    incidentsPerYear: Object.fromEntries(Object.entries(incidents).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, share(v, workingYears)])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 2000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error('seeds must be 1..10000');
  console.log(JSON.stringify({ before: measureWorkLife({ seeds, switchPayFrom: MAX_AGE }),
    after: measureWorkLife({ seeds }) }, null, 2));
}
