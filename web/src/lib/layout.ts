import { state } from './store';

// Node positions live under their own key, NOT inside the graph JSON:
// exports stay canonical { nodes, edges }, and sim ticks never churn the
// undo history / graph autosave.
const LAYOUT_KEY = 'bropilot:layout:v1';
const SAVE_DEBOUNCE_MS = 800;

type Layout = Record<string, { x: number; y: number }>;

let layout: Layout | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Layout {
  if (layout) return layout;
  layout = {};
  if (typeof localStorage === 'undefined') return layout;
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') layout = parsed as Layout;
    }
  } catch {
    /* corrupt / unavailable — start empty */
  }
  return layout;
}

function write() {
  if (!layout) return;
  // prune ids no longer in the graph so the map can't grow unboundedly
  const ids = new Set(state.graph.nodes.map((n) => n.id));
  for (const id of Object.keys(layout)) {
    if (!ids.has(id)) delete layout[id];
  }
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* quota / unavailable — ignore */
  }
}

export function getPos(id: string): { x: number; y: number } | undefined {
  return load()[id];
}

/** Merge (never replace — filtered-out nodes keep their positions) and debounce-write. */
export function setPositions(entries: Iterable<[string, { x: number; y: number }]>) {
  const map = load();
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

export function clearLayout() {
  layout = {};
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    localStorage.removeItem(LAYOUT_KEY);
  } catch {
    /* ignore */
  }
}
