// answer-to-effects: turns free-text answer content into staged effects. The stub calls
// store.ts's exported `stageFor` (singular kind → one add/update, plural kind → one add per
// non-empty line) — the same logic the existing answer()/answerFollowUp() path uses — so this
// function is the trackable, AI-shaped entry point to that behaviour rather than a second copy of it.
import { stageFor, type Effect } from '../../store.ts';
import { kindById } from '../../kernel.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface AnswerToEffectsIn { kindId: string; content: string; answerId?: string }
export interface AnswerToEffectsOut { effects: Effect[]; warnings: string[] }

function stub(input: AnswerToEffectsIn): AnswerToEffectsOut {
  const kind = kindById[input.kindId];
  if (!kind) return { effects: [], warnings: [`Unknown kind "${input.kindId}".`] };
  const answerId = input.answerId ?? 'ai:answer-to-effects';
  return stageFor(input.kindId, input.content, answerId);
}

function toCues(out: AnswerToEffectsOut, callId: string): Cue[] {
  const effects = out.effects.map((e, i) => ({ ...e, id: `${callId}-e${i}` }));
  const note = effects.length ? `Staged ${effects.length} change${effects.length === 1 ? '' : 's'}.` : (out.warnings[0] ?? 'Nothing to stage.');
  return [{ t: 'stage', effects, note }];
}

export const answerToEffects: AIFunctionImpl<AnswerToEffectsIn, AnswerToEffectsOut> = {
  context: { digest: (ctx: Context) => `next=${ctx.next?.produces ?? 'none'} nodes=${ctx.graph.nodes}` },
  stub,
  toCues,
};
