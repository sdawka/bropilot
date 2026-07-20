// T-Box-constrained graph queries: SPARQL's basic-graph-pattern kernel, JSON
// encoded, validated against the ontology before execution. Advisory rule
// holds here too — off-ontology patterns warn, they never refuse to run.
import {
  type Graph,
  type GraphNode,
  KINDS,
  KIND_MAP,
  EDGE_TYPE_SET,
  EDGE_TYPE_LABELS,
  ONTOLOGY,
  tripleFor,
} from './schema';

export interface NodeRef { var?: string; id?: string; kind?: string }
export interface QueryPattern { s: NodeRef; p: string; o: NodeRef; not?: boolean }
export interface GraphQuery { match: QueryPattern[]; select: string[]; limit?: number }
export interface QueryError { level: 'error' | 'warning'; message: string }

const KIND_SET = new Set(KINDS.map((k) => k.kind));

function parseP(p: string): { type: string; inverse: boolean; transitive: boolean } {
  let s = p;
  let inverse = false;
  let transitive = false;
  if (s.startsWith('^')) { inverse = true; s = s.slice(1); }
  if (s.endsWith('+')) { transitive = true; s = s.slice(0, -1); }
  return { type: s, inverse, transitive };
}

export function validateQuery(q: GraphQuery): QueryError[] {
  const errs: QueryError[] = [];
  if (!q.match?.length) {
    errs.push({ level: 'error', message: 'Query has no match patterns.' });
    return errs;
  }
  for (const pat of q.match) {
    const { type, inverse } = parseP(pat.p);
    if (!EDGE_TYPE_SET.has(type)) {
      errs.push({ level: 'error', message: `Unknown edge type "${type}". Valid: ${[...EDGE_TYPE_SET].join(', ')}.` });
    }
    for (const ref of [pat.s, pat.o]) {
      if (ref.kind && !KIND_SET.has(ref.kind)) {
        errs.push({ level: 'error', message: `Unknown kind "${ref.kind}". Valid: ${[...KIND_SET].join(', ')}.` });
      }
    }
    if (pat.s.kind && pat.o.kind && EDGE_TYPE_SET.has(type) && KIND_SET.has(pat.s.kind) && KIND_SET.has(pat.o.kind)) {
      const [sk, ok] = inverse ? [pat.o.kind, pat.s.kind] : [pat.s.kind, pat.o.kind];
      if (!tripleFor(sk, type, ok)) {
        const alts = [...new Set(ONTOLOGY.filter((t) => t.src === sk && t.dst === ok).map((t) => t.type))];
        errs.push({
          level: 'warning',
          message: `No ontology triple ${sk} —${type}→ ${ok}.${alts.length ? ` Licensed types for this pair: ${alts.join(', ')}.` : ''}`,
        });
      }
    }
  }
  const bound = [...new Set(q.match.flatMap((p) => [p.s.var, p.o.var].filter((v): v is string => !!v)))];
  for (const v of q.select ?? []) {
    if (!q.match.some((p) => p.s.var === v || p.o.var === v)) {
      errs.push({ level: 'error', message: `select var "${v}" is never bound in match. Bound vars: ${bound.join(', ') || 'none'}.` });
    }
  }
  return errs;
}

type Binding = Record<string, string>; // var → node id

export function runQuery(graph: Graph, q: GraphQuery): Record<string, GraphNode>[] {
  if (validateQuery(q).some((e) => e.level === 'error')) return [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const kindOk = (ref: NodeRef, id: string) => !ref.kind || byId.get(id)?.kind === ref.kind;

  function candidates(ref: NodeRef, b: Binding): string[] {
    if (ref.var && b[ref.var]) return kindOk(ref, b[ref.var]) ? [b[ref.var]] : [];
    if (ref.id) return byId.has(ref.id) && kindOk(ref, ref.id) ? [ref.id] : [];
    return graph.nodes.filter((n) => !ref.kind || n.kind === ref.kind).map((n) => n.id);
  }

  function reach(from: string, type: string, inverse: boolean, transitive: boolean): Set<string> {
    const step = (id: string) =>
      graph.edges
        .filter((e) => e.type === type && (inverse ? e.dstId === id : e.srcId === id))
        .map((e) => (inverse ? e.srcId : e.dstId));
    if (!transitive) return new Set(step(from));
    const seen = new Set<string>();
    const queue = step(from);
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...step(id));
    }
    return seen;
  }

  let bindings: Binding[] = [{}];
  for (const pat of q.match) {
    const { type, inverse, transitive } = parseP(pat.p);
    const next: Binding[] = [];
    for (const b of bindings) {
      const matched: Binding[] = [];
      for (const sid of candidates(pat.s, b)) {
        const targets = reach(sid, type, inverse, transitive);
        for (const oid of candidates(pat.o, b)) {
          if (!targets.has(oid)) continue;
          if (pat.s.var && pat.s.var === pat.o.var && sid !== oid) continue;
          const nb: Binding = { ...b };
          if (pat.s.var) nb[pat.s.var] = sid;
          if (pat.o.var) nb[pat.o.var] = oid;
          matched.push(nb);
        }
      }
      if (pat.not) {
        if (!matched.length) next.push(b);
      } else {
        next.push(...matched);
      }
    }
    const seen = new Set<string>();
    bindings = next.filter((b) => {
      const k = JSON.stringify(b);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!bindings.length) break;
  }

  return bindings
    .slice(0, q.limit ?? 100)
    .map((b) => Object.fromEntries(q.select.filter((v) => b[v]).map((v) => [v, byId.get(b[v])!])));
}

// ── Named verbs ─────────────────────────────────────────────────────────────

/** Intent ancestry. Mixed-direction alternation (incoming motivates/serves/
 *  constrains, outgoing implements/satisfies) is not a single BGP — BFS. */
const WHY_IN = new Set(['motivates', 'serves', 'constrains']);
const WHY_OUT = new Set(['implements', 'satisfies']);

export function whyChain(graph: Graph, id: string): GraphNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([id]);
  const queue = [id];
  const out: GraphNode[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of graph.edges) {
      let nextId: string | null = null;
      if (WHY_IN.has(e.type) && e.dstId === cur) nextId = e.srcId;
      else if (WHY_OUT.has(e.type) && e.srcId === cur) nextId = e.dstId;
      if (!nextId || seen.has(nextId)) continue;
      seen.add(nextId);
      queue.push(nextId);
      const n = byId.get(nextId);
      if (n) out.push(n);
    }
  }
  return out;
}

export function realization(graph: Graph, id: string): GraphNode[] {
  const impl = runQuery(graph, { match: [{ s: { var: 'x' }, p: 'implements', o: { id } }], select: ['x'] });
  const sat = runQuery(graph, { match: [{ s: { var: 'x' }, p: 'satisfies', o: { id } }], select: ['x'] });
  const seen = new Set<string>();
  return [...impl, ...sat].map((r) => r.x).filter((n) => !seen.has(n.id) && seen.add(n.id));
}

export function evidence(graph: Graph, id: string): GraphNode[] {
  const ver = runQuery(graph, { match: [{ s: { var: 'x' }, p: 'verifies', o: { id } }], select: ['x'] });
  const mon = runQuery(graph, { match: [{ s: { var: 'x' }, p: 'monitors', o: { id } }], select: ['x'] });
  const seen = new Set<string>();
  return [...ver, ...mon].map((r) => r.x).filter((n) => !seen.has(n.id) && seen.add(n.id));
}

export function neighborhood(
  graph: Graph,
  id: string,
  opts: { depth?: number; edgeTypes?: string[] } = {},
): Graph {
  const depth = opts.depth ?? 2;
  const typeOk = (t: string) => !opts.edgeTypes || opts.edgeTypes.includes(t);
  const keep = new Set<string>([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const e of graph.edges) {
      if (!typeOk(e.type)) continue;
      for (const [a, b] of [[e.srcId, e.dstId], [e.dstId, e.srcId]]) {
        if (frontier.includes(a) && !keep.has(b)) {
          keep.add(b);
          next.push(b);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.srcId) && keep.has(e.dstId) && typeOk(e.type)),
  };
}

/** Markdown context slice for pasting into an LLM chat. */
export function contextMarkdown(graph: Graph, id: string, opts: { depth?: number } = {}): string {
  const centre = graph.nodes.find((n) => n.id === id);
  if (!centre) return '';
  const hood = neighborhood(graph, id, { depth: opts.depth ?? 2 });
  const lines: string[] = [];
  const kindLabel = (n: GraphNode) => KIND_MAP[n.kind]?.label ?? n.kind;
  lines.push(`# ${centre.title}`);
  lines.push(`*${kindLabel(centre)}* — ${centre.description || 'no description'}`);
  const props = Object.entries(centre.props ?? {}).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (props.length) {
    lines.push('');
    for (const [k, v] of props) lines.push(`- **${k}**: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  }
  lines.push('', `## Context (${hood.nodes.length - 1} related nodes)`);
  for (const e of hood.edges) {
    const s = hood.nodes.find((n) => n.id === e.srcId);
    const o = hood.nodes.find((n) => n.id === e.dstId);
    if (!s || !o) continue;
    lines.push(`- ${s.title} **${EDGE_TYPE_LABELS[e.type] ?? e.type}** ${o.title}`);
  }
  lines.push('', '## Nodes');
  for (const n of hood.nodes) {
    if (n.id === centre.id) continue;
    lines.push(`- **${n.title}** (${kindLabel(n)}): ${n.description || '—'}`);
  }
  return lines.join('\n');
}
