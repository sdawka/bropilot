// explain-node: ScriptedDirector.tourBet generalised to any selected/named node (not just bets),
// plus the "edit bet: …" reword command (a two-step ask, same shape as define-term's).
import { state, nodeById } from '../../store.ts';
import { kindById, STATEMENTS } from '../../kernel.ts';
import { contextFor } from '../../brief.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';
import type { Node } from '../../store.ts';

export type ExplainNodeIn =
  | { op: 'explain'; nodeId?: string }
  | { op: 'reword-start'; hint: string }
  | { op: 'reword-apply'; text: string };

interface Group { label: string; nodeIds: string[]; edgeIds: string[] }
type ExplainOut = { op: 'explain'; nodeId: string; label: string; title: string; description?: string; quote: string; verdict?: string; groups: Group[] };
type ExplainNoneOut = { op: 'explain-none' };
type RewordAskOut = { op: 'reword-ask'; nodeId: string; title: string };
type RewordNoneOut = { op: 'reword-none' };
type RewordStagedOut = { op: 'reword-staged'; nodeId: string; title: string; newTitle: string };
export type ExplainNodeOut = ExplainOut | ExplainNoneOut | RewordAskOut | RewordNoneOut | RewordStagedOut;

const byKind = (k: string) => state.graph.nodes.filter((n) => n.kind === k);
const edgesOf = (id: string) => state.graph.edges.filter((e) => e.src === id || e.dst === id);
const quote = (n?: Node) => {
  const s = n?.source;
  if (!s || s.kind !== 'said') return '';
  const c = contextFor(s.statements[0]);
  return c ? ` You said: "${c.hit.trim()}"` : ` (S${s.statements[0]}: "${STATEMENTS[s.statements[0]]}")`;
};

function pickNode(input: { nodeId?: string }, ctx: Context): Node | undefined {
  return (input.nodeId ? nodeById(input.nodeId) : undefined)
    ?? (ctx.selectedId ? nodeById(ctx.selectedId) : undefined)
    ?? byKind('hypothesis')[0];
}

function stub(input: ExplainNodeIn, ctx: Context): ExplainNodeOut {
  if (input.op === 'reword-start') {
    const bet = byKind('hypothesis').find((b) => b.title.toLowerCase().includes(input.hint.toLowerCase()))
      ?? (ctx.selectedId ? nodeById(ctx.selectedId) : undefined);
    if (bet && bet.kind === 'hypothesis') return { op: 'reword-ask', nodeId: bet.id, title: bet.title };
    return { op: 'reword-none' };
  }
  if (input.op === 'reword-apply') {
    const bet = ctx.selectedId ? nodeById(ctx.selectedId) : undefined;
    if (!bet) return { op: 'reword-none' };
    return { op: 'reword-staged', nodeId: bet.id, title: bet.title, newTitle: input.text.trim() };
  }
  const node = pickNode(input, ctx);
  if (!node) return { op: 'explain-none' };
  const byOtherKind = new Map<string, Group>();
  for (const e of edgesOf(node.id)) {
    const otherId = e.src === node.id ? e.dst : e.src;
    const other = nodeById(otherId);
    if (!other) continue;
    const g = byOtherKind.get(other.kind) ?? { label: kindById[other.kind]?.label ?? other.kind, nodeIds: [], edgeIds: [] };
    g.nodeIds.push(otherId);
    g.edgeIds.push(e.id);
    byOtherKind.set(other.kind, g);
  }
  return {
    op: 'explain', nodeId: node.id, label: kindById[node.kind]?.label ?? node.kind, title: node.title,
    description: node.description, quote: quote(node), verdict: node.props?.verdict, groups: [...byOtherKind.values()],
  };
}

function toCues(out: ExplainNodeOut, callId: string): Cue[] {
  if (out.op === 'reword-ask') {
    return [{ t: 'point', nodes: [out.nodeId], focus: out.nodeId }, { t: 'ask', id: `${callId}-a1`, text: `New wording for "${out.title}"?` }];
  }
  if (out.op === 'reword-none') return [{ t: 'say', id: `${callId}-s1`, text: 'Which bet? Select it on the main screen or name it.' }];
  if (out.op === 'reword-staged') {
    return [
      { t: 'stage', effects: [{ id: `${callId}-e0`, op: 'update-node', nodeId: out.nodeId, patch: { title: out.newTitle }, answerId: 'director' }], note: `Reword bet: ${out.title}` },
      { t: 'point', nodes: [out.nodeId], focus: out.nodeId },
      { t: 'say', id: `${callId}-s1`, text: 'Staged the new wording for that bet. Approve to commit, or discard.' },
    ];
  }
  if (out.op === 'explain-none') return [{ t: 'say', id: `${callId}-s1`, text: 'Nothing selected to explain.' }];
  const steps: Cue[][] = [[
    { t: 'point', nodes: [out.nodeId], focus: out.nodeId },
    { t: 'say', id: `${callId}-s1`, text: `${out.label}: ${out.title}.${out.description ? ' ' + out.description : ''}${out.quote}` },
  ]];
  out.groups.forEach((g, i) => {
    steps.push([
      { t: 'point', nodes: [out.nodeId, ...g.nodeIds], edges: g.edgeIds, focus: out.nodeId },
      { t: 'say', id: `${callId}-s${i + 2}`, text: `Connected to ${g.nodeIds.length} ${g.label}${g.nodeIds.length === 1 ? '' : 's'}.` },
    ]);
  });
  if (out.verdict) steps.push([{ t: 'say', id: `${callId}-s${steps.length + 1}`, text: `Verdict: ${out.verdict}.` }]);
  return [{ t: 'sequence', dwellMs: 0, steps }];
}

export const explainNode: AIFunctionImpl<ExplainNodeIn, ExplainNodeOut> = {
  context: { digest: (ctx) => `selection=${ctx.selectedId ?? 'none'}` },
  stub,
  toCues,
};
