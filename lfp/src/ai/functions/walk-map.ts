// walk-map: tours the level-0 Map (moved from ScriptedDirector.tourMap verbatim): problem, bets,
// solution, then the reality-side test loop.
import { state, nodeById } from '../../store.ts';
import { STATEMENTS } from '../../kernel.ts';
import { contextFor } from '../../brief.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';
import type { Node } from '../../store.ts';

interface Step { text: string; view?: 'domain' | 'overview'; level?: 0; clear?: boolean; nodes?: string[]; edges?: string[]; focus?: string }
export interface WalkMapOut { steps: Step[] }

const byKind = (k: string) => state.graph.nodes.filter((n) => n.kind === k);
const edgesOf = (id: string) => state.graph.edges.filter((e) => e.src === id || e.dst === id);
const quote = (n?: Node) => {
  const s = n?.source;
  if (!s || s.kind !== 'said') return '';
  const c = contextFor(s.statements[0]);
  return c ? ` You said: "${c.hit.trim()}"` : ` (S${s.statements[0]}: "${STATEMENTS[s.statements[0]]}")`;
};

function stub(): WalkMapOut {
  const bets = byKind('hypothesis');
  const tests = byKind('test');
  const results = byKind('test-result');
  const missing = results.filter((r) => r.props?.status !== 'pass').length;
  const problems = byKind('problem');
  const root = problems.find((p) => edgesOf(p.id).some((e) => e.type === 'has' && e.src === p.id && nodeById(e.dst)?.kind === 'problem')) ?? problems[0];
  const caps = byKind('capability');
  const capEdges = state.graph.edges.filter((e) => e.type === 'satisfies' && caps.some((c) => c.id === e.src));
  return {
    steps: [
      { view: 'domain', level: 0, clear: true, text: 'This is the Map. Everything you describe lives on the left, in the representation. Everything that actually runs lives on the right, in reality. The two only touch through tests.' },
      { view: 'overview', nodes: root ? [root.id] : [], focus: root?.id, text: `It starts with the main problem: ${root?.title ?? 'none yet'}.${quote(root)}` },
      { nodes: bets.map((b) => b.id), focus: bets[0]?.id, text: `Then ${bets.length} bets. A bet links what we build to an outcome we want; some are testable, some are just bets.` },
      { nodes: caps.map((c) => c.id), edges: capEdges.map((e) => e.id), focus: caps[0]?.id, text: `The solution is ${caps.length} capabilities. The lines show which problems each one satisfies.` },
      { view: 'domain', level: 0, clear: true, text: `On the reality side: ${tests.length} tests bridge the two. ${missing} ${missing === 1 ? 'is' : 'are'} not fulfilled, so planned changes are needed. That is the whole loop.` },
    ],
  };
}

function toCues(out: WalkMapOut, callId: string): Cue[] {
  const steps: Cue[][] = out.steps.map((s, i) => {
    const step: Cue[] = [];
    if (s.view === 'domain') step.push({ t: 'navigate', view: 'domain', params: { level: s.level ?? 0 } });
    else if (s.view === 'overview') step.push({ t: 'navigate', view: 'overview' });
    if (s.clear) step.push({ t: 'clear' });
    if (s.nodes || s.edges || s.focus) step.push({ t: 'point', nodes: s.nodes ?? [], edges: s.edges ?? [], focus: s.focus });
    step.push({ t: 'say', id: `${callId}-s${i + 1}`, text: s.text });
    return step;
  });
  return [{ t: 'sequence', dwellMs: 0, steps }];
}

export const walkMap: AIFunctionImpl<undefined, WalkMapOut> = {
  context: { digest: () => `nodes=${state.graph.nodes.length} edges=${state.graph.edges.length}` },
  stub,
  toCues,
};
