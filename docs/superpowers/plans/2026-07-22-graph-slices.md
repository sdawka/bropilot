# Graph Slices & Thread View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single spread-out force graph with sliced views — an "All" tab (today's combined graph), one force-graph tab per part (Foundations / Domain / Implementation) with cross-part "ghost" context nodes, and a deterministic "Thread" tab that traces a selected node's cross-part closure.

**Architecture:** The Graph view gains a tab strip. The existing `ForceGraph.vue` is reused for every force tab via new props (`ghostIds`, `namespace`) — never forked. Part subsetting, ghost computation, and the ghost-click jump live in `GraphView.vue`. Thread layout is a pure, deterministic, hand-rolled module (`lib/thread.ts`) rendered by a new `ThreadView.vue`. Node position persistence in `lib/layout.ts` is namespaced per force tab, with legacy un-namespaced data migrated into the `all` namespace on first read. Active tab persists to a UI-prefs localStorage key (not the graph key, not the hash).

**Tech Stack:** Astro 5 + Vue 3 (single `client:only` island), TypeScript, d3-force (layout only), Tailwind v4 (no config file), Vitest (node env), Playwright. No new dependencies.

## Global Constraints

Every task's requirements implicitly include this section. Values copied verbatim from the spec.

- **Client-only; no new dependencies.** No `d3-zoom`, `d3-drag`, ELK, dagre, or any other package. Thread layout is hand-rolled and deterministic.
- **Single Vue island.** All interactive state stays inside the one `<Studio client:only="vue">` mount. No new Astro pages.
- **`ForceGraph.vue` is reused for all force tabs — extend via props, do not fork it.** Interactions (drag, pan, zoom, select-to-spotlight, click-empty-to-deselect) must keep working on every force tab.
- **`lib/thread.ts` is PURE** — no Vue imports, no store imports. `threadFor(graph, anchorId)` only.
- **Nothing is validated or blocked.** All views are advisory/exploratory.
- **Ontology toggle is exclusive to the All tab.** Part tabs get Fit/Relayout but not the Instance|Ontology toggle.
- **Ghosts:** 1-hop cross-part neighbours of a part's nodes, rendered smaller with ~0.35 opacity, dashed+dimmed edges, label only on hover/selection. Clicking a ghost switches to its home part tab and selects it — the only way a part tab changes tabs. Unknown-kind nodes (not in `KIND_MAP`) appear only in the All tab and are never ghosts.
- **Thread closure:** BFS from `state.selectedId` over **all** edges, both directions, unlimited depth, capped at **60** nodes (breadth-first order); cap noted in the UI when hit. Three fixed columns bucketed by `KIND_MAP[kind].part`; unknown-kind nodes skipped. Row order = barycenter of neighbour rows in adjacent columns, iterated twice, ties by title. Deterministic.
- **Layout persistence:** namespaced `all | foundations | domain | implementation`; legacy flat data migrates to `all` on first read; pruning stays correct per namespace.
- **Active tab persists** to localStorage UI-prefs key `bropilot:ui:graphTab:v1` (not `bropilot:graph:v1`, not the hash). Selecting a node never changes the active tab by itself (except the deliberate ghost jump).
- **Hash routing is unchanged** — tabs are deliberately NOT in the hash.
- **All commands run from `web/`.** If `web/node_modules` is missing, run `npm install` in `web/` first. `npm run check`, `npm run test`, and `npm run e2e` must all be green at the end of every task.

---

## File Structure

**Create:**
- `web/src/lib/thread.ts` — pure closure + column/row layout (Task 1).
- `web/tests/unit/thread.test.ts` — thread unit tests (Task 1).
- `web/tests/unit/layout.test.ts` — layout namespacing/migration tests (Task 2).
- `web/src/components/views/ThreadView.vue` — thread renderer (Task 4).
- `web/e2e/slices.spec.ts` — new e2e coverage (Task 6).

**Modify:**
- `web/src/lib/layout.ts` — namespace all functions; migrate legacy data (Task 2).
- `web/src/components/graph/ForceGraph.vue` — add `ghostIds` + `namespace` props; ghost rendering (Task 3).
- `web/src/components/views/GraphView.vue` — tab strip, part subsetting, ghost jump, active-tab persistence, mount `ThreadView` (Task 5).

---

## Task 1: `lib/thread.ts` — pure closure + deterministic layout

**Files:**
- Create: `web/src/lib/thread.ts`
- Test: `web/tests/unit/thread.test.ts`

**Interfaces:**
- Consumes: from `web/src/lib/schema.ts` — `KIND_MAP`, and types `Graph`, `GraphNode`, `GraphEdge`, `Part`.
- Produces:
  - `interface ThreadNode { node: GraphNode; row: number }`
  - `interface ThreadColumn { part: Part; nodes: ThreadNode[] }`
  - `interface Thread { columns: ThreadColumn[]; edges: GraphEdge[]; capped: boolean }`
  - `function threadFor(graph: Graph, anchorId: string): Thread` — `columns` is always length 3 in fixed order `['foundations','domain','implementation']`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/unit/thread.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { threadFor, type Thread } from '../../src/lib/thread';
import { SAMPLE_GRAPH } from '../../src/lib/sample';
import type { Graph } from '../../src/lib/schema';

const PARTS = ['foundations', 'domain', 'implementation'] as const;

function ids(thread: Thread, part: (typeof PARTS)[number]): string[] {
  return thread.columns.find((c) => c.part === part)!.nodes.map((n) => n.node.id);
}
function allIds(thread: Thread): string[] {
  return thread.columns.flatMap((c) => c.nodes.map((n) => n.node.id));
}

describe('threadFor: structure', () => {
  it('returns three fixed columns in order, even when the anchor is missing', () => {
    const t = threadFor(SAMPLE_GRAPH, 'does-not-exist');
    expect(t.columns.map((c) => c.part)).toEqual([...PARTS]);
    expect(allIds(t)).toEqual([]);
    expect(t.edges).toEqual([]);
    expect(t.capped).toBe(false);
  });

  it('returns an empty thread for an empty anchor id', () => {
    const t = threadFor(SAMPLE_GRAPH, '');
    expect(allIds(t)).toEqual([]);
  });
});

describe('threadFor: closure', () => {
  it('traverses edges in both directions (anchor reached only via an incoming edge)', () => {
    // In SAMPLE_GRAPH the only edge touching requirement-three-parts is
    // e-4: capability-collect --satisfies--> requirement-three-parts.
    // Direction-agnostic BFS must still pull capability-collect in.
    const t = threadFor(SAMPLE_GRAPH, 'requirement-three-parts');
    const found = allIds(t);
    expect(found).toContain('requirement-three-parts');
    expect(found).toContain('capability-collect');
  });

  it('buckets every returned node into the column matching KIND_MAP[kind].part', () => {
    const t = threadFor(SAMPLE_GRAPH, 'screen-studio');
    // foundations kinds land in foundations, etc. Spot-check known members.
    expect(ids(t, 'domain')).toContain('screen-studio');
    expect(ids(t, 'implementation')).toContain('component-force-graph');
    expect(ids(t, 'foundations')).toContain('usecase-onboard');
  });

  it('skips unknown-kind nodes but keeps their known-kind neighbours', () => {
    const graph: Graph = {
      nodes: [
        { id: 'persona-a', kind: 'persona', title: 'A', description: '', props: {} },
        { id: 'weird-1', kind: 'zzz-unknown', title: 'Weird', description: '', props: {} },
        { id: 'entity-b', kind: 'entity', title: 'B', description: '', props: {} },
      ],
      edges: [
        { id: 'x1', srcId: 'persona-a', dstId: 'weird-1', type: 'references' },
        { id: 'x2', srcId: 'weird-1', dstId: 'entity-b', type: 'references' },
      ],
    };
    const t = threadFor(graph, 'persona-a');
    const found = allIds(t);
    expect(found).toContain('persona-a');
    expect(found).toContain('entity-b'); // reachable through the unknown node
    expect(found).not.toContain('weird-1'); // unknown kind never shown
    // edges touching the skipped node are excluded from the rendered set
    expect(t.edges.map((e) => e.id).sort()).toEqual([]);
  });
});

describe('threadFor: cap', () => {
  it('caps the closure at 60 nodes and flags it', () => {
    const nodes = [{ id: 'name-root', kind: 'name', title: 'Root', description: '', props: {} }];
    const edges = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({ id: `capability-${i}`, kind: 'capability', title: `Cap ${i}`, description: '', props: {} });
      edges.push({ id: `e-${i}`, srcId: 'name-root', dstId: `capability-${i}`, type: 'has' });
    }
    const t = threadFor({ nodes, edges }, 'name-root');
    const total = t.columns.reduce((n, c) => n + c.nodes.length, 0);
    expect(total).toBe(60);
    expect(t.capped).toBe(true);
  });
});

describe('threadFor: deterministic ordering', () => {
  it('produces identical output across runs', () => {
    const a = JSON.stringify(threadFor(SAMPLE_GRAPH, 'screen-studio'));
    const b = JSON.stringify(threadFor(SAMPLE_GRAPH, 'screen-studio'));
    expect(a).toBe(b);
  });

  it('breaks barycenter ties by title within a column', () => {
    // Two foundations nodes with identical neighbour sets tie on barycenter,
    // so they must fall back to title order: "Alpha" before "Beta".
    const graph: Graph = {
      nodes: [
        { id: 'capability-beta', kind: 'capability', title: 'Beta', description: '', props: {} },
        { id: 'capability-alpha', kind: 'capability', title: 'Alpha', description: '', props: {} },
        { id: 'entity-hub', kind: 'entity', title: 'Hub', description: '', props: {} },
      ],
      edges: [
        { id: 'b1', srcId: 'capability-beta', dstId: 'entity-hub', type: 'references' },
        { id: 'b2', srcId: 'capability-alpha', dstId: 'entity-hub', type: 'references' },
      ],
    };
    const t = threadFor(graph, 'entity-hub');
    expect(ids(t, 'foundations')).toEqual(['capability-alpha', 'capability-beta']);
    // rows are contiguous 0..n-1
    expect(t.columns.find((c) => c.part === 'foundations')!.nodes.map((n) => n.row)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npm run test -- thread`
Expected: FAIL — `Cannot find module '../../src/lib/thread'` (the file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/thread.ts`:

```ts
// Pure, deterministic thread layout. No Vue, no store imports — unit-testable.
// A "thread" is the cross-part closure of a single anchor node, bucketed into
// three fixed columns (Foundations / Domain / Implementation) and row-ordered
// by a twice-iterated barycenter heuristic. Same graph + anchor in → same
// layout out.
import { KIND_MAP, type Graph, type GraphNode, type GraphEdge, type Part } from './schema';

export interface ThreadNode {
  node: GraphNode;
  row: number;
}
export interface ThreadColumn {
  part: Part;
  nodes: ThreadNode[];
}
export interface Thread {
  columns: ThreadColumn[];
  edges: GraphEdge[];
  capped: boolean;
}

const THREAD_PARTS: Part[] = ['foundations', 'domain', 'implementation'];
const NODE_CAP = 60;
// Columns whose rows feed a given column's barycenter (left/right neighbours).
const ADJACENT: Record<Part, Part[]> = {
  foundations: ['domain'],
  domain: ['foundations', 'implementation'],
  implementation: ['domain'],
};

function emptyThread(): Thread {
  return { columns: THREAD_PARTS.map((part) => ({ part, nodes: [] })), edges: [], capped: false };
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function threadFor(graph: Graph, anchorId: string): Thread {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!anchorId || !byId.has(anchorId)) return emptyThread();

  // Undirected adjacency over edges whose both endpoints exist.
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.srcId) || !byId.has(e.dstId)) continue;
    push(adj, e.srcId, e.dstId);
    push(adj, e.dstId, e.srcId);
  }

  // BFS closure, breadth-first order, capped at NODE_CAP nodes (incl. anchor).
  const visited = new Set<string>([anchorId]);
  const queue = [anchorId];
  let capped = false;
  for (let head = 0; head < queue.length && !capped; head++) {
    for (const nb of adj.get(queue[head]) ?? []) {
      if (visited.has(nb)) continue;
      if (visited.size >= NODE_CAP) {
        capped = true;
        break;
      }
      visited.add(nb);
      queue.push(nb);
    }
  }

  // Bucket known-kind nodes into fixed columns (Set preserves BFS order).
  const columnNodes: Record<Part, GraphNode[]> = { foundations: [], domain: [], implementation: [] };
  for (const id of visited) {
    const node = byId.get(id)!;
    const part = KIND_MAP[node.kind]?.part;
    if (part) columnNodes[part].push(node);
  }

  // Rendered node set = known-kind closure members only.
  const shown = new Set<string>();
  for (const part of THREAD_PARTS) for (const n of columnNodes[part]) shown.add(n.id);
  const edges = graph.edges.filter((e) => shown.has(e.srcId) && shown.has(e.dstId));

  // Barycenter row ordering, seeded by title for stable ties.
  const rowOf = new Map<string, number>();
  const partOf = new Map<string, Part>();
  const reindex = () => {
    rowOf.clear();
    partOf.clear();
    for (const part of THREAD_PARTS)
      columnNodes[part].forEach((n, i) => {
        rowOf.set(n.id, i);
        partOf.set(n.id, part);
      });
  };
  for (const part of THREAD_PARTS)
    columnNodes[part].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  reindex();

  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    push(neighbours, e.srcId, e.dstId);
    push(neighbours, e.dstId, e.srcId);
  }

  for (let sweep = 0; sweep < 2; sweep++) {
    for (const part of THREAD_PARTS) {
      const adjacent = new Set(ADJACENT[part]);
      const bary = new Map<string, number>();
      columnNodes[part].forEach((n, idx) => {
        const rows: number[] = [];
        for (const nb of neighbours.get(n.id) ?? []) {
          const np = partOf.get(nb);
          if (np && adjacent.has(np)) rows.push(rowOf.get(nb)!);
        }
        // No cross-column neighbours → keep current position (idx).
        bary.set(n.id, rows.length ? rows.reduce((s, r) => s + r, 0) / rows.length : idx);
      });
      columnNodes[part].sort(
        (a, b) =>
          bary.get(a.id)! - bary.get(b.id)! ||
          a.title.localeCompare(b.title) ||
          a.id.localeCompare(b.id),
      );
      reindex();
    }
  }

  return {
    columns: THREAD_PARTS.map((part) => ({
      part,
      nodes: columnNodes[part].map((node, row) => ({ node, row })),
    })),
    edges,
    capped,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npm run test -- thread`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Run the full gate**

Run: `cd web && npm run check && npm run test`
Expected: `astro check` reports 0 errors; the whole Vitest suite (including the new file) passes.

- [ ] **Step 6: Commit**

```bash
cd web && git add src/lib/thread.ts tests/unit/thread.test.ts
git commit -m "feat: add pure thread-closure layout module"
```

---

## Task 2: `lib/layout.ts` — namespaced positions + legacy migration

**Files:**
- Modify: `web/src/lib/layout.ts`
- Test: `web/tests/unit/layout.test.ts`

**Interfaces:**
- Consumes: `state` from `web/src/lib/store.ts` (for pruning).
- Produces (backward-compatible — every namespace param is trailing + optional, defaulting to `'all'`, so existing `getPos(id)` / `setPositions(entries)` / `clearLayout()` calls keep compiling):
  - `type LayoutNamespace = 'all' | 'foundations' | 'domain' | 'implementation'`
  - `getPos(id: string, namespace?: LayoutNamespace): { x: number; y: number } | undefined`
  - `setPositions(entries: Iterable<[string, { x: number; y: number }]>, namespace?: LayoutNamespace): void`
  - `flushPositions(): void` (writes the whole namespaced store; unchanged signature)
  - `clearLayout(namespace?: LayoutNamespace): void` (clears one namespace only)

- [ ] **Step 1: Write the failing test**

Create `web/tests/unit/layout.test.ts`:

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest';

const LAYOUT_KEY = 'bropilot:layout:v1';

// layout.ts caches its parsed store at module scope, so each test resets the
// module registry and re-imports a fresh copy after seeding localStorage.
async function freshLayout() {
  vi.resetModules();
  const store = await import('../../src/lib/store');
  const layout = await import('../../src/lib/layout');
  return { store, layout };
}

beforeEach(() => {
  localStorage.clear();
});

describe('layout namespacing', () => {
  it('keeps positions in separate namespaces', async () => {
    const { layout } = await freshLayout();
    layout.setPositions([['a', { x: 1, y: 2 }]], 'all');
    layout.setPositions([['a', { x: 9, y: 9 }]], 'foundations');
    expect(layout.getPos('a', 'all')).toEqual({ x: 1, y: 2 });
    expect(layout.getPos('a', 'foundations')).toEqual({ x: 9, y: 9 });
    expect(layout.getPos('a', 'domain')).toBeUndefined();
  });

  it('defaults to the "all" namespace', async () => {
    const { layout } = await freshLayout();
    layout.setPositions([['a', { x: 3, y: 4 }]]); // no namespace arg
    expect(layout.getPos('a')).toEqual({ x: 3, y: 4 });
    expect(layout.getPos('a', 'all')).toEqual({ x: 3, y: 4 });
  });

  it('clearLayout(namespace) clears only that namespace', async () => {
    const { layout } = await freshLayout();
    layout.setPositions([['a', { x: 1, y: 1 }]], 'all');
    layout.setPositions([['a', { x: 2, y: 2 }]], 'foundations');
    layout.flushPositions();
    layout.clearLayout('foundations');
    expect(layout.getPos('a', 'foundations')).toBeUndefined();
    expect(layout.getPos('a', 'all')).toEqual({ x: 1, y: 1 });
  });
});

describe('layout migration', () => {
  it('migrates legacy un-namespaced data into the "all" namespace on first read', async () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ 'node-1': { x: 5, y: 6 } }));
    const { layout } = await freshLayout();
    expect(layout.getPos('node-1', 'all')).toEqual({ x: 5, y: 6 });
    expect(layout.getPos('node-1')).toEqual({ x: 5, y: 6 });
  });
});

describe('layout pruning', () => {
  it('drops ids absent from the graph across every namespace on write', async () => {
    const { store, layout } = await freshLayout();
    store.state.graph = {
      nodes: [{ id: 'keep', kind: 'name', title: 'Keep', description: '', props: {} }],
      edges: [],
    };
    layout.setPositions(
      [
        ['keep', { x: 1, y: 1 }],
        ['gone', { x: 2, y: 2 }],
      ],
      'foundations',
    );
    layout.flushPositions(); // prune happens on write
    expect(layout.getPos('keep', 'foundations')).toEqual({ x: 1, y: 1 });
    expect(layout.getPos('gone', 'foundations')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npm run test -- layout`
Expected: FAIL — the namespaced calls (`getPos('a', 'all')`, `clearLayout('foundations')`, migration) do not behave as asserted against the current flat implementation.

- [ ] **Step 3: Rewrite `web/src/lib/layout.ts`**

Replace the entire file contents with:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npm run test -- layout`
Expected: PASS — all 5 layout tests green.

- [ ] **Step 5: Run the full gate**

Run: `cd web && npm run check && npm run test && npm run e2e`
Expected: `astro check` clean; full Vitest suite green; the whole Playwright suite green (ForceGraph still calls `getPos(id)` / `setPositions(entries)` / `clearLayout()` with no namespace, which now default to `'all'` — behaviour is byte-identical to before).

- [ ] **Step 6: Commit**

```bash
cd web && git add src/lib/layout.ts tests/unit/layout.test.ts
git commit -m "feat: namespace layout positions per force tab with legacy migration"
```

---

## Task 3: `ForceGraph.vue` — ghost + namespace props

**Files:**
- Modify: `web/src/components/graph/ForceGraph.vue`

**Interfaces:**
- Consumes: `LayoutNamespace` from `web/src/lib/layout.ts` (Task 2).
- Produces (new props; both default so existing `GraphView` usage is unchanged and green):
  - `ghostIds?: Set<string>` — ids to render as ghosts (default: empty set).
  - `namespace?: LayoutNamespace` — layout namespace for position persistence (default: `'all'`).
  - Still emits `select` for every node click, including ghosts — the jump decision lives in the parent (Task 5).

- [ ] **Step 1: Add the props (extend the existing `defineProps`)**

Replace lines 13–19 (the schema import + `props` block) with:

```ts
import { KIND_MAP, SPACES, EDGE_TYPE_LABELS, nodeHue, nodeSpace, type GraphNode, type GraphEdge, type Space } from '../../lib/schema';
import { getPos, setPositions, flushPositions, clearLayout, type LayoutNamespace } from '../../lib/layout';

const props = withDefaults(
  defineProps<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    selectedId: string | null;
    dash?: Record<string, string>;
    persist?: boolean;
    ghostIds?: Set<string>;
    namespace?: LayoutNamespace;
  }>(),
  { persist: true, namespace: 'all', ghostIds: () => new Set<string>() },
);
```

- [ ] **Step 2: Thread the namespace through persistence**

In `savePositions` (currently lines 69–73), pass the namespace to `setPositions`:

```ts
function savePositions(flush = false) {
  if (props.persist === false) return;
  setPositions(
    simNodes.map((n) => [n.id, { x: n.x, y: n.y }] as [string, { x: number; y: number }]),
    props.namespace,
  );
  if (flush) flushPositions();
}
```

In `build` (currently line 87), read stored positions from the namespace:

```ts
      const stored = props.persist === false ? undefined : getPos(node.id, props.namespace);
```

In `relayout` (currently line 327), clear only this tab's namespace:

```ts
  if (props.persist !== false) clearLayout(props.namespace);
```

- [ ] **Step 3: Add ghost flags to the render computeds**

Add a helper next to `radius` (after line 149):

```ts
function isGhost(id: string) {
  return props.ghostIds.has(id);
}
```

Replace the `dots` computed (lines 170–184) with a ghost-aware version:

```ts
const dots = computed(() => {
  frame.value;
  const focus = hoverId.value ?? props.selectedId;
  return simNodes.map((d) => {
    const ghost = isGhost(d.id);
    const dim = dimmed(d.id);
    return {
      id: d.id,
      x: d.x,
      y: d.y,
      r: radius(d) * (ghost ? 0.62 : 1),
      title: d.node.title,
      icon: KIND_MAP[d.node.kind]?.icon ?? '•',
      hue: nodeHue(d.node),
      selected: d.id === props.selectedId,
      active: isActive(d.id),
      dim,
      ghost,
      opacity: dim ? 0.28 : ghost ? 0.35 : 1,
      // ghosts stay label-free until hovered or selected, to avoid crowding
      showLabel: !ghost || d.id === props.selectedId || d.id === focus,
    };
  });
});
```

Replace the `links` computed (lines 152–168) so links touching a ghost carry a flag:

```ts
const links = computed(() => {
  frame.value; // dependency
  return simLinks.map((l) => ({
    id: l.id,
    type: l.type,
    x1: l.source.x,
    y1: l.source.y,
    x2: l.target.x,
    y2: l.target.y,
    active: isActive(l.source.id) || isActive(l.target.id),
    connectsSel:
      props.selectedId != null && (l.source.id === props.selectedId || l.target.id === props.selectedId),
    ghost: isGhost(l.source.id) || isGhost(l.target.id),
    mx: (l.source.x + l.target.x) / 2,
    my: (l.source.y + l.target.y) / 2,
    text: (EDGE_TYPE_LABELS[l.type] ?? l.type) + (l.label ? ` · ${l.label}` : ''),
  }));
});
```

- [ ] **Step 4: Render ghosts in the template**

Replace the edge `<line>` block (lines 429–441) so ghost edges are dashed and dimmed (spotlight still wins):

```html
          <line
            v-for="l in links"
            :key="l.id"
            :x1="l.x1"
            :y1="l.y1"
            :x2="l.x2"
            :y2="l.y2"
            :stroke="l.connectsSel || l.active ? '#78a9ff' : l.ghost ? 'rgba(190,195,215,0.12)' : 'rgba(190,195,215,0.26)'"
            :stroke-width="l.connectsSel || l.active ? 2.2 : 1.2"
            :stroke-dasharray="l.ghost && !(l.connectsSel || l.active) ? '4 4' : props.dash?.[l.id] || undefined"
            :marker-end="l.connectsSel || l.active ? 'url(#arrow-active)' : 'url(#arrow)'"
            :style="{ transition: 'stroke 0.2s' }"
          />
```

Replace the node `<g>` block (lines 462–488) so opacity comes from `d.opacity` and the label respects `d.showLabel`:

```html
          <g
            v-for="d in dots"
            :key="d.id"
            :transform="`translate(${d.x},${d.y})`"
            class="cursor-pointer"
            :style="{ opacity: d.opacity, transition: 'opacity 0.2s' }"
            @pointerdown="onNodeDown(d, $event)"
            @pointerenter="hoverId = d.id"
            @pointerleave="hoverId = null"
          >
            <circle v-if="d.selected" :r="d.r + 7" :fill="d.hue" opacity="0.18" />
            <circle
              :r="d.r"
              :fill="d.hue"
              :stroke="d.selected ? '#fff' : 'rgba(7,8,13,0.9)'"
              :stroke-width="d.selected ? 2 : 1.5"
              :style="{ filter: d.selected || d.active ? `drop-shadow(0 0 8px ${d.hue})` : 'none' }"
            />
            <text
              v-if="d.showLabel"
              :y="d.r + 13"
              text-anchor="middle"
              class="pointer-events-none font-medium"
              :font-size="11"
              :fill="d.dim ? 'rgba(139,151,176,0.6)' : '#cdd5e8'"
              :style="{ paintOrder: 'stroke', stroke: 'rgba(7,8,13,0.85)', strokeWidth: '3px' }"
            >{{ d.title.length > 22 ? d.title.slice(0, 21) + '…' : d.title }}</text>
          </g>
```

- [ ] **Step 5: Run the full gate**

Run: `cd web && npm run check && npm run test && npm run e2e`
Expected: `astro check` clean; Vitest green; Playwright green. `GraphView` does not yet pass `ghostIds`, so `props.ghostIds` is the empty default, `isGhost` is always `false`, and every existing force-graph behaviour (including the drag/relayout regression test) is unchanged.

- [ ] **Step 6: Commit**

```bash
cd web && git add src/components/graph/ForceGraph.vue
git commit -m "feat: add ghost-node and layout-namespace props to ForceGraph"
```

---

## Task 4: `ThreadView.vue` — deterministic thread renderer

**Files:**
- Create: `web/src/components/views/ThreadView.vue`

**Interfaces:**
- Consumes: `threadFor` and types `Thread`/`ThreadNode` from `web/src/lib/thread.ts` (Task 1); `state` from `web/src/lib/store.ts`; `KIND_MAP`, `nodeHue`, `EDGE_TYPE_LABELS` from `web/src/lib/schema.ts`.
- Produces: a self-contained Vue component with no props. Reads `state.selectedId` as the initial anchor; renders three labelled columns, clickable cards, cross- and same-column SVG edges, an anchor accent ring, an "⚓ Anchor here" affordance, and a cap notice. Not yet mounted — Task 5 mounts it inside `GraphView`.

- [ ] **Step 1: Create the component**

Create `web/src/components/views/ThreadView.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { threadFor, type Thread } from '../../lib/thread';
import { state } from '../../lib/store';
import { KIND_MAP, EDGE_TYPE_LABELS, nodeHue, PARTS } from '../../lib/schema';

// Layout geometry (deterministic — no forces, no drag).
const COL_W = 260;
const COL_X0 = 60;
const CARD_W = 190;
const CARD_H = 46;
const ROW_H = 66;
const TOP = 88;

// The thread stays rooted on `anchorId`; selecting a card only moves the
// spotlight. "Anchor here" re-roots. First selection seeds the anchor.
const anchorId = ref<string | null>(state.selectedId);
watch(
  () => state.selectedId,
  (id) => {
    if (id && !anchorId.value) anchorId.value = id;
  },
);

const thread = computed<Thread>(() => threadFor(state.graph, anchorId.value ?? ''));

const PART_LABEL: Record<string, string> = Object.fromEntries(PARTS.map((p) => [p.id, p.label]));

// id -> card geometry, for edge endpoints and card rendering.
interface Placed {
  id: string;
  title: string;
  icon: string;
  hue: string;
  col: number;
  cx: number; // card left
  cy: number; // card top
  centerX: number;
  centerY: number;
}
const placed = computed(() => {
  const map = new Map<string, Placed>();
  thread.value.columns.forEach((column, col) => {
    const cx = COL_X0 + col * COL_W;
    for (const tn of column.nodes) {
      const cy = TOP + tn.row * ROW_H;
      const def = KIND_MAP[tn.node.kind];
      map.set(tn.node.id, {
        id: tn.node.id,
        title: tn.node.title,
        icon: def?.icon ?? '•',
        hue: nodeHue(tn.node),
        col,
        cx,
        cy,
        centerX: cx + CARD_W / 2,
        centerY: cy + CARD_H / 2,
      });
    }
  });
  return map;
});

const cards = computed(() => [...placed.value.values()]);

const maxRows = computed(() =>
  Math.max(1, ...thread.value.columns.map((c) => c.nodes.length)),
);
const svgWidth = COL_X0 + 3 * COL_W;
const svgHeight = computed(() => TOP + maxRows.value * ROW_H + 40);

const columnHeaders = computed(() =>
  thread.value.columns.map((c, col) => ({
    part: c.part,
    label: PART_LABEL[c.part] ?? c.part,
    x: COL_X0 + col * COL_W + CARD_W / 2,
  })),
);

// Spotlight = selected node + its thread neighbours.
const spotlight = computed(() => {
  const set = new Set<string>();
  const sel = state.selectedId;
  if (sel && placed.value.has(sel)) {
    set.add(sel);
    for (const e of thread.value.edges) {
      if (e.srcId === sel) set.add(e.dstId);
      if (e.dstId === sel) set.add(e.srcId);
    }
  }
  return set;
});

interface EdgePath {
  id: string;
  d: string;
  labelX: number;
  labelY: number;
  text: string;
  active: boolean;
}
const edgePaths = computed<EdgePath[]>(() => {
  const out: EdgePath[] = [];
  for (const e of thread.value.edges) {
    const s = placed.value.get(e.srcId);
    const t = placed.value.get(e.dstId);
    if (!s || !t) continue;
    const active = spotlight.value.has(e.srcId) && spotlight.value.has(e.dstId);
    const text = EDGE_TYPE_LABELS[e.type] ?? e.type;
    if (s.col === t.col) {
      // same-column: short arc bulging to the right of the column
      const x = s.cx + CARD_W;
      const y1 = s.centerY;
      const y2 = t.centerY;
      const bulge = x + 46;
      out.push({
        id: e.id,
        d: `M ${x} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x} ${y2}`,
        labelX: bulge,
        labelY: (y1 + y2) / 2,
        text,
        active,
      });
    } else {
      // cross-column: horizontal bezier from right edge to left edge
      const [a, b] = s.col < t.col ? [s, t] : [t, s];
      const x1 = a.cx + CARD_W;
      const y1 = a.centerY;
      const x2 = b.cx;
      const y2 = b.centerY;
      const mx = (x1 + x2) / 2;
      out.push({
        id: e.id,
        d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        labelX: mx,
        labelY: (y1 + y2) / 2 - 5,
        text,
        active,
      });
    }
  }
  return out;
});

function selectCard(id: string) {
  state.selectedId = id;
}
function anchorHere() {
  if (state.selectedId) anchorId.value = state.selectedId;
}
</script>

<template>
  <div class="thread-view relative h-full w-full overflow-auto">
    <!-- empty state -->
    <div
      v-if="!anchorId || cards.length === 0"
      class="absolute inset-0 grid place-items-center text-center text-ink-400"
    >
      <div>
        <div class="mb-2 text-3xl opacity-40">🧵</div>
        <p class="text-sm">Select a node to trace its thread.</p>
      </div>
    </div>

    <template v-else>
      <div class="pointer-events-none absolute left-5 top-4 z-10">
        <h1 class="display text-2xl">Thread</h1>
        <p v-if="thread.capped" class="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-amber-300/80">
          Showing the first 60 connected nodes
        </p>
      </div>

      <svg :width="svgWidth" :height="svgHeight" class="block select-none">
        <defs>
          <marker id="thread-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="rgba(190,195,215,0.55)" />
          </marker>
          <marker id="thread-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#78a9ff" />
          </marker>
        </defs>

        <!-- column headers -->
        <text
          v-for="h in columnHeaders"
          :key="h.part"
          :x="h.x"
          :y="52"
          text-anchor="middle"
          font-size="12"
          fill="#8b97b0"
          class="font-mono font-semibold uppercase"
          style="letter-spacing: 0.24em"
        >{{ h.label }}</text>

        <!-- edges -->
        <g fill="none" stroke-linecap="round">
          <path
            v-for="e in edgePaths"
            :key="e.id"
            :d="e.d"
            :stroke="e.active ? '#78a9ff' : 'rgba(190,195,215,0.24)'"
            :stroke-width="e.active ? 2.2 : 1.2"
            :marker-end="e.active ? 'url(#thread-arrow-active)' : 'url(#thread-arrow)'"
          />
        </g>
        <g class="pointer-events-none">
          <text
            v-for="e in edgePaths"
            v-show="e.active"
            :key="`lbl-${e.id}`"
            :x="e.labelX"
            :y="e.labelY"
            text-anchor="middle"
            font-size="8.5"
            fill="#78a9ff"
            class="font-mono font-semibold uppercase"
            :style="{ letterSpacing: '0.14em', paintOrder: 'stroke', stroke: 'rgba(10,10,12,0.92)', strokeWidth: '3.5px' }"
          >{{ e.text }}</text>
        </g>

        <!-- cards -->
        <g
          v-for="c in cards"
          :key="c.id"
          class="thread-card cursor-pointer"
          :data-node-id="c.id"
          :data-anchor="c.id === anchorId ? 'true' : 'false'"
          @click="selectCard(c.id)"
        >
          <rect
            :x="c.cx"
            :y="c.cy"
            :width="CARD_W"
            :height="CARD_H"
            rx="8"
            fill="rgba(16,18,27,0.92)"
            :stroke="c.hue"
            :stroke-width="c.id === state.selectedId ? 2.4 : 1.4"
            :opacity="spotlight.size && !spotlight.has(c.id) ? 0.45 : 1"
          />
          <circle v-if="c.id === anchorId" :cx="c.cx + 13" :cy="c.centerY" r="9" fill="none" :stroke="c.hue" stroke-width="2" />
          <text :x="c.cx + 13" :y="c.centerY + 5" text-anchor="middle" font-size="14">{{ c.icon }}</text>
          <text
            :x="c.cx + 30"
            :y="c.centerY + 4"
            font-size="12"
            fill="#cdd5e8"
            class="pointer-events-none font-medium"
          >{{ c.title.length > 20 ? c.title.slice(0, 19) + '…' : c.title }}</text>
        </g>
      </svg>

      <!-- re-anchor affordance -->
      <button
        v-if="state.selectedId && state.selectedId !== anchorId && placed.has(state.selectedId)"
        class="btn glass absolute bottom-5 right-5 z-10"
        @click="anchorHere"
      >⚓ Anchor here</button>
    </template>
  </div>
</template>
```

- [ ] **Step 2: Run the gate (component compiles + type-checks)**

Run: `cd web && npm run check && npm run build`
Expected: `astro check` reports 0 errors; the build succeeds. (The component is not yet rendered — behavioural coverage lands in Task 6.)

- [ ] **Step 3: Confirm nothing regressed**

Run: `cd web && npm run test && npm run e2e`
Expected: both green (this task adds an unmounted file only).

- [ ] **Step 4: Commit**

```bash
cd web && git add src/components/views/ThreadView.vue
git commit -m "feat: add deterministic ThreadView renderer"
```

---

## Task 5: `GraphView.vue` — tab strip, part tabs, ghost jump, tab persistence

**Files:**
- Modify: `web/src/components/views/GraphView.vue`

**Interfaces:**
- Consumes: `kindsForPart`, `PARTS`, `KIND_MAP`, `type Part` from schema; `type LayoutNamespace` from layout; `ThreadView` (Task 4); `ForceGraph` `ghostIds`/`namespace` props (Task 3).
- Produces: a tab strip (`role="tablist"` with five `role="tab"` buttons — `All`, `Foundations`, `Domain`, `Implementation`, `Thread`). Default active tab `all`. Part tabs render the part's nodes plus ghosts. Thread tab renders `<ThreadView>`. Active tab persists to `bropilot:ui:graphTab:v1`.

- [ ] **Step 1: Replace the `<script setup>` block**

Replace the entire `<script setup lang="ts"> … </script>` (lines 1–77) with:

```ts
<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { SPACES, KIND_MAP, kindsForPart, PARTS, ontologyGraph, ONTOLOGY, type Space, type Part } from '../../lib/schema';
import { state, nodesByKind } from '../../lib/store';
import type { LayoutNamespace } from '../../lib/layout';
import { graphMode, focusedKind } from '../../lib/graphMode';
import ForceGraph from '../graph/ForceGraph.vue';
import ThreadView from './ThreadView.vue';
import KindCard from '../graph/KindCard.vue';

const graphRef = ref<InstanceType<typeof ForceGraph> | null>(null);

// ── tabs ──
type GraphTab = 'all' | Part | 'thread';
const TAB_KEY = 'bropilot:ui:graphTab:v1';
const TABS: { id: GraphTab; label: string }[] = [
  { id: 'all', label: 'All' },
  ...PARTS.map((p) => ({ id: p.id as GraphTab, label: p.label })),
  { id: 'thread', label: 'Thread' },
];
const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

function readTab(): GraphTab {
  if (typeof localStorage === 'undefined') return 'all';
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v && TAB_IDS.has(v)) return v as GraphTab;
  } catch {
    /* ignore */
  }
  return 'all';
}
const activeTab = ref<GraphTab>(readTab());

function setTab(t: GraphTab) {
  if (activeTab.value === t) return;
  activeTab.value = t;
  if (t !== 'all') {
    graphMode.value = 'instance';
    focusedKind.value = null;
  }
}
watch(activeTab, (t) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TAB_KEY, t);
  } catch {
    /* ignore */
  }
});

const isPartTab = computed(() => activeTab.value !== 'all' && activeTab.value !== 'thread');
const isThread = computed(() => activeTab.value === 'thread');
const isForceTab = computed(() => !isThread.value);
const namespace = computed<LayoutNamespace>(() =>
  isPartTab.value ? (activeTab.value as LayoutNamespace) : 'all',
);

// ── space filters ──
const active = reactive<Record<Space, boolean>>({
  basics: true,
  problem: true,
  solution: true,
  crosscutting: true,
});
function toggle(sp: Space) {
  active[sp] = !active[sp];
}

// ── ontology (All tab only) ──
const isOntology = computed(() => activeTab.value === 'all' && graphMode.value === 'ontology');
const onto = ontologyGraph();
const DASH: Record<string, string> = { canonical: '', typical: '6 4', possible: '2 5' };
const ontoDash: Record<string, string> = Object.fromEntries(
  ONTOLOGY.map((t) => [`o-${t.src}-${t.type}-${t.dst}`, DASH[t.strength]]),
);
const ontoNodes = computed(() =>
  onto.nodes.map((n) => ({ ...n, title: `${n.title} · ${nodesByKind(n.kind).length}` })),
);

// ── part subsetting + ghosts ──
const nodeById = computed(() => new Map(state.graph.nodes.map((n) => [n.id, n])));
const partNodeIds = computed<Set<string>>(() => {
  if (!isPartTab.value) return new Set();
  const kinds = new Set(kindsForPart(activeTab.value as Part).map((k) => k.kind));
  return new Set(state.graph.nodes.filter((n) => kinds.has(n.kind)).map((n) => n.id));
});
// 1-hop cross-part neighbours of home nodes, known-kind only.
const ghostIds = computed<Set<string>>(() => {
  if (!isPartTab.value) return new Set();
  const home = partNodeIds.value;
  const ghosts = new Set<string>();
  const consider = (id: string) => {
    if (home.has(id)) return;
    const n = nodeById.value.get(id);
    if (n && KIND_MAP[n.kind]) ghosts.add(id);
  };
  for (const e of state.graph.edges) {
    if (home.has(e.srcId)) consider(e.dstId);
    if (home.has(e.dstId)) consider(e.srcId);
  }
  return ghosts;
});
const tabNodeIds = computed<Set<string>>(() => new Set([...partNodeIds.value, ...ghostIds.value]));

// ── base node/edge set for the active force tab ──
const baseNodes = computed(() => {
  if (isOntology.value) return ontoNodes.value;
  if (isPartTab.value) return state.graph.nodes.filter((n) => tabNodeIds.value.has(n.id));
  return state.graph.nodes;
});
const baseEdges = computed(() => {
  if (isOntology.value) return onto.edges;
  if (isPartTab.value)
    return state.graph.edges.filter((e) => tabNodeIds.value.has(e.srcId) && tabNodeIds.value.has(e.dstId));
  return state.graph.edges;
});

const visibleNodes = computed(() =>
  baseNodes.value.filter((n) => {
    const sp = KIND_MAP[n.kind]?.space;
    return sp ? active[sp] : true;
  }),
);
const visibleIds = computed(() => new Set(visibleNodes.value.map((n) => n.id)));
const visibleEdges = computed(() =>
  baseEdges.value.filter((e) => visibleIds.value.has(e.srcId) && visibleIds.value.has(e.dstId)),
);

// ── selection (ghost click = jump to home part tab) ──
function select(id: string | null) {
  if (isOntology.value) {
    focusedKind.value = id;
    return;
  }
  if (id && isPartTab.value && ghostIds.value.has(id)) {
    const part = KIND_MAP[nodeById.value.get(id)!.kind]?.part;
    if (part) setTab(part);
    state.selectedId = id;
    return;
  }
  state.selectedId = id;
}

function setMode(m: 'instance' | 'ontology') {
  graphMode.value = m;
  if (m === 'instance') focusedKind.value = null;
}
function jumpToInstance(id: string) {
  graphMode.value = 'instance';
  focusedKind.value = null;
  state.selectedId = id;
}

// re-frame when the mode (and thus the whole node set) swaps
watch(isOntology, () => setTimeout(() => graphRef.value?.fit(), 650));

// an instance selection (search palette, health card) landing while the
// graph is in ontology mode must escape back to instance mode.
watch(
  () => state.selectedId,
  (id) => {
    if (id && graphMode.value === 'ontology') {
      graphMode.value = 'instance';
      focusedKind.value = null;
    }
  },
);
</script>
```

- [ ] **Step 2: Replace the `<template>` block**

Replace the entire `<template> … </template>` (lines 79–133) with:

```html
<template>
  <div class="relative h-full w-full">
    <ForceGraph
      v-if="isForceTab"
      ref="graphRef"
      :key="activeTab"
      :nodes="visibleNodes"
      :edges="visibleEdges"
      :selected-id="isOntology ? focusedKind : state.selectedId"
      :dash="isOntology ? ontoDash : undefined"
      :persist="!isOntology"
      :ghost-ids="ghostIds"
      :namespace="namespace"
      @select="select"
    />
    <ThreadView v-else />

    <!-- top-left: title -->
    <div v-if="isForceTab" class="pointer-events-none absolute left-5 top-5">
      <h1 class="display text-3xl">Knowledge graph</h1>
      <p class="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-ink-400">
        {{ visibleNodes.length }} {{ isOntology ? 'kinds' : 'nodes' }} · {{ visibleEdges.length }} {{ isOntology ? 'relations' : 'edges' }} · drag to move · scroll to zoom
      </p>
    </div>

    <!-- top-center: tab strip -->
    <div class="absolute left-1/2 top-5 -translate-x-1/2">
      <div role="tablist" aria-label="Graph slices" class="flex border hairline bg-ink-900">
        <button
          v-for="t in TABS"
          :key="t.id"
          role="tab"
          :aria-selected="activeTab === t.id ? 'true' : 'false'"
          class="px-3 py-1.5 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] transition"
          :class="activeTab === t.id ? 'bg-white/[0.08] text-ink-100' : 'text-ink-400 hover:text-ink-200'"
          @click="setTab(t.id)"
        >{{ t.label }}</button>
      </div>
    </div>

    <!-- top-right: controls -->
    <div v-if="isForceTab" class="absolute right-5 top-5 flex gap-2">
      <button class="btn glass" @click="graphRef?.fit()" title="Fit to view">⤢ Fit</button>
      <button class="btn glass" @click="graphRef?.relayout()" title="Forget saved positions and re-run layout">↻ Relayout</button>
      <div v-if="activeTab === 'all'" class="flex border hairline">
        <button
          v-for="m in (['instance', 'ontology'] as const)"
          :key="m"
          class="px-3 py-1.5 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] transition"
          :class="graphMode === m ? 'bg-white/[0.08] text-ink-100' : 'text-ink-400 hover:text-ink-200'"
          @click="setMode(m)"
        >{{ m }}</button>
      </div>
    </div>

    <!-- bottom-left: legend / filters -->
    <div v-if="isForceTab" class="absolute bottom-5 left-5 flex flex-wrap gap-1.5 border hairline bg-ink-900 px-2.5 py-2">
      <button
        v-for="sp in Object.values(SPACES)"
        :key="sp.id"
        class="flex items-center gap-1.5 px-2 py-1 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] transition"
        :style="{
          color: active[sp.id] ? sp.hue : 'var(--color-ink-400)',
          background: active[sp.id] ? sp.glow : 'transparent',
        }"
        @click="toggle(sp.id)"
      >
        <span class="h-2 w-2" :style="{ background: active[sp.id] ? sp.hue : 'var(--color-ink-600)' }" />
        {{ sp.label }}
      </button>
    </div>

    <KindCard v-if="isOntology && focusedKind" :kind="focusedKind" @close="focusedKind = null" @jump="jumpToInstance" />
  </div>
</template>
```

- [ ] **Step 3: Run the full gate (existing behaviour preserved on the default All tab)**

Run: `cd web && npm run check && npm run test && npm run e2e`
Expected: `astro check` clean; Vitest green; Playwright green. The default active tab is `all`, so the existing 11 e2e tests (ontology toggle, KindCard jump, drag/relayout regression, etc.) still find the Instance|Ontology toggle, Fit, Relayout, and the full combined graph exactly where they were.

Note on the tab strip position: it is centered at `top-5` while Fit/Relayout sit at `right-5` and the title at `left-5`, so the three corners the e2e `assertPointHitsSvg` guard cares about are unchanged. If any existing settle-dependent test flakes because a node now fits under the centered tab strip, that is a real overlay collision — pick a different labelled node in that assertion, matching the pattern already used in the drag regression test (which deliberately avoids nodes that land under corner overlays).

- [ ] **Step 4: Commit**

```bash
cd web && git add src/components/views/GraphView.vue
git commit -m "feat: add graph slice tabs, part ghosts, and thread tab to GraphView"
```

---

## Task 6: e2e coverage for slices & thread

**Files:**
- Create: `web/e2e/slices.spec.ts`

**Interfaces:**
- Consumes: `web/e2e/helpers.ts` — `freshPage`, `waitForGraphSettle`, `clickSvgNode`, `clickInspectorTab`, `BASE_URL`.
- Produces: Playwright coverage for tab render/switch, part-tab subsetting, ghost jump, thread columns, re-anchor, and active-tab persistence across reload.

**Fixture facts (verified against `web/src/lib/sample.ts`):**
- Foundations node: `persona-architect` — label "System architect".
- Ghost in the Foundations tab: `module-store` (label "Graph store") — it is `implements`-linked from `capability-portable` (a foundations node), so it is a 1-hop cross-part neighbour. Its home part is `implementation`.
- NOT present in the Foundations tab: `module-schema` (label "Schema") — no edge connects it to any foundations node, so it is neither a home node nor a ghost.

- [ ] **Step 1: Write the failing e2e spec**

Create `web/e2e/slices.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { freshPage, waitForGraphSettle, clickSvgNode, clickInspectorTab, BASE_URL } from './helpers';

test.describe('slice tabs', () => {
  test('the tab strip renders all five tabs on the graph view', async ({ page }) => {
    await freshPage(page, '#/graph');
    for (const name of ['All', 'Foundations', 'Domain', 'Implementation', 'Thread']) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('the Foundations tab shows its own nodes plus ghosts, but not unrelated nodes', async ({ page }) => {
    await freshPage(page, '#/graph');
    await waitForGraphSettle(page);
    await page.getByRole('tab', { name: 'Foundations', exact: true }).click();
    await waitForGraphSettle(page);

    // a foundations node is present
    await expect(page.locator('svg g.cursor-pointer', { has: page.locator('text', { hasText: 'System architect' }) }).first()).toBeVisible();
    // a ghost (module-store) is present in the DOM (its label may be opacity-hidden until hover)
    await expect(page.locator('svg g.cursor-pointer', { has: page.locator('text', { hasText: 'Graph store' }) }).first()).toBeAttached();
    // module-schema ("Schema") is neither a foundations node nor a ghost → absent
    await expect(page.locator('svg g.cursor-pointer', { has: page.locator('text', { hasText: 'Schema' }) })).toHaveCount(0);
  });

  test('clicking a ghost jumps to its home part tab and selects it', async ({ page }) => {
    await freshPage(page, '#/graph');
    await waitForGraphSettle(page);
    await page.getByRole('tab', { name: 'Foundations', exact: true }).click();
    await waitForGraphSettle(page);

    await clickSvgNode(page, 'Graph store'); // ghost module-store

    // jumped to Implementation tab, node selected → hash reflects selection
    await expect(page.getByRole('tab', { name: 'Implementation', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/#\/graph\/module-store$/);
  });

  test('the active tab survives a reload', async ({ page }) => {
    // Fresh Playwright context ⇒ empty storage, so the app seeds the sample
    // graph on first load. We deliberately do NOT use freshPage here (its
    // addInitScript clears storage on every navigation, including reloads),
    // so the persisted tab pref survives page.reload().
    await page.goto(`${BASE_URL}/#/graph`);
    await page.getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await page.getByRole('tab', { name: 'Domain', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Domain', exact: true })).toHaveAttribute('aria-selected', 'true');

    await page.reload();
    await page.getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await expect(page.getByRole('tab', { name: 'Domain', exact: true })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('thread tab', () => {
  test('shows three columns and the anchor for a selected node', async ({ page }) => {
    await freshPage(page, '#/graph/screen-studio'); // selects screen-studio
    await page.getByRole('tab', { name: 'Thread', exact: true }).click();

    const view = page.locator('.thread-view');
    await expect(view.getByText('Foundations', { exact: true })).toBeVisible();
    await expect(view.getByText('Domain', { exact: true })).toBeVisible();
    await expect(view.getByText('Implementation', { exact: true })).toBeVisible();

    const anchor = view.locator('g.thread-card[data-anchor="true"]');
    await expect(anchor).toHaveCount(1);
    await expect(anchor).toHaveAttribute('data-node-id', 'screen-studio');
  });

  test('re-anchoring re-roots the thread on the newly selected card', async ({ page }) => {
    await freshPage(page, '#/graph/screen-studio');
    await page.getByRole('tab', { name: 'Thread', exact: true }).click();

    const view = page.locator('.thread-view');
    // select a different card (component-force-graph, implementation column)
    await view.locator('g.thread-card[data-node-id="component-force-graph"]').click();
    // selecting alone does not move the anchor
    await expect(view.locator('g.thread-card[data-anchor="true"]')).toHaveAttribute('data-node-id', 'screen-studio');

    await page.getByRole('button', { name: '⚓ Anchor here' }).click();
    await expect(view.locator('g.thread-card[data-anchor="true"]')).toHaveAttribute('data-node-id', 'component-force-graph');
  });

  test('shows the empty state when nothing is selected', async ({ page }) => {
    await freshPage(page, '#/graph'); // no node selected
    await page.getByRole('tab', { name: 'Thread', exact: true }).click();
    await expect(page.getByText('Select a node to trace its thread.')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the new spec to verify it drives the feature**

Run: `cd web && npm run e2e -- slices`
Expected: PASS — all 7 new tests green. If the ghost-presence assertion fails with a not-found `text`, confirm Task 3 renders the ghost `<text>` element in the DOM (via `v-if="d.showLabel"`, ghost labels are hidden by `showLabel=false` until hover/selection — the assertion uses `toBeAttached()` on the enclosing `<g>` located by its circle sibling, not by the label's visibility). Because `svgNodeCircle`/`clickSvgNode` locate the group via a child `text` with matching `hasText`, ghost labels must remain in the DOM; if a ghost's `<text>` is removed rather than hidden, `clickSvgNode('Graph store')` cannot find it. Resolution if needed: in ForceGraph keep the ghost `<text>` mounted and drive visibility with opacity instead of `v-if` — but the Task 3 template already keeps non-ghost labels mounted and only ghosts use `showLabel`; the ghost group is still located by its `<circle>`, and the label text node exists whenever `showLabel` is true. For robustness this spec locates ghosts by the group containing the label text and asserts attachment, and `clickSvgNode` triggers selection which flips `showLabel` true. This works because the click helper targets the circle, and the group is found by `has: text` — which requires the text node to exist. To guarantee it, see Step 3.

- [ ] **Step 3: Ensure ghost labels stay locatable (adjust ForceGraph if the ghost-click test fails)**

Only if `clickSvgNode(page, 'Graph store')` fails to find the node: in `web/src/components/graph/ForceGraph.vue`, render the ghost label text always (kept in DOM) and hide it with opacity rather than `v-if`. Replace the label `<text>` inside the node `<g>` (from Task 3, Step 4) with:

```html
            <text
              :y="d.r + 13"
              text-anchor="middle"
              class="pointer-events-none font-medium"
              :font-size="11"
              :fill="d.dim ? 'rgba(139,151,176,0.6)' : '#cdd5e8'"
              :opacity="d.showLabel ? 1 : 0"
              :style="{ paintOrder: 'stroke', stroke: 'rgba(7,8,13,0.85)', strokeWidth: '3px' }"
            >{{ d.title.length > 22 ? d.title.slice(0, 21) + '…' : d.title }}</text>
```

This keeps every label node mounted (so `has: text` locators and `waitForGraphSettle`'s circle-counting are stable) while ghosts stay visually label-free (opacity 0) until hovered or selected, satisfying the spec. Re-run `cd web && npm run e2e -- slices`.

- [ ] **Step 4: Run the full gate**

Run: `cd web && npm run check && npm run test && npm run e2e`
Expected: all green — `astro check` clean, full Vitest suite, and the complete Playwright suite (existing 11 + new 7).

- [ ] **Step 5: Commit**

```bash
cd web && git add e2e/slices.spec.ts src/components/graph/ForceGraph.vue
git commit -m "test: e2e coverage for graph slices and thread view"
```

---

## Self-Review

**1. Spec coverage.**

| Spec requirement | Task |
| --- | --- |
| Tab strip All / Foundations / Domain / Implementation / Thread | Task 5 |
| All = today's combined graph, unchanged; toggle/Fit/Relayout here | Task 5 (default tab, preserved controls) |
| Part tabs = part's nodes via `kindsForPart` + ghosts; Fit/Relayout | Task 5 |
| Ontology toggle exclusive to All | Task 5 (`v-if="activeTab === 'all'"`) |
| Active tab persists to a UI-prefs key, not graph key, not hash | Task 5 (`bropilot:ui:graphTab:v1`) |
| Selecting a node never changes active tab (except ghost jump) | Task 5 (`select` only sets `state.selectedId`; jump is the sole exception) |
| Drag/pan/zoom/select/click-empty preserved on all force tabs | Task 3 (props defaulted, interactions untouched) + Task 5 |
| Ghost = 1-hop cross-part neighbours, smaller, ~0.35 opacity, label on hover/sel, dashed dimmed edges | Task 3 (rendering) + Task 5 (computation) |
| Ghost click jumps to home tab + selects | Task 5 (`select`) |
| Ghosts excluded from lint/health, not editable from tab (jump instead) | Task 5 — ghosts are display-only in the part tab; clicking jumps rather than inspecting in place; lint/health read `state.graph` (unchanged) |
| Unknown-kind nodes only in All tab | Task 5 (`ghostIds` requires `KIND_MAP`; part home set is kind-filtered) + Task 1 (thread skips unknown) |
| Thread anchored on `state.selectedId`; empty state | Task 4 |
| `threadFor(graph, anchorId): Thread` pure, unit-testable | Task 1 |
| BFS both directions, unlimited depth, cap 60, cap noted in UI | Task 1 (`capped`) + Task 4 (notice) |
| Three fixed columns by `KIND_MAP[kind].part`; unknown skipped | Task 1 |
| Barycenter row order, iterated twice, ties by title, deterministic | Task 1 |
| Thread render: 3 labelled columns, cards (icon+title, hue border), bezier edges w/ edge-type styling/arrowheads, same-column arcs, distinct anchor | Task 4 |
| Click card selects (re-render spotlight, same anchor); "⚓ Anchor here" re-roots; no drag | Task 4 |
| No layout persistence for Thread | Task 4 (derived only) |
| Layout namespaced per force tab; legacy migrates to `all`; pruning per namespace; ghost positions persist in part namespace | Task 2 (namespacing/migration/pruning) + Task 3 (namespace prop) |
| Client-only, no new deps | Global Constraints; no `package.json` change in any task |
| `ForceGraph` reused, not forked | Task 3 (props only) |
| Existing unit/sim/e2e stay green; `check` clean | Every task's final gate |
| Unit tests: closure incl. direction-agnostic, cap, bucketing, ordering, unknown skip, anchor-not-in-graph | Task 1 |
| e2e: tab render/switch, part+ghost, ghost jump, thread columns, re-anchor, reload restores tab | Task 6 |

No gaps found.

**2. Placeholder scan.** No `TBD`/`TODO`/"add error handling"/"similar to Task N"/"write tests for the above" remain. Every code step contains complete code; every test step contains full assertions; every command has an expected outcome.

**3. Type consistency.** `LayoutNamespace` is defined in Task 2 and consumed identically in Tasks 3 and 5. `getPos(id, namespace?)`, `setPositions(entries, namespace?)`, `clearLayout(namespace?)` signatures match between definition (Task 2) and call sites (Task 3). `Thread`/`ThreadNode`/`ThreadColumn` and `threadFor` are defined in Task 1 and consumed with matching shapes in Task 4. `ghostIds: Set<string>` and `namespace: LayoutNamespace` prop names match between Task 3 (`defineProps`) and Task 5 (`:ghost-ids`, `:namespace`). `GraphTab` (`'all' | Part | 'thread'`) is internally consistent in Task 5. `data-node-id` / `data-anchor` attributes emitted in Task 4 match the selectors used in Task 6.

## Spec ambiguities resolved

1. **Does BFS traverse *through* unknown-kind nodes?** The spec says the closure is "BFS over all edges" and separately that "unknown-kind nodes are skipped" from columns. Resolution: BFS traverses the whole reachable graph regardless of kind (so a known node reachable only *through* an unknown node is still found), but unknown-kind nodes are omitted from the rendered columns and from the thread's `edges`. Task 1's unknown-kind test asserts exactly this.

2. **Anchor vs. selection in Thread.** The spec says the thread is "anchored on `state.selectedId`" yet also that clicking a card "keeps the same anchor" and only "⚓ Anchor here" re-roots. Resolution: `ThreadView` holds its own `anchorId`, seeded from `state.selectedId` on first selection; card clicks move only `state.selectedId` (spotlight), and "Anchor here" copies the current selection into `anchorId`. Empty state shows while `anchorId` is null.

3. **Cap semantics (60 including anchor?).** Resolution: the cap counts all closure nodes including the anchor — BFS stops adding once the visited set reaches 60. Task 1's cap test asserts total rendered nodes equal 60 with `capped === true` for an over-cap star graph (all known-kind).

4. **Space-filter legend on part tabs.** The spec doesn't say whether the bottom-left space filter applies to part tabs. Resolution: keep it active on every force tab (All + parts), consistent with existing behaviour — the space filter composes on top of the part subset and ghost set. The Ontology toggle, explicitly All-only, is hidden elsewhere.

5. **Ghost-label DOM presence vs. visibility.** "Label only on hover/selection" could mean the text node is removed. Resolution: keep ghost label nodes mounted and control visibility with opacity (Task 6, Step 3 fallback), because the e2e helpers locate nodes via a child `<text>` and count circles per settle — removing label nodes would break `clickSvgNode`/`waitForGraphSettle`. Visually identical, testable.

6. **Tab identity in the hash.** Explicitly out of scope per the spec ("Hash-routing the active tab" deferred). Resolution: tabs live only in `activeTab` + the UI-prefs key; the hash continues to carry only `#/graph` / `#/graph/{nodeId}`, so selection (including the ghost jump) still round-trips through the existing Studio hash sync.
