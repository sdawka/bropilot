// CHECKS-SPEC §3.2: pack units into /api/decide requests. Homogeneous (one checkId per request), unit-key
// order, a unit is never split, ≤ 64 questions and ≤ 60 000 chars of JSON.stringify({state, questions}). Pure.
// `mixSmall` (lazy ensure / recheck): the homogeneous groups are then packed whole into mixed requests under
// the same caps, so a column costs 1-2 requests. Safe per §1: the state is a constant and every question
// carries everything it reads. Default (runAll, eval) stays homogeneous.
import type { DecideRequest, S1Question } from '../types';
import type { CheckUnit } from './types';
import { CHECK_STATE } from './phrasing';

export const MAX_QUESTIONS = 64;
export const MAX_CHARS = 60_000;
export const requestChars = (questions: Record<string, S1Question>) => JSON.stringify({ state: CHECK_STATE, questions }).length;

export type Batch = { request: DecideRequest; units: CheckUnit[] };
export function batch(units: CheckUnit[], model: 'clef-flash' | 'clef', opts: { mixSmall?: boolean } = {}): Batch[] {
  const asked = units.filter((u) => !u.code && Object.keys(u.questions).length)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const out: { request: DecideRequest; units: CheckUnit[] }[] = [];
  let cur: CheckUnit[] = [], qs: Record<string, S1Question> = {};
  const close = () => {
    if (cur.length) out.push({ request: { fn: 'check', state: CHECK_STATE, questions: qs, model }, units: cur });
    cur = []; qs = {};
  };
  for (const u of asked) {
    if (cur.length && cur[0].checkId !== u.checkId) close();
    const next = { ...qs, ...u.questions };
    if (cur.length && (Object.keys(next).length > MAX_QUESTIONS || requestChars(next) > MAX_CHARS)) { close(); qs = { ...u.questions }; }
    else qs = next;
    cur.push(u);
  }
  close();
  return opts.mixSmall ? mix(out, model) : out;
}

/** Lazy packing: whole homogeneous groups (never a split unit) first-fit into mixed requests, largest first. */
function mix(reqs: Batch[], model: 'clef-flash' | 'clef'): Batch[] {
  if (reqs.length < 2) return reqs;
  const bins: Batch[] = [];
  const size = (b: Batch) => Object.keys(b.request.questions).length;
  for (const r of [...reqs].sort((x, y) => size(y) - size(x))) {
    const bin = bins.find((b) => {
      const next = { ...b.request.questions, ...r.request.questions };
      return Object.keys(next).length <= MAX_QUESTIONS && requestChars(next) <= MAX_CHARS;
    });
    if (bin) { bin.request = { ...bin.request, questions: { ...bin.request.questions, ...r.request.questions } }; bin.units = [...bin.units, ...r.units]; }
    else bins.push({ request: { fn: 'check', state: CHECK_STATE, questions: { ...r.request.questions }, model }, units: [...r.units] });
  }
  return bins;
}
