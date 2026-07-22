// Named, pure(ish) checks run against the *current* live store state after
// simulator ops. Two tiers, mirroring run.ts's cost budget:
//   - `checkCheapInvariants` — O(graph) scans only, safe to run after every op.
//   - `checkExpensiveInvariants` — calls into lint/query plus a real
//     importGraph(exportGraph()) round-trip and an undo();redo() cycle; run
//     every K ops by run.ts.
//   - `checkInvariants` — both tiers together (the full spec §1 list), the
//     contract later waves import directly.
import {
  KIND_MAP,
  KINDS,
  SUGGESTED_EDGE_TYPES,
  ontologyGraph,
} from '../schema';
import { lintGraph } from '../lint';
import { contextMarkdown, neighborhood, runQuery, whyChain, type GraphQuery } from '../query';
import { counts, exportGraph, importGraph, redo, state, undo } from '../store';

export interface InvariantFailure {
  invariant: string;
  detail: string;
}

function fail(invariant: string, detail: string): InvariantFailure {
  return { invariant, detail };
}

// ── Cheap: referential integrity, id discipline, derived consistency ───────
export function checkCheapInvariants(): InvariantFailure[] {
  const out: InvariantFailure[] = [];
  const graph = state.graph;
  const nodeIds = new Set<string>();

  for (const n of graph.nodes) {
    if (nodeIds.has(n.id)) {
      out.push(fail('id-discipline', `duplicate node id "${n.id}"`));
    }
    nodeIds.add(n.id);
    if (!n.id.startsWith(`${n.kind}-`)) {
      out.push(fail('id-discipline', `node "${n.id}" has kind "${n.kind}" but id does not start with "${n.kind}-"`));
    }
  }

  for (const e of graph.edges) {
    if (!nodeIds.has(e.srcId)) {
      out.push(fail('referential-integrity', `edge "${e.id}" srcId "${e.srcId}" does not resolve to a live node`));
    }
    if (!nodeIds.has(e.dstId)) {
      out.push(fail('referential-integrity', `edge "${e.id}" dstId "${e.dstId}" does not resolve to a live node`));
    }
  }

  const byPart: Record<string, number> = { foundations: 0, domain: 0, implementation: 0 };
  for (const n of graph.nodes) {
    const part = KIND_MAP[n.kind]?.part;
    if (part) byPart[part] = (byPart[part] ?? 0) + 1;
  }
  // `store.ts`'s `counts` computed spreads a `Record<string, number>`
  // (`byPart`) into its return object literal; TS's spread inference drops
  // that index signature entirely, so the *inferred* type of `counts.value`
  // only has `nodes`/`edges` even though `foundations`/`domain`/
  // `implementation` are present at runtime. Not our file to fix (store.ts
  // isn't owned here) — this cast documents the real runtime shape.
  const c = counts.value as {
    nodes: number;
    edges: number;
    foundations: number;
    domain: number;
    implementation: number;
  };
  if (c.nodes !== graph.nodes.length) {
    out.push(fail('derived-consistency', `counts.nodes (${c.nodes}) != actual node count (${graph.nodes.length})`));
  }
  if (c.edges !== graph.edges.length) {
    out.push(fail('derived-consistency', `counts.edges (${c.edges}) != actual edge count (${graph.edges.length})`));
  }
  const partChecks: [string, number, number][] = [
    ['foundations', c.foundations, byPart.foundations ?? 0],
    ['domain', c.domain, byPart.domain ?? 0],
    ['implementation', c.implementation, byPart.implementation ?? 0],
  ];
  for (const [part, actual, expected] of partChecks) {
    if (actual !== expected) {
      out.push(fail('derived-consistency', `counts.${part} (${actual}) != recount (${expected})`));
    }
  }

  for (const k of KINDS) {
    const suggestions = SUGGESTED_EDGE_TYPES[k.kind];
    if (!suggestions || !suggestions.length) {
      out.push(fail('derived-consistency', `SUGGESTED_EDGE_TYPES["${k.kind}"] is empty`));
    }
  }

  return out;
}

// ── Expensive: never-throws surface, round-trip identity, undo/redo ────────
type QueryPattern = GraphQuery['match'][number];

const PROBE_QUERIES: GraphQuery[] = [
  // not-pattern-first query — `not` patterns must not depend on match order.
  { match: [{ s: { var: 'x' }, p: 'motivates', o: { var: 'y' }, not: true }], select: ['x'] },
  // `^` (inverse) and `+` (transitive) composition.
  { match: [{ s: { var: 'x' }, p: '^motivates+', o: { var: 'y' } }], select: ['x', 'y'] },
  // malformed pattern: a null entry in match.
  { match: [null as unknown as QueryPattern], select: [] },
  // missing select entirely.
  { match: [{ s: { var: 'x' }, p: 'uses', o: { var: 'y' } }], select: undefined as unknown as string[] },
];

export function checkExpensiveInvariants(): InvariantFailure[] {
  const out: InvariantFailure[] = [];
  const graph = state.graph;

  try {
    lintGraph(graph);
  } catch (e) {
    out.push(fail('never-throws', `lintGraph threw: ${(e as Error).message}`));
  }
  try {
    ontologyGraph();
  } catch (e) {
    out.push(fail('never-throws', `ontologyGraph threw: ${(e as Error).message}`));
  }
  for (const q of PROBE_QUERIES) {
    try {
      runQuery(graph, q);
    } catch (e) {
      out.push(fail('never-throws', `runQuery threw on probe ${JSON.stringify(q)}: ${(e as Error).message}`));
    }
  }

  const probeNode = graph.nodes[0];
  if (probeNode) {
    const id = probeNode.id;
    try {
      whyChain(graph, id);
    } catch (e) {
      out.push(fail('never-throws', `whyChain threw: ${(e as Error).message}`));
    }
    try {
      neighborhood(graph, id);
    } catch (e) {
      out.push(fail('never-throws', `neighborhood threw: ${(e as Error).message}`));
    }
    try {
      contextMarkdown(graph, id);
    } catch (e) {
      out.push(fail('never-throws', `contextMarkdown threw: ${(e as Error).message}`));
    }
  }

  out.push(...checkRoundTrip());
  out.push(...checkUndoRedo());

  return out;
}

function checkRoundTrip(): InvariantFailure[] {
  const beforeJson = exportGraph();
  const beforeParsed = JSON.parse(beforeJson) as unknown;
  const result = importGraph(beforeJson);
  if (!result.ok) {
    return [fail('round-trip-identity', `importGraph(exportGraph()) failed: ${result.error ?? 'unknown error'}`)];
  }
  const afterJson = JSON.stringify(state.graph);
  if (JSON.stringify(beforeParsed) !== afterJson) {
    return [fail('round-trip-identity', 'importGraph(exportGraph()) produced a graph that is not deep-equal to the original')];
  }
  return [];
}

function checkUndoRedo(): InvariantFailure[] {
  const before = exportGraph();
  undo();
  redo();
  const after = exportGraph();
  if (before !== after) {
    return [fail('undo-redo-restore', 'undo(); redo(); did not restore the exact pre-undo serialization')];
  }
  return [];
}

/** Full spec §1 coverage: both tiers together. */
export function checkInvariants(): InvariantFailure[] {
  return [...checkCheapInvariants(), ...checkExpensiveInvariants()];
}
