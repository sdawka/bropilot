// describe-screen: free-text fallback. Finds a matching node in the graph and explains it (moved
// from ScriptedDirector.freeTalk's keyword lookup), or — when nothing matches — names what the
// active screen is currently showing.
import { state, nodeById } from '../../store.ts';
import { kindById, edgeTypeById, STATEMENTS } from '../../kernel.ts';
import { contextFor } from '../../brief.ts';
import type { Cue, Context, View } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';
import type { Node } from '../../store.ts';

export interface DescribeScreenIn { text: string }

type HitOut = {
  op: 'hit';
  id: string; label: string; title: string; description?: string; quote: string; related: string;
  view: View; level?: 0 | 1 | 2 | 3; pointIds: string[]; edgeIds: string[];
};
type NotFoundOut = { op: 'not-found'; text: string };
type ScreenOut = { op: 'screen'; view: string; itemIds: string[]; summary: string };
export type DescribeScreenOut = HitOut | NotFoundOut | ScreenOut;

const edgesOf = (id: string) => state.graph.edges.filter((e) => e.src === id || e.dst === id);
const other = (e: { src: string; dst: string }, id: string) => (e.src === id ? e.dst : e.src);
const title = (id: string) => nodeById(id)?.title ?? id;
const quote = (n?: Node) => {
  const s = n?.source;
  if (!s || s.kind !== 'said') return '';
  const c = contextFor(s.statements[0]);
  return c ? ` You said: "${c.hit.trim()}"` : ` (S${s.statements[0]}: "${STATEMENTS[s.statements[0]]}")`;
};

function stub(input: DescribeScreenIn, ctx: Context): DescribeScreenOut {
  const q = input.text.trim();
  const lower = q.toLowerCase();
  if (lower) {
    const hits = state.graph.nodes
      .filter((n) => n.title.toLowerCase().includes(lower) || lower.includes(n.title.toLowerCase()))
      .sort((a, b) => b.title.length - a.title.length);
    const hit = hits[0];
    if (hit) {
      const es = edgesOf(hit.id).slice(0, 6);
      const kind = kindById[hit.kind];
      const view: View = kind?.level !== undefined ? 'domain' : 'overview';
      const rel = es.map((e) => `${e.src === hit.id ? '' : title(e.src) + ' '}${edgeTypeById[e.type]?.label ?? e.type}${e.src === hit.id ? ' ' + title(e.dst) : ''}`).join('; ');
      return {
        op: 'hit', id: hit.id, label: kind?.label ?? hit.kind, title: hit.title, description: hit.description,
        quote: quote(hit), related: rel, view, level: kind?.level, pointIds: [hit.id, ...es.map((e) => other(e, hit.id))], edgeIds: es.map((e) => e.id),
      };
    }
    return { op: 'not-found', text: q };
  }
  const items = ctx.screen.items;
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const summary = [...counts.entries()].map(([kind, n]) => `${n} ${kindById[kind]?.label ?? kind}${n === 1 ? '' : 's'}`).join(', ') || 'nothing yet';
  return { op: 'screen', view: ctx.screen.view, itemIds: items.map((it) => it.id).slice(0, 12), summary };
}

function toCues(out: DescribeScreenOut, callId: string): Cue[] {
  if (out.op === 'hit') {
    return [
      out.view === 'domain' ? { t: 'navigate', view: 'domain', params: { level: out.level ?? 0 } } : { t: 'navigate', view: 'overview' },
      { t: 'point', nodes: out.pointIds, edges: out.edgeIds, focus: out.id },
      { t: 'say', id: `${callId}-s1`, text: `${out.label}: ${out.title}.${out.description ? ' ' + out.description : ''}${out.quote}${out.related ? ` Related: ${out.related}.` : ''}` },
    ];
  }
  if (out.op === 'not-found') {
    return [{ t: 'say', id: `${callId}-s1`, text: `I couldn't find "${out.text}" in the graph. Try a node's name, "edit bet: …", or pick a tour.` }];
  }
  return [
    { t: 'point', nodes: out.itemIds },
    { t: 'say', id: `${callId}-s1`, text: `This is ${out.view}. It shows ${out.summary}.` },
  ];
}

export const describeScreen: AIFunctionImpl<DescribeScreenIn, DescribeScreenOut> = {
  context: { digest: (ctx) => `view=${ctx.view} screenItems=${ctx.screen.items.length} selection=${ctx.selectedId ?? 'none'}` },
  stub,
  toCues,
};
