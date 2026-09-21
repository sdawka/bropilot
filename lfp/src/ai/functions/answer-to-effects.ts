// answer-to-effects: turns free-text answer content into staged effects. The stub calls
// store.ts's exported `stageFor` (singular kind → one add/update, plural kind → one add per
// non-empty line) — the same logic the existing answer()/answerFollowUp() path uses — so this
// function is the trackable, AI-shaped entry point to that behaviour rather than a second copy of it.
// v4.1: a leading `edit <title>: <text>` (case-insensitive) is handled specially — it patches the
// title of the node named, or its description when the new text starts with `desc:`.
import { state, stageFor, type Effect } from '../../store.ts';
import { kindById } from '../../kernel.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface AnswerToEffectsIn { kindId: string; content: string; answerId?: string }
export interface AnswerToEffectsOut { effects: Effect[]; warnings: string[] }

const EDIT_RE = /^edit\s+(.+?):\s*(.+)$/i;
const DESC_RE = /^desc:\s*(.+)$/i;

function stub(input: AnswerToEffectsIn): AnswerToEffectsOut {
  const answerId = input.answerId ?? 'ai:answer-to-effects';
  const edit = input.content.trim().match(EDIT_RE);
  if (edit) {
    const [, titleRaw, rest] = edit;
    const target = state.graph.nodes.find((n) => n.title.toLowerCase() === titleRaw.trim().toLowerCase());
    if (!target) return { effects: [], warnings: [`No node titled "${titleRaw.trim()}" found.`] };
    const desc = rest.match(DESC_RE);
    const patch = desc ? { description: desc[1].trim() } : { title: rest.trim() };
    return { effects: [{ id: 'ef-0', op: 'update-node', nodeId: target.id, patch, answerId }], warnings: [] };
  }
  const kind = kindById[input.kindId];
  if (!kind) return { effects: [], warnings: [`Unknown kind "${input.kindId}".`] };
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
