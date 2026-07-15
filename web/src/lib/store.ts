import { reactive, ref, computed, watch } from 'vue';
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
const SEED_KEY = 'bropilot:seed:v1'; // exact JSON we last seeded — detects untouched demo data

function emptyGraph(): Graph {
  return { nodes: [], edges: [] };
}

function seedSample(): Graph {
  try {
    localStorage.setItem(SEED_KEY, JSON.stringify(SAMPLE_GRAPH));
  } catch {
    /* ignore */
  }
  return structuredClone(SAMPLE_GRAPH);
}

function load(): Graph {
  if (typeof localStorage === 'undefined') return emptyGraph();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedSample(); // first run → seed with demo
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      // stored graph is demo data the user never edited → follow sample upgrades
      const seeded = localStorage.getItem(SEED_KEY);
      if (seeded && raw === seeded && raw !== JSON.stringify(SAMPLE_GRAPH)) return seedSample();
      return parsed;
    }
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

/** Bumped after every successful autosave — drives the "Saved" indicator. */
export const savedAt = ref(0);

// ── Undo/redo — snapshot history driven by the autosave watch ───────────────
// `baseline` is the serialized graph at the last recorded history point. The
// deep watch schedules a debounced record(); undo/redo set `baseline` to the
// snapshot they apply, so the watch-triggered record() compares equal and
// no-ops — no isApplying flag needed.
const HISTORY_LIMIT = 50;
const HISTORY_DEBOUNCE_MS = 400;

const history = reactive<{ past: string[]; future: string[] }>({ past: [], future: [] });
let baseline = '';
let pendingRecord: ReturnType<typeof setTimeout> | null = null;

function record() {
  const current = JSON.stringify(state.graph);
  if (current === baseline) return;
  history.past.push(baseline);
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future = [];
  baseline = current;
}

function scheduleRecord() {
  if (pendingRecord) clearTimeout(pendingRecord);
  pendingRecord = setTimeout(() => {
    pendingRecord = null;
    record();
  }, HISTORY_DEBOUNCE_MS);
}

/** Flush any pending debounced record so the next mutation is a discrete undo step. */
function checkpoint() {
  if (!state.loaded) return;
  if (pendingRecord) {
    clearTimeout(pendingRecord);
    pendingRecord = null;
  }
  record();
}

export const canUndo = computed(() => history.past.length > 0);
export const canRedo = computed(() => history.future.length > 0);

function applySnapshot(snapshot: string) {
  baseline = snapshot; // set before the watch fires — echo guard
  state.graph = JSON.parse(snapshot);
  if (state.selectedId && !state.graph.nodes.some((n) => n.id === state.selectedId)) {
    state.selectedId = null;
  }
}

export function undo() {
  checkpoint(); // mid-typing Cmd+Z reverts the typed chunk
  if (!history.past.length) return;
  history.future.push(baseline);
  applySnapshot(history.past.pop()!);
}

export function redo() {
  if (!history.future.length) return;
  history.past.push(baseline);
  applySnapshot(history.future.pop()!);
}

/** Call once, client-side, to hydrate from localStorage. */
export function hydrate() {
  if (state.loaded) return;
  state.graph = load();
  baseline = JSON.stringify(state.graph);
  state.loaded = true;
  watch(
    () => state.graph,
    (g) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
        savedAt.value = Date.now();
      } catch {
        /* quota / unavailable — ignore */
      }
      scheduleRecord();
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
  checkpoint();
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
  checkpoint();
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
  checkpoint();
  const edge: GraphEdge = { id: `e-${nanoid(8)}`, srcId, dstId, type, label };
  state.graph.edges.push(edge);
  return edge;
}

export function updateEdge(id: string, patch: Partial<Pick<GraphEdge, 'type' | 'label'>>) {
  const edge = state.graph.edges.find((e) => e.id === id);
  if (!edge) return;
  Object.assign(edge, patch);
}

export function removeEdge(id: string) {
  checkpoint();
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
    checkpoint();
    state.graph = { nodes: parsed.nodes, edges: parsed.edges };
    state.selectedId = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function resetToSample() {
  checkpoint();
  state.graph = seedSample();
  state.selectedId = null;
}

export function clearGraph() {
  checkpoint();
  state.graph = emptyGraph();
  state.selectedId = null;
}
