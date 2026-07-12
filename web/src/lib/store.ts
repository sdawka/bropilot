import { reactive, computed, watch } from 'vue';
import { nanoid } from 'nanoid';
import {
  type Graph,
  type GraphNode,
  type GraphEdge,
  type Part,
  KIND_MAP,
  kebab,
  kindsForPart,
} from './schema';
import { SAMPLE_GRAPH } from './sample';

const STORAGE_KEY = 'bropilot:graph:v1';

function emptyGraph(): Graph {
  return { nodes: [], edges: [] };
}

function load(): Graph {
  if (typeof localStorage === 'undefined') return emptyGraph();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(SAMPLE_GRAPH); // first run → seed with demo
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) return parsed;
  } catch {
    /* fall through to empty */
  }
  return emptyGraph();
}

interface StoreState {
  graph: Graph;
  selectedId: string | null;
  loaded: boolean;
}

export const state = reactive<StoreState>({
  graph: emptyGraph(),
  selectedId: null,
  loaded: false,
});

/** Call once, client-side, to hydrate from localStorage. */
export function hydrate() {
  if (state.loaded) return;
  state.graph = load();
  state.loaded = true;
  watch(
    () => state.graph,
    (g) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
      } catch {
        /* quota / unavailable — ignore */
      }
    },
    { deep: true },
  );
}

// ── Node ids — {kind}-{kebab-title}, de-duplicated ──────────────────────────
function makeNodeId(kind: string, title: string): string {
  const base = `${kind}-${kebab(title) || nanoid(5)}`;
  if (!state.graph.nodes.some((n) => n.id === base)) return base;
  return `${base}-${nanoid(4)}`;
}

// ── Node CRUD ───────────────────────────────────────────────────────────────
export function addNode(kind: string, partial: Partial<GraphNode> = {}): GraphNode {
  const def = KIND_MAP[kind];
  const title = partial.title?.trim() || `New ${def?.label ?? kind}`;
  const node: GraphNode = {
    id: makeNodeId(kind, title),
    kind,
    title,
    description: partial.description ?? '',
    props: partial.props ?? {},
    sourceRefs: partial.sourceRefs ?? [],
  };
  state.graph.nodes.push(node);
  state.selectedId = node.id;
  return node;
}

export function updateNode(id: string, patch: Partial<GraphNode>) {
  const node = state.graph.nodes.find((n) => n.id === id);
  if (!node) return;
  Object.assign(node, patch);
}

export function removeNode(id: string) {
  state.graph.nodes = state.graph.nodes.filter((n) => n.id !== id);
  state.graph.edges = state.graph.edges.filter((e) => e.srcId !== id && e.dstId !== id);
  if (state.selectedId === id) state.selectedId = null;
}

export function getNode(id: string | null): GraphNode | undefined {
  if (!id) return undefined;
  return state.graph.nodes.find((n) => n.id === id);
}

// ── Edge CRUD ───────────────────────────────────────────────────────────────
export function addEdge(srcId: string, dstId: string, type: string, label?: string): GraphEdge | null {
  if (!srcId || !dstId || srcId === dstId) return null;
  const dup = state.graph.edges.find((e) => e.srcId === srcId && e.dstId === dstId && e.type === type);
  if (dup) return dup;
  const edge: GraphEdge = { id: `e-${nanoid(8)}`, srcId, dstId, type, label };
  state.graph.edges.push(edge);
  return edge;
}

export function removeEdge(id: string) {
  state.graph.edges = state.graph.edges.filter((e) => e.id !== id);
}

export function edgesOf(id: string) {
  const outgoing = state.graph.edges.filter((e) => e.srcId === id);
  const incoming = state.graph.edges.filter((e) => e.dstId === id);
  return { outgoing, incoming };
}

// ── Selectors ───────────────────────────────────────────────────────────────
export function nodesByKind(kind: string): GraphNode[] {
  return state.graph.nodes.filter((n) => n.kind === kind);
}

export function nodesInPart(part: Part): GraphNode[] {
  const kinds = new Set(kindsForPart(part).map((k) => k.kind));
  return state.graph.nodes.filter((n) => kinds.has(n.kind));
}

export const counts = computed(() => {
  const byPart: Record<string, number> = { foundations: 0, domain: 0, implementation: 0 };
  for (const n of state.graph.nodes) {
    const part = KIND_MAP[n.kind]?.part;
    if (part) byPart[part] += 1;
  }
  return { ...byPart, nodes: state.graph.nodes.length, edges: state.graph.edges.length };
});

// ── Import / export ─────────────────────────────────────────────────────────
export function exportGraph(): string {
  return JSON.stringify(state.graph, null, 2);
}

export function importGraph(raw: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return { ok: false, error: 'Expected { nodes: [...], edges: [...] }' };
    }
    state.graph = { nodes: parsed.nodes, edges: parsed.edges };
    state.selectedId = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function resetToSample() {
  state.graph = structuredClone(SAMPLE_GRAPH);
  state.selectedId = null;
}

export function clearGraph() {
  state.graph = emptyGraph();
  state.selectedId = null;
}
