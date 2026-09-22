// find-gaps: v4.1 folds the old two ad-hoc checks (no edges / bets with no metric) into the
// kernel itself (S145) — this is now a thin reporter over `checks.ts::checkInvariants`, one line
// per violation. Kept as a plain exported function too, since director.ts's `currentContext`
// calls it directly on every context publish — that isn't itself an AI call, so it shouldn't go
// through `runAI`/`state.aiCalls`.
import { state, nodeById } from '../../store.ts';
import { checkInvariants } from '../../checks.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

/** One line per violation from checkInvariants(state.graph). */
export function computeGaps(): string[] {
  return checkInvariants(state.graph).map((v) => v.message);
}

export interface FindGapsOut { gaps: string[]; pointIds: string[] }

function stub(): FindGapsOut {
  const violations = checkInvariants(state.graph);
  const first = violations[0];
  const pointIds = first ? first.subjects.filter((id) => nodeById(id)) : [];
  return { gaps: violations.map((v) => v.message), pointIds };
}

function toCues(out: FindGapsOut, callId: string): Cue[] {
  const cues: Cue[] = [];
  if (out.pointIds.length) cues.push({ t: 'point', nodes: out.pointIds, focus: out.pointIds[0] });
  if (!out.gaps.length) {
    cues.push({ t: 'say', id: `${callId}-s1`, text: 'No gaps found.' });
    return cues;
  }
  const shown = out.gaps.slice(0, 5);
  const text = `${shown.join(' ')} (${out.gaps.length} open gap${out.gaps.length === 1 ? '' : 's'} total.)`;
  cues.push({ t: 'say', id: `${callId}-s1`, text });
  return cues;
}

export const findGaps: AIFunctionImpl<undefined, FindGapsOut> = {
  context: { digest: (ctx) => `gaps=${ctx.gaps.length}` },
  stub,
  toCues,
};
