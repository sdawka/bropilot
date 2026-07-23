# Rich Sample Graph & Densification Tooling — Design

**Goal:** Make the graph worthy of what the app claims: a dense, dogfooded sample graph (Bropilot modelling itself, extracted from this actual repo) plus in-app tooling that helps any graph get richer.

**Branch:** `feat/rich-graph` (off `dev`). Ships as its own PR into `dev`. Runs in parallel with `feat/graph-slices` — file overlap is limited to `Inspector.vue` (Suggestions section) and `OverviewView.vue`; neither is touched by the slices team.

## Part 1 — Dogfooded SAMPLE_GRAPH

Replace the 27-node demo with a graph extracted from this repository itself (source material: `web/src/lib/*.ts`, components, the three skills, CI workflow, tests/simulator, README, specs).

**Targets (acceptance thresholds, not aspirations):**

- ≥ 110 nodes, ≥ 220 edges.
- Every one of the 28 kinds has ≥ 1 instance; core kinds (capability, usecase, requirement, term, entity, behaviour, module, api, tests) have ≥ 4 each.
- Complete why-chains: every `capability`/`usecase` reachable from a `goal` via intentional edges, and every `module` connected (directly or transitively) to something it `implements`/`satisfies`.
- Every `module` and `api` has an incoming `verifies` from a `tests` node where a real test file exists (name real files, e.g. `tests/unit/thread.test.ts` need not exist — use only files that do).
- Lint: **0 orphans**, 0 why-chain gaps, ≤ 3 unverified-surface findings.
- Edge types: all 17 used at least once; `references` used sparingly (< 5% of edges).
- Descriptions: 1–2 sentences each, written to read well in the Narrative view (they are the " — description" clause of a generated sentence). No placeholder text.
- Ids follow `{kind}-{kebab-title}`; kind-specific fields go in `node.props` per each kind's `fields` in `schema.ts`.

**Storage:** move the data to `src/lib/sample-data.json` (canonical `{ nodes, edges }` Bropilot JSON — the same shape `importGraph` accepts); `sample.ts` becomes a thin typed wrapper exporting `SAMPLE_GRAPH`. A unit test imports the JSON through `importGraph`'s validation path so a malformed sample fails CI.

**Process note:** content is produced by extraction agents reading the repo, then a curation pass for narrative quality and title consistency. The graph is data, not code — reviewers check thresholds via the unit test plus spot-reads, not line-by-line.

## Part 2 — Densification tooling (`lib/suggest.ts` + UI)

**`lib/suggest.ts`** (pure, unit-testable):

```ts
interface Suggestion {
  nodeId: string;
  dir: 'out' | 'in';
  type: EdgeType;              // e.g. 'verifies'
  otherKind: string;           // the kind the ontology expects on the other end
  strength: 'canonical' | 'typical';   // 'possible' rows are never suggested
  candidates: string[];        // existing node ids of otherKind, ranked, max 5
  reason: string;              // human sentence, e.g. "Modules are typically verified by tests"
}
suggestFor(graph, nodeId): Suggestion[]   // ranked canonical→typical, existing edges excluded, max 8
suggestStats(graph): { nodes: number; total: number; topNodeId: string | null }
```

Ranking of candidates: nodes already connected to the subject's neighbours first (closing triangles), then alphabetical by title. A suggestion with zero candidates is still returned (the kind exists in the ontology but not the graph) with an empty list — the UI renders it as "add a …" guidance.

**UI:**

- Inspector → Details tab gains a **Suggestions** section (below Relationships): each suggestion is one row — reason text + up to 3 candidate-target buttons. Clicking a candidate adds the edge immediately (undoable, toast). Zero-candidate suggestions render as muted guidance text. Advisory only; dismissible per node per session (a "hide" affordance, not persisted).
- Overview health card gains one row: "⚡ N suggested connections across M nodes"; clicking selects `topNodeId` and navigates to its part (same `emit('navigate')` pattern the health card already uses).

## Constraints

- No schema/ONTOLOGY changes (no `sync-skills` run needed). No new dependencies.
- Advisory only — nothing validated or blocked.
- All existing tests stay green; sim tests must not depend on sample content (verify — they seed their own ops).
- `hydrate()` seeding, import/export, and localStorage behaviour unchanged; users with an existing saved graph are untouched (sample only seeds empty storage).

## Testing

- Unit: sample-data passes `importGraph` validation + all thresholds above (counts, kind coverage, lint numbers) as assertions; `suggestFor` (excludes existing edges, strength ranking, triangle-closing candidate order, max caps, zero-candidate case); `suggestStats`.
- e2e: open a node with a known missing typical edge → Suggestions section shows it → click candidate → edge appears in Relationships and the toast fires; Overview shows the suggestions row and navigates on click.

## Out of scope

- Auto-applying suggestions in bulk; persisting dismissals; suggestion generation for `possible`-strength triples; any LLM involvement (that's the Workshop feature).
