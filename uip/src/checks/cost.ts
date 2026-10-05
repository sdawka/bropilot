// CHECKS-SPEC §3.6: input-token cost. Output is not billed (research, 2026-10-01). Pure.
import type { CheckModel, CheckUnit, CostEstimate } from './types';
import { batch, requestChars } from './batch';

export const PRICE_PER_MTOK = { 'clef-flash': 0.09, clef: 0.24 } as const;
export const wireModel = (m: CheckModel): 'clef-flash' | 'clef' => (m === 'clef' ? 'clef' : 'clef-flash');

function sum(units: CheckUnit[], wire: 'clef-flash' | 'clef') {
  const reqs = batch(units, wire);
  let tokens = 0, questions = 0;
  for (const r of reqs) { tokens += Math.ceil(requestChars(r.request.questions) / 4); questions += Object.keys(r.request.questions).length; }
  return { questions, requests: reqs.length, tokens, usd: (tokens * PRICE_PER_MTOK[wire]) / 1e6 };
}

/** Σ over batch(units) of ceil(requestChars / 4) × price / 1e6; escalate = flash(all) + clef(consistency units). */
export function estimate(units: CheckUnit[], model: CheckModel): CostEstimate {
  const a = sum(units, wireModel(model));
  if (model !== 'escalate') return { ...a, model };
  const b = sum(units.filter((u) => u.family === 'consistency'), 'clef');
  return { questions: a.questions + b.questions, requests: a.requests + b.requests, tokens: a.tokens + b.tokens, usd: a.usd + b.usd, model };
}
/** `≈ 312 questions · 7 requests · ≈ $0.006 on clef-flash` */
export const formatEstimate = (e: CostEstimate) =>
  `≈ ${e.questions} questions · ${e.requests} requests · ≈ $${e.usd.toFixed(3)} on ${e.model === 'escalate' ? 'clef-flash + clef' : wireModel(e.model)}`;
