// raise-question: an agent's clarification, raised as a `raise` cue (S148) — the task it's about
// (if any) gets marked blocked until the user answers. Ask-vs-act per AGENT-RUNTIME.md §4: this
// exists for the case an agent cannot derive a measurable done-criterion; it names the subject
// task and its targeted tests, what is missing, and the readings considered, if any.
import { state, nodeById } from '../../store.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface RaiseQuestionIn { taskId?: string; missing: string; readings?: string[] }
export interface RaiseQuestionOut { prompt: string; subjects: string[]; produces: string; taskId?: string; taskTitle: string }

function stub(input: RaiseQuestionIn): RaiseQuestionOut {
  const task = input.taskId ? nodeById(input.taskId) : undefined;
  const taskTitle = task?.title ?? input.taskId ?? 'this task';
  const testIds = task ? state.graph.edges.filter((e) => e.type === 'targets' && e.src === task.id).map((e) => e.dst) : [];
  const subjects = [...(task ? [task.id] : []), ...testIds];
  let prompt = `About ${taskTitle}: ${input.missing}`;
  if (input.readings?.length) prompt += ` Readings considered: ${input.readings.join('; ')}.`;
  return { prompt, subjects, produces: 'context', taskId: input.taskId, taskTitle };
}

function toCues(out: RaiseQuestionOut, callId: string): Cue[] {
  return [
    { t: 'raise', prompt: out.prompt, produces: out.produces, subjects: out.subjects, source: 'agent', taskId: out.taskId },
    { t: 'say', id: `${callId}-s1`, text: `"${out.taskTitle}" is now blocked until that's answered.` },
  ];
}

export const raiseQuestion: AIFunctionImpl<RaiseQuestionIn, RaiseQuestionOut> = {
  context: { digest: (ctx) => `selection=${ctx.selectedId ?? 'none'} next=${ctx.next?.id ?? 'none'}` },
  stub,
  toCues,
};
