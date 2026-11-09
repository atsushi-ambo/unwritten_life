import { CHOICES, INCIDENTS, decisionId } from './engine.js';

export const emptyBook = () => ({ companies: [], choices: [], incidents: [] });
const cleanName = (s) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= 60 && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(s) ? s.trim() : null;
export function validateBook(raw) {
  const result = emptyBook();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const [key, limit, valid] of [
    ['companies', 200, cleanName],
    ['choices', Object.keys(CHOICES).length, (s) => typeof s === 'string' && Object.hasOwn(CHOICES, s) ? s : null],
    ['incidents', Object.keys(INCIDENTS).length, (s) => typeof s === 'string' && Object.hasOwn(INCIDENTS, s) ? s : null],
  ]) {
    if (!Array.isArray(raw[key])) continue;
    for (const value of raw[key].slice(0, 1000)) {
      const item = valid(value);
      if (item && !result[key].includes(item) && result[key].length < limit) result[key].push(item);
    }
  }
  return result;
}
// Occurrences are keyed by their position and value, not by discovery type.
export function gameDiscoveries(game, { startHistory = 0, end = game?.history?.length ?? 0, includeCurrent = true } = {}) {
  const g = game && typeof game === 'object' ? game : {}, entries = [];
  const add = (key, value, source) => {
    const valid = validateBook({ [key]: [value] })[key][0];
    if (valid) entries.push({ key, value: valid, id: JSON.stringify([source, key, valid]) });
  };
  if (includeCurrent) {
    add('companies', g.profile?.company, 'profile');
    add('companies', g.employer?.name, `employer:${g.history?.length ?? 0}`);
    for (const [year, names] of Object.entries(g.careerSeen ?? {})) if (Array.isArray(names)) names.forEach((name, i) => add('companies', name, `career:${year}:${i}`));
    (g.decisions ?? []).forEach((d, i) => { add('choices', decisionId(d), `decision:${i}`); add('companies', d?.name, `decision:${i}`); });
    for (const [year, scene] of Object.entries(g.scenes ?? {})) (scene?.options ?? []).forEach((option, i) => {
      add('choices', option.id, `scene:${year}:${i}`); add('companies', option.decision?.name, `scene:${year}:${i}`);
    });
  }
  (g.history ?? []).slice(startHistory, end).forEach((h, offset) => { const i = startHistory + offset; add('companies', h.employer?.name, `history:${i}`); add('choices', h.choice, `history:${i}`); add('incidents', h.incident?.id, `history:${i}`); });
  return entries;
}
export function bookBaseline(game, options = {}) {
  const baseline = new Set(gameDiscoveries(game, options).map((entry) => entry.id));
  baseline.historyCursor = options.end ?? game?.history?.length ?? 0;
  return baseline;
}
export function recordGame(book, game, baseline, options) {
  const result = validateBook(book), next = new Set(baseline);
  const end = options?.end ?? game?.history?.length ?? 0;
  for (const entry of gameDiscoveries(game, { ...options, startHistory: baseline.historyCursor ?? 0 })) if (!baseline.has(entry.id)) {
    result[entry.key].push(entry.value); next.add(entry.id);
  }
  next.historyCursor = end;
  return { book: validateBook(result), baseline: next };
}
export function bookView(book) {
  const b = validateBook(book);
  return {
    companies: { total: b.companies.length, items: b.companies },
    choices: { total: Object.keys(CHOICES).length, items: Object.entries(CHOICES).map(([id, value]) => b.choices.includes(id) ? value.label : '？？？') },
    incidents: { total: Object.keys(INCIDENTS).length, items: Object.entries(INCIDENTS).map(([id, value]) => b.incidents.includes(id) ? value.title : '？？？') },
    note: '会社はゲーム内の架空の会社や未確認の提案です。実在や募集状況は確認していません。',
  };
}
