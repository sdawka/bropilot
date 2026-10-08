// unrealised-to-tasks: finds protocols with no realising practice and stages an epic plus one
// task each (moved from ScriptedDirector.unrealised).
import { state, uniqueId, kebab, type Effect } from '../../store.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

const byKind = (k: string) => state.graph.nodes.filter((n) => n.kind === k);
const MODULE_ID = 'module-automation';

interface Task { id: string; title: string }
type NoneOut = { op: 'none'; moduleId: string };
type PlanOut = { op: 'plan'; moduleId: string; missingIds: string[]; missingTitles: string[]; epic: { id: string; title: string }; tasks: Task[] };
export type UnrealisedToTasksOut = NoneOut | PlanOut;

function stub(): UnrealisedToTasksOut {
  const protocols = byKind('protocol');
  const realised = new Set(state.graph.edges.filter((e) => e.type === 'realises').map((e) => e.dst));
  const missing = protocols.filter((p) => !realised.has(p.id));
  if (!missing.length) return { op: 'none', moduleId: MODULE_ID };
  const taken = new Set(state.graph.nodes.map((n) => n.id));
  const epicId = uniqueId('epic-realise-protocols', taken);
  const tasks: Task[] = missing.map((p) => ({ id: uniqueId(`task-${kebab(p.title).slice(0, 30)}`, taken), title: `Put "${p.title}" into practice` }));
  return {
    op: 'plan', moduleId: MODULE_ID, missingIds: missing.map((m) => m.id), missingTitles: missing.map((m) => m.title),
    epic: { id: epicId, title: `Realise ${missing.length} unrealised protocol${missing.length === 1 ? '' : 's'}` }, tasks,
  };
}

function toCues(out: UnrealisedToTasksOut, callId: string): Cue[] {
  if (out.op === 'none') {
    return [{ t: 'navigate', view: 'domain', params: { level: 3, module: out.moduleId } }, { t: 'say', id: `${callId}-s1`, text: 'Every protocol is realised by a practice. Nothing to plan.' }];
  }
  const effects: Effect[] = [
    { id: `${callId}-e0`, op: 'add-node', node: { id: out.epic.id, kind: 'epic', title: out.epic.title, description: 'Proposed by the director from the Automation module.', status: 'draft', source: { kind: 'inferred', reason: 'Derived from protocols without a realising practice.' } }, answerId: 'director' },
  ];
  out.tasks.forEach((t, i) => {
    effects.push({ id: `${callId}-e${i * 2 + 1}`, op: 'add-node', node: { id: t.id, kind: 'task', title: t.title, props: { status: 'queued' }, status: 'draft', source: { kind: 'inferred', reason: 'One task per unrealised protocol.' } }, answerId: 'director' });
    effects.push({ id: `${callId}-e${i * 2 + 2}`, op: 'add-edge', edge: { id: `e-${out.epic.id}-${t.id}`, src: out.epic.id, dst: t.id, type: 'contains', status: 'draft' }, answerId: 'director' });
  });
  return [
    { t: 'navigate', view: 'domain', params: { level: 3, module: out.moduleId } },
    { t: 'point', nodes: out.missingIds, focus: out.missingIds[0] },
    { t: 'stage', effects, note: `Epic + ${out.tasks.length} tasks to realise: ${out.missingTitles.join('; ')}` },
    { t: 'say', id: `${callId}-s1`, text: `${out.tasks.length} protocol${out.tasks.length === 1 ? ' is' : 's are'} not realised by any practice: ${out.missingTitles.join('; ')}. I staged an epic with one task each. Approve to commit, or discard.` },
  ];
}

export const unrealisedToTasks: AIFunctionImpl<undefined, UnrealisedToTasksOut> = {
  context: { digest: () => `protocols=${byKind('protocol').length}` },
  stub,
  toCues,
};
