# Meta-Ontology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode the kind→kind meta-ontology (T-Box) in `schema.ts` and wire it into editor suggestions, an ontology graph view, advisory linting, a T-Box-validated query layer, skill sync, and a new interview skill.

**Architecture:** One `ONTOLOGY` triple table in `web/src/lib/schema.ts` is the single source of truth; everything else derives from it (derived `SUGGESTED_EDGE_TYPES`, `ontologyGraph()` projection rendered by the existing `ForceGraph.vue`, `lint.ts` conformance checks, `query.ts` BGP evaluator, a generated markdown block synced into three SKILL.md files). Spec: `docs/superpowers/specs/2026-07-19-meta-ontology-design.md`.

**Tech Stack:** Astro 5 + Vue 3 island, TypeScript, Tailwind v4, d3-force. New devDependency: `tsx` (runs the sync script and scratch verification scripts).

## Global Constraints

- All npm commands run from `web/`. All git commands run from the **repo root** (paths in `git add` are root-relative).
- **No test framework and no linter exist — do not add one** (standing decision). Verification per task = `npm run check` + throwaway `npx tsx` scripts for pure logic + browser verification (final task). Scratch scripts are written to `web/scratch-verify.ts`, run, then **deleted before committing**.
- **Nothing is ever validated or blocked** in the UI. Ontology findings and warnings are advisory only.
- Node ids are `{kind}-{kebab-title}`; kind-specific fields live in `node.props`, never top-level.
- Persistence stays localStorage-only; no backend, no new storage.
- The app is a `client:only` island — a passing build does not prove rendering; final task verifies in a real browser with real mouse events (synthetic PointerEvent dispatch does NOT trigger node selection).
- Commit after every task. Commit messages: clean and concise, no attribution or ads.
- The stock-8 edge types keep round-tripping; richer types stay advisory.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `web/src/lib/schema.ts` | Modify | + `ONTOLOGY`, `TripleStrength`, `OntologyTriple`, `triplesFrom`, `tripleFor`, `ontologyGraph`; `SUGGESTED_EDGE_TYPES` becomes derived |
| `web/src/lib/lint.ts` | Create | `lintGraph(graph): Finding[]` — 4 advisory checks |
| `web/src/lib/query.ts` | Create | `validateQuery`, `runQuery`, verbs (`whyChain`, `neighborhood`, `realization`, `evidence`), `contextMarkdown` |
| `web/src/lib/graphMode.ts` | Create | Shared refs: `graphMode`, `focusedKind`, `openOntology()` |
| `web/src/components/form/RelationshipEditor.vue` | Modify | Suggestion chips + target re-ranking |
| `web/src/components/graph/ForceGraph.vue` | Modify | Optional `dash` prop (per-edge stroke-dasharray) |
| `web/src/components/views/GraphView.vue` | Modify | Instance/Ontology toggle, projection, KindCard host |
| `web/src/components/graph/KindCard.vue` | Create | Ontology-mode overlay card for a kind |
| `web/src/components/views/OverviewView.vue` | Modify | Graph health card |
| `web/src/components/form/Inspector.vue` | Modify | Findings badge, kind-chip → ontology link, Copy context |
| `web/scripts/sync-skills.ts` | Create | Rewrites `<!-- ontology:begin/end -->` blocks in 3 SKILL.md files |
| `web/package.json` | Modify | `tsx` devDep + `sync-skills` script |
| `.claude/skills/bropilot-extract/SKILL.md` | Modify | Marker block replaces static edge-type list; prefer-ontology instruction |
| `.claude/skills/bropilot-generate/SKILL.md` | Modify | Marker block; ontology-order walk instruction |
| `.claude/skills/bropilot-interview/SKILL.md` | Create | New interview skill |
| `CLAUDE.md` | Modify | One paragraph: ONTOLOGY drives everything; run sync-skills after edits |

---

### Task 1: ONTOLOGY triple table + derived exports in schema.ts

**Files:**
- Modify: `web/src/lib/schema.ts` (replace lines 271–304, the `SUGGESTED_EDGE_TYPES` block; add new section after `edgeTypesByCategory`)
- Modify: `web/package.json` (add `tsx`)

**Interfaces:**
- Consumes: existing `KINDS`, `EDGE_TYPES`, `Graph`, `GraphNode` in `schema.ts`.
- Produces (later tasks rely on these exact names):
  - `export type TripleStrength = 'canonical' | 'typical' | 'possible'`
  - `export interface OntologyTriple { src: string; type: string; dst: string; strength: TripleStrength; note?: string }`
  - `export const ONTOLOGY: OntologyTriple[]`
  - `export function triplesFrom(kind: string): OntologyTriple[]` (sorted canonical→typical→possible)
  - `export function tripleFor(src: string, type: string, dst: string): OntologyTriple | undefined`
  - `export const SUGGESTED_EDGE_TYPES: Partial<Record<string, string[]>>` (same name/shape as today, now derived)
  - `export function ontologyGraph(): Graph` (node ids = kind names; edge ids = `o-{src}-{type}-{dst}`)

- [ ] **Step 1: Install tsx**

Run from `web/`: `npm install -D tsx`
Expected: package.json devDependencies gains `"tsx"`.

- [ ] **Step 2: Write the failing verification script**

Create `web/scratch-verify.ts`:

```ts
import { ONTOLOGY, KINDS, EDGE_TYPE_SET, triplesFrom, tripleFor, SUGGESTED_EDGE_TYPES, ontologyGraph } from './src/lib/schema';

const kindSet = new Set(KINDS.map((k) => k.kind));
let failures = 0;
const fail = (msg: string) => { failures++; console.error('FAIL:', msg); };

// every triple references real kinds and edge types
for (const t of ONTOLOGY) {
  if (!kindSet.has(t.src)) fail(`unknown src kind ${t.src}`);
  if (!kindSet.has(t.dst)) fail(`unknown dst kind ${t.dst}`);
  if (!EDGE_TYPE_SET.has(t.type)) fail(`unknown edge type ${t.type}`);
}
// no duplicate triples
const keys = new Set<string>();
for (const t of ONTOLOGY) {
  const k = `${t.src}|${t.type}|${t.dst}`;
  if (keys.has(k)) fail(`duplicate triple ${k}`);
  keys.add(k);
}
// every kind has at least one outgoing triple (so the editor always has suggestions)
for (const k of KINDS) if (!triplesFrom(k.kind).length) fail(`kind ${k.kind} has no outgoing triples`);
// spot checks
if (tripleFor('persona', 'motivates', 'usecase')?.strength !== 'canonical') fail('persona motivates usecase should be canonical');
if (tripleFor('tests', 'verifies', 'hypothesis')?.strength !== 'canonical') fail('tests verifies hypothesis should be canonical');
if (!SUGGESTED_EDGE_TYPES['persona']?.length) fail('derived SUGGESTED_EDGE_TYPES missing persona');
if (SUGGESTED_EDGE_TYPES['persona']![0] !== 'motivates') fail('persona suggestions should lead with motivates (canonical first)');
// projection shape
const og = ontologyGraph();
if (og.nodes.length !== KINDS.length) fail(`ontologyGraph nodes ${og.nodes.length} !== KINDS ${KINDS.length}`);
if (og.edges.length !== ONTOLOGY.length) fail(`ontologyGraph edges ${og.edges.length} !== ONTOLOGY ${ONTOLOGY.length}`);
if (og.nodes.some((n) => n.id !== n.kind)) fail('ontologyGraph node ids must equal kind names');

console.log(failures ? `${failures} failures` : `OK — ${ONTOLOGY.length} triples`);
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Run it to verify it fails**

Run from `web/`: `npx tsx scratch-verify.ts`
Expected: FAIL — `ONTOLOGY`/`triplesFrom`/`tripleFor`/`ontologyGraph` are not exported yet (import error).

- [ ] **Step 4: Implement in schema.ts**

Delete the entire existing `SUGGESTED_EDGE_TYPES` block (the comment starting `/** Likely edge types per source kind` through its closing `};`, currently lines 271–304). In its place insert:

```ts
// ── Meta-ontology (T-Box) ───────────────────────────────────────────────────
// Kind→kind triples: which edge types typically connect which kinds. Sources:
// the bro.png ontology arrows, the canonical pairs named in edge-type hints,
// and edge patterns in the sample graph. Advisory everywhere — never blocking.
export type TripleStrength = 'canonical' | 'typical' | 'possible';

export interface OntologyTriple {
  src: string;
  type: string;
  dst: string;
  strength: TripleStrength;
  note?: string;
}

export const ONTOLOGY: OntologyTriple[] = [
  // basics
  { src: 'name', type: 'has', dst: 'purpose', strength: 'canonical' },
  { src: 'name', type: 'has', dst: 'capability', strength: 'canonical' },
  // intent chain
  { src: 'purpose', type: 'motivates', dst: 'goal', strength: 'canonical' },
  { src: 'purpose', type: 'serves', dst: 'persona', strength: 'canonical' },
  { src: 'purpose', type: 'motivates', dst: 'capability', strength: 'typical' },
  { src: 'purpose', type: 'depends_on', dst: 'hypothesis', strength: 'typical' },
  { src: 'goal', type: 'motivates', dst: 'usecase', strength: 'typical' },
  { src: 'goal', type: 'motivates', dst: 'capability', strength: 'typical' },
  { src: 'hypothesis', type: 'motivates', dst: 'goal', strength: 'typical' },
  { src: 'hypothesis', type: 'motivates', dst: 'capability', strength: 'typical' },
  { src: 'persona', type: 'motivates', dst: 'usecase', strength: 'canonical' },
  { src: 'persona', type: 'motivates', dst: 'requirement', strength: 'typical' },
  { src: 'persona', type: 'triggers', dst: 'usecase', strength: 'typical' },
  { src: 'persona', type: 'triggers', dst: 'flow', strength: 'typical' },
  { src: 'persona', type: 'uses', dst: 'capability', strength: 'typical' },
  { src: 'capability', type: 'serves', dst: 'persona', strength: 'canonical' },
  { src: 'capability', type: 'satisfies', dst: 'requirement', strength: 'canonical' },
  { src: 'capability', type: 'satisfies', dst: 'usecase', strength: 'typical' },
  { src: 'capability', type: 'depends_on', dst: 'constraint', strength: 'possible' },
  { src: 'usecase', type: 'uses', dst: 'screen', strength: 'typical' },
  { src: 'usecase', type: 'uses', dst: 'capability', strength: 'typical' },
  { src: 'requirement', type: 'constrains', dst: 'module', strength: 'typical' },
  { src: 'requirement', type: 'constrains', dst: 'design', strength: 'typical' },
  { src: 'constraint', type: 'constrains', dst: 'module', strength: 'canonical' },
  { src: 'constraint', type: 'constrains', dst: 'api', strength: 'typical' },
  { src: 'constraint', type: 'constrains', dst: 'component', strength: 'possible' },
  { src: 'assumption', type: 'constrains', dst: 'design', strength: 'possible' },
  { src: 'assumption', type: 'constrains', dst: 'module', strength: 'possible' },
  // domain
  { src: 'term', type: 'describes', dst: 'entity', strength: 'canonical' },
  { src: 'term', type: 'describes', dst: 'behaviour', strength: 'typical' },
  { src: 'term', type: 'describes', dst: 'event', strength: 'possible' },
  { src: 'term', type: 'extends', dst: 'term', strength: 'possible' },
  { src: 'entity', type: 'has', dst: 'relationship', strength: 'typical' },
  { src: 'entity', type: 'extends', dst: 'entity', strength: 'typical' },
  { src: 'relationship', type: 'references', dst: 'entity', strength: 'canonical' },
  { src: 'behaviour', type: 'emits', dst: 'event', strength: 'canonical' },
  { src: 'behaviour', type: 'uses', dst: 'state', strength: 'typical' },
  { src: 'event', type: 'triggers', dst: 'behaviour', strength: 'canonical' },
  { src: 'event', type: 'triggers', dst: 'flow', strength: 'typical' },
  { src: 'state', type: 'references', dst: 'entity', strength: 'typical' },
  { src: 'flow', type: 'satisfies', dst: 'usecase', strength: 'canonical' },
  { src: 'flow', type: 'uses', dst: 'screen', strength: 'canonical' },
  { src: 'flow', type: 'uses', dst: 'capability', strength: 'typical' },
  { src: 'flow', type: 'triggers', dst: 'event', strength: 'typical' },
  { src: 'screen', type: 'contains', dst: 'component', strength: 'canonical' },
  { src: 'screen', type: 'serves', dst: 'persona', strength: 'typical' },
  { src: 'screen', type: 'uses', dst: 'state', strength: 'typical' },
  { src: 'screen', type: 'uses', dst: 'api', strength: 'typical' },
  { src: 'screen', type: 'uses', dst: 'design', strength: 'typical' },
  { src: 'screen', type: 'uses', dst: 'module', strength: 'typical' },
  { src: 'design', type: 'describes', dst: 'screen', strength: 'canonical' },
  { src: 'design', type: 'describes', dst: 'component', strength: 'typical' },
  { src: 'design', type: 'constrains', dst: 'component', strength: 'typical' },
  // implementation
  { src: 'module', type: 'contains', dst: 'component', strength: 'canonical' },
  { src: 'module', type: 'contains', dst: 'module', strength: 'typical' },
  { src: 'module', type: 'contains', dst: 'logic', strength: 'typical' },
  { src: 'module', type: 'exposes', dst: 'api', strength: 'canonical' },
  { src: 'module', type: 'exposes', dst: 'interface', strength: 'typical' },
  { src: 'module', type: 'implements', dst: 'capability', strength: 'canonical' },
  { src: 'module', type: 'implements', dst: 'behaviour', strength: 'canonical' },
  { src: 'module', type: 'satisfies', dst: 'requirement', strength: 'canonical' },
  { src: 'module', type: 'depends_on', dst: 'module', strength: 'canonical' },
  { src: 'module', type: 'uses', dst: 'external', strength: 'canonical' },
  { src: 'module', type: 'uses', dst: 'interface', strength: 'typical' },
  { src: 'component', type: 'implements', dst: 'screen', strength: 'canonical' },
  { src: 'component', type: 'implements', dst: 'capability', strength: 'typical' },
  { src: 'component', type: 'implements', dst: 'design', strength: 'typical' },
  { src: 'component', type: 'emits', dst: 'event', strength: 'canonical' },
  { src: 'component', type: 'uses', dst: 'api', strength: 'typical' },
  { src: 'component', type: 'uses', dst: 'entity', strength: 'typical' },
  { src: 'component', type: 'uses', dst: 'state', strength: 'typical' },
  { src: 'component', type: 'uses', dst: 'external', strength: 'typical' },
  { src: 'component', type: 'uses', dst: 'module', strength: 'typical' },
  { src: 'logic', type: 'implements', dst: 'behaviour', strength: 'canonical' },
  { src: 'logic', type: 'uses', dst: 'entity', strength: 'typical' },
  { src: 'api', type: 'implements', dst: 'interface', strength: 'canonical' },
  { src: 'api', type: 'satisfies', dst: 'requirement', strength: 'typical' },
  { src: 'api', type: 'emits', dst: 'event', strength: 'canonical' },
  { src: 'api', type: 'uses', dst: 'module', strength: 'typical' },
  { src: 'interface', type: 'extends', dst: 'interface', strength: 'canonical' },
  { src: 'interface', type: 'references', dst: 'entity', strength: 'typical' },
  { src: 'repository', type: 'contains', dst: 'module', strength: 'canonical' },
  { src: 'external', type: 'triggers', dst: 'event', strength: 'typical' },
  // verification
  { src: 'tests', type: 'verifies', dst: 'module', strength: 'canonical' },
  { src: 'tests', type: 'verifies', dst: 'api', strength: 'canonical' },
  { src: 'tests', type: 'verifies', dst: 'behaviour', strength: 'canonical' },
  { src: 'tests', type: 'verifies', dst: 'hypothesis', strength: 'canonical' },
  { src: 'tests', type: 'verifies', dst: 'component', strength: 'typical' },
  { src: 'tests', type: 'verifies', dst: 'flow', strength: 'typical' },
  { src: 'observability', type: 'monitors', dst: 'goal', strength: 'canonical' },
  { src: 'observability', type: 'monitors', dst: 'api', strength: 'typical' },
  { src: 'observability', type: 'monitors', dst: 'module', strength: 'typical' },
];

const STRENGTH_RANK: Record<TripleStrength, number> = { canonical: 0, typical: 1, possible: 2 };

export function triplesFrom(kind: string): OntologyTriple[] {
  return ONTOLOGY.filter((t) => t.src === kind).sort(
    (a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength],
  );
}

export function tripleFor(src: string, type: string, dst: string): OntologyTriple | undefined {
  return ONTOLOGY.find((t) => t.src === src && t.type === type && t.dst === dst);
}

/**
 * Likely edge types per source kind — pure ordering hints for the editor.
 * Derived from ONTOLOGY (canonical first); nothing is validated or blocked.
 */
export const SUGGESTED_EDGE_TYPES: Partial<Record<string, string[]>> = (() => {
  const out: Record<string, string[]> = {};
  for (const k of KINDS) {
    const types: string[] = [];
    for (const t of triplesFrom(k.kind)) if (!types.includes(t.type)) types.push(t.type);
    if (types.length) out[k.kind] = types;
  }
  return out;
})();

/** The T-Box projected into the instance Graph shape, for rendering in ForceGraph. */
export function ontologyGraph(): Graph {
  return {
    nodes: KINDS.map((k) => ({ id: k.kind, kind: k.kind, title: k.label, description: k.blurb, props: {} })),
    edges: ONTOLOGY.map((t) => ({ id: `o-${t.src}-${t.type}-${t.dst}`, srcId: t.src, dstId: t.dst, type: t.type })),
  };
}
```

Note: the table adds four sample-driven rows beyond the spec table (`persona motivates requirement`, `component uses module`, `module uses interface`, `screen uses module`) — the spec explicitly allows strength/row adjustments. Sample edge `module-schema implements term-space` deliberately stays off-ontology (it demos an advisory finding).

- [ ] **Step 5: Run verification + typecheck**

Run from `web/`: `npx tsx scratch-verify.ts && npm run check`
Expected: `OK — 92 triples` (the table has 92 rows; re-count if you adjust it) and `astro check` passes with 0 errors.

- [ ] **Step 6: Delete scratch script and commit**

```bash
rm web/scratch-verify.ts
git add web/src/lib/schema.ts web/package.json web/package-lock.json
git commit -m "Add ONTOLOGY triple table; derive SUGGESTED_EDGE_TYPES from it"
```

---

### Task 2: Advisory linting — lib/lint.ts

**Files:**
- Create: `web/src/lib/lint.ts`

**Interfaces:**
- Consumes: `Graph`, `KIND_MAP`, `EDGE_TYPE_SET`, `ONTOLOGY`, `tripleFor` from `./schema` (Task 1).
- Produces: `export interface Finding { severity: 'note' | 'hint'; nodeId?: string; edgeId?: string; message: string; suggestion?: string }` and `export function lintGraph(graph: Graph): Finding[]`. Off-ontology and why-chain findings are `severity: 'note'`; orphan and unverified are `severity: 'hint'`. Every finding carries a `nodeId` (for edge findings: the edge's `srcId`) so the UI can navigate.

- [ ] **Step 1: Write the failing verification script**

Create `web/scratch-verify.ts`:

```ts
import { SAMPLE_GRAPH } from './src/lib/sample';
import { lintGraph } from './src/lib/lint';

const findings = lintGraph(SAMPLE_GRAPH);
const byKind = (needle: string) => findings.filter((f) => f.message.includes(needle)).length;
let failures = 0;
const expect = (cond: boolean, msg: string) => { if (!cond) { failures++; console.error('FAIL:', msg); } };

for (const f of findings) console.log(`[${f.severity}] ${f.message}${f.suggestion ? ` → ${f.suggestion}` : ''}`);

// The sample graph has exactly: 1 off-ontology edge (module implements term),
// 0 orphans, 2 why-chain gaps (capability-collect, capability-portable),
// 3 unverified surfaces (module-store, module-schema, behaviour-autosave).
expect(byKind('not in the ontology') === 1, `off-ontology: got ${byKind('not in the ontology')}, want 1`);
expect(byKind('no relationships') === 0, 'sample has no orphans');
expect(byKind('Nothing says why') === 2, `why-chain: got ${byKind('Nothing says why')}, want 2`);
expect(byKind('No test evidence') === 3, `unverified: got ${byKind('No test evidence')}, want 3`);
expect(findings.length === 6, `total: got ${findings.length}, want 6`);
// robustness: malformed graph must not throw
expect(Array.isArray(lintGraph({ nodes: [{ id: 'x', kind: 'alien', title: '', description: '' }], edges: [{ id: 'e', srcId: 'x', dstId: 'gone', type: 'zap' }] })), 'unknown kinds/types must not throw');

console.log(failures ? `${failures} failures` : 'OK');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run from `web/`: `npx tsx scratch-verify.ts`
Expected: FAIL — cannot find module `./src/lib/lint`.

- [ ] **Step 3: Implement lint.ts**

```ts
// Advisory graph-health checks against the ONTOLOGY (T-Box). Pure, never
// throws, never blocks — findings are suggestions, not errors.
import { type Graph, KIND_MAP, EDGE_TYPE_SET, ONTOLOGY, tripleFor } from './schema';

export interface Finding {
  severity: 'note' | 'hint';
  nodeId?: string;
  edgeId?: string;
  message: string;
  suggestion?: string;
}

const INTENT_TARGETS = new Set(['capability', 'usecase', 'goal']);
const INTENT_TYPES = new Set(['motivates', 'serves']);
const VERIFY_TARGETS = new Set(['module', 'api', 'behaviour']);

export function lintGraph(graph: Graph): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const linked = new Set<string>();
  const incomingTypes = new Map<string, Set<string>>();

  for (const e of graph.edges) {
    linked.add(e.srcId);
    linked.add(e.dstId);
    if (!incomingTypes.has(e.dstId)) incomingTypes.set(e.dstId, new Set());
    incomingTypes.get(e.dstId)!.add(e.type);
  }

  // 1 · off-ontology edges (skip unknown kinds/types — imported graphs may have them)
  for (const e of graph.edges) {
    const src = byId.get(e.srcId);
    const dst = byId.get(e.dstId);
    if (!src || !dst) continue;
    if (!KIND_MAP[src.kind] || !KIND_MAP[dst.kind] || !EDGE_TYPE_SET.has(e.type)) continue;
    if (tripleFor(src.kind, e.type, dst.kind)) continue;
    const alts = [...new Set(ONTOLOGY.filter((t) => t.src === src.kind && t.dst === dst.kind).map((t) => t.type))];
    findings.push({
      severity: 'note',
      edgeId: e.id,
      nodeId: e.srcId,
      message: `Unusual edge: “${src.title}” ${e.type} “${dst.title}” (${src.kind} → ${dst.kind}) — not in the ontology.`,
      suggestion: alts.length ? `The ontology suggests: ${alts.join(', ')}` : undefined,
    });
  }

  // 2 · orphans
  for (const n of graph.nodes) {
    if (!linked.has(n.id)) {
      findings.push({ severity: 'hint', nodeId: n.id, message: `“${n.title}” has no relationships yet.` });
    }
  }

  // 3 · why-chain gaps
  for (const n of graph.nodes) {
    if (!INTENT_TARGETS.has(n.kind)) continue;
    const inc = incomingTypes.get(n.id);
    if (inc && [...inc].some((t) => INTENT_TYPES.has(t))) continue;
    findings.push({
      severity: 'note',
      nodeId: n.id,
      message: `Nothing says why “${n.title}” exists — no incoming motivates/serves edge.`,
      suggestion: 'Link a purpose, goal, hypothesis or persona to it.',
    });
  }

  // 4 · unverified surfaces
  for (const n of graph.nodes) {
    if (!VERIFY_TARGETS.has(n.kind)) continue;
    if (incomingTypes.get(n.id)?.has('verifies')) continue;
    findings.push({
      severity: 'hint',
      nodeId: n.id,
      message: `No test evidence for “${n.title}” — nothing verifies it.`,
      suggestion: 'Add a tests node with a verifies edge.',
    });
  }

  return findings;
}
```

- [ ] **Step 4: Run verification + typecheck**

Run from `web/`: `npx tsx scratch-verify.ts && npm run check`
Expected: the six findings print, then `OK`; `astro check` passes. If counts differ, the ONTOLOGY table and sample graph disagree with the expectations — fix the lint logic (or, if a sample edge is genuinely reasonable, add a `typical` triple and update both scratch expectations) before proceeding.

- [ ] **Step 5: Delete scratch script and commit**

```bash
rm web/scratch-verify.ts
git add web/src/lib/lint.ts
git commit -m "Add advisory graph linting against the ontology"
```

---

### Task 3: RelationshipEditor — suggestion chips + target re-ranking

**Files:**
- Modify: `web/src/components/form/RelationshipEditor.vue`

**Interfaces:**
- Consumes: `triplesFrom`, `tripleFor` (Task 1); existing `addEdge`, `state`, `edgesOf`.
- Produces: UI only — no exports.

- [ ] **Step 1: Add chip + ranking logic to the script block**

In the imports (line 3), add `triplesFrom, tripleFor` to the `schema` import list. Then add after the `links` computed (line 23):

```ts
// ── one-click suggestions from the ontology (advisory — never exhaustive) ──
const chips = computed(() => {
  const existing = new Set(links.value.outgoing.map((e) => `${e.type}|${e.dstId}`));
  const out: { type: string; target: GraphNode; strength: string }[] = [];
  for (const t of triplesFrom(props.node.kind)) {
    for (const n of state.graph.nodes) {
      if (n.kind !== t.dst || n.id === props.node.id) continue;
      if (existing.has(`${t.type}|${n.id}`)) continue;
      out.push({ type: t.type, target: n, strength: t.strength });
    }
    if (out.length >= 6) break;
  }
  return out.slice(0, 6);
});

function addChip(c: { type: string; target: GraphNode }) {
  addEdge(props.node.id, c.target.id, c.type);
}

function fitsOntology(n: GraphNode): boolean {
  return !!tripleFor(props.node.kind, newType.value, n.kind);
}
```

Replace the `results` computed (lines 40–44) with an ontology-aware ranking — same 20-item cap, nothing hidden:

```ts
const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  const pool = q ? targets.value.filter((n) => n.title.toLowerCase().includes(q)) : targets.value;
  return pool
    .slice()
    .sort((a, b) => Number(fitsOntology(b)) - Number(fitsOntology(a)) || a.title.localeCompare(b.title))
    .slice(0, 20);
});
```

- [ ] **Step 2: Add the chips to the template**

Insert directly above the `<!-- add edge -->` comment (line 164):

```html
    <!-- ontology suggestions -->
    <div v-if="chips.length" class="flex flex-wrap gap-1.5">
      <button
        v-for="c in chips"
        :key="`${c.type}-${c.target.id}`"
        class="btn btn-ghost !px-2 !py-1 text-[0.68rem]"
        :title="`Suggested by the ontology (${c.strength})`"
        @click="addChip(c)"
      >
        <span class="font-mono uppercase tracking-[0.08em] text-accent">{{ c.type }}</span>
        <span class="ml-1 truncate">→ {{ KIND_MAP[c.target.kind]?.icon }} {{ c.target.title }}</span>
      </button>
    </div>
```

And in the target-result row (the button inside the results `<li>`, after the kind-label span at line 200), add the fit marker:

```html
              <span v-if="fitsOntology(n)" class="shrink-0 text-[0.6rem] text-emerald-400/70">· fits ontology</span>
```

- [ ] **Step 3: Typecheck + build**

Run from `web/`: `npm run check && npm run build`
Expected: both pass. (Full browser assertion happens in Task 9; if iterating visually, `npm run dev` → open a node in a part view → chips appear under Relationships.)

- [ ] **Step 4: Commit**

```bash
git add web/src/components/form/RelationshipEditor.vue
git commit -m "Ontology-driven suggestion chips and target ranking in RelationshipEditor"
```

---

### Task 4: Ontology view — graphMode, ForceGraph dash prop, GraphView toggle, KindCard

**Files:**
- Create: `web/src/lib/graphMode.ts`
- Create: `web/src/components/graph/KindCard.vue`
- Modify: `web/src/components/graph/ForceGraph.vue`
- Modify: `web/src/components/views/GraphView.vue`

**Interfaces:**
- Consumes: `ontologyGraph`, `ONTOLOGY`, `KIND_MAP`, `SPACES` (Task 1); store `state`, `nodesByKind`.
- Produces (Task 6/Inspector relies on these):
  - `graphMode.ts`: `export type GraphMode = 'instance' | 'ontology'`; `export const graphMode: Ref<GraphMode>`; `export const focusedKind: Ref<string | null>`; `export function openOntology(kind?: string | null): void`
  - `ForceGraph.vue`: new optional prop `dash?: Record<string, string>` (edge id → stroke-dasharray value; absent/empty string = solid).
  - `KindCard.vue`: props `{ kind: string }`, emits `close` and `jump(id: string)`.
- Node-id note: ontology node ids are bare kind names (`persona`); instance ids always contain a `-` (`{kind}-{kebab}`), so stored layout positions (keyed by id in `lib/layout.ts`) never collide between modes.

- [ ] **Step 1: Create graphMode.ts**

```ts
// Shared graph-view mode state — lives outside GraphView so the Inspector can
// deep-link into ontology mode before navigating. Not routed, not persisted.
import { ref } from 'vue';

export type GraphMode = 'instance' | 'ontology';

export const graphMode = ref<GraphMode>('instance');
export const focusedKind = ref<string | null>(null);

export function openOntology(kind: string | null = null) {
  graphMode.value = 'ontology';
  focusedKind.value = kind;
}
```

- [ ] **Step 2: Add the dash prop to ForceGraph.vue**

Change the props line (line 16) to:

```ts
const props = defineProps<{ nodes: GraphNode[]; edges: GraphEdge[]; selectedId: string | null; dash?: Record<string, string> }>();
```

In the edge `<line>` element (lines 425–436), add one attribute:

```html
            :stroke-dasharray="props.dash?.[l.id] || undefined"
```

- [ ] **Step 3: Create KindCard.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { KIND_MAP, ONTOLOGY, SPACES, nodeHue } from '../../lib/schema';
import { nodesByKind } from '../../lib/store';

const props = defineProps<{ kind: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'jump', id: string): void }>();

const def = computed(() => KIND_MAP[props.kind]);
const space = computed(() => (def.value ? SPACES[def.value.space] : undefined));
const instances = computed(() => nodesByKind(props.kind));
const outgoing = computed(() => ONTOLOGY.filter((t) => t.src === props.kind));
const incoming = computed(() => ONTOLOGY.filter((t) => t.dst === props.kind));

function label(kind: string) {
  return KIND_MAP[kind]?.label ?? kind;
}
</script>

<template>
  <div v-if="def" class="absolute bottom-5 right-5 w-80 border hairline glass-strong">
    <header class="flex items-start justify-between gap-2 border-b hairline px-4 py-3">
      <div class="min-w-0">
        <span class="chip" :style="{ color: space?.hue }">{{ def.icon }} {{ def.label }}</span>
        <p class="mt-1.5 text-xs leading-relaxed text-ink-300">{{ def.blurb }}</p>
      </div>
      <button class="btn btn-ghost shrink-0 !px-2" title="Close" @click="emit('close')">✕</button>
    </header>

    <div class="max-h-72 space-y-4 overflow-y-auto px-4 py-3">
      <section v-if="outgoing.length">
        <h4 class="label mb-1.5">Relates to</h4>
        <p v-for="t in outgoing" :key="`${t.type}-${t.dst}`" class="text-xs text-ink-300" :title="t.note">
          <span class="font-mono text-[0.66rem] uppercase tracking-wide text-accent">{{ t.type }}</span>
          → {{ label(t.dst) }}
          <span class="text-[0.62rem] text-ink-400">({{ t.strength }})</span>
        </p>
      </section>
      <section v-if="incoming.length">
        <h4 class="label mb-1.5">Related from</h4>
        <p v-for="t in incoming" :key="`${t.src}-${t.type}`" class="text-xs text-ink-300" :title="t.note">
          {{ label(t.src) }}
          <span class="font-mono text-[0.66rem] uppercase tracking-wide text-ink-400">{{ t.type }}</span> → this
        </p>
      </section>
      <section>
        <h4 class="label mb-1.5">Instances ({{ instances.length }})</h4>
        <p v-if="!instances.length" class="text-xs text-ink-400">None yet.</p>
        <button
          v-for="n in instances"
          :key="n.id"
          class="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-ink-200 transition hover:bg-white/[0.05]"
          @click="emit('jump', n.id)"
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{ background: nodeHue(n) }" />
          <span class="truncate">{{ n.title }}</span>
        </button>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Wire the toggle into GraphView.vue**

Replace the full `<script setup>` block with:

```ts
import { ref, reactive, computed, watch } from 'vue';
import { SPACES, KIND_MAP, ontologyGraph, ONTOLOGY, type Space } from '../../lib/schema';
import { state, nodesByKind } from '../../lib/store';
import { graphMode, focusedKind } from '../../lib/graphMode';
import ForceGraph from '../graph/ForceGraph.vue';
import KindCard from '../graph/KindCard.vue';

const graphRef = ref<InstanceType<typeof ForceGraph> | null>(null);

const active = reactive<Record<Space, boolean>>({
  basics: true,
  problem: true,
  solution: true,
  crosscutting: true,
});

const isOntology = computed(() => graphMode.value === 'ontology');
const onto = ontologyGraph();

// Strength per projected edge id → stroke-dasharray (canonical solid).
const DASH: Record<string, string> = { canonical: '', typical: '6 4', possible: '2 5' };
const ontoDash: Record<string, string> = Object.fromEntries(
  ONTOLOGY.map((t) => [`o-${t.src}-${t.type}-${t.dst}`, DASH[t.strength]]),
);

// Ontology-mode node titles carry the instance count as a lightweight badge.
const ontoNodes = computed(() =>
  onto.nodes.map((n) => ({ ...n, title: `${n.title} · ${nodesByKind(n.kind).length}` })),
);

const sourceNodes = computed(() => (isOntology.value ? ontoNodes.value : state.graph.nodes));
const sourceEdges = computed(() => (isOntology.value ? onto.edges : state.graph.edges));

const visibleNodes = computed(() =>
  sourceNodes.value.filter((n) => {
    const sp = KIND_MAP[n.kind]?.space;
    return sp ? active[sp] : true;
  }),
);
const visibleIds = computed(() => new Set(visibleNodes.value.map((n) => n.id)));
const visibleEdges = computed(() =>
  sourceEdges.value.filter((e) => visibleIds.value.has(e.srcId) && visibleIds.value.has(e.dstId)),
);

function toggle(sp: Space) {
  active[sp] = !active[sp];
}
function select(id: string | null) {
  if (isOntology.value) focusedKind.value = id;
  else state.selectedId = id;
}
function jumpToInstance(id: string) {
  graphMode.value = 'instance';
  focusedKind.value = null;
  state.selectedId = id;
}

// re-frame when the mode (and thus the whole node set) swaps
watch(isOntology, () => setTimeout(() => graphRef.value?.fit(), 650));
```

In the template: pass the new data to ForceGraph and add the toggle + card. Replace the `<ForceGraph …/>` element with:

```html
    <ForceGraph
      ref="graphRef"
      :nodes="visibleNodes"
      :edges="visibleEdges"
      :selected-id="isOntology ? focusedKind : state.selectedId"
      :dash="isOntology ? ontoDash : undefined"
      @select="select"
    />
```

In the top-right controls div (after the Relayout button), add:

```html
      <div class="flex border hairline">
        <button
          v-for="m in (['instance', 'ontology'] as const)"
          :key="m"
          class="px-3 py-1.5 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] transition"
          :class="graphMode === m ? 'bg-white/[0.08] text-ink-100' : 'text-ink-400 hover:text-ink-200'"
          @click="graphMode = m; if (m === 'instance') focusedKind = null"
        >{{ m }}</button>
      </div>
```

Also update the subtitle line (`{{ visibleNodes.length }} nodes …`) to reflect mode:

```html
        {{ visibleNodes.length }} {{ isOntology ? 'kinds' : 'nodes' }} · {{ visibleEdges.length }} {{ isOntology ? 'relations' : 'edges' }} · drag to move · scroll to zoom
```

Before the closing root `</div>`, add the overlay card:

```html
    <KindCard v-if="isOntology && focusedKind" :kind="focusedKind" @close="focusedKind = null" @jump="jumpToInstance" />
```

- [ ] **Step 5: Typecheck + build**

Run from `web/`: `npm run check && npm run build`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/graphMode.ts web/src/components/graph/KindCard.vue web/src/components/graph/ForceGraph.vue web/src/components/views/GraphView.vue
git commit -m "Add ontology view: mode toggle, strength-coded edges, kind card"
```

---

### Task 5: Graph health card (Overview) + Inspector findings badge and ontology link

**Files:**
- Modify: `web/src/components/views/OverviewView.vue`
- Modify: `web/src/components/form/Inspector.vue`

**Interfaces:**
- Consumes: `lintGraph`, `Finding` (Task 2); `openOntology` (Task 4); `buildHash` from `../../lib/router` (existing: `buildHash(view, nodeId)`).
- Produces: UI only.

- [ ] **Step 1: Health card in OverviewView.vue**

Add to the script block imports: `import { lintGraph } from '../../lib/lint';` and extend the store import with `state` (already imported). Add:

```ts
const findings = computed(() => lintGraph(state.graph));

function jump(nodeId?: string) {
  if (!nodeId) return;
  const part = KIND_MAP[state.graph.nodes.find((n) => n.id === nodeId)?.kind ?? '']?.part;
  state.selectedId = nodeId;
  location.hash = `#/${part ?? 'graph'}/${nodeId}`;
}
```

In the template, after the graph CTA button, add:

```html
    <!-- graph health -->
    <section v-if="findings.length" class="mt-4 border hairline bg-ink-900 px-5 py-4">
      <h3 class="display text-xl">Graph health</h3>
      <p class="mt-1 text-xs text-ink-300">{{ findings.length }} advisory finding{{ findings.length > 1 ? 's' : '' }} — suggestions, never rules.</p>
      <ul class="mt-3 space-y-1.5">
        <li v-for="(f, i) in findings" :key="i">
          <button class="w-full text-left text-xs text-ink-200 transition hover:text-accent" @click="jump(f.nodeId)">
            <span class="font-mono text-[0.62rem] uppercase tracking-wide" :class="f.severity === 'note' ? 'text-amber-400/80' : 'text-ink-400'">{{ f.severity }}</span>
            {{ f.message }}
            <span v-if="f.suggestion" class="text-ink-400">{{ f.suggestion }}</span>
          </button>
        </li>
      </ul>
    </section>
```

- [ ] **Step 2: Inspector — findings badge and kind-chip ontology link**

In `Inspector.vue` script block, add imports:

```ts
import { lintGraph } from '../../lib/lint';
import { openOntology } from '../../lib/graphMode';
import { buildHash } from '../../lib/router';
```

Add after the `space` computed:

```ts
const nodeFindings = computed(() =>
  node.value ? lintGraph(state.graph).filter((f) => f.nodeId === node.value!.id) : [],
);

function toOntology() {
  if (!node.value) return;
  openOntology(node.value.kind);
  location.hash = buildHash('graph', null);
}
```

In the template header (line 121), make the kind chip clickable and add the badge — replace the chip span with:

```html
              <button
                class="chip cursor-pointer transition hover:opacity-80"
                :style="{ color: hue }"
                title="View this kind in the ontology"
                @click="toOntology"
              >{{ def?.icon }} {{ def?.label }}</button>
              <span
                v-if="nodeFindings.length"
                class="chip ml-1.5 !border-amber-400/40 text-amber-400/90"
                :title="nodeFindings.map((f) => f.message + (f.suggestion ? ` — ${f.suggestion}` : '')).join('\n')"
              >⚠ {{ nodeFindings.length }}</span>
```

- [ ] **Step 3: Typecheck + build**

Run from `web/`: `npm run check && npm run build`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/views/OverviewView.vue web/src/components/form/Inspector.vue
git commit -m "Surface lint findings: Overview health card, Inspector badge + ontology link"
```

---

### Task 6: Query layer — lib/query.ts + Inspector "Copy context"

**Files:**
- Create: `web/src/lib/query.ts`
- Modify: `web/src/components/form/Inspector.vue`

**Interfaces:**
- Consumes: `Graph`, `GraphNode`, `KINDS`, `KIND_MAP`, `EDGE_TYPE_SET`, `EDGE_TYPE_LABELS`, `ONTOLOGY`, `tripleFor` (Task 1).
- Produces:
  - `export interface NodeRef { var?: string; id?: string; kind?: string }`
  - `export interface QueryPattern { s: NodeRef; p: string; o: NodeRef; not?: boolean }` — `p` is an edge type, `^` prefix = inverse, `+` suffix = transitive.
  - `export interface GraphQuery { match: QueryPattern[]; select: string[]; limit?: number }`
  - `export interface QueryError { level: 'error' | 'warning'; message: string }`
  - `export function validateQuery(q: GraphQuery): QueryError[]`
  - `export function runQuery(graph: Graph, q: GraphQuery): Record<string, GraphNode>[]`
  - `export function whyChain(graph: Graph, id: string): GraphNode[]` (BFS — mixed-direction intent traversal isn't a single BGP)
  - `export function realization(graph: Graph, id: string): GraphNode[]` and `export function evidence(graph: Graph, id: string): GraphNode[]` (canned queries through `runQuery`)
  - `export function neighborhood(graph: Graph, id: string, opts?: { depth?: number; edgeTypes?: string[] }): Graph` (direct BFS)
  - `export function contextMarkdown(graph: Graph, id: string, opts?: { depth?: number }): string`

- [ ] **Step 1: Write the failing verification script**

Create `web/scratch-verify.ts`:

```ts
import { SAMPLE_GRAPH } from './src/lib/sample';
import { validateQuery, runQuery, whyChain, realization, evidence, neighborhood, contextMarkdown } from './src/lib/query';

let failures = 0;
const expect = (cond: boolean, msg: string) => { if (!cond) { failures++; console.error('FAIL:', msg); } };

// validation: unknown kind and type produce errors that name valid alternatives
const bad = validateQuery({ match: [{ s: { kind: 'personna' }, p: 'zaps', o: { var: 'x' } }], select: ['x'] });
expect(bad.some((e) => e.level === 'error' && e.message.includes('personna') && e.message.includes('persona')), 'unknown kind error lists valid kinds');
expect(bad.some((e) => e.level === 'error' && e.message.includes('zaps')), 'unknown edge type error');
// validation: off-ontology kind pair yields a warning, not an error
const warn = validateQuery({ match: [{ s: { kind: 'persona' }, p: 'contains', o: { kind: 'module' } }], select: [] });
expect(warn.some((e) => e.level === 'warning'), 'off-ontology pair warns');
expect(!warn.some((e) => e.level === 'error'), 'off-ontology pair is not an error');
// unbound select var
expect(validateQuery({ match: [{ s: { kind: 'persona' }, p: 'uses', o: { var: 'c' } }], select: ['zz'] }).some((e) => e.level === 'error'), 'unbound select var errors');

// basic BGP: personas that use a capability
const rows = runQuery(SAMPLE_GRAPH, { match: [{ s: { var: 'p', kind: 'persona' }, p: 'uses', o: { var: 'c', kind: 'capability' } }], select: ['p', 'c'] });
expect(rows.length === 2, `persona-uses-capability rows: got ${rows.length}, want 2`);
// negation: capabilities nothing motivates (collect + portable)
const unmotivated = runQuery(SAMPLE_GRAPH, { match: [
  { s: { var: 'c', kind: 'capability' }, p: '^has', o: { id: 'name-bropilot' } },
  { s: { var: 'x' }, p: 'motivates', o: { var: 'c' }, not: true },
], select: ['c'] });
expect(unmotivated.length === 2, `unmotivated capabilities: got ${unmotivated.length}, want 2 (collect, portable)`);
// inverse + transitive: everything reachable from purpose via motivates+
const chain = runQuery(SAMPLE_GRAPH, { match: [{ s: { id: 'purpose-shared-understanding' }, p: 'motivates+', o: { var: 'x' } }], select: ['x'] });
expect(chain.some((r) => r.x.id === 'usecase-onboard'), 'motivates+ reaches usecase-onboard via goal');

// verbs
const why = whyChain(SAMPLE_GRAPH, 'module-store');
expect(why.some((n) => n.id === 'purpose-shared-understanding'), 'whyChain(module-store) reaches the purpose');
expect(evidence(SAMPLE_GRAPH, 'module-store').length === 0, 'no evidence in sample');
expect(realization(SAMPLE_GRAPH, 'capability-portable').some((n) => n.id === 'module-store'), 'realization finds module-store');
const hood = neighborhood(SAMPLE_GRAPH, 'module-store', { depth: 1 });
expect(hood.nodes.some((n) => n.id === 'module-schema'), 'depth-1 neighborhood includes module-schema');
expect(!hood.nodes.some((n) => n.id === 'persona-architect'), 'depth-1 neighborhood excludes 2-hop nodes');
const md = contextMarkdown(SAMPLE_GRAPH, 'module-store');
expect(md.includes('# Graph store') && md.includes('depends on'), 'context markdown has title and edges');

console.log(failures ? `${failures} failures` : 'OK');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

Run from `web/`: `npx tsx scratch-verify.ts`
Expected: FAIL — cannot find module `./src/lib/query`.

- [ ] **Step 3: Implement query.ts**

```ts
// T-Box-constrained graph queries: SPARQL's basic-graph-pattern kernel, JSON
// encoded, validated against the ontology before execution. Advisory rule
// holds here too — off-ontology patterns warn, they never refuse to run.
import {
  type Graph,
  type GraphNode,
  KINDS,
  KIND_MAP,
  EDGE_TYPE_SET,
  EDGE_TYPE_LABELS,
  ONTOLOGY,
  tripleFor,
} from './schema';

export interface NodeRef { var?: string; id?: string; kind?: string }
export interface QueryPattern { s: NodeRef; p: string; o: NodeRef; not?: boolean }
export interface GraphQuery { match: QueryPattern[]; select: string[]; limit?: number }
export interface QueryError { level: 'error' | 'warning'; message: string }

const KIND_SET = new Set(KINDS.map((k) => k.kind));

function parseP(p: string): { type: string; inverse: boolean; transitive: boolean } {
  let s = p;
  let inverse = false;
  let transitive = false;
  if (s.startsWith('^')) { inverse = true; s = s.slice(1); }
  if (s.endsWith('+')) { transitive = true; s = s.slice(0, -1); }
  return { type: s, inverse, transitive };
}

export function validateQuery(q: GraphQuery): QueryError[] {
  const errs: QueryError[] = [];
  if (!q.match?.length) {
    errs.push({ level: 'error', message: 'Query has no match patterns.' });
    return errs;
  }
  for (const pat of q.match) {
    const { type, inverse } = parseP(pat.p);
    if (!EDGE_TYPE_SET.has(type)) {
      errs.push({ level: 'error', message: `Unknown edge type “${type}”. Valid: ${[...EDGE_TYPE_SET].join(', ')}.` });
    }
    for (const ref of [pat.s, pat.o]) {
      if (ref.kind && !KIND_SET.has(ref.kind)) {
        errs.push({ level: 'error', message: `Unknown kind “${ref.kind}”. Valid: ${[...KIND_SET].join(', ')}.` });
      }
    }
    if (pat.s.kind && pat.o.kind && EDGE_TYPE_SET.has(type) && KIND_SET.has(pat.s.kind) && KIND_SET.has(pat.o.kind)) {
      const [sk, ok] = inverse ? [pat.o.kind, pat.s.kind] : [pat.s.kind, pat.o.kind];
      if (!tripleFor(sk, type, ok)) {
        const alts = [...new Set(ONTOLOGY.filter((t) => t.src === sk && t.dst === ok).map((t) => t.type))];
        errs.push({
          level: 'warning',
          message: `No ontology triple ${sk} —${type}→ ${ok}.${alts.length ? ` Licensed types for this pair: ${alts.join(', ')}.` : ''}`,
        });
      }
    }
  }
  for (const v of q.select ?? []) {
    if (!q.match.some((p) => p.s.var === v || p.o.var === v)) {
      errs.push({ level: 'error', message: `select var “${v}” is never bound in match.` });
    }
  }
  return errs;
}

type Binding = Record<string, string>; // var → node id

export function runQuery(graph: Graph, q: GraphQuery): Record<string, GraphNode>[] {
  if (validateQuery(q).some((e) => e.level === 'error')) return [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const kindOk = (ref: NodeRef, id: string) => !ref.kind || byId.get(id)?.kind === ref.kind;

  function candidates(ref: NodeRef, b: Binding): string[] {
    if (ref.var && b[ref.var]) return kindOk(ref, b[ref.var]) ? [b[ref.var]] : [];
    if (ref.id) return byId.has(ref.id) && kindOk(ref, ref.id) ? [ref.id] : [];
    return graph.nodes.filter((n) => !ref.kind || n.kind === ref.kind).map((n) => n.id);
  }

  function reach(from: string, type: string, inverse: boolean, transitive: boolean): Set<string> {
    const step = (id: string) =>
      graph.edges
        .filter((e) => e.type === type && (inverse ? e.dstId === id : e.srcId === id))
        .map((e) => (inverse ? e.srcId : e.dstId));
    if (!transitive) return new Set(step(from));
    const seen = new Set<string>();
    const queue = step(from);
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...step(id));
    }
    return seen;
  }

  let bindings: Binding[] = [{}];
  for (const pat of q.match) {
    const { type, inverse, transitive } = parseP(pat.p);
    const next: Binding[] = [];
    for (const b of bindings) {
      const matched: Binding[] = [];
      for (const sid of candidates(pat.s, b)) {
        const targets = reach(sid, type, inverse, transitive);
        for (const oid of candidates(pat.o, b)) {
          if (!targets.has(oid)) continue;
          const nb: Binding = { ...b };
          if (pat.s.var) nb[pat.s.var] = sid;
          if (pat.o.var) nb[pat.o.var] = oid;
          matched.push(nb);
        }
      }
      if (pat.not) {
        if (!matched.length) next.push(b);
      } else {
        next.push(...matched);
      }
    }
    const seen = new Set<string>();
    bindings = next.filter((b) => {
      const k = JSON.stringify(b);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!bindings.length) break;
  }

  return bindings
    .slice(0, q.limit ?? 100)
    .map((b) => Object.fromEntries(q.select.filter((v) => b[v]).map((v) => [v, byId.get(b[v])!])));
}

// ── Named verbs ─────────────────────────────────────────────────────────────

/** Intent ancestry. Mixed-direction alternation (incoming motivates/serves/
 *  constrains, outgoing implements/satisfies) is not a single BGP — BFS. */
const WHY_IN = new Set(['motivates', 'serves', 'constrains']);
const WHY_OUT = new Set(['implements', 'satisfies']);

export function whyChain(graph: Graph, id: string): GraphNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([id]);
  const queue = [id];
  const out: GraphNode[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of graph.edges) {
      let nextId: string | null = null;
      if (WHY_IN.has(e.type) && e.dstId === cur) nextId = e.srcId;
      else if (WHY_OUT.has(e.type) && e.srcId === cur) nextId = e.dstId;
      if (!nextId || seen.has(nextId)) continue;
      seen.add(nextId);
      queue.push(nextId);
      const n = byId.get(nextId);
      if (n) out.push(n);
    }
  }
  return out;
}

export function realization(graph: Graph, id: string): GraphNode[] {
  const impl = runQuery(graph, { match: [{ s: { var: 'x' }, p: 'implements', o: { id } }], select: ['x'] });
  const sat = runQuery(graph, { match: [{ s: { var: 'x' }, p: 'satisfies', o: { id } }], select: ['x'] });
  const seen = new Set<string>();
  return [...impl, ...sat].map((r) => r.x).filter((n) => !seen.has(n.id) && seen.add(n.id));
}

export function evidence(graph: Graph, id: string): GraphNode[] {
  const ver = runQuery(graph, { match: [{ s: { var: 'x' }, p: 'verifies', o: { id } }], select: ['x'] });
  const mon = runQuery(graph, { match: [{ s: { var: 'x' }, p: 'monitors', o: { id } }], select: ['x'] });
  const seen = new Set<string>();
  return [...ver, ...mon].map((r) => r.x).filter((n) => !seen.has(n.id) && seen.add(n.id));
}

export function neighborhood(
  graph: Graph,
  id: string,
  opts: { depth?: number; edgeTypes?: string[] } = {},
): Graph {
  const depth = opts.depth ?? 2;
  const typeOk = (t: string) => !opts.edgeTypes || opts.edgeTypes.includes(t);
  const keep = new Set<string>([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const e of graph.edges) {
      if (!typeOk(e.type)) continue;
      for (const [a, b] of [[e.srcId, e.dstId], [e.dstId, e.srcId]]) {
        if (frontier.includes(a) && !keep.has(b)) {
          keep.add(b);
          next.push(b);
        }
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter((e) => keep.has(e.srcId) && keep.has(e.dstId) && typeOk(e.type)),
  };
}

/** Markdown context slice for pasting into an LLM chat. */
export function contextMarkdown(graph: Graph, id: string, opts: { depth?: number } = {}): string {
  const centre = graph.nodes.find((n) => n.id === id);
  if (!centre) return '';
  const hood = neighborhood(graph, id, { depth: opts.depth ?? 2 });
  const lines: string[] = [];
  const kindLabel = (n: GraphNode) => KIND_MAP[n.kind]?.label ?? n.kind;
  lines.push(`# ${centre.title}`);
  lines.push(`*${kindLabel(centre)}* — ${centre.description || 'no description'}`);
  const props = Object.entries(centre.props ?? {}).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (props.length) {
    lines.push('');
    for (const [k, v] of props) lines.push(`- **${k}**: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
  }
  lines.push('', `## Context (${hood.nodes.length - 1} related nodes)`);
  for (const e of hood.edges) {
    const s = hood.nodes.find((n) => n.id === e.srcId);
    const o = hood.nodes.find((n) => n.id === e.dstId);
    if (!s || !o) continue;
    lines.push(`- ${s.title} **${EDGE_TYPE_LABELS[e.type] ?? e.type}** ${o.title}`);
  }
  lines.push('', '## Nodes');
  for (const n of hood.nodes) {
    if (n.id === centre.id) continue;
    lines.push(`- **${n.title}** (${kindLabel(n)}): ${n.description || '—'}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run verification + typecheck**

Run from `web/`: `npx tsx scratch-verify.ts && npm run check`
Expected: `OK`, then `astro check` passes.

- [ ] **Step 5: Add "Copy context" to Inspector.vue**

Script block — extend imports and add the handler:

```ts
import { contextMarkdown } from '../../lib/query';
```

```ts
async function copyContext() {
  if (!node.value) return;
  try {
    await navigator.clipboard.writeText(contextMarkdown(state.graph, node.value.id));
    toast('✓ Context copied — paste into any LLM chat');
  } catch {
    /* clipboard unavailable — ignore */
  }
}
```

Template — in the Details footer, put the two buttons side by side (replace the existing footer content):

```html
        <footer class="flex shrink-0 gap-2 border-t hairline px-5 py-3">
          <button class="btn flex-1 justify-center" title="Copy a markdown context slice (2-hop neighborhood)" @click="copyContext">⧉ Copy context</button>
          <button class="btn btn-danger flex-1 justify-center" @click="del">🗑 Delete</button>
        </footer>
```

- [ ] **Step 6: Typecheck, delete scratch, commit**

```bash
npm run check
rm web/scratch-verify.ts
git add web/src/lib/query.ts web/src/components/form/Inspector.vue
git commit -m "Add T-Box-validated query layer and Inspector context export"
```

---

### Task 7: sync-skills script + marker blocks in extract/generate skills

**Files:**
- Create: `web/scripts/sync-skills.ts`
- Modify: `web/package.json` (add script)
- Modify: `.claude/skills/bropilot-extract/SKILL.md` (replace the `### Edge Types` code block, lines 67–78)
- Modify: `.claude/skills/bropilot-generate/SKILL.md` (replace the `### Edge Types` code block, lines 43–47)

**Interfaces:**
- Consumes: `ONTOLOGY`, `EDGE_TYPES`, `EDGE_CATEGORIES`, `KIND_MAP` (Task 1).
- Produces: `npm run sync-skills` — rewrites the content between `<!-- ontology:begin -->` and `<!-- ontology:end -->` in the three skill files (interview skill added in Task 8; the script warns but does **not** fail while that file is absent — see step 2). Exits 1 on missing markers in an existing file. Idempotent.

- [ ] **Step 1: Put marker blocks in the two existing skills**

In `.claude/skills/bropilot-extract/SKILL.md`, replace the whole `### Edge Types` section (heading + fenced code block listing the 8 types) with:

```markdown
### Edge Types & Ontology

Prefer edges the ontology licenses for a kind pair; `references` is the explicit last resort. The 8 stock types (marked ✱) round-trip everywhere; richer types are advisory upgrades.

<!-- ontology:begin -->
<!-- ontology:end -->
```

In `.claude/skills/bropilot-generate/SKILL.md`, replace its `### Edge Types` section (heading + fenced code block) with:

```markdown
### Edge Types & Ontology

When walking the graph to scaffold, follow ontology order: intentional edges first (purpose/persona/goal), then domain, then implementation. The 8 stock types (marked ✱) round-trip everywhere.

<!-- ontology:begin -->
<!-- ontology:end -->
```

- [ ] **Step 2: Create web/scripts/sync-skills.ts**

```ts
// Regenerates the ontology block in the bropilot skills from schema.ts.
// Run after any ONTOLOGY / EDGE_TYPES change: npm run sync-skills
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ONTOLOGY, EDGE_TYPES, EDGE_CATEGORIES, KIND_MAP } from '../src/lib/schema';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = [
  '.claude/skills/bropilot-extract/SKILL.md',
  '.claude/skills/bropilot-generate/SKILL.md',
  '.claude/skills/bropilot-interview/SKILL.md',
];
const BEGIN = '<!-- ontology:begin -->';
const END = '<!-- ontology:end -->';

function render(): string {
  const lines: string[] = [];
  lines.push('', '**Edge types** (✱ = stock, always round-trips):', '');
  for (const cat of EDGE_CATEGORIES) {
    const types = EDGE_TYPES.filter((t) => t.category === cat.id);
    lines.push(`- *${cat.label}*: ${types.map((t) => `\`${t.type}\`${t.stock ? '✱' : ''}`).join(', ')}`);
  }
  lines.push('', '**Kind→kind ontology** (canonical and typical triples — prefer these when choosing edges):', '');
  lines.push('| src | edge | dst | strength |', '|---|---|---|---|');
  for (const t of ONTOLOGY) {
    if (t.strength === 'possible') continue;
    lines.push(`| ${KIND_MAP[t.src]?.kind ?? t.src} | ${t.type} | ${KIND_MAP[t.dst]?.kind ?? t.dst} | ${t.strength} |`);
  }
  lines.push('');
  return lines.join('\n');
}

let failed = false;
const block = render();
for (const rel of FILES) {
  const path = resolve(repoRoot, rel);
  if (!existsSync(path)) {
    console.warn(`skip (absent): ${rel}`);
    continue;
  }
  const text = readFileSync(path, 'utf8');
  const i = text.indexOf(BEGIN);
  const j = text.indexOf(END);
  if (i === -1 || j === -1 || j < i) {
    console.error(`ERROR: markers missing or malformed in ${rel}`);
    failed = true;
    continue;
  }
  const next = text.slice(0, i + BEGIN.length) + '\n' + block + text.slice(j);
  if (next !== text) {
    writeFileSync(path, next);
    console.log(`synced: ${rel}`);
  } else {
    console.log(`up to date: ${rel}`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 3: Add the npm script**

In `web/package.json` scripts, add: `"sync-skills": "tsx scripts/sync-skills.ts"`.

- [ ] **Step 4: Run and verify idempotency**

Run from `web/`:

```bash
npm run sync-skills
npm run sync-skills
git diff --stat ../.claude/skills
```

Expected: first run prints `synced:` for extract and generate and `skip (absent)` for interview; second run prints `up to date:` twice; the diff shows the two SKILL.md files changed once (the rendered table between markers).

- [ ] **Step 5: Typecheck + commit**

```bash
npm run check   # from web/
git add web/scripts/sync-skills.ts web/package.json .claude/skills/bropilot-extract/SKILL.md .claude/skills/bropilot-generate/SKILL.md
git commit -m "Sync ontology block into extract/generate skills via npm run sync-skills"
```

---

### Task 8: bropilot-interview skill

**Files:**
- Create: `.claude/skills/bropilot-interview/SKILL.md`

**Interfaces:**
- Consumes: the ontology marker block (Task 7 script fills it).
- Produces: a user-invocable `/bropilot-interview` skill that writes/updates a Bropilot graph JSON file.

- [ ] **Step 1: Create the skill file**

```markdown
---
name: bropilot-interview
description: Interview the user about a system and build/update a Bropilot knowledge-graph JSON through conversation. Use when the user wants to describe a new system conversationally, flesh out an existing Bropilot graph, or turn a product idea into a spec by answering questions.
---

# Bropilot Interview: Conversation → Graph

Build a Bropilot instance graph by interviewing the user. You edit the **instance graph only** — never the ontology or schema.

**Related**: `/bropilot-extract` (repo → graph), `/bropilot-generate` (graph → code). The output imports directly into Bropilot Studio.

## File handling

- Default file: `./bropilot-graph.json` (ask only if the user names a different path).
- If the file exists, load it and **resume** — never start over. Treat it as authoritative.
- **Write after every 2–3 answers**, not only at the end. Announce saves briefly.
- **Patch, don't regenerate**: read the current JSON, apply add/update operations to specific nodes/edges, write back. Never rebuild the whole file from memory — regeneration silently drops nodes.

## Graph format

`{ "nodes": [...], "edges": [...] }` — node ids are `{kind}-{kebab-title}` (e.g. `persona-sales-rep`); kind-specific fields go in `node.props` (see the props table in /bropilot-extract), never top-level. Edges: `{ "id": "e-...", "srcId", "dstId", "type", "label?" }`.

**Provenance**: every node created from an answer records the user's words:

```json
"sourceRefs": [{ "turnId": "interview-3", "excerpt": "mostly field techs who hate typing" }]
```

`turnId` is `interview-{n}` where n counts your questions; `excerpt` quotes (or tightly paraphrases) the user.

## Opening questions (Act 1)

Ask **one at a time**, in this order, adapting wording to context. Skip any the user already answered.

1. What do you wanna make?  → `name`, `purpose`
2. Who is it for, and why are they using it?  → `persona` (+ `persona motivates usecase`)
3. What does them using it look like?  → `usecase`, `flow`, `screen`
4. Why do you think doing it this way works? What is the essence?  → `hypothesis`, `capability`
5. What can we simplify, and what can we double down on?  → `capability` priorities, `assumption`
6. What needs to be true for the magic to happen?  → `constraint`, `assumption`, `requirement`

After each answer: create/update nodes, connect them with edges from the ontology table below (canonical first), save, then ask the next question.

## Gap-driven follow-ups

After the opening round, find the biggest hole and ask about it. Holes, in priority order:

1. A `capability`, `usecase`, or `goal` with no incoming `motivates`/`serves` — ask *why* it exists.
2. A `persona` with no `motivates`/`triggers` edge to any usecase — ask what they do with the system.
3. A `usecase` no `flow` satisfies — ask how it plays out step by step.
4. A `flow` with no `screen` — ask what the user sees.
5. Entities mentioned in answers but never modelled — ask what they are and how they relate.
6. A `module`/`api`/`behaviour` with no incoming `verifies` — ask how they'd know it works.

Stop interviewing when the user says so or when two consecutive follow-ups add nothing new.

## Edge selection

Use the ontology table below. Prefer canonical, then typical. `references` is the last resort. Never invent edge types.

<!-- ontology:begin -->
<!-- ontology:end -->

## Exit

1. Save the file a final time.
2. Summarise: node count by kind, edge count, and the 2–3 biggest remaining gaps.
3. Point the user at: import into Bropilot Studio (Import JSON), or `/bropilot-generate` to scaffold code.
```

- [ ] **Step 2: Fill its ontology block and verify**

Run from `web/`: `npm run sync-skills`
Expected: `synced: .claude/skills/bropilot-interview/SKILL.md` (other two `up to date:`). Open the file and confirm the table rendered between the markers.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/bropilot-interview
git commit -m "Add bropilot-interview skill: conversational graph collection"
```

---

### Task 9: CLAUDE.md note + browser verification pass

**Files:**
- Modify: `CLAUDE.md` (repo root)

- [ ] **Step 1: Document the ontology in CLAUDE.md**

In the Architecture section, at the end of the paragraph that begins `**\`src/lib/schema.ts\` is the single source of truth.**`, append:

```markdown
The `ONTOLOGY` triple table (kind→kind, with canonical/typical/possible strengths) is the T-Box layered on top: it derives `SUGGESTED_EDGE_TYPES`, drives RelationshipEditor suggestion chips, the Graph view's Instance|Ontology toggle, `lib/lint.ts` advisory findings, and `lib/query.ts` validation. After editing `ONTOLOGY` or `EDGE_TYPES`, run `npm run sync-skills` (from `web/`) to regenerate the ontology blocks in the three bropilot skills.
```

- [ ] **Step 2: Full browser verification**

Start the dev server (`cd web && npm run dev`), then drive headless Chrome. Use real mouse events (`Input.dispatchMouseEvent` via CDP, or Playwright's `page.mouse` which sends real input) — synthetic `PointerEvent` dispatch does not trigger node selection in this app. Verify each of:

1. **Editor chips**: open `http://localhost:4433/#/foundations/persona-architect` → Inspector → Details tab → Relationships shows ontology suggestion chips (e.g. `motivates → …`); clicking one adds the edge to the list above.
2. **Target ranking**: in "Add relationship" with type `motivates`, focus the target search — usecase/requirement nodes sort first with a "· fits ontology" marker; other nodes still listed below.
3. **Ontology toggle**: go to `#/graph`, click `ONTOLOGY` in the top-right segmented control → 28 kind nodes render with ` · N` count suffixes; typical edges are dashed, possible dotted, canonical solid.
4. **KindCard + cross-layer jump**: click the `persona` node → card opens bottom-right listing relations and instances; click an instance → view flips to instance mode with that node selected (Inspector shows it).
5. **Instance → ontology link**: select any instance node in a part view, click its kind chip in the Inspector header → graph view opens in ontology mode with that kind's card open.
6. **Health card**: on `#/overview` (sample graph loaded) the Graph health card lists 6 findings; clicking the "module-schema implements term" finding navigates to that node.
7. **Inspector badge**: select `module-store` → header shows `⚠` badge (unverified finding) with tooltip.
8. **Copy context**: with `module-store` selected, click `⧉ Copy context`; read the clipboard (CDP `Browser.grantPermissions` + `navigator.clipboard.readText()` in an evaluate) — markdown starts with `# Graph store` and contains a `## Context` section.

Fix anything broken before proceeding. Then run the static gates one last time from `web/`: `npm run check && npm run build`.

- [ ] **Step 3: Commit and push**

```bash
git add CLAUDE.md
git commit -m "Document ontology layer and sync-skills in CLAUDE.md"
git push -u origin dev
```

Then create the PR (per user's standing preference, don't ask):

```bash
gh pr create --base main --head dev \
  --title "Meta-ontology: T-Box triples, ontology view, lint, query layer, interview skill" \
  --body "Encodes the kind→kind meta-ontology as an ONTOLOGY triple table in schema.ts and derives everything from it:

- RelationshipEditor: ontology suggestion chips + fits-ontology target ranking
- Graph view: Instance|Ontology toggle, strength-coded edges, KindCard with cross-layer navigation
- lib/lint.ts: advisory graph-health findings (Overview card + Inspector badge)
- lib/query.ts: T-Box-validated JSON graph patterns + whyChain/realization/evidence/neighborhood verbs; Inspector Copy context
- npm run sync-skills: generated ontology block in the three bropilot skills
- New /bropilot-interview skill: conversational instance-graph collection with sourceRefs provenance

Spec: docs/superpowers/specs/2026-07-19-meta-ontology-design.md
Verified: npm run check, build, and the 8-point browser pass in the plan's Task 9."
```

---

## Self-Review Notes

- **Spec coverage**: §1 data model → Task 1; §2 editor → Task 3; §3 ontology view + cross-layer links → Tasks 4–5; §4 lint → Tasks 2, 5; §5 skills sync → Task 7; §6 interview skill → Task 8; §7 query layer + Copy context → Task 6; docs → Task 9. Spec's "SourceRef producer" lives in the interview skill (Task 8).
- **Deviation from spec, intentional**: `whyChain` is a BFS, not a canned `GraphQuery` — mixed-direction alternation is outside the BGP language; `realization`/`evidence` dogfood the evaluator instead. Four `typical` triples were added beyond the spec table (sample-graph-driven); spec allows row additions.
- **Type consistency**: `Finding`, `OntologyTriple`, `GraphQuery`, `graphMode`/`focusedKind`/`openOntology`, `dash` prop names are used identically across Tasks 1–6; verify against the Interfaces blocks when implementing.
