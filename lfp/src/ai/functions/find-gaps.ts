// find-gaps: the two gap checks (moved from director.ts's private `computeGaps`, S83). Kept as a
// plain exported function too, since director.ts's `currentContext` calls it directly on every
// context publish — that isn't itself an AI call, so it shouldn't go through `runAI`/`state.aiCalls`.
import { state, nodeById, edgesOf } from '../../store.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

/** Exactly two gap checks, kept to one line each (Cut on purpose: nothing more). */
export function computeGaps(): string[] {
  const out: string[] = [];
  const noEdges = state.graph.nodes.filter((n) => !state.graph.edges.some((e) => e.src === n.id || e.dst === n.id));
  if (noEdges.length) out.push(`${noEdges.length} node${noEdges.length === 1 ? '' : 's'} with no edges: ${noEdges.slice(0, 3).map((n) => n.title).join(', ')}`);
  const hyps = state.graph.nodes.filter((n) => n.kind === 'hypothesis');
  const noMetric = hyps.filter((h) => !edgesOf(h.id).some((e) => nodeById(e.src === h.id ? e.dst : e.src)?.kind === 'metric'));
  if (noMetric.length) out.push(`${noMetric.length} bet${noMetric.length === 1 ? '' : 's'} with no metric: ${noMetric.slice(0, 3).map((n) => n.title).join(', ')}`);
  return out;
}

export interface FindGapsOut { gaps: string[] }

function toCues(out: FindGapsOut, callId: string): Cue[] {
  return [{ t: 'say', id: `${callId}-s1`, text: out.gaps.length ? out.gaps.join(' ') : 'No gaps found.' }];
}

export const findGaps: AIFunctionImpl<undefined, FindGapsOut> = {
  context: { digest: (ctx) => `gaps=${ctx.gaps.length}` },
  stub: () => ({ gaps: computeGaps() }),
  toCues,
};
