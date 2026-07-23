# Graph Slices & Thread View — Design

**Goal:** Replace the single spread-out force graph experience with sliced, structured views: per-part 2D graphs behind tabs, plus an orthogonal "thread" view that follows any node end-to-end across the three parts.

**Branch:** `feat/graph-slices` (off `dev`). Ships as its own PR into `dev`.

## Problem

The instance graph renders all nodes in one force layout. As the graph grows it spreads out, shows no structure, and is hard to reason about. The three-part structure (Foundations → Domain → Implementation) that organises everything else in the app is invisible in the graph.

## Design

### Slice tabs

The Graph view gets a tab strip: **All | Foundations | Domain | Implementation | Thread**.

- **All** — today's combined force graph, unchanged. The existing Instance|Ontology toggle, Fit, and Relayout live here and only here (part tabs get Fit/Relayout too, but the Ontology toggle is exclusive to All).
- **Part tabs** — a force graph of only that part's nodes (via `kindsForPart`), plus **ghost nodes** (below).
- **Thread** — deterministic layered layout of the selected node's cross-part closure (below).
- Active tab persists to localStorage (a UI-prefs key, not the graph key, not the hash). Selecting a node never changes the active tab by itself.
- Existing behaviour preserved on all force tabs: drag, pan, zoom, select-to-spotlight, click-empty-to-deselect.

### Ghost nodes (cross-layer context in a part tab)

A part tab's graph = that part's nodes + the **1-hop neighbours from other parts**, rendered as ghosts:

- Ghost rendering: smaller radius, reduced opacity (~0.35), no label crowding — label only on hover/selection. Edges touching a ghost are dashed and dimmed.
- Clicking a ghost **jumps**: switches to the ghost's home part tab and selects it (spotlighted there). This is the only way a part tab changes tabs.
- Ghosts are excluded from lint/health counts and are not editable from that tab (selection jump happens instead of in-place inspection).
- Nodes of unknown kinds (not in `KIND_MAP`) appear only in the All tab.

### Thread view

- Anchored on `state.selectedId`. Empty state ("Select a node to trace its thread") when nothing is selected.
- `lib/thread.ts` (pure, unit-testable):
  - `threadFor(graph, anchorId): Thread` where `Thread = { columns: { part: Part; nodes: ThreadNode[] }[]; edges: GraphEdge[] }`.
  - Closure = BFS from the anchor over **all** edges, traversed in both directions, unlimited depth, capped at 60 nodes (breadth-first order, cap noted in the UI when hit).
  - Nodes bucketed into three fixed columns by `KIND_MAP[kind].part`; unknown-kind nodes are skipped.
  - Row order within a column: barycenter ordering (average index of neighbours in adjacent columns), iterated twice; ties broken by title. Deterministic — same graph in, same layout out.
- Rendering: three labelled columns left→right (Foundations, Domain, Implementation), nodes as compact cards (icon + title, hue-coloured border), SVG bezier edges between them with the existing edge-type styling/arrowheads. Same-column edges render as short arcs alongside the column. The anchor is visually distinct (accent ring).
- Interactions: click a card → selects it (Inspector updates, thread re-renders spotlighting it but keeps the same anchor). An explicit **"⚓ Anchor here"** affordance on the selected card re-roots the thread. No drag; layout is deterministic.
- No layout persistence for Thread (it's derived).

### Layout persistence

`lib/layout.ts` gains a namespace per force tab (`all` | `foundations` | `domain` | `implementation`); position maps are stored and pruned per namespace. The existing storage key's un-namespaced data migrates to `all` on first read. Ghost node positions persist in the part tab's namespace like any other node.

## Constraints

- Client-only; no new dependencies (no d3-zoom/d3-drag/ELK/dagre — thread layout is hand-rolled and deterministic).
- Nothing validated or blocked; all views advisory/exploratory.
- `ForceGraph.vue` is reused for all force tabs — extend via props (e.g. `ghostIds`, namespace for persistence), don't fork it.
- All existing unit/sim/e2e tests stay green; `npm run check` clean.

## Testing

- Unit (`tests/unit/thread.test.ts`): closure correctness (incl. direction-agnostic traversal), 60-node cap, column bucketing, deterministic ordering, unknown-kind skipping, anchor-not-in-graph → empty thread.
- e2e additions: tab strip renders and switches; part tab shows only its part + ghosts; clicking a ghost jumps tab and selects; Thread tab shows columns for a selected node; re-anchor works; reload restores the active tab. Reuse `web/e2e/helpers.ts` (real mouse events, click circles not labels).

## Out of scope

- Combined 2.5D/isometric view (explicitly deferred — "tabs only" decision).
- Hash-routing the active tab; edge editing from the thread view; export of thread as image.
