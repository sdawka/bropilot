// next-decision: surfaces the single top-ranked open item from store.ts's `rankOpen()` (four
// tiers: agent-blocking > next template question > violation > rest), falling back to ctx.next
// when rankOpen() somehow disagrees with the context snapshot. One ask, one tier word, done.
import { rankOpen } from '../../store.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';
import type { OpenItem } from '../../types.ts';

export interface NextDecisionOut { item: OpenItem | null; openCount: number }

const TIER_WORD: Record<OpenItem['tier'], string> = {
  1: 'Blocking:',
  2: 'Next question:',
  3: 'Gap:',
  4: 'Open thread:',
};

function stub(_input: undefined, ctx: Context): NextDecisionOut {
  const items = rankOpen();
  const item = items[0] ?? ctx.next ?? null;
  return { item, openCount: items.length };
}

function toCues(out: NextDecisionOut, callId: string): Cue[] {
  if (!out.item) {
    return [{ t: 'say', id: `${callId}-s1`, text: 'Nothing outstanding: every question is answered and no gaps were found.' }];
  }
  const options = out.item.options?.length ? out.item.options : ['Answer it', 'Skip'];
  return [{ t: 'ask', id: `${callId}-a1`, text: `${TIER_WORD[out.item.tier]} ${out.item.prompt}`, options }];
}

export const nextDecision: AIFunctionImpl<undefined, NextDecisionOut> = {
  context: {
    digest: (ctx: Context) => {
      const items = rankOpen();
      const item = items[0] ?? ctx.next;
      return `tier=${item?.tier ?? 'none'} id=${item?.id ?? 'none'} open=${items.length}`;
    },
  },
  stub,
  toCues,
};
