// answer-to-effects: turns free-text answer content into staged effects. The stub calls
// store.ts's exported `stageFor` (singular kind → one add/update, plural kind → one add per
// non-empty line) — the same logic the existing answer()/answerFollowUp() path uses — so this
// function is the trackable, AI-shaped entry point to that behaviour rather than a second copy of it.
// v4.1: a leading `edit <title>: <text>` (case-insensitive) is handled specially — it patches the
// title of the node named, or its description when the new text starts with `desc:`.
//
// v4.3: `decision` (AGENT-RUNTIME.md §9, threshold 'edit-vs-new') covers free text that doesn't use
// the explicit `edit <title>: …` syntax — the regex stays authoritative when it matches (null
// questions). Otherwise Jev is asked whether the text means to edit an existing item or add new
// content and, when candidates exist, which existing item it means.
import { state, stageFor, type Effect, type Node } from '../../store.ts';
import { kindById } from '../../kernel.ts';
import { answerConfidence } from '../decisionConfig.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers, S1Request } from '../types.ts';

export interface AnswerToEffectsIn { kindId: string; content: string; answerId?: string }
export interface AnswerToEffectsOut { effects: Effect[]; warnings: string[] }

const EDIT_RE = /^edit\s+(.+?):\s*(.+)$/i;
const DESC_RE = /^desc:\s*(.+)$/i;

const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const wordsOf = (s: string) => new Set(normTitle(s).replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
function sharedWordCount(a: string, b: string): number {
  const wa = wordsOf(a);
  let n = 0;
  for (const w of wordsOf(b)) if (wa.has(w)) n++;
  return n;
}

/** Apply an edit to a resolved target node — shared by the EDIT_RE path and the decision path. */
function applyEditEffect(target: Node, rest: string, answerId: string): AnswerToEffectsOut {
  const desc = rest.match(DESC_RE);
  const patch = desc ? { description: desc[1].trim() } : { title: rest.trim() };
  return { effects: [{ id: 'ef-0', op: 'update-node', nodeId: target.id, patch, answerId }], warnings: [] };
}

function editEffect(titleRaw: string, rest: string, answerId: string): AnswerToEffectsOut {
  const target = state.graph.nodes.find((n) => n.title.toLowerCase() === titleRaw.trim().toLowerCase());
  if (!target) return { effects: [], warnings: [`No node titled "${titleRaw.trim()}" found.`] };
  return applyEditEffect(target, rest, answerId);
}

/** Existing same-kind titles sharing ≥1 word with the text, up to 10 — candidates for "is this
 * text about one of these instead of new content?" */
function targetCandidates(kindId: string, text: string): Node[] {
  return state.graph.nodes.filter((n) => n.kind === kindId && sharedWordCount(n.title, text) >= 1).slice(0, 10);
}

function stub(input: AnswerToEffectsIn): AnswerToEffectsOut {
  const answerId = input.answerId ?? 'ai:answer-to-effects';
  const edit = input.content.trim().match(EDIT_RE);
  if (edit) {
    const [, titleRaw, rest] = edit;
    return editEffect(titleRaw, rest, answerId);
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

/** 'edit-vs-new': null when the text already matches EDIT_RE (the regex is authoritative) or names
 * an unknown kind (the stub's deterministic error already handles it). Otherwise one choice for
 * intent, plus — only when candidates exist — one choice for which existing item is meant. */
function questions(input: AnswerToEffectsIn): S1Request | null {
  const content = input.content.trim();
  if (EDIT_RE.test(content)) return null;
  const kind = kindById[input.kindId];
  if (!kind) return null;
  const candidates = targetCandidates(input.kindId, content);
  const questions: S1Request['questions'] = {
    intent: {
      type: 'choice',
      instructions: "Does the user's text ask to change an existing item, or does it add new content?",
      criteria: { edit: 'The text asks to change an existing item', new: 'The text adds new content' },
    },
  };
  if (candidates.length) {
    questions.target = {
      type: 'choice',
      instructions: "If the text asks to change an existing item, which one does it mean? Pick none if it refers to nothing listed.",
      criteria: {
        ...Object.fromEntries(candidates.map((c) => [c.id, c.title])),
        none: 'None of these is what the text refers to',
      },
    };
  }
  return { state: { text: content, kind: input.kindId, existingTitles: candidates.map((c) => c.title) }, questions };
}

function decide(answers: S1Answers, input: AnswerToEffectsIn): AnswerToEffectsOut {
  const answerId = input.answerId ?? 'ai:answer-to-effects';
  const content = input.content.trim();
  const intentAnswer = answers.intent;
  const intent = intentAnswer && intentAnswer.type === 'choice' ? intentAnswer.choice : 'new';
  if (intent === 'edit') {
    const targetAnswer = answers.target;
    const targetId = targetAnswer && targetAnswer.type === 'choice' ? targetAnswer.choice : 'none';
    if (targetId !== 'none') {
      const target = state.graph.nodes.find((n) => n.id === targetId);
      if (target) return applyEditEffect(target, content, answerId);
    }
  }
  const kind = kindById[input.kindId];
  if (!kind) return { effects: [], warnings: [`Unknown kind "${input.kindId}".`] };
  return stageFor(input.kindId, input.content, answerId);
}

/** Only the `intent` answer gates this decision — `target`'s own confidence doesn't matter once
 * intent is 'new' (target isn't even asked when there are no candidates), and when intent is
 * 'edit' a wrong target still produces a real (if misdirected) edit, not a wrong shape of output. */
const decision: DecisionSpec<AnswerToEffectsIn, AnswerToEffectsOut> = {
  id: 'edit-vs-new',
  questions,
  decide,
  confidence: (answers) => (answers.intent ? answerConfidence(answers.intent) : 0),
};

export const answerToEffects: AIFunctionImpl<AnswerToEffectsIn, AnswerToEffectsOut> = {
  context: { digest: (ctx: Context) => `next=${ctx.next?.produces ?? 'none'} nodes=${ctx.graph.nodes}` },
  stub,
  toCues,
  decision,
};
