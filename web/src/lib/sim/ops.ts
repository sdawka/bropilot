// Weighted, seeded op generator + applier over the real store. `generateOps`
// is a pure function of `rnd` (and the op count) — it never touches the
// store, so the exact op stream for a seed is reproducible independent of
// prior graph state. `applyOp` is where those ops meet live state: node/edge
// "targets" are carried as large ints and resolved modulo the *current*
// live array length at apply time, rather than as concrete ids — the
// generator can't know what ids will exist (dedup suffixes, removals, undo)
// without running the store itself.
import {
  KINDS,
  EDGE_TYPE_SET,
  triplesFrom,
  type FieldDef,
  type KindDef,
} from '../schema';
import {
  addEdge,
  addNode,
  clearGraph,
  exportGraph,
  redo,
  removeEdge,
  removeNode,
  resetToSample,
  state,
  undo,
  updateEdge,
  updateNode,
  importGraph as storeImportGraph,
} from '../store';
import { int, pick } from './rng';

// ── Op type ──────────────────────────────────────────────────────────────
export type SimOp =
  | { type: 'addNode'; kind: string; title: string; description: string; props: Record<string, unknown> }
  | { type: 'updateNode'; targetIndex: number; patch: NodePatch }
  | { type: 'removeNode'; targetIndex: number }
  | { type: 'addEdge'; srcIndex: number; dstIndex: number; edgeType: string; label?: string }
  | { type: 'updateEdge'; edgeIndex: number; patch: EdgePatch }
  | { type: 'removeEdge'; edgeIndex: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'importGraph'; malformed: boolean; payload?: string }
  | { type: 'clearGraph' }
  | { type: 'resetToSample' };

interface NodePatch {
  title?: string;
  description?: string;
  props?: Record<string, unknown>;
}

interface EdgePatch {
  type?: string;
  label?: string;
}

// ── Hostile + plausible string banks ────────────────────────────────────────
const HOSTILE_STRINGS: readonly string[] = [
  '',
  'line one\nline two\n\nline three\n',
  '# Heading\n\n**bold** and _em_ and `code` and [link](https://example.com)\n- item one\n- item two',
  'a'.repeat(10_000),
  '🚀💥🔥 emoji test 测试 データ 😀😀😀',
  '   leading and trailing whitespace   ',
  '<script>alert(1)</script>',
  '"quotes" \'single\' `backtick` \\ backslash',
];

const WORDS: readonly string[] = [
  'order', 'payment', 'session', 'dashboard', 'invoice', 'report', 'profile',
  'settings', 'queue', 'worker', 'cache', 'token', 'ledger', 'webhook',
  'schedule', 'review', 'import', 'export', 'audit', 'signup', 'checkout',
  'notification', 'ticket', 'asset', 'pipeline', 'gateway', 'sync',
];

function plausibleText(rnd: () => number): string {
  return `${pick(rnd, WORDS)} ${pick(rnd, WORDS)}`;
}

/** ~30% hostile input, ~70% plausible short text. */
function randomText(rnd: () => number): string {
  return rnd() < 0.3 ? pick(rnd, HOSTILE_STRINGS) : plausibleText(rnd);
}

function randomFieldValue(rnd: () => number, f: FieldDef): unknown {
  const hostile = rnd() < 0.3;
  switch (f.type) {
    case 'select':
      return f.options && f.options.length ? pick(rnd, f.options) : randomText(rnd);
    case 'list':
      return hostile ? [pick(rnd, HOSTILE_STRINGS)] : [plausibleText(rnd), plausibleText(rnd)];
    default: // text, textarea, link
      return randomText(rnd);
  }
}

function randomProps(rnd: () => number, def: KindDef): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const f of def.fields ?? []) props[f.key] = randomFieldValue(rnd, f);
  return props;
}

function randomNodePatch(rnd: () => number): NodePatch {
  const patch: NodePatch = {};
  if (rnd() < 0.7) patch.title = randomText(rnd);
  if (rnd() < 0.7) patch.description = randomText(rnd);
  if (rnd() < 0.3) patch.props = { note: pick(rnd, HOSTILE_STRINGS) };
  if (patch.title === undefined && patch.description === undefined && patch.props === undefined) {
    patch.title = randomText(rnd);
  }
  return patch;
}

const EDGE_TYPES_ARR = [...EDGE_TYPE_SET];

function randomEdgePatch(rnd: () => number): EdgePatch {
  const patch: EdgePatch = {};
  if (rnd() < 0.6) patch.type = pick(rnd, EDGE_TYPES_ARR);
  if (rnd() < 0.4) patch.label = randomText(rnd);
  if (patch.type === undefined && patch.label === undefined) patch.type = pick(rnd, EDGE_TYPES_ARR);
  return patch;
}

// ── addEdge generation — 85% ontology-licensed, 15% off-ontology/hostile ────
// `kindTrack` is a best-effort shadow model: the kind of every node the
// generator has *decided* to add so far, in order. It is not adjusted for
// removeNode/undo/redo/import/clear — those can desync it from what actually
// exists at apply time. That's fine: `applyOp` always resolves indices
// against the real live array modulo its current length, so a stale index
// just degrades gracefully to "some existing node" (still legal — the
// advisory rule means off-ontology edges must work too) rather than
// producing an invalid op.
const OFF_ONTOLOGY_TYPES: readonly string[] = [...EDGE_TYPE_SET, 'frobnicates', 'relates_to', ''];

function generateAddEdge(rnd: () => number, kindTrack: readonly string[]): SimOp {
  const wantLicensed = rnd() < 0.85;
  if (wantLicensed && kindTrack.length) {
    const srcPos = int(rnd, 0, kindTrack.length - 1);
    const srcKind = kindTrack[srcPos];
    const triples = srcKind ? triplesFrom(srcKind) : [];
    if (triples.length) {
      const triple = pick(rnd, triples);
      const matches: number[] = [];
      kindTrack.forEach((k, idx) => {
        if (k === triple.dst) matches.push(idx);
      });
      const dstPos = matches.length ? pick(rnd, matches) : int(rnd, 0, kindTrack.length - 1);
      const label = rnd() < 0.2 ? randomText(rnd) : undefined;
      return label === undefined
        ? { type: 'addEdge', srcIndex: srcPos, dstIndex: dstPos, edgeType: triple.type }
        : { type: 'addEdge', srcIndex: srcPos, dstIndex: dstPos, edgeType: triple.type, label };
    }
  }
  const label = rnd() < 0.2 ? pick(rnd, HOSTILE_STRINGS) : undefined;
  const base = {
    type: 'addEdge' as const,
    srcIndex: int(rnd, 0, 1_000_000),
    dstIndex: int(rnd, 0, 1_000_000),
    edgeType: pick(rnd, OFF_ONTOLOGY_TYPES),
  };
  return label === undefined ? base : { ...base, label };
}

const MALFORMED_IMPORT_PAYLOADS: readonly string[] = [
  '{not valid json',
  '{}',
  'null',
  '42',
  '{"nodes": "oops", "edges": []}',
  '{"nodes": [], "edges": "oops"}',
  '[]',
  '',
];

function generateImportGraph(rnd: () => number): SimOp {
  const malformed = rnd() < 0.4; // importGraph is already rare; malformed occasionally within it
  return malformed
    ? { type: 'importGraph', malformed: true, payload: pick(rnd, MALFORMED_IMPORT_PAYLOADS) }
    : { type: 'importGraph', malformed: false };
}

// ── Weighted op-type selection ──────────────────────────────────────────────
// Add-heavy: the graph must actually grow across a run. removeNode/clearGraph
// stay rare, resetToSample rarer still (per plan cautions).
const OP_WEIGHTS: readonly (readonly [string, number])[] = [
  ['addNode', 32],
  ['updateNode', 18],
  ['removeNode', 5],
  ['addEdge', 24],
  ['updateEdge', 8],
  ['removeEdge', 5],
  ['undo', 3],
  ['redo', 2],
  ['importGraph', 2],
  ['clearGraph', 0.6],
  ['resetToSample', 0.4],
];

function weightedPick(rnd: () => number): string {
  const total = OP_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [k, w] of OP_WEIGHTS) {
    if (r < w) return k;
    r -= w;
  }
  const last = OP_WEIGHTS[OP_WEIGHTS.length - 1];
  return last ? last[0] : 'addNode';
}

function generateOp(rnd: () => number, type: string, kindTrack: string[]): SimOp {
  switch (type) {
    case 'addNode': {
      const def = pick(rnd, KINDS);
      kindTrack.push(def.kind);
      return {
        type: 'addNode',
        kind: def.kind,
        title: randomText(rnd),
        description: randomText(rnd),
        props: randomProps(rnd, def),
      };
    }
    case 'updateNode':
      return { type: 'updateNode', targetIndex: int(rnd, 0, 1_000_000), patch: randomNodePatch(rnd) };
    case 'removeNode':
      return { type: 'removeNode', targetIndex: int(rnd, 0, 1_000_000) };
    case 'addEdge':
      return generateAddEdge(rnd, kindTrack);
    case 'updateEdge':
      return { type: 'updateEdge', edgeIndex: int(rnd, 0, 1_000_000), patch: randomEdgePatch(rnd) };
    case 'removeEdge':
      return { type: 'removeEdge', edgeIndex: int(rnd, 0, 1_000_000) };
    case 'undo':
      return { type: 'undo' };
    case 'redo':
      return { type: 'redo' };
    case 'importGraph':
      return generateImportGraph(rnd);
    case 'clearGraph':
      return { type: 'clearGraph' };
    case 'resetToSample':
      return { type: 'resetToSample' };
    default:
      return { type: 'addNode', kind: 'name', title: 'fallback', description: '', props: {} };
  }
}

/** Pure: generates `count` ops from `rnd` alone. Never touches the store. */
export function generateOps(rnd: () => number, count: number): SimOp[] {
  const ops: SimOp[] = [];
  const kindTrack: string[] = [];
  const warmup = Math.max(5, Math.floor(count * 0.1));

  for (let i = 0; i < count; i++) {
    let type = weightedPick(rnd);
    // Warm-up window: keep the graph growing instead of getting wiped early.
    if (i < warmup && (type === 'removeNode' || type === 'removeEdge' || type === 'clearGraph' || type === 'resetToSample')) {
      type = 'addNode';
    }
    // Ops that need existing nodes fall back to addNode while the shadow
    // model is still empty (targets would just resolve to nothing anyway).
    if ((type === 'updateNode' || type === 'removeNode' || type === 'addEdge' || type === 'updateEdge' || type === 'removeEdge') && kindTrack.length === 0) {
      type = 'addNode';
    }
    ops.push(generateOp(rnd, type, kindTrack));
  }
  return ops;
}

// ── Applying an op to the real store ────────────────────────────────────────
function mod(n: number, len: number): number {
  return ((n % len) + len) % len;
}

/** Drives the real store mutators for one op. Never throws by design of the
 * store's own mutators; index-based targets that don't currently exist
 * (e.g. an empty graph) are no-ops rather than errors. */
export function applyOp(op: SimOp): void {
  switch (op.type) {
    case 'addNode':
      addNode(op.kind, { title: op.title, description: op.description, props: op.props });
      return;
    case 'updateNode': {
      const nodes = state.graph.nodes;
      if (!nodes.length) return;
      const node = nodes[mod(op.targetIndex, nodes.length)];
      if (node) updateNode(node.id, op.patch);
      return;
    }
    case 'removeNode': {
      const nodes = state.graph.nodes;
      if (!nodes.length) return;
      const node = nodes[mod(op.targetIndex, nodes.length)];
      if (node) removeNode(node.id);
      return;
    }
    case 'addEdge': {
      const nodes = state.graph.nodes;
      if (nodes.length < 2) return;
      const src = nodes[mod(op.srcIndex, nodes.length)];
      const dst = nodes[mod(op.dstIndex, nodes.length)];
      if (src && dst) addEdge(src.id, dst.id, op.edgeType, op.label);
      return;
    }
    case 'updateEdge': {
      const edges = state.graph.edges;
      if (!edges.length) return;
      const edge = edges[mod(op.edgeIndex, edges.length)];
      if (edge) updateEdge(edge.id, op.patch);
      return;
    }
    case 'removeEdge': {
      const edges = state.graph.edges;
      if (!edges.length) return;
      const edge = edges[mod(op.edgeIndex, edges.length)];
      if (edge) removeEdge(edge.id);
      return;
    }
    case 'undo':
      undo();
      return;
    case 'redo':
      redo();
      return;
    case 'importGraph': {
      const payload = op.malformed ? (op.payload ?? '') : exportGraph();
      storeImportGraph(payload);
      return;
    }
    case 'clearGraph':
      clearGraph();
      return;
    case 'resetToSample':
      resetToSample();
      return;
  }
}
