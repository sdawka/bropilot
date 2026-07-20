# Meta-ontology for Bropilot Studio

**Date:** 2026-07-19 · **Status:** approved design

## Problem

The Studio's schema defines node kinds and 17 edge types, but nothing encodes *which kinds relate to which kinds* — the arrows in the bro.png ontology diagram. Suggestions are a flat per-kind list (`SUGGESTED_EDGE_TYPES`), the diagram exists only as an image, nothing can flag off-ontology edges, and the extract/generate skills don't know the expected shape of a graph.

## Solution overview

One new data structure — an `ONTOLOGY` array of kind→kind triples in `web/src/lib/schema.ts` — with five consumers:

1. **RelationshipEditor** — ranked suggestion chips, derived type ordering, target re-ranking.
2. **Ontology view** — the triples projected into a `Graph` and rendered by the existing `ForceGraph.vue` behind an `Instance | Ontology` toggle in GraphView.
3. **Advisory linting** — `web/src/lib/lint.ts` flags off-ontology edges, orphans, why-chain gaps, unverified surfaces. Never blocks (standing rule: nothing is ever validated or blocked).
4. **Skills round-trip** — a generated ontology block synced into both SKILL.md files via `npm run sync-skills`.
5. **New `bropilot-interview` skill** — conversational collection of an instance graph, using the ontology to drive gap-based questioning.
6. **Query layer** (§7) — a T-Box-validated JSON graph-pattern engine with named verbs, powering an Inspector "Copy context" export and any future MCP surface.

## 1 · Data model (`schema.ts`)

```ts
export type TripleStrength = 'canonical' | 'typical' | 'possible';

export interface OntologyTriple {
  src: string;   // source kind
  type: string;  // edge type from EDGE_TYPES
  dst: string;   // destination kind
  strength: TripleStrength;
  note?: string; // rationale — tooltip in the ontology view
}

export const ONTOLOGY: OntologyTriple[] = [ /* table below */ ];
```

Derived exports (all pure, all in `schema.ts`):

- `SUGGESTED_EDGE_TYPES` — **becomes computed** from `ONTOLOGY` (same name/shape as today: per-kind edge types ordered canonical → typical → possible, deduped). The hand-maintained table is deleted.
- `triplesFrom(kind)` / `tripleFor(srcKind, type, dstKind)` — lookups for the editor and linter.
- `ontologyGraph(): Graph` — kinds → nodes (`id = kind`, `kind = kind`, `title = label`, `description = blurb`), triples → edges (`id = "o-{src}-{type}-{dst}"`, `label` unset). Because projected nodes carry real kinds, `nodeSpace`/`nodeHue`/legend filters work unchanged.

### The triple table

Strengths: **canonical** = a bro.png arrow or a pair named in an edge-type hint; **typical** = clearly sensible and expected; **possible** = plausible but rare. Sources: bro.png arrows, edge-type hints, the old `SUGGESTED_EDGE_TYPES`, and edge patterns in `SAMPLE_GRAPH`.

| src | type | dst | strength |
|---|---|---|---|
| name | has | purpose | canonical |
| name | has | capability | canonical |
| purpose | motivates | goal | canonical |
| purpose | serves | persona | canonical |
| purpose | motivates | capability | typical |
| purpose | depends_on | hypothesis | typical |
| goal | motivates | usecase | typical |
| goal | motivates | capability | typical |
| hypothesis | motivates | goal | typical |
| hypothesis | motivates | capability | typical |
| persona | motivates | usecase | canonical |
| persona | triggers | usecase | typical |
| persona | triggers | flow | typical |
| persona | uses | capability | typical |
| capability | serves | persona | canonical |
| capability | satisfies | requirement | canonical |
| capability | satisfies | usecase | typical |
| capability | depends_on | constraint | possible |
| usecase | uses | screen | typical |
| usecase | uses | capability | typical |
| requirement | constrains | module | typical |
| requirement | constrains | design | typical |
| constraint | constrains | module | canonical |
| constraint | constrains | api | typical |
| constraint | constrains | component | possible |
| assumption | constrains | design | possible |
| assumption | constrains | module | possible |
| term | describes | entity | canonical |
| term | describes | behaviour | typical |
| term | describes | event | possible |
| term | extends | term | possible |
| entity | has | relationship | typical |
| entity | extends | entity | typical |
| relationship | references | entity | canonical |
| behaviour | emits | event | canonical |
| behaviour | uses | state | typical |
| event | triggers | behaviour | canonical |
| event | triggers | flow | typical |
| state | references | entity | typical |
| flow | satisfies | usecase | canonical |
| flow | uses | screen | canonical |
| flow | uses | capability | typical |
| flow | triggers | event | typical |
| screen | contains | component | canonical |
| screen | serves | persona | typical |
| screen | uses | state | typical |
| screen | uses | api | typical |
| screen | uses | design | typical |
| design | describes | screen | canonical |
| design | describes | component | typical |
| design | constrains | component | typical |
| module | contains | component | canonical |
| module | contains | module | typical |
| module | contains | logic | typical |
| module | exposes | api | canonical |
| module | exposes | interface | typical |
| module | implements | capability | canonical |
| module | implements | behaviour | canonical |
| module | satisfies | requirement | canonical |
| module | depends_on | module | canonical |
| module | uses | external | canonical |
| component | implements | screen | canonical |
| component | implements | capability | typical |
| component | implements | design | typical |
| component | emits | event | canonical |
| component | uses | api | typical |
| component | uses | entity | typical |
| component | uses | state | typical |
| component | uses | external | typical |
| logic | implements | behaviour | canonical |
| logic | uses | entity | typical |
| api | implements | interface | canonical |
| api | satisfies | requirement | typical |
| api | emits | event | canonical |
| api | uses | module | typical |
| interface | extends | interface | canonical |
| interface | references | entity | typical |
| repository | contains | module | canonical |
| external | triggers | event | typical |
| tests | verifies | module | canonical |
| tests | verifies | api | canonical |
| tests | verifies | behaviour | canonical |
| tests | verifies | hypothesis | canonical |
| tests | verifies | component | typical |
| tests | verifies | flow | typical |
| observability | monitors | goal | canonical |
| observability | monitors | api | typical |
| observability | monitors | module | typical |

The table is authoritative for implementation; adjustments during implementation (a strength up/down, an added `possible` row) are fine, structural changes are not.

## 2 · RelationshipEditor (`components/form/RelationshipEditor.vue`)

Additive changes only:

- **Suggestion chips**: above "Add relationship", compute `triplesFrom(node.kind)` × existing nodes of each `dst` kind, minus already-linked `(type, target)` pairs and self, ranked by strength then title, capped at 6. Chip reads *"motivates → 🎬 Onboard onto a system"*; click = `addEdge`.
- **Type ordering**: unchanged code — it already reads `SUGGESTED_EDGE_TYPES`, now derived.
- **Target re-ranking**: with a type selected, results whose kind forms a triple `(node.kind, type, candidate.kind)` sort first and get a muted "· fits ontology" suffix. No hiding, no blocking.

## 3 · Ontology view (`components/views/GraphView.vue`)

- A segmented `Instance | Ontology` toggle in GraphView's toolbar; state is a local ref (not routed, not persisted).
- Ontology mode passes `ontologyGraph()` to `ForceGraph` instead of the store graph.
- Edge stroke by strength: canonical solid, typical dashed, possible dotted. Hover shows `type` + `note`.
- Clicking a kind node opens a lightweight overlay card (icon, label, blurb, in/out triples as sentences). The Inspector is not used — it binds to store nodes. Selection state for the overlay is local to GraphView.
- Read-only: the ontology is edited in code.

### Cross-layer links (T-Box ↔ A-Box)

The `kind` field on instance nodes is the type link (≈ `rdf:type`); the UI surfaces it in both directions:

- **Ontology → instances**: in ontology mode each kind node shows its instance count as a badge (0 allowed); the overlay card lists that kind's instances, and clicking one switches to instance mode with that node selected (existing hash routing).
- **Instance → ontology**: the Inspector's kind chip becomes a link that opens the graph view in ontology mode with that kind's overlay card open.

Plumbing: the toggle + focused-kind state moves to a tiny exported ref pair in `lib/store.ts` (or a dedicated `lib/graphMode.ts`) so the Inspector can set it before navigating; GraphView reads it on mount. Still not routed/persisted.

Verification note (from CLAUDE.md): a passing build doesn't prove rendering — verify the toggle, strokes, and overlay in a browser via headless Chrome CDP with real `Input.dispatchMouseEvent`.

## 4 · Advisory linting (`lib/lint.ts`)

```ts
export interface Finding {
  severity: 'note' | 'hint';
  nodeId?: string;
  edgeId?: string;
  message: string;
  suggestion?: string;
}
export function lintGraph(graph: Graph): Finding[];
```

Checks (v1):

| Check | Trigger | Suggestion |
|---|---|---|
| Off-ontology edge | `(srcKind, type, dstKind)` has no triple | Edge types that *do* have a triple for that kind pair, if any |
| Orphan node | node with no edges | — |
| Why-chain gap | `capability`/`usecase`/`goal` with no incoming `motivates`/`serves` | "Nothing says why this exists" |
| Unverified surface | `module`/`api`/`behaviour` with no incoming `verifies` | "No test evidence" |

Unknown kinds (imported graphs may contain them) are skipped, never flagged. Surfacing: a "Graph health" card on OverviewView (count + findings list; clicking a finding navigates via existing hash routing) and a small badge in the Inspector header when the selected node has findings. No dismissal persistence in v1. `lintGraph` is pure and must never throw on malformed-but-imported graphs.

## 5 · Skills sync

- All three skills — `bropilot-extract`, `bropilot-generate`, and the new `bropilot-interview` (§6) — get a block in their `SKILL.md` delimited by `<!-- ontology:begin -->` / `<!-- ontology:end -->` containing: the 17 edge types grouped by category with stock types marked, and the triple table filtered to canonical + typical.
- `web/scripts/sync-skills.mjs` (run via `tsx`, new devDependency; `npm run sync-skills`) imports `ONTOLOGY`, `EDGE_TYPES`, `KINDS` from `schema.ts`, renders markdown, and rewrites the marked blocks in place. Fails with a nonzero exit if a marker pair is missing. Running twice is a no-op (idempotent).
- Skill instruction changes: extract prefers ontology-matching edges (`references` remains the explicit fallback); generate walks intentional → domain → implementation order when scaffolding.
- Stock-8 round-trip compatibility is unchanged.

## 6 · `bropilot-interview` skill

New `.claude/skills/bropilot-interview/SKILL.md`. Behaviour:

- **Scope**: edits the instance graph only — never the ontology or schema.
- **Opening**: bro.png Act-1 questions, one at a time: what do you wanna make; who is it for and why are they using it; what does them using it look like; why do you think doing it this way works; what can we simplify / double down on; what needs to be true for the magic to happen.
- **File**: maintains a graph JSON (default `./bropilot-graph.json`, overridable; resumes from an existing file/Studio export if present). Writes after every few answers, not only at the end.
- **Mapping answers → graph**: node IDs `{kind}-{kebab-title}`; kind props per the existing props table; edges chosen from the synced ontology block, canonical first.
- **Gap-driven follow-ups**: after the opening, ask whichever question fills the largest ontology gap — unmotivated capabilities, personas without use cases, flows without screens, untested modules (the linter's checks, run conversationally).
- **Provenance**: every node created from an answer gets `sourceRefs: [{ turnId, excerpt }]` quoting the user's words. (`SourceRef` exists in the schema and currently has no producer.)
- **Exit**: writes the file, summarises node/edge counts, points at Studio import and `/bropilot-generate`.
- Contains the same synced ontology block (add its markers; `sync-skills` targets all three skills).

## 7 · Query layer (`lib/query.ts`)

A schema-constrained graph query engine — SPARQL's basic-graph-pattern kernel, JSON-encoded, validated against the T-Box before execution. Chosen for expressiveness and LLM reliability, not speed (at this scale everything is instant).

### Query shape

```ts
interface NodeRef { var?: string; id?: string; kind?: string }   // at least one
interface QueryPattern {
  s: NodeRef;
  p: string;        // edge type; '^' prefix = inverse, '+' suffix = transitive (e.g. '^motivates+')
  o: NodeRef;
  not?: boolean;    // anti-pattern: bindings survive only if NO match exists
}
interface GraphQuery { match: QueryPattern[]; select: string[]; limit?: number }

function validateQuery(q: GraphQuery): QueryError[];
function runQuery(graph: Graph, q: GraphQuery): Record<string, GraphNode>[];
```

- **Validation before execution** (`validateQuery`): unknown kind or edge type → error listing valid names; a pattern whose `(srcKind, type, dstKind)` has no `ONTOLOGY` triple → *warning* with nearest ontology-licensed alternatives (advisory rule holds even for queries). This reuses `tripleFor`/`triplesFrom`.
- **Evaluation**: nested-loop join over patterns in order; `not` patterns as anti-joins after positive bindings; transitive `+` via BFS with a visited set. No optimizer — wrong tool at hundreds of nodes.
- **No text syntax**: JSON only. No parser to write, and structured output can force well-formedness.

### Named verbs = canned queries

`whyChain(id)`, `realization(id)`, `evidence(id)` are exported functions defined as `GraphQuery` values run through the evaluator (dogfooding). `neighborhood(id, { depth, edgeTypes })` is a direct BFS — depth-bounded neighborhoods aren't expressible as a single BGP, and pretending otherwise would contort the language.

### Consumers (v1)

- **Inspector "Copy context" button**: copies a markdown rendering of `neighborhood(selectedId, { depth: 2 })` — a token-budgeted context slice for pasting into any LLM chat.
- The **interview skill** documents patch-style editing (add/update ops against the JSON file, never whole-file regeneration) and uses the ontology block for its gap logic; it does not call `query.ts` (skills run outside the app).
- Future MCP server (out of scope) would expose `runQuery` + verbs directly; the API contract is engine-agnostic by design.

Explicitly rejected: Rust/WASM engine (JS↔WASM serialization overhead exceeds any gain at this scale; second type system to sync), full SPARQL (grammar surface exists for open-world web data; a closed validated schema doesn't need it), replacing verbs with the language (verbs are the cheap, reliable 90% path).

## Docs

CLAUDE.md architecture section: one added sentence — `ONTOLOGY` in `schema.ts` drives editor suggestions, the ontology view, lint, and the skills' ontology blocks; run `npm run sync-skills` after editing it.

## Error handling

- `lintGraph` and all ontology helpers are pure; unknown kinds/types are ignored, never thrown on.
- `sync-skills` exits nonzero on missing markers or unreadable files; it never partially writes (render fully, then write).
- Import behaviour is unchanged — off-ontology graphs import fine and simply produce lint notes.

## Testing / verification

No test suite exists (standing decision); gates are:

- `npm run check` passes.
- Browser verification (dev server + headless Chrome CDP): editor chips add correct edges; ontology toggle renders ~28 kinds with strength-coded strokes; health card findings navigate correctly; cross-layer links round-trip (kind chip → ontology overlay → instance → back).
- `npm run sync-skills` run twice → second run makes no changes (`git diff --exit-code` on the skill files).
- Query layer: `validateQuery` rejects unknown kinds/types with named alternatives; each verb returns the expected rows against `SAMPLE_GRAPH` (e.g. `whyChain('module-store')` reaches `purpose-shared-understanding`); "Copy context" produces valid markdown.
- Interview skill: dry-run a short interview, import the produced JSON into the Studio, confirm zero import errors and sensible lint results.

## Build order

1. `ONTOLOGY` + derived exports in `schema.ts` (`SUGGESTED_EDGE_TYPES` derivation keeps everything working).
2. `lint.ts` (pure, no UI).
3. RelationshipEditor chips + re-ranking.
4. GraphView ontology toggle.
5. Overview health card + Inspector badge.
6. `query.ts` (validate + evaluate + verbs) and Inspector "Copy context".
7. `sync-skills` script + skill block updates.
8. `bropilot-interview` skill.
9. CLAUDE.md sentence; browser verification pass.
