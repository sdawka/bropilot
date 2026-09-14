// answer-to-effects: turns free-text answer content into staged effects. The stub mirrors
// store.ts's private `stageFor` (singular kind → one add/update, plural kind → one add per
// non-empty line), reimplemented here against store.ts's exported primitives so the store keeps
// owning `stageFor` for the existing answer()/answerFollowUp() path while this function is the
// trackable, AI-shaped entry point to the same behaviour.
import { state, kebab, uniqueId, type Effect, type Node } from '../../store.ts';
import { kindById } from '../../kernel.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface AnswerToEffectsIn { kindId: string; content: string; answerId?: string }
export interface AnswerToEffectsOut { effects: Effect[]; warnings: string[] }

function stub(input: AnswerToEffectsIn): AnswerToEffectsOut {
  const kind = kindById[input.kindId];
  const answerId = input.answerId ?? 'ai:answer-to-effects';
  const effects: Effect[] = [];
  const warnings: string[] = [];
  if (!kind) { warnings.push(`Unknown kind "${input.kindId}".`); return { effects, warnings }; }
  const taken = new Set(state.graph.nodes.map((n) => n.id));
  const lines = input.content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (kind.singular) {
    const existing = state.graph.nodes.find((n) => n.kind === kind.id);
    const title = lines.join(' ');
    if (existing) effects.push({ id: 'e0', op: 'update-node', nodeId: existing.id, patch: { title, status: 'draft', answerId }, answerId });
    else effects.push({ id: 'e0', op: 'add-node', node: { id: uniqueId(`${kind.id}-${kebab(title)}`, taken), kind: kind.id, title, status: 'draft', answerId }, answerId });
  } else {
    for (const line of lines) {
      if (state.graph.nodes.some((n) => n.kind === kind.id && n.title.toLowerCase() === line.toLowerCase())) { warnings.push(`"${line}" already exists as a ${kind.label}; skipped.`); continue; }
      const node: Node = { id: uniqueId(`${kind.id}-${kebab(line)}`, taken), kind: kind.id, title: line, status: 'draft', answerId };
      effects.push({ id: `e${effects.length}`, op: 'add-node', node, answerId });
    }
  }
  if (!effects.length) warnings.push('Nothing to stage.');
  return { effects, warnings };
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
