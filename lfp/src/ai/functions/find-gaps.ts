// find-gaps: v4.1 folds the old two ad-hoc checks (no edges / bets with no metric) into the
// kernel itself (S145) — this is now a thin reporter over `checks.ts::checkInvariants`, one line
// per violation. Kept as a plain exported function too, since director.ts's `currentContext`
// calls it directly on every context publish — that isn't itself an AI call, so it shouldn't go
// through `runAI`/`state.aiCalls`.
//
// 2026-09-28 (founder sessions): "No gaps found." was said while template questions were still
// unanswered and grouped violations sat on the Now strip. The reply now leads with an honest
// summary (gapSummary): template questions left (naming the next), gap groups (the Now strip's
// grouping, deferred ones counted as skipped) and follow-ups awaiting an answer.
import { state, nodeById, nextQuestion, committedAnswerFor } from '../../store.ts';
import { checkInvariants } from '../../checks.ts';
import { groupViolations } from '../../consolidate.ts';
import { QUESTIONS } from '../../kernel.ts';
import reality from '../../reality.json';
import type { RealityFile } from '../../store.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

/** One line per violation from checkInvariants(state.graph). */
export function computeGaps(): string[] {
  return checkInvariants(state.graph).map((v) => v.message);
}

export interface GapSummary {
  questionsTotal: number;
  questionsAnswered: number;
  questionsLeft: number;
  nextQuestion: { id: string; prompt: string } | null;
  groups: number; // open gap groups (the Now strip's grouping), not skipped
  skipped: number; // gap groups the user deferred ("Skip")
  followups: number; // non-violation follow-ups still awaiting an answer
}

/** The same kernel view store.ts::currentViolations uses (reality matches + answered questions). */
function violationsNow() {
  return checkInvariants(state.graph, { matches: (reality as RealityFile).matches ?? {} }, { answered: state.answers.map((a) => a.questionId) });
}

/** Honest counts for the Talk panel's progress chip and the find-gaps reply. */
export function gapSummary(): GapSummary {
  const answeredIds = new Set(state.answers.map((a) => a.questionId));
  const answered = QUESTIONS.filter((q) => answeredIds.has(q.id) || committedAnswerFor(q.id)).length;
  const groups = groupViolations(violationsNow().filter((v) => v.raise === 'question'), state.graph);
  const deferredRefs = new Set(
    state.followups.filter((f) => f.raisedBy?.kind === 'violation' && f.deferred && f.answerIds.length === 0).map((f) => f.raisedBy!.ref),
  );
  const skipped = groups.filter((g) => deferredRefs.has(g.id) || (g.violationIds.length === 1 && deferredRefs.has(g.violationIds[0]))).length;
  const followups = state.followups.filter((f) => f.raisedBy?.kind !== 'violation' && f.answerIds.length === 0 && !f.deferred).length;
  const nq = nextQuestion.value;
  return {
    questionsTotal: QUESTIONS.length,
    questionsAnswered: answered,
    questionsLeft: QUESTIONS.length - answered,
    nextQuestion: nq ? { id: nq.id, prompt: nq.prompt } : null,
    groups: groups.length - skipped,
    skipped,
    followups,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "3 template questions left (next: "Who is it for?"). 2 gap groups, 1 skipped. 1 follow-up awaiting an answer." */
export function summaryText(s: GapSummary): string {
  const parts: string[] = [];
  if (s.questionsLeft > 0) parts.push(`${plural(s.questionsLeft, 'template question')} left${s.nextQuestion ? ` (next: "${s.nextQuestion.prompt}")` : ''}.`);
  if (s.groups || s.skipped) parts.push(`${plural(s.groups, 'gap group')}${s.skipped ? `, ${s.skipped} skipped` : ''}.`);
  if (s.followups) parts.push(`${plural(s.followups, 'follow-up')} awaiting an answer.`);
  return parts.join(' ');
}

export interface FindGapsOut { gaps: string[]; pointIds: string[]; summary?: GapSummary }

function stub(): FindGapsOut {
  const violations = checkInvariants(state.graph);
  const first = violations[0];
  const pointIds = first ? first.subjects.filter((id) => nodeById(id)) : [];
  return { gaps: violations.map((v) => v.message), pointIds, summary: gapSummary() };
}

function toCues(out: FindGapsOut, callId: string): Cue[] {
  const cues: Cue[] = [];
  if (out.pointIds.length) cues.push({ t: 'point', nodes: out.pointIds, focus: out.pointIds[0] });
  // a live (flue) output is validated against the {gaps, pointIds} schema, so the summary is recomputed here
  const head = summaryText(out.summary ?? gapSummary());
  if (!out.gaps.length) {
    cues.push({ t: 'say', id: `${callId}-s1`, text: head || 'No gaps found.' });
    return cues;
  }
  const shown = out.gaps.slice(0, 5);
  const text = `${head ? head + ' ' : ''}${shown.join(' ')} (${out.gaps.length} open gap${out.gaps.length === 1 ? '' : 's'} total.)`;
  cues.push({ t: 'say', id: `${callId}-s1`, text });
  return cues;
}

export const findGaps: AIFunctionImpl<undefined, FindGapsOut> = {
  context: { digest: (ctx) => `gaps=${ctx.gaps.length}` },
  stub,
  toCues,
};
