// next-decision: ranks ctx.next (the next unlocked question) above the top open gap and surfaces
// exactly one of them as an ask, with a reason and a couple of quick options.
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

type NextOut = { op: 'next'; questionId: string; prompt: string };
type GapOut = { op: 'gap'; text: string };
type NoneOut = { op: 'none' };
export type NextDecisionOut = NextOut | GapOut | NoneOut;

function stub(_input: undefined, ctx: Context): NextDecisionOut {
  if (ctx.next) return { op: 'next', questionId: ctx.next.questionId, prompt: ctx.next.prompt };
  if (ctx.gaps.length) return { op: 'gap', text: ctx.gaps[0] };
  return { op: 'none' };
}

function toCues(out: NextDecisionOut, callId: string): Cue[] {
  if (out.op === 'next') {
    return [{ t: 'ask', id: `${callId}-a1`, text: `The next unanswered question is: ${out.prompt}`, options: ['Answer it', 'Skip'] }];
  }
  if (out.op === 'gap') {
    return [{ t: 'ask', id: `${callId}-a1`, text: `Every question is answered, but there's an open gap: ${out.text}`, options: ['Answer it', 'Skip'] }];
  }
  return [{ t: 'say', id: `${callId}-s1`, text: 'Nothing outstanding: every question is answered and no gaps were found.' }];
}

export const nextDecision: AIFunctionImpl<undefined, NextDecisionOut> = {
  context: { digest: (ctx) => `next=${ctx.next?.questionId ?? 'none'} gaps=${ctx.gaps.length}` },
  stub,
  toCues,
};
