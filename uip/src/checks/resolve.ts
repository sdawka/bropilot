// CHECKS-SPEC §2.1 generic verdict rules. Answers → CheckResult, in code. Pure.
import type { Band, S1Answer } from '../types';
import { bandFor } from '../s1/decisionConfig';
import type { CheckResult, CheckUnit, PlanCtx, Verdict } from './types';
import { CHECKS } from './catalog';

export type Resolved = Omit<CheckResult, 'at' | 'model' | 'fake' | 'hash'>;

/** conf(noul p) = |p − .5|·2 */
export const noulConf = (p: number) => Math.abs(p - 0.5) * 2;
export const noulOf = (a: S1Answer | undefined) => (a && a.type === 'noul' ? a.noul : 0.5);

export function nounVerdict(p: number, t: number, polarity: 'yes-good' | 'yes-bad'): Verdict {
  const band = bandFor(noulConf(p), t);
  return band === 'ask' ? 'unknown' : band === 'offer' ? 'weak' : (p >= 0.5) === (polarity === 'yes-good') ? 'solid' : 'broken';
}

/** Multi-question units: the band of the weakest answer caps the rolled-up verdict (offer → weak, ask → unknown). */
export function rollup(raw: Verdict, band: Band): Verdict {
  if (band === 'ask') return 'unknown';
  if (band === 'offer' && (raw === 'solid' || raw === 'broken')) return 'weak';
  return raw;
}

export function resolveCheck(unit: CheckUnit, answers: Record<string, S1Answer>, ctx: PlanCtx): Resolved {
  return CHECKS[unit.checkId].resolve(unit, answers, ctx);
}
