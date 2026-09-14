// define-term: the glossary's two-step ask state machine (moved from ScriptedDirector's
// pendingAsk 'term-title'/'term-desc' handling). The Director holds which stage is pending and
// threads the collected title back in on the second call; the stub itself stays stateless.
import { state } from '../../store.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export type DefineTermIn =
  | { stage: 'start' }
  | { stage: 'title'; text: string }
  | { stage: 'desc'; text: string; title: string };

type AskTitleOut = { op: 'ask-title' };
type AskDescOut = { op: 'ask-desc'; title: string };
type DoneOut = { op: 'done'; title: string; description: string; existingId?: string };
export type DefineTermOut = AskTitleOut | AskDescOut | DoneOut;

function stub(input: DefineTermIn): DefineTermOut {
  if (input.stage === 'start') return { op: 'ask-title' };
  if (input.stage === 'title') return { op: 'ask-desc', title: input.text.trim() };
  const title = input.title.trim();
  const existing = state.graph.nodes.find((n) => n.kind === 'term' && n.title.toLowerCase() === title.toLowerCase());
  return { op: 'done', title, description: input.text.trim(), existingId: existing?.id };
}

function toCues(out: DefineTermOut, callId: string): Cue[] {
  if (out.op === 'ask-title') return [{ t: 'ask', id: `${callId}-a1`, text: 'What term should I add to the glossary? Just the word or phrase.' }];
  if (out.op === 'ask-desc') return [{ t: 'ask', id: `${callId}-a1`, text: `And how would you define "${out.title}" in one sentence?` }];
  return [
    { t: 'glossary', op: 'upsert', title: out.title, description: out.description, id: out.existingId },
    { t: 'navigate', view: 'overview' },
    { t: 'say', id: `${callId}-s1`, text: `Added "${out.title}" to the glossary. It committed straight away; you can undo it from Definition.` },
  ];
}

export const defineTerm: AIFunctionImpl<DefineTermIn, DefineTermOut> = {
  context: { digest: () => `terms=${state.graph.nodes.filter((n) => n.kind === 'term').length}` },
  stub,
  toCues,
};
