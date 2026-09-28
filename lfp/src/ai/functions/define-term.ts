// define-term: the glossary's two-step ask state machine (moved from ScriptedDirector's
// pendingAsk 'term-title'/'term-desc' handling). The Director holds which stage is pending and
// threads the collected title back in on the second call; the stub itself stays stateless.
//
// v4.3: `decision` (AGENT-RUNTIME.md §9, threshold 'duplicate-detect') covers the 'desc' stage —
// an exact-title match still wins in code with certainty (kept in the stub); near-miss existing
// terms (sharing ≥1 word, not equal) are handed to Jev one noul each.
import { state } from '../../store.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers, S1Question, S1Request } from '../types.ts';

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

const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const wordsOf = (s: string) => new Set(normTitle(s).replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
function sharedWordCount(a: string, b: string): number {
  const wa = wordsOf(a);
  let n = 0;
  for (const w of wordsOf(b)) if (wa.has(w)) n++;
  return n;
}

/** Near-miss existing terms: same-kind title not equal to the new one, sharing ≥1 word. Up to 10. */
function nearMissTermCandidates(newTitle: string) {
  const nt = normTitle(newTitle);
  return state.graph.nodes
    .filter((n) => n.kind === 'term' && normTitle(n.title) !== nt && sharedWordCount(n.title, newTitle) >= 1)
    .slice(0, 10);
}

/** 'duplicate-detect': only at the 'desc' stage, where the new term's title is finally known. Null
 * when there are no near-miss existing terms — the stub's exact-match/new-term path is already right. */
function questions(input: DefineTermIn): S1Request | null {
  if (input.stage !== 'desc') return null;
  const title = input.title.trim();
  const candidates = nearMissTermCandidates(title);
  if (!candidates.length) return null;
  const questions: Record<string, S1Question> = {};
  for (const c of candidates) {
    questions[`term-${c.id}`] = {
      type: 'noul',
      instructions: `Is "${c.title}" the same glossary term as "${title}"?`,
      criteria: { true: 'Same term', false: 'Different term' },
    };
  }
  return { state: { newTitle: title, candidates: candidates.map((c) => ({ id: c.id, title: c.title })) }, questions };
}

function decide(answers: S1Answers, input: DefineTermIn): DefineTermOut {
  const title = input.stage === 'desc' ? input.title.trim() : '';
  const description = input.stage === 'desc' ? input.text.trim() : '';
  for (const c of nearMissTermCandidates(title)) {
    const a = answers[`term-${c.id}`];
    if (a && a.type === 'noul' && a.noul >= 0.5) return { op: 'done', title, description, existingId: c.id };
  }
  return { op: 'done', title, description };
}

const decision: DecisionSpec<DefineTermIn, DefineTermOut> = { id: 'duplicate-detect', questions, decide };

export const defineTerm: AIFunctionImpl<DefineTermIn, DefineTermOut> = {
  context: { digest: () => `terms=${state.graph.nodes.filter((n) => n.kind === 'term').length}` },
  stub,
  toCues,
  decision,
};
