import { state } from './store';

// Node positions live under their own key, NOT inside the graph JSON:
// exports stay canonical { nodes, edges }, and sim ticks never churn the
// undo history / graph autosave. Positions are namespaced per force tab so
// each slice keeps its own layout; legacy flat data migrates to `all`.
const LAYOUT_KEY = 'bropilot:layout:v1';
const SAVE_DEBOUNCE_MS = 800;

export type LayoutNamespace = 'all' | 'foundations' | 'domain' | 'implementation';

type Pos = { x: number; y: number };
type Layout = Record<string, Pos>;
type LayoutStore = Record<string, Layout>;

let store: LayoutStore | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Legacy (un-namespaced) data maps id -> {x,y}: its first value carries a
// numeric x/y. The namespaced shape maps namespace -> id -> {x,y}, whose first
// value is a Layout object with no numeric x. Empty object → fresh store.
function isLegacyFlat(obj: Record<string, unknown>): boolean {
  for (const v of Object.values(obj)) {
    return !!v && typeof v === 'object' && typeof (v as Pos).x === 'number' && typeof (v as Pos).y === 'number';
  }
  return false;
}

function loadStore(): LayoutStore {
  if (store) return store;
  store = {};
  if (typeof localStorage === 'undefined') return store;
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        store = isLegacyFlat(parsed) ? { all: parsed as Layout } : (parsed as LayoutStore);
      }
    }
  } catch {
    /* corrupt / unavailable — start empty */
  }
  return store;
}

function nsMap(namespace: LayoutNamespace): Layout {
  const s = loadStore();
  return (s[namespace] ??= {});
}

function write() {
  const s = loadStore();
  // prune ids no longer in the graph so no namespace can grow unboundedly
  const ids = new Set(state.graph.nodes.map((n) => n.id));
  for (const layout of Object.values(s)) {
    for (const id of Object.keys(layout)) {
      if (!ids.has(id)) delete layout[id];
    }
  }
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(s));
  } catch {
    /* quota / unavailable — ignore */
  }
}

export function getPos(id: string, namespace: LayoutNamespace = 'all'): Pos | undefined {
  return nsMap(namespace)[id];
}

/** Merge (never replace — filtered-out nodes keep their positions) and debounce-write. */
export function setPositions(
  entries: Iterable<[string, Pos]>,
  namespace: LayoutNamespace = 'all',
) {
  const map = nsMap(namespace);
  for (const [id, pos] of entries) map[id] = { x: pos.x, y: pos.y };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    write();
  }, SAVE_DEBOUNCE_MS);
}

/** Flush any pending debounced write immediately (e.g. before unmount). */
export function flushPositions() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  write();
}

/** Forget one namespace's stored positions and persist the rest. */
export function clearLayout(namespace: LayoutNamespace = 'all') {
  const s = loadStore();
  delete s[namespace];
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
