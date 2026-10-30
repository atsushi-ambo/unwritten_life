import { pathToFileURL } from 'node:url';
import { createGame, advance, availableChoices, pendingCareerOffer, onMentalLeave, MAX_AGE, RANKS } from '../public/engine.js';
import { simulationProfile } from './simulate-life-realism.mjs';

const move = (n) => ({ id: 'switch', target: 'custom', name: `合成勤務先${n}`, role: 'tech', companyType: 'small' });
const start = (seed, from, lifeEventsFrom) => createGame(simulationProfile({ age: 25 }), 'steady', seed * 7919,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, from, 0, ...Array(7).fill(0), lifeEventsFrom);
// This is the exact PR #49 promotion policy, with only offersFrom varied.
export function measurePromotionOffers({ seeds = 2000, from = 0, lifeEventsFrom = 0 } = {}) {
  const c = { staffLead: 0, managerSpecialist: 0, directorPrincipal: 0, endedBefore50: 0, seekingAt50: 0,
    managerEver: 0, directorEver: 0, neverPromoted: 0, offers: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    let g = start(seed, from, lifeEventsFrom), peak = 0, promotions = 0;
    for (let year = 0; g.age < 50 && !g.ended; year++) {
      const allowed = availableChoices(g), offer = pendingCareerOffer(g);
      const action = onMentalLeave(g) ? 'rest' : g.employer.kind === 'seeking' ? move(year)
        : offer?.id === 'promotionOffer' ? (g.position.rank === 'lead'
          ? { id: 'promote', track: RANKS[offer.targetRank].track, intent: '打診を受ける' } : 'promote')
          : year % 2 === 0 && allowed.includes('promote') ? 'promote'
            : allowed.includes('negotiate') ? 'negotiate' : year % 2 ? 'rest' : 'focus';
      g = advance(g, action);
      peak = Math.max(peak, RANKS[g.position.rank].level);
      if (g.history.at(-1).outcome?.promotion) promotions++;
      if (g.history.at(-1).incident?.id === 'promotionOffer') c.offers++;
    }
    if (peak >= 2) c.managerEver++;
    if (peak >= 3) c.directorEver++;
    if (!promotions) c.neverPromoted++;
    if (g.ended && g.age < 50) c.endedBefore50++;
    else if (g.employer.kind === 'seeking') c.seekingAt50++;
    else c[RANKS[g.position.rank].level < 2 ? 'staffLead' : RANKS[g.position.rank].level === 2 ? 'managerSpecialist' : 'directorPrincipal']++;
  }
  return { seeds, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / seeds])) };
}

// Three simple policies, each uses the same cohort: stay (decline scouts,
// wait for promotion offers rather than applying),
// balanced (consider alternate scouts), mobile (consider every scout).
// Synthetic names avoid fabricating facts about real employers. No AI/network.
export function measureCareerVariety({ seeds = 2000, from = 0, lifeEventsFrom = 0, strategy = 'balanced' } = {}) {
  const c = { changes: [0, 0, 0, 0], promotions: [0, 0, 0, 0], scouts: [0, 0, 0, 0],
    leaves: [0, 0, 0, 0], promotionOffers: 0, noPromotionOffer: 0, meanScouts: 0, meanPromotions: 0, meanLeaves: 0, leaveYears: 0, workingYears: 0, fastManager: 0, changesOverSix: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    let g = start(seed, from, lifeEventsFrom), changes = 0, promotions = 0, scouts = 0, leaves = 0, offers = 0, fast = false;
    for (let year = 0; !g.ended && g.age < 65; year++) {
      const allowed = availableChoices(g), offer = pendingCareerOffer(g);
      let action;
      if (onMentalLeave(g)) action = 'rest';
      else if (g.employer.kind === 'seeking') action = move(year);
      else if (offer?.id === 'promotionOffer') action = g.position.rank === 'lead'
        ? { id: 'promote', track: RANKS[offer.targetRank].track, intent: '打診を受ける' } : 'promote';
      else if (offer?.id === 'scout' && strategy !== 'stay' && (strategy === 'mobile' || scouts % 2 === 0)) action = move(year);
      else if (strategy !== 'stay' && year % 5 === 0 && allowed.includes('promote')) action = 'promote';
      else action = ['focus', 'learn', 'focus', 'rest', 'connect'][year % 5];
      g = advance(g, action);
      const h = g.history.at(-1);
      if (h.choice === 'switch' || h.outcome?.kind === 'reemployed') changes++;
      if (h.outcome?.promotion) promotions++;
      if (h.incident?.id === 'scout') scouts++;
      if (h.incident?.id === 'promotionOffer') offers++;
      if (h.incident?.effects.mentalLeave && h.incident.id !== 'leaveContinues') leaves++;
      if (h.incident?.effects.mentalLeave) c.leaveYears++;
      if (h.employer.kind !== 'seeking') c.workingYears++;
      if (g.age <= 35 && RANKS[g.position.rank].level >= 2) fast = true;
    }
    for (const [key, value] of Object.entries({ changes, promotions, scouts, leaves })) c[key][Math.min(3, value)]++;
    c.promotionOffers += offers;
    if (!offers) c.noPromotionOffer++;
    c.meanScouts += scouts;
    c.meanPromotions += promotions;
    c.meanLeaves += leaves;
    if (fast) c.fastManager++;
    if (changes > 6) c.changesOverSix++;
  }
  return { seeds, strategy, ...Object.fromEntries(Object.entries(c).map(([key, value]) => [key,
    Array.isArray(value) ? value.map((n) => n / seeds) : value / (['workingYears', 'leaveYears'].includes(key) ? 1 : seeds)])),
    leaveYearRate: c.leaveYears / c.workingYears, leaveOnsetRate: c.meanLeaves / c.workingYears };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seeds = Number(process.argv[2] ?? 2000);
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 10000) throw Error('seeds must be 1..10000');
  console.log(JSON.stringify({ before: measurePromotionOffers({ seeds, from: MAX_AGE }),
    after: measurePromotionOffers({ seeds }),
    variety: ['stay', 'balanced', 'mobile'].map((strategy) => measureCareerVariety({ seeds, strategy })) }, null, 2));
}
