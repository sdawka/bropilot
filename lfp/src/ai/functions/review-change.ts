// review-change: checks a task's targeted tests against the rules they verify, condition by
// condition (S152). Heuristic: `serves-intent` when every condition of every verified rule has a
// targeted test whose `props.condition` names it; `overfits` when the task's tests only cover
// some of a rule's conditions (green on the letter, not the whole rule); `unclear` when the task
// has no targeted tests, or none of them verify a rule.
import { state, nodeById } from '../../store.ts';
import { conditionsOf } from '../../checks.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface ReviewChangeIn { taskId: string }
export interface ReviewChangeOut {
  verdict: 'serves-intent' | 'overfits' | 'unclear';
  reasons: string[];
  taskId: string;
  taskTitle: string;
  testIds: string[];
  ruleIds: string[];
}

function stub(input: ReviewChangeIn): ReviewChangeOut {
  const task = nodeById(input.taskId);
  if (!task) {
    return { verdict: 'unclear', reasons: [`No task "${input.taskId}" found.`], taskId: input.taskId, taskTitle: input.taskId, testIds: [], ruleIds: [] };
  }
  const testIds = state.graph.edges.filter((e) => e.type === 'targets' && e.src === task.id).map((e) => e.dst);
  const tests = testIds.map((id) => nodeById(id)).filter((n): n is NonNullable<typeof n> => !!n);
  if (!tests.length) {
    return { verdict: 'unclear', reasons: [`"${task.title}" targets no tests.`], taskId: task.id, taskTitle: task.title, testIds: [], ruleIds: [] };
  }
  const ruleIds = [...new Set(tests.flatMap((t) => state.graph.edges.filter((e) => e.type === 'verifies' && e.src === t.id).map((e) => e.dst)))];
  const rules = ruleIds.map((id) => nodeById(id)).filter((n): n is NonNullable<typeof n> => !!n);
  if (!rules.length) {
    return { verdict: 'unclear', reasons: [`None of the tests "${task.title}" targets verify a rule.`], taskId: task.id, taskTitle: task.title, testIds, ruleIds: [] };
  }
  const reasons: string[] = [];
  let allCovered = true;
  for (const rule of rules) {
    for (const cond of conditionsOf(rule)) {
      const covered = tests.some((t) => (t.props?.condition ?? '').trim() === cond);
      if (covered) reasons.push(`"${rule.title}" condition "${cond}" is covered.`);
      else { reasons.push(`"${rule.title}" condition "${cond}" is not covered by any targeted test.`); allCovered = false; }
    }
  }
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

export const reviewChange: AIFunctionImpl<ReviewChangeIn, ReviewChangeOut> = {
  context: { digest: (ctx: Context) => `selection=${ctx.selectedId ?? 'none'}` },
  stub,
  toCues,
};
