// review-change: stub only (Stage 1-A fills in the real heuristic). Exists so ai/index.ts's
// registry/impl id check passes and the app boots (v4.1 stage 0, plan item 10).
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface ReviewChangeOut { text: string }

function toCues(out: ReviewChangeOut, callId: string): Cue[] {
  return [{ t: 'say', id: `${callId}-s1`, text: out.text }];
}

export const reviewChange: AIFunctionImpl<undefined, ReviewChangeOut> = {
  context: { digest: (_ctx: Context) => 'stub' },
  stub: () => ({ text: 'review-change is stubbed; Stage 1-A wires up the real verdict.' }),
  toCues,
};
