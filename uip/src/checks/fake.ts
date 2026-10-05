// CHECKS-SPEC §2.4 tail / §3.3 step 4: deterministic fakes. A fake never raises an alarm it cannot
// justify: with no overlap it lands in the ask band (unknown). Pure.
import type { S1Answer } from '../types';
import { overlap, tokens } from '../s1/text';
import type { CheckUnit, PlanCtx } from './types';
import { CHECKS } from './catalog';

/** `o = overlap(tokens(a), tokens(b))`; `p = o ≥ 2 ? .86 : o === 1 ? .72 : .35`. */
export function fakeNoul(a: string, b: string): S1Answer {
  const o = overlap(tokens(a), tokens(b));
  return { type: 'noul', noul: o >= 2 ? 0.86 : o === 1 ? 0.72 : 0.35 };
}

/** A choice at `conf` on `pick`; every other option shares the rest equally. */
export function choiceAt(keys: string[], pick: string, conf: number): S1Answer {
  const others = keys.filter((k) => k !== pick);
  const rest = others.length ? +((1 - conf) / others.length).toFixed(4) : 0;
  return { type: 'choice', choice: pick, confidence: conf, probabilities: { [pick]: conf, ...Object.fromEntries(others.map((k) => [k, rest])) } };
}

/** The option with the most overlap; ≥ 2 and unique → .75, 1 → .50, 0 → none @ .20. */
export function fakeChoice(text: string, options: Record<string, string>): S1Answer {
  const keys = Object.keys(options);
  const real = keys.filter((k) => k !== 'none');
  const tt = tokens(text);
  const scored = real.map((k) => ({ k, o: overlap(tt, tokens(options[k])) })).sort((a, b) => b.o - a.o);
  const top = scored[0];
  const fallback = keys.includes('none') ? 'none' : real[0];
  if (!top || top.o === 0) return choiceAt(keys, fallback, 0.2);
  const unique = scored.length < 2 || scored[1].o < top.o;
  return choiceAt(keys, top.k, top.o >= 2 && unique ? 0.75 : 0.5);
}

/** Every question of the unit answered by its check's fake. */
export function fakeAnswers(unit: CheckUnit, ctx: PlanCtx): Record<string, S1Answer> {
  return CHECKS[unit.checkId].fake(unit, ctx);
}
