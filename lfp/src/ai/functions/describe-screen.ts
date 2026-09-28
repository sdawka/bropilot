// describe-screen: free-text fallback. Finds a matching node in the graph and explains it (moved
// from ScriptedDirector.freeTalk's keyword lookup), or — when nothing matches — names what the
// active screen is currently showing.
// v4.3: `decision` (AGENT-RUNTIME.md §9, threshold 'find-by-title') hands Jev the same pre-filtered
// candidates the stub would search itself, and asks it to confirm the resolved node isn't a false
// positive — even a single candidate is asked about, since a substring match can still be wrong.
import { state, nodeById } from '../../store.ts';
import { kindById, edgeTypeById, STATEMENTS } from '../../kernel.ts';
import { contextFor } from '../../brief.ts';
import { titleCandidates } from '../candidates.ts';
import { nodeByTextRequest, nodeByTextNext, resolveNodeByText } from '../ontology.ts';
import { thresholdFor } from '../decisionConfig.ts';
import type { Cue, Context, View } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers, S1Request } from '../types.ts';
import type { Node } from '../../store.ts';

export interface DescribeScreenIn { text: string }

type HitOut = {
  op: 'hit';
  id: string; label: string; title: string; description?: string; quote: string; related: string;
  view: View; level?: 0 | 1 | 2 | 3; pointIds: string[]; edgeIds: string[]; suspect: string;
};
type NotFoundOut = { op: 'not-found'; text: string; suspect: string };
type ScreenOut = { op: 'screen'; view: string; itemIds: string[]; summary: string; suspect: string };
export type DescribeScreenOut = HitOut | NotFoundOut | ScreenOut;

/** One sentence naming up to 3 suspect node titles and suggesting a revalidate, when there are any. */
function suspectSentence(ctx: Context): string {
  if (ctx.suspect.edges <= 0) return '';
  const names = ctx.suspect.nodes.slice(0, 3);
  return ` ${ctx.suspect.edges} suspect edge${ctx.suspect.edges === 1 ? '' : 's'} pending on ${names.join(', ')} — try "revalidate ${names[0]}".`;
}

const edgesOf = (id: string) => state.graph.edges.filter((e) => e.src === id || e.dst === id);
const other = (e: { src: string; dst: string }, id: string) => (e.src === id ? e.dst : e.src);
const title = (id: string) => nodeById(id)?.title ?? id;
const quote = (n?: Node) => {
  const s = n?.source;
  if (!s || s.kind !== 'said') return '';
  const c = contextFor(s.statements[0]);
  return c ? ` You said: "${c.hit.trim()}"` : ` (S${s.statements[0]}: "${STATEMENTS[s.statements[0]]}")`;
};

/** Build the 'hit' output for a resolved node — shared by the stub and the decision path so a
 * resolved node produces byte-identical cues/text either way. */
function buildHit(hit: Node, suspect: string): HitOut {
  const es = edgesOf(hit.id).slice(0, 6);
  const kind = kindById[hit.kind];
  const view: View = kind?.level !== undefined ? 'domain' : 'overview';
  const rel = es.map((e) => `${e.src === hit.id ? '' : title(e.src) + ' '}${edgeTypeById[e.type]?.label ?? e.type}${e.src === hit.id ? ' ' + title(e.dst) : ''}`).join('; ');
  return {
    op: 'hit', id: hit.id, label: kind?.label ?? hit.kind, title: hit.title, description: hit.description,
    quote: quote(hit), related: rel, view, level: kind?.level, pointIds: [hit.id, ...es.map((e) => other(e, hit.id))], edgeIds: es.map((e) => e.id), suspect,
  };
}

function stub(input: DescribeScreenIn, ctx: Context): DescribeScreenOut {
  const q = input.text.trim();
  const lower = q.toLowerCase();
  const suspect = suspectSentence(ctx);
  if (lower) {
    const hit = titleCandidates(q, state.graph.nodes)[0];
    if (hit) return buildHit(hit, suspect);
    return { op: 'not-found', text: q, suspect };
  }
  const items = ctx.screen.items;
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const summary = [...counts.entries()].map(([kind, n]) => `${n} ${kindById[kind]?.label ?? kind}${n === 1 ? '' : 's'}`).join(', ') || 'nothing yet';
  return { op: 'screen', view: ctx.screen.view, itemIds: items.map((it) => it.id).slice(0, 12), summary, suspect };
}

function toCues(out: DescribeScreenOut, callId: string): Cue[] {
  if (out.op === 'hit') {
    return [
      out.view === 'domain' ? { t: 'navigate', view: 'domain', params: { level: out.level ?? 0 } } : { t: 'navigate', view: 'overview' },
      { t: 'point', nodes: out.pointIds, edges: out.edgeIds, focus: out.id },
      { t: 'say', id: `${callId}-s1`, text: `${out.label}: ${out.title}.${out.description ? ' ' + out.description : ''}${out.quote}${out.related ? ` Related: ${out.related}.` : ''}${out.suspect}` },
    ];
  }
  if (out.op === 'not-found') {
    return [{ t: 'say', id: `${callId}-s1`, text: `I couldn't find "${out.text}" in the graph. Try a node's name, "edit bet: …", or pick a tour.${out.suspect}` }];
  }
  return [
    { t: 'point', nodes: out.itemIds },
    { t: 'say', id: `${callId}-s1`, text: `This is ${out.view}. It shows ${out.summary}.${out.suspect}` },
  ];
}

/** 'find-by-title', chained through the ontology (ontology.ts, AGENT-RUNTIME.md §9): level 1 asks
 * the substring candidates (if any) and "which kind of item?" side by side; a confident candidate
 * ends it, otherwise level 2 asks for the node within that kind. So a paraphrase with no substring
 * hit ("the phone view") still resolves. Null only for an empty query. */
const CAND_THRESHOLD = thresholdFor('find-by-title');
function questions(input: DescribeScreenIn): S1Request | null {
  const q = input.text.trim();
  if (!q) return null;
  return nodeByTextRequest(q, state.graph.nodes, titleCandidates(q, state.graph.nodes));
}
const next = (answers: S1Answers, input: DescribeScreenIn): S1Request | null => nodeByTextNext(input.text.trim(), state.graph.nodes, answers, CAND_THRESHOLD);
const confidence = (answers: S1Answers) => resolveNodeByText(answers, CAND_THRESHOLD).confidence;

function decide(answers: S1Answers, input: DescribeScreenIn, ctx: Context): DescribeScreenOut {
  const q = input.text.trim();
  const suspect = suspectSentence(ctx);
  const picked = resolveNodeByText(answers, CAND_THRESHOLD);
  const hit = picked.id ? nodeById(picked.id) : undefined;
  if (!hit) return { op: 'not-found', text: q, suspect };
  return buildHit(hit, suspect);
}

const decision: DecisionSpec<DescribeScreenIn, DescribeScreenOut> = { id: 'find-by-title', questions, decide, next, confidence };

export const describeScreen: AIFunctionImpl<DescribeScreenIn, DescribeScreenOut> = {
  context: { digest: (ctx) => `view=${ctx.view} screenItems=${ctx.screen.items.length} selection=${ctx.selectedId ?? 'none'}` },
  stub,
  toCues,
  decision,
};
