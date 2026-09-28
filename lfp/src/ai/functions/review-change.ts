// review-change: checks a task's targeted tests against the rules they verify, condition by
// condition (S152). Heuristic: `serves-intent` when every condition of every verified rule has a
// targeted test whose `props.condition` names it; `overfits` when the task's tests only cover
// some of a rule's conditions (green on the letter, not the whole rule); `unclear` when the task
// has no targeted tests, or none of them verify a rule.
//
// v4.3: `decision` (AGENT-RUNTIME.md §9, threshold 'review-change') asks Jev to judge the verdict
// itself once the structural bookkeeping (which tests, which rules, which conditions are covered
// by an exact-match test) is done in code — `computeBasis` is that bookkeeping, shared by the stub
// and the decision path so `reasons`/`testIds`/`ruleIds`/`taskId`/`taskTitle` are always the same.
import { state, nodeById } from '../../store.ts';
import { conditionsOf } from '../../checks.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers, S1Request } from '../types.ts';
import type { Node } from '../../store.ts';

export interface ReviewChangeIn { taskId: string }
export interface ReviewChangeOut {
  verdict: 'serves-intent' | 'overfits' | 'unclear';
  reasons: string[];
  taskId: string;
  taskTitle: string;
  testIds: string[];
  ruleIds: string[];
}

interface Coverage { ruleId: string; ruleTitle: string; condition: string; coveredByExactMatch: boolean }
interface Basis { task: Node; tests: Node[]; testIds: string[]; rules: Node[]; ruleIds: string[]; coverage: Coverage[] }

/** The structural half of a review: which tests a task targets, which rules they verify, and
 * whether each condition is covered by an exact-match test. Returns `unclear` directly for every
 * structural reason (no task, no tests, no rules) — those never reach a question, they're certain
 * in code. */
function computeBasis(input: ReviewChangeIn): { basis: Basis } | { unclear: ReviewChangeOut } {
  const task = nodeById(input.taskId);
  if (!task) {
    return { unclear: { verdict: 'unclear', reasons: [`No task "${input.taskId}" found.`], taskId: input.taskId, taskTitle: input.taskId, testIds: [], ruleIds: [] } };
  }
  const testIds = state.graph.edges.filter((e) => e.type === 'targets' && e.src === task.id).map((e) => e.dst);
  const tests = testIds.map((id) => nodeById(id)).filter((n): n is NonNullable<typeof n> => !!n);
  if (!tests.length) {
    return { unclear: { verdict: 'unclear', reasons: [`"${task.title}" targets no tests.`], taskId: task.id, taskTitle: task.title, testIds: [], ruleIds: [] } };
  }
  const ruleIds = [...new Set(tests.flatMap((t) => state.graph.edges.filter((e) => e.type === 'verifies' && e.src === t.id).map((e) => e.dst)))];
  const rules = ruleIds.map((id) => nodeById(id)).filter((n): n is NonNullable<typeof n> => !!n);
  if (!rules.length) {
    return { unclear: { verdict: 'unclear', reasons: [`None of the tests "${task.title}" targets verify a rule.`], taskId: task.id, taskTitle: task.title, testIds, ruleIds: [] } };
  }
  const coverage: Coverage[] = [];
  for (const rule of rules) {
    for (const cond of conditionsOf(rule)) {
      const coveredByExactMatch = tests.some((t) => (t.props?.condition ?? '').trim() === cond);
      coverage.push({ ruleId: rule.id, ruleTitle: rule.title, condition: cond, coveredByExactMatch });
    }
  }
  return { basis: { task, tests, testIds, rules, ruleIds, coverage } };
}

const coverageReason = (c: Coverage) => c.coveredByExactMatch
  ? `"${c.ruleTitle}" condition "${c.condition}" is covered.`
  : `"${c.ruleTitle}" condition "${c.condition}" is not covered by any targeted test.`;

function stub(input: ReviewChangeIn): ReviewChangeOut {
  const r = computeBasis(input);
  if ('unclear' in r) return r.unclear;
  const { task, testIds, ruleIds, coverage } = r.basis;
  const reasons = coverage.map(coverageReason);
  const allCovered = coverage.every((c) => c.coveredByExactMatch);
  return { verdict: allCovered ? 'serves-intent' : 'overfits', reasons, taskId: task.id, taskTitle: task.title, testIds, ruleIds };
}

function toCues(out: ReviewChangeOut, callId: string): Cue[] {
  const cues: Cue[] = [];
  const pointIds = [out.taskId, ...out.testIds, ...out.ruleIds].filter((id) => nodeById(id));
  if (pointIds.length) cues.push({ t: 'point', nodes: pointIds, focus: out.taskId });
  const text = `Review of "${out.taskTitle}": ${out.verdict}.${out.reasons.length ? ' ' + out.reasons.join(' ') : ''}`;
  cues.push({ t: 'say', id: `${callId}-s1`, text });
  return cues;
}

/** 'review-change': null whenever the stub would already be 'unclear' for structural reasons (no
 * task, no tests, no rules) — those stay in code. Otherwise one choice over the same three
 * verdicts, with the coverage bookkeeping (computed in code) as the only state. */
function questions(input: ReviewChangeIn): S1Request | null {
  const r = computeBasis(input);
  if ('unclear' in r) return null;
  const { task, tests, rules, coverage } = r.basis;
  return {
    state: {
      task: task.title,
      tests: tests.map((t) => ({ title: t.title, condition: (t.props?.condition ?? '').trim() })),
      rules: rules.map((rule) => ({ title: rule.title, conditions: conditionsOf(rule) })),
      coverage: coverage.map((c) => ({ rule: c.ruleTitle, condition: c.condition, coveredByExactMatch: c.coveredByExactMatch })),
    },
    questions: {
      verdict: {
        type: 'choice',
        instructions: "Judge this task's targeted tests against the rules they verify, using only the state given: do they, taken together, verify every condition of every rule they cover?",
        criteria: {
          'serves-intent': 'The targeted tests, taken together, verify every condition of every rule they cover',
          overfits: 'The targeted tests cover only some conditions — green on the letter, not the whole rule',
          unclear: 'It cannot be told from this state',
        },
      },
    },
  };
}

function decide(answers: S1Answers, input: ReviewChangeIn): ReviewChangeOut {
  const r = computeBasis(input);
  if ('unclear' in r) return r.unclear;
  const { task, testIds, ruleIds, coverage } = r.basis;
  const reasons = coverage.map(coverageReason);
  const answer = answers.verdict;
  const verdict: ReviewChangeOut['verdict'] = answer && answer.type === 'choice'
    ? (answer.choice as ReviewChangeOut['verdict'])
    : 'unclear';
  return { verdict, reasons, taskId: task.id, taskTitle: task.title, testIds, ruleIds };
}

const decision: DecisionSpec<ReviewChangeIn, ReviewChangeOut> = { id: 'review-change', questions, decide };

export const reviewChange: AIFunctionImpl<ReviewChangeIn, ReviewChangeOut> = {
  context: { digest: (ctx: Context) => `selection=${ctx.selectedId ?? 'none'}` },
  stub,
  toCues,
  decision,
};
