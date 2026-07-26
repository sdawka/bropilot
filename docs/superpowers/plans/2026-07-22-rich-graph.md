# Rich Sample Graph & Densification Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 27-node demo graph with a dense (~110+ node) graph of Bropilot modelling itself, and add advisory "densification" tooling (`lib/suggest.ts` + Inspector/Overview UI) that helps any graph get richer.

**Architecture:** A new pure module `lib/suggest.ts` derives edge suggestions from the existing `ONTOLOGY` T-Box (canonical/typical triples only, existing edges excluded, candidates ranked). The sample data moves out of `sample.ts` into `sample-data.json` with `sample.ts` becoming a thin typed wrapper. Two UI surfaces consume `suggest.ts`: an Inspector → Details "Suggestions" section and an Overview health-card row. Everything is advisory — nothing is validated or blocked.

**Tech Stack:** TypeScript, Vue 3 (single `client:only` island), Astro 5, Vitest (node env), Playwright. No backend. Tailwind v4 (no config file). Run all commands from `web/`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Run all commands from `web/`.** If `node_modules` is missing, run `npm install` first.
- **No schema/ONTOLOGY changes.** Do not edit `src/lib/schema.ts` (`KINDS`, `ONTOLOGY`, `EDGE_TYPES`). Therefore **`npm run sync-skills` is not needed** and the CI skills-drift gate (`git diff --exit-code .claude/skills`) stays green untouched.
- **No new dependencies.** Do not add anything to `web/package.json`.
- **Advisory only.** Suggestions and lint findings are hints — never block, throw, or auto-apply in bulk.
- **`hydrate()` seeding, import/export, and localStorage behaviour are unchanged.** The sample only seeds empty storage; users with a saved graph are untouched.
- **Sim tests must stay content-independent.** `tests/sim/simulator.test.ts` and `src/lib/sim/*` seed their own ops and do not reference the sample — do not make them depend on sample content. (Verified: no `SAMPLE`/`sample` references in `tests/sim` or `src/lib/sim`.)
- **Each task ends green:** `npm run check`, `npm run test`, and `npm run e2e` all pass before the task's commit. (`npm run e2e` needs Chromium: `npx playwright install chromium` once.)
- **No placeholder content in the sample.** Every node description is 1–2 real sentences.

---

### Task 1: `lib/suggest.ts` — pure suggestion engine

Pure, store-free module deriving edge suggestions from `ONTOLOGY`. Unit-testable in isolation (takes a `Graph`, never touches the reactive store).

**Files:**
- Create: `web/src/lib/suggest.ts`
- Test: `web/tests/unit/suggest.test.ts`

**Interfaces:**
- Consumes: from `./schema` — `ONTOLOGY` (`OntologyTriple[]`, each `{ src, type, dst, strength, note? }`), `KIND_MAP` (`Record<string, KindDef>`, `.label` is the singular human label), `EDGE_TYPE_LABELS` (`Record<string,string>`), and types `Graph`, `GraphNode`.
- Produces (later tasks rely on these exact names/shapes):
  ```ts
  export interface Suggestion {
    nodeId: string;        // the subject node the suggestion is for
    dir: 'out' | 'in';     // 'out' = subject is edge source; 'in' = subject is edge target
    type: string;          // edge type, e.g. 'verifies'
    otherKind: string;     // the kind expected on the other end
    strength: 'canonical' | 'typical';
    candidates: string[];  // existing node ids of otherKind, ranked, max 5
    reason: string;        // human sentence
  }
  export function suggestFor(graph: Graph, nodeId: string): Suggestion[];
  export function suggestStats(graph: Graph): { nodes: number; total: number; topNodeId: string | null };
  ```

**Behaviour (locked decisions):**
- Consider both directions: for subject kind `K`, ONTOLOGY triples with `src === K` yield `dir: 'out'` (otherKind = `dst`); triples with `dst === K` yield `dir: 'in'` (otherKind = `src`).
- **`possible`-strength triples are never suggested.**
- Suggestions are ordered **canonical before typical**; within a strength, suggestions with at least one candidate come before zero-candidate guidance; stable within that = ONTOLOGY declaration order. Capped at **8**. (Amended by controller 2026-07-25: actionable-before-guidance resolves the cap-vs-verifies-test inconsistency.)
- For each triple, candidate pool = existing nodes of `otherKind`, excluding the subject itself and excluding any whose edge **already exists** in that direction+type (`out`: subject→candidate of `type`; `in`: candidate→subject of `type`).
- **Zero-candidate handling:** if the pool is empty *and no node of `otherKind` exists at all*, keep the suggestion with `candidates: []` (UI renders "add a …" guidance). If nodes of `otherKind` exist but are *all already connected* (pool empty, kind present), **drop** the suggestion — it is satisfied.
- **Candidate ranking:** triangle-closing first (candidate shares at least one neighbour with the subject), then alphabetical by title; capped at **5**.
- **Reason sentence** (deterministic, no exact-text assertions depend on it): active voice, singular articles.
  - `dir: 'out'`: "A {subject} {adverb} {edgeLabel} {article} {other}." e.g. "A capability typically serves a persona."
  - `dir: 'in'`: "A {other} {adverb} {edgeLabel} {article} {subject}." e.g. "A test suite canonically verifies a module."
  - `adverb` = `canonical → 'canonically'`, `typical → 'typically'`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/unit/suggest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { suggestFor, suggestStats } from '../../src/lib/suggest';
import type { Graph } from '../../src/lib/schema';

const node = (id: string, kind: string, title = id) => ({ id, kind, title, description: '' });

describe('suggestFor: existing-edge exclusion & zero-candidate rules', () => {
  it('drops a suggestion whose only candidate is already connected, keeps it when a free candidate exists', () => {
    const connected: Graph = {
      nodes: [node('m', 'module', 'M'), node('t', 'tests', 'T')],
      edges: [{ id: 'e1', srcId: 't', dstId: 'm', type: 'verifies' }],
    };
    // the sole tests node already verifies m → no verifies/tests suggestion for m
    expect(
      suggestFor(connected, 'm').some((s) => s.type === 'verifies' && s.otherKind === 'tests'),
    ).toBe(false);

    const withFree: Graph = {
      nodes: [node('m', 'module', 'M'), node('t', 'tests', 'T'), node('t2', 'tests', 'T2')],
      edges: [{ id: 'e1', srcId: 't', dstId: 'm', type: 'verifies' }],
    };
    const verify = suggestFor(withFree, 'm').find((s) => s.type === 'verifies' && s.otherKind === 'tests');
    expect(verify).toBeTruthy();
    expect(verify!.candidates).toEqual(['t2']); // t excluded (already connected)
    expect(verify!.dir).toBe('in');
  });

  it('keeps a zero-candidate suggestion when no node of the target kind exists', () => {
    const g: Graph = { nodes: [node('o', 'observability', 'O')], edges: [] };
    const s = suggestFor(g, 'o');
    const monitorsGoal = s.find((x) => x.type === 'monitors' && x.otherKind === 'goal');
    expect(monitorsGoal).toBeTruthy();
    expect(monitorsGoal!.candidates).toEqual([]);
    expect(monitorsGoal!.dir).toBe('out');
  });

  it('never suggests a possible-strength triple', () => {
    const g: Graph = { nodes: [node('c', 'capability', 'C'), node('k', 'constraint', 'K')], edges: [] };
    // capability --depends_on--> constraint is strength 'possible'
    expect(
      suggestFor(g, 'c').some((s) => s.type === 'depends_on' && s.otherKind === 'constraint'),
    ).toBe(false);
    expect(suggestFor(g, 'c').every((s) => s.strength === 'canonical' || s.strength === 'typical')).toBe(true);
  });

  it('returns [] for a nonexistent node', () => {
    expect(suggestFor({ nodes: [], edges: [] }, 'ghost')).toEqual([]);
  });
});

describe('suggestFor: ordering & caps', () => {
  it('orders canonical suggestions before typical ones', () => {
    const g: Graph = {
      nodes: [node('c', 'capability', 'C'), node('p', 'persona', 'P'), node('r', 'requirement', 'R'), node('u', 'usecase', 'U')],
      edges: [],
    };
    const s = suggestFor(g, 'c');
    const firstTypical = s.findIndex((x) => x.strength === 'typical');
    const lastCanonical = s.map((x) => x.strength).lastIndexOf('canonical');
    if (firstTypical !== -1) expect(lastCanonical).toBeLessThan(firstTypical);
  });

  it('caps suggestions at 8 for a densely-connected kind', () => {
    const g: Graph = { nodes: [node('m', 'module', 'M')], edges: [] };
    expect(suggestFor(g, 'm').length).toBe(8); // module has far more than 8 canonical/typical triples
  });

  it('caps candidates at 5', () => {
    const nodes = [node('m', 'module', 'M')];
    for (let i = 0; i < 6; i++) nodes.push(node(`c${i}`, 'component', `Comp ${i}`));
    const contains = suggestFor({ nodes, edges: [] }, 'm').find(
      (s) => s.type === 'contains' && s.otherKind === 'component',
    );
    expect(contains).toBeTruthy();
    expect(contains!.candidates.length).toBe(5);
  });

  it('ranks triangle-closing candidates before alphabetical ones', () => {
    // subject capability C connects to usecase U; persona pA also connects to U (shared neighbour → triangle),
    // persona pB shares nothing. pB's title sorts first alphabetically, but pA must rank first.
    const g: Graph = {
      nodes: [
        node('c', 'capability', 'C'),
        node('u', 'usecase', 'U'),
        node('pa', 'persona', 'ZZZ'),
        node('pb', 'persona', 'AAA'),
      ],
      edges: [
        { id: 'e1', srcId: 'c', dstId: 'u', type: 'satisfies' }, // C — U
        { id: 'e2', srcId: 'pa', dstId: 'u', type: 'motivates' }, // pA — U (shared neighbour)
      ],
    };
    const serves = suggestFor(g, 'c').find((s) => s.type === 'serves' && s.otherKind === 'persona');
    expect(serves).toBeTruthy();
    expect(serves!.candidates[0]).toBe('pa'); // triangle beats alphabetical
    expect(serves!.candidates).toContain('pb');
  });

  it('produces a readable reason sentence', () => {
    const g: Graph = { nodes: [node('m', 'module', 'M')], edges: [] };
    const s = suggestFor(g, 'm').find((x) => x.type === 'verifies' && x.otherKind === 'tests');
    expect(s!.reason).toMatch(/verifies/);
    expect(s!.reason.endsWith('.')).toBe(true);
    expect(s!.reason[0]).toBe(s!.reason[0].toUpperCase());
  });
});

describe('suggestStats', () => {
  it('aggregates counts and picks the node with the most suggestions', () => {
    const g: Graph = {
      nodes: [node('m', 'module', 'M'), node('g', 'goal', 'G')],
      edges: [],
    };
    const stats = suggestStats(g);
    const mCount = suggestFor(g, 'm').length;
    const gCount = suggestFor(g, 'g').length;
    expect(stats.total).toBe(mCount + gCount);
    expect(stats.nodes).toBe(2);
    expect(stats.topNodeId).toBe(mCount >= gCount ? 'm' : 'g'); // module has more triples than goal
  });

  it('reports zero and null topNodeId for a graph with no suggestions', () => {
    // a lone term with every ontology target absent still yields zero-candidate suggestions,
    // so use a truly empty graph for the null case
    expect(suggestStats({ nodes: [], edges: [] })).toEqual({ nodes: 0, total: 0, topNodeId: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- suggest`
Expected: FAIL — `Cannot find module '../../src/lib/suggest'`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/suggest.ts`:

```ts
// Advisory edge suggestions derived from the ONTOLOGY (T-Box). Pure — takes a
// Graph, never touches the store, never mutates. Suggestions are hints the UI
// offers; nothing is validated or auto-applied.
import { ONTOLOGY, KIND_MAP, EDGE_TYPE_LABELS, type Graph } from './schema';

export interface Suggestion {
  nodeId: string;
  dir: 'out' | 'in';
  type: string;
  otherKind: string;
  strength: 'canonical' | 'typical';
  candidates: string[];
  reason: string;
}

const MAX_SUGGESTIONS = 8;
const MAX_CANDIDATES = 5;
const STRENGTH_RANK: Record<'canonical' | 'typical', number> = { canonical: 0, typical: 1 };

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function reasonFor(
  subjectKind: string,
  dir: 'out' | 'in',
  type: string,
  otherKind: string,
  strength: 'canonical' | 'typical',
): string {
  const adverb = strength === 'canonical' ? 'canonically' : 'typically';
  const verb = EDGE_TYPE_LABELS[type] ?? type;
  const subj = (KIND_MAP[subjectKind]?.label ?? subjectKind).toLowerCase();
  const other = (KIND_MAP[otherKind]?.label ?? otherKind).toLowerCase();
  const s =
    dir === 'out'
      ? `${article(subj)} ${subj} ${adverb} ${verb} ${article(other)} ${other}`
      : `${article(other)} ${other} ${adverb} ${verb} ${article(subj)} ${subj}`;
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

interface Triple {
  dir: 'out' | 'in';
  type: string;
  otherKind: string;
  strength: 'canonical' | 'typical';
}

export function suggestFor(graph: Graph, nodeId: string): Suggestion[] {
  const subject = graph.nodes.find((n) => n.id === nodeId);
  if (!subject) return [];
  const kind = subject.kind;

  // adjacency (undirected) for triangle-closing + directed sets for existing-edge exclusion
  const neighbours = new Map<string, Set<string>>();
  const outExisting = new Set<string>(); // `${type}|${dstId}` for edges where subject is src
  const inExisting = new Set<string>(); // `${type}|${srcId}` for edges where subject is dst
  for (const e of graph.edges) {
    if (!neighbours.has(e.srcId)) neighbours.set(e.srcId, new Set());
    if (!neighbours.has(e.dstId)) neighbours.set(e.dstId, new Set());
    neighbours.get(e.srcId)!.add(e.dstId);
    neighbours.get(e.dstId)!.add(e.srcId);
    if (e.srcId === nodeId) outExisting.add(`${e.type}|${e.dstId}`);
    if (e.dstId === nodeId) inExisting.add(`${e.type}|${e.srcId}`);
  }
  const subjectNeighbours = neighbours.get(nodeId) ?? new Set<string>();

  const closesTriangle = (candId: string): boolean => {
    const cn = neighbours.get(candId);
    if (!cn) return false;
    for (const m of cn) if (m !== candId && subjectNeighbours.has(m)) return true;
    return false;
  };

  // collect out+in triples (canonical/typical only) in ONTOLOGY order, then stable-sort by strength
  const triples: Triple[] = [];
  for (const t of ONTOLOGY) {
    if (t.strength === 'possible') continue;
    const strength = t.strength; // 'canonical' | 'typical'
    if (t.src === kind) triples.push({ dir: 'out', type: t.type, otherKind: t.dst, strength });
    if (t.dst === kind) triples.push({ dir: 'in', type: t.type, otherKind: t.src, strength });
  }
  triples.sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength]);

  const suggestions: Suggestion[] = [];
  for (const t of triples) {
    const pool = graph.nodes.filter((n) => {
      if (n.kind !== t.otherKind || n.id === nodeId) return false;
      const key = `${t.type}|${n.id}`;
      return t.dir === 'out' ? !outExisting.has(key) : !inExisting.has(key);
    });
    const anyOfKind = graph.nodes.some((n) => n.kind === t.otherKind && n.id !== nodeId);
    if (pool.length === 0 && anyOfKind) continue; // satisfied — every node of otherKind already linked

    const candidates = pool
      .map((n) => ({ id: n.id, title: n.title ?? '', triangle: closesTriangle(n.id) }))
      .sort((a, b) => (a.triangle === b.triangle ? a.title.localeCompare(b.title) : a.triangle ? -1 : 1))
      .slice(0, MAX_CANDIDATES)
      .map((c) => c.id);

    suggestions.push({
      nodeId,
      dir: t.dir,
      type: t.type,
      otherKind: t.otherKind,
      strength: t.strength,
      candidates,
      reason: reasonFor(kind, t.dir, t.type, t.otherKind, t.strength),
    });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }
  return suggestions;
}

export function suggestStats(graph: Graph): { nodes: number; total: number; topNodeId: string | null } {
  let total = 0;
  let nodes = 0;
  let topNodeId: string | null = null;
  let topCount = 0;
  for (const n of graph.nodes) {
    const count = suggestFor(graph, n.id).length;
    if (count > 0) {
      nodes++;
      total += count;
      if (count > topCount) {
        topCount = count;
        topNodeId = n.id;
      }
    }
  }
  return { nodes, total, topNodeId };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- suggest`
Expected: PASS (all suggest.test.ts cases).

- [ ] **Step 5: Run check and commit**

Run: `npm run check` → expected: no errors.
Run: `npm run test` → expected: all suites pass.

```bash
git add web/src/lib/suggest.ts web/tests/unit/suggest.test.ts
git commit -m "feat: add lib/suggest.ts ontology-driven edge suggestions"
```

---

### Task 2: Decouple `query.test.ts` and `lint.test.ts` from sample content

These two unit suites hard-code assertions about the *current* 27-node sample (specific ids like `name-bropilot`, `capability-collect`, exact finding counts). Task 3 replaces the sample, which would break them. Decouple them **first**, using a frozen fixture that reproduces the current sample so every assertion stays green and meaningful without depending on `sample.ts`.

**Files:**
- Modify: `web/tests/unit/query.test.ts` — replace `SAMPLE_GRAPH` import with a local `FIXTURE`.
- Modify: `web/tests/unit/lint.test.ts` — remove the `SAMPLE_GRAPH`-based describe block; keep the content-independent ones.

**Interfaces:**
- Consumes: `query.ts` exports `runQuery, validateQuery, whyChain, realization, evidence, neighborhood, contextMarkdown, type GraphQuery`; `schema.ts` `type Graph`.

- [ ] **Step 1: Add the frozen FIXTURE to `query.test.ts`**

In `web/tests/unit/query.test.ts`, delete the line `import { SAMPLE_GRAPH } from '../../src/lib/sample';` and add, directly below the existing `import type { Graph } from '../../src/lib/schema';` line, this fixture (the exact structure the assertions in this file rely on — lifted from the pre-swap sample):

```ts
// Frozen fixture: a self-contained graph reproducing the structure these query
// assertions depend on. Decoupled from src/lib/sample.ts so the rich-sample
// swap (Task 3) cannot break query-engine tests.
const FIXTURE: Graph = {
  nodes: [
    { id: 'name-bropilot', kind: 'name', title: 'Bropilot Studio', description: 'A studio for collecting and visualising the knowledge graph of a system.', props: {} },
    { id: 'purpose-shared-understanding', kind: 'purpose', title: 'Shared understanding, codified', description: 'Capture the why, the what and the how of a system in one navigable graph.', props: {} },
    { id: 'capability-collect', kind: 'capability', title: 'Guided collection', description: 'Structured forms walk you through every kind of knowledge a system has.', props: {} },
    { id: 'capability-visualise', kind: 'capability', title: 'Live graph view', description: 'See the whole system as an explorable node-link graph.', props: {} },
    { id: 'capability-portable', kind: 'capability', title: 'Portable spec', description: 'Import / export the Bropilot JSON schema.', props: {} },
    { id: 'persona-architect', kind: 'persona', title: 'System architect', description: 'Owns the shape of the system and keeps the graph honest.', props: { role: 'Designs and curates the knowledge graph' } },
    { id: 'persona-builder', kind: 'persona', title: 'Builder', description: 'Turns the graph into running code.', props: { role: 'Implements modules from the domain' } },
    { id: 'requirement-three-parts', kind: 'requirement', title: 'Three-part model', description: 'Foundations, Domain and Implementation must each be first-class.', props: { priority: 'must' } },
    { id: 'requirement-traceable', kind: 'requirement', title: 'Code traceability', description: 'Every implementation node links to where its code lives.', props: { priority: 'should' } },
    { id: 'usecase-onboard', kind: 'usecase', title: 'Onboard onto a system', description: 'A newcomer reads the graph to understand a system fast.', props: { situation: 'A new engineer joins.' } },
    { id: 'constraint-client-only', kind: 'constraint', title: 'No backend required', description: 'Runs entirely in the browser.', props: { invariant: 'The graph is always usable offline.' } },
    { id: 'goal-faster-alignment', kind: 'goal', title: 'Faster alignment', description: 'Cut the time a team spends arguing about what the system is.', props: { metric: 'Onboarding time trends down.' } },
    { id: 'hypothesis-graph-beats-docs', kind: 'hypothesis', title: 'A graph beats a doc', description: 'A linked graph is retained better than prose docs.', props: { belief: 'People reason about systems as connected things.', validation: 'Users navigate edges more than they read.' } },
    { id: 'term-space', kind: 'term', title: 'Space', description: 'One of four semantic groupings.', props: { aka: ['concern'] } },
    { id: 'entity-node', kind: 'entity', title: 'Node', description: 'A unit of knowledge with a kind, title and description.', props: { attributes: ['id', 'kind', 'title'] } },
    { id: 'entity-edge', kind: 'entity', title: 'Edge', description: 'A typed, directed relationship between two nodes.', props: { attributes: ['id', 'srcId', 'dstId', 'type'] } },
    { id: 'relationship-node-edge', kind: 'relationship', title: 'Nodes connect via Edges', description: 'Edges link a source node to a destination node.', props: { cardinality: 'many-to-many' } },
    { id: 'behaviour-autosave', kind: 'behaviour', title: 'Autosave', description: 'Any change to the graph is persisted to localStorage immediately.', props: {} },
    { id: 'flow-collect', kind: 'flow', title: 'Collect a system', description: 'Walk the three parts and fill in what you know.', props: { steps: ['Name & purpose', 'Domain objects'] } },
    { id: 'screen-studio', kind: 'screen', title: 'Studio', description: 'The single-page workspace hosting all views.', props: {} },
    { id: 'module-store', kind: 'module', title: 'Graph store', description: 'Reactive state + persistence + import/export.', props: { path: 'web/src/lib/store.ts', repo: '' } },
    { id: 'module-schema', kind: 'module', title: 'Schema', description: 'Kind registry, parts, spaces and field defs.', props: { path: 'web/src/lib/schema.ts', repo: '' } },
    { id: 'component-force-graph', kind: 'component', title: 'ForceGraph', description: 'd3-force layout rendered as interactive SVG.', props: { path: 'web/src/components/graph/ForceGraph.vue', repo: '' } },
    { id: 'component-node-form', kind: 'component', title: 'NodeForm', description: 'Dynamic editor generated from a kind’s field defs.', props: { path: 'web/src/components/form/NodeForm.vue', repo: '' } },
    { id: 'interface-graph', kind: 'interface', title: 'Graph', description: 'The serialisable shape: { nodes, edges }.', props: { signature: 'interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }' } },
    { id: 'external-d3', kind: 'external', title: 'd3-force', description: 'Physics simulation for graph layout.', props: { url: 'https://github.com/d3/d3-force' } },
    { id: 'design-glass', kind: 'design', title: 'Glass dark theme', description: 'Translucent panels, per-space accent glows.', props: {} },
  ],
  edges: [
    { id: 'e-1', srcId: 'name-bropilot', dstId: 'capability-collect', type: 'has' },
    { id: 'e-2', srcId: 'name-bropilot', dstId: 'capability-visualise', type: 'has' },
    { id: 'e-3', srcId: 'name-bropilot', dstId: 'capability-portable', type: 'has' },
    { id: 'e-4', srcId: 'capability-collect', dstId: 'requirement-three-parts', type: 'satisfies' },
    { id: 'e-5', srcId: 'persona-architect', dstId: 'usecase-onboard', type: 'triggers' },
    { id: 'e-6', srcId: 'usecase-onboard', dstId: 'screen-studio', type: 'uses' },
    { id: 'e-7', srcId: 'requirement-traceable', dstId: 'module-store', type: 'constrains' },
    { id: 'e-8', srcId: 'relationship-node-edge', dstId: 'entity-node', type: 'references' },
    { id: 'e-9', srcId: 'relationship-node-edge', dstId: 'entity-edge', type: 'references' },
    { id: 'e-10', srcId: 'screen-studio', dstId: 'component-force-graph', type: 'contains' },
    { id: 'e-11', srcId: 'screen-studio', dstId: 'component-node-form', type: 'contains' },
    { id: 'e-12', srcId: 'component-force-graph', dstId: 'external-d3', type: 'uses' },
    { id: 'e-13', srcId: 'component-force-graph', dstId: 'entity-node', type: 'uses' },
    { id: 'e-14', srcId: 'module-store', dstId: 'behaviour-autosave', type: 'implements' },
    { id: 'e-15', srcId: 'module-store', dstId: 'interface-graph', type: 'uses' },
    { id: 'e-16', srcId: 'module-schema', dstId: 'term-space', type: 'implements' },
    { id: 'e-17', srcId: 'flow-collect', dstId: 'screen-studio', type: 'uses' },
    { id: 'e-18', srcId: 'screen-studio', dstId: 'design-glass', type: 'uses' },
    { id: 'e-19', srcId: 'name-bropilot', dstId: 'purpose-shared-understanding', type: 'has' },
    { id: 'e-20', srcId: 'purpose-shared-understanding', dstId: 'goal-faster-alignment', type: 'motivates' },
    { id: 'e-21', srcId: 'hypothesis-graph-beats-docs', dstId: 'goal-faster-alignment', type: 'motivates' },
    { id: 'e-22', srcId: 'hypothesis-graph-beats-docs', dstId: 'capability-visualise', type: 'motivates' },
    { id: 'e-23', srcId: 'goal-faster-alignment', dstId: 'usecase-onboard', type: 'motivates' },
    { id: 'e-24', srcId: 'persona-architect', dstId: 'capability-collect', type: 'uses' },
    { id: 'e-25', srcId: 'persona-builder', dstId: 'capability-portable', type: 'uses' },
    { id: 'e-26', srcId: 'usecase-onboard', dstId: 'capability-visualise', type: 'uses' },
    { id: 'e-27', srcId: 'flow-collect', dstId: 'capability-collect', type: 'uses' },
    { id: 'e-28', srcId: 'component-force-graph', dstId: 'capability-visualise', type: 'implements' },
    { id: 'e-29', srcId: 'module-store', dstId: 'capability-portable', type: 'implements' },
    { id: 'e-30', srcId: 'constraint-client-only', dstId: 'module-store', type: 'constrains' },
    { id: 'e-31', srcId: 'interface-graph', dstId: 'entity-node', type: 'references' },
    { id: 'e-32', srcId: 'interface-graph', dstId: 'entity-edge', type: 'references' },
    { id: 'e-33', srcId: 'module-store', dstId: 'module-schema', type: 'depends_on' },
    { id: 'e-34', srcId: 'component-node-form', dstId: 'module-schema', type: 'uses' },
    { id: 'e-35', srcId: 'purpose-shared-understanding', dstId: 'persona-architect', type: 'serves' },
    { id: 'e-36', srcId: 'purpose-shared-understanding', dstId: 'persona-builder', type: 'serves' },
    { id: 'e-37', srcId: 'purpose-shared-understanding', dstId: 'hypothesis-graph-beats-docs', type: 'depends_on' },
    { id: 'e-38', srcId: 'persona-architect', dstId: 'flow-collect', type: 'triggers' },
    { id: 'e-39', srcId: 'screen-studio', dstId: 'module-store', type: 'uses' },
    { id: 'e-40', srcId: 'capability-portable', dstId: 'constraint-client-only', type: 'depends_on' },
    { id: 'e-41', srcId: 'persona-builder', dstId: 'requirement-traceable', type: 'motivates' },
    { id: 'e-42', srcId: 'entity-node', dstId: 'relationship-node-edge', type: 'has' },
  ],
};
```

- [ ] **Step 2: Repoint every assertion to `FIXTURE`**

In `web/tests/unit/query.test.ts`, replace every occurrence of `SAMPLE_GRAPH` with `FIXTURE`. (There are ~20; a global find-replace of the token `SAMPLE_GRAPH` → `FIXTURE` within this file is exact and safe — the only other identifier was the now-deleted import.)

- [ ] **Step 3: Trim `lint.test.ts` to content-independent cases**

In `web/tests/unit/lint.test.ts`:
- Delete the import line `import { SAMPLE_GRAPH } from '../../src/lib/sample';`.
- Delete the entire first `describe('lintGraph on SAMPLE_GRAPH', () => { ... })` block (lines asserting "exactly the 6 known findings", the off-ontology `module-schema`, the two why-gaps, the three unverified surfaces). That coverage moves to Task 3's `sample.test.ts`.
- Keep all remaining describes (`unknown kinds are skipped`, `robustness against null/malformed entries`, `why-chain and verify-target rules directly`) unchanged — they use inline graphs.

- [ ] **Step 4: Run the tests to verify green**

Run: `npm run test -- query lint`
Expected: PASS. `query.test.ts` behaves identically (FIXTURE reproduces the old sample); `lint.test.ts` keeps its inline-graph cases.

Run: `npm run check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/tests/unit/query.test.ts web/tests/unit/lint.test.ts
git commit -m "test: decouple query/lint unit tests from sample content"
```

---

### Task 3: Rich dogfooded sample — `sample-data.json` wrapper, threshold test, e2e re-anchor

Replace the 27-node demo with a ≥110-node graph of Bropilot modelling itself, stored as JSON with a typed wrapper. The **threshold unit test is the spec-compliance gate** — author the JSON until it passes. Also re-anchor the sample-dependent e2e tests so `npm run e2e` stays green after the swap.

**Files:**
- Create: `web/src/lib/sample-data.json`
- Rewrite: `web/src/lib/sample.ts` (thin typed wrapper)
- Create: `web/tests/unit/sample.test.ts` (threshold gate)
- Modify: `web/tsconfig.json` (only if `npm run check` complains about JSON import — see Step 3)
- Modify: `web/e2e/verification.spec.ts` (re-anchor)
- Modify: `web/e2e/helpers.ts` (add `nMostCentralNodeLabels`)

**Interfaces:**
- Consumes: `store.ts` `importGraph(raw: string): { ok: boolean; error?: string }`; `lint.ts` `lintGraph(graph): Finding[]` (`Finding` has `severity: 'note'|'hint'`, optional `nodeId`, `message`); `schema.ts` `KINDS` (28 `KindDef`), `KIND_MAP`, `EDGE_TYPE_SET` (`Set<string>` of the 17 types), `type Graph`.
- Produces: `SAMPLE_GRAPH: Graph` (same export name/shape as before — `store.ts` imports it unchanged).

**Authoring process (this is the one task where the plan specifies process + acceptance test, not verbatim node content — the graph is data, ~110+ nodes).** Walk the repo systematically and author `sample-data.json` as canonical `{ nodes, edges }` Bropilot JSON. Mine these concrete sources:

- **`web/src/lib/*.ts`** — `schema.ts` (the KINDS registry, ONTOLOGY, edge types → `module`/`interface`/`entity`/`term` nodes: "Schema", "KindDef", "OntologyTriple", "Graph", "GraphNode", "GraphEdge", "Space", "Part"), `store.ts` (`module` "Graph store"; `behaviour` "Autosave", "Undo/redo history"; `state` "localStorage graph"), `lint.ts` (`module`/`logic` "Graph lint", `behaviour` per rule), `query.ts` (`module`/`logic` "Graph query engine", `api`-less BGP), `narrative.ts`, `router.ts`, `toast.ts`, `graphMode.ts`, `sim/*` (`tests` "Ontology simulator").
- **`web/src/components/**`** — `component` nodes: "ForceGraph", "Studio", "Inspector", "RelationshipEditor", "NodeForm", "OverviewView", "PartView", "GraphView"; `screen` "Studio", "Overview", "Graph"; `design` decisions (glass theme, per-space hues).
- **The three skills** `.claude/skills/bropilot-*/SKILL.md` — `capability` "Extract graph from code", "Generate SPA from graph", "Interview to build graph"; `flow` for each.
- **`.github/workflows/ci.yml`** — `tests`/`observability` nodes: "CI pipeline", "check gate", "e2e gate", "sync-skills drift gate"; `external` "GitHub Actions", "Playwright".
- **`web/tests/**` & `web/e2e/**`** — `tests` nodes naming **real files** (`tests/unit/schema.test.ts`, `tests/unit/lint.test.ts`, `tests/unit/query.test.ts`, `tests/unit/narrative.test.ts`, `tests/unit/suggest.test.ts`, `tests/sim/simulator.test.ts`, `e2e/verification.spec.ts`). Do not invent test files that don't exist.
- **`web/README.md`, `CLAUDE.md`, `docs/superpowers/specs/`** — `purpose`, `goal`, `hypothesis`, `persona` ("System architect", "Builder", "Newcomer/onboarding engineer", "The AI agent"), `usecase`, `requirement`, `constraint` ("No backend required", "Single Vue island", "SVG not canvas"), `assumption`.
- **`package.json`** — `external` nodes: "d3-force", "Vue", "Astro", "Vitest", "Playwright", "nanoid", "Tailwind v4", "tsx"; `repository` "bropilot repo".

**Why-chain skeleton (author top-down so lint passes):** `name` → `has` capabilities & purpose; `purpose` → `motivates` goals, `serves` personas; `goal`/`hypothesis`/`persona` → `motivates` capabilities & usecases (so **every capability/usecase has an incoming `motivates`/`serves`** → 0 why-chain gaps); `persona` → `triggers`/`uses` usecases & flows; `capability` → `serves` persona, `satisfies` requirement/usecase; `requirement`/`constraint` → `constrains` modules; domain: `term` → `describes` entity/behaviour, `entity` → `has` relationship, `behaviour` → `emits` event, `event` → `triggers` behaviour/flow, `flow` → `satisfies` usecase & `uses` screen; implementation: `module` → `implements` capability/behaviour, `satisfies` requirement, `exposes` interface, `contains` component/logic, `depends_on` module, `uses` external (so **every module reaches something it implements/satisfies**); `component` → `implements` screen/design; `tests` → `verifies` module/api/behaviour/component; `observability` → `monitors` goal/module.

**Acceptance thresholds (all asserted by `sample.test.ts`):** ≥110 nodes, ≥220 edges; every one of the 28 kinds ≥1, core kinds (`capability, usecase, requirement, term, entity, behaviour, module, api, tests`) ≥4; **0 orphans, 0 why-chain gaps, 1–3 unverified surfaces**; all 17 edge types used ≥1; `references` edges < 5% of edges; every node id matches `{kind}-{kebab-title}`; every node.kind ∈ KIND_MAP; every edge type ∈ EDGE_TYPE_SET and both endpoints resolve.

**Anchor nodes the sample MUST contain (protect e2e; asserted by `sample.test.ts`):**
- `persona-architect` titled **"System architect"** (used by e2e persona tests).
- `module-store` titled **"Graph store"**, verified by a tests node (copy-context + drag control).
- a `component` whose id is `component-force-graph` titled **"ForceGraph"**.
- Deliberately leave **1–3** `module`/`api`/`behaviour` nodes with no incoming `verifies` (so the health card always has content). Keep `module-store` verified; spend the unverified budget on other surfaces.

- [ ] **Step 1: Write the failing threshold test**

Create `web/tests/unit/sample.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SAMPLE_GRAPH } from '../../src/lib/sample';
import sampleJson from '../../src/lib/sample-data.json';
import { importGraph } from '../../src/lib/store';
import { lintGraph } from '../../src/lib/lint';
import { KINDS, KIND_MAP, EDGE_TYPE_SET, kebab } from '../../src/lib/schema';

const CORE = ['capability', 'usecase', 'requirement', 'term', 'entity', 'behaviour', 'module', 'api', 'tests'];

describe('SAMPLE_GRAPH passes importGraph validation', () => {
  it('imports without error through the store validation path', () => {
    const res = importGraph(JSON.stringify(sampleJson));
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });
});

describe('SAMPLE_GRAPH size & coverage thresholds', () => {
  const { nodes, edges } = SAMPLE_GRAPH;

  it('has at least 110 nodes and 220 edges', () => {
    expect(nodes.length).toBeGreaterThanOrEqual(110);
    expect(edges.length).toBeGreaterThanOrEqual(220);
  });

  it('uses every one of the 28 kinds at least once', () => {
    const present = new Set(nodes.map((n) => n.kind));
    for (const k of KINDS) expect(present.has(k.kind), `missing kind: ${k.kind}`).toBe(true);
  });

  it('has at least 4 of each core kind', () => {
    for (const k of CORE) {
      expect(nodes.filter((n) => n.kind === k).length, `core kind ${k} < 4`).toBeGreaterThanOrEqual(4);
    }
  });

  it('uses all 17 edge types at least once', () => {
    const used = new Set(edges.map((e) => e.type));
    for (const t of EDGE_TYPE_SET) expect(used.has(t), `edge type never used: ${t}`).toBe(true);
  });

  it('keeps references edges under 5% of all edges', () => {
    const refs = edges.filter((e) => e.type === 'references').length;
    expect(refs / edges.length).toBeLessThan(0.05);
  });
});

describe('SAMPLE_GRAPH structural integrity', () => {
  const { nodes, edges } = SAMPLE_GRAPH;
  const ids = new Set(nodes.map((n) => n.id));

  it('every node id matches {kind}-{kebab-title} and every kind is known', () => {
    for (const n of nodes) {
      expect(KIND_MAP[n.kind], `unknown kind: ${n.kind}`).toBeTruthy();
      expect(n.id, `id mismatch for "${n.title}"`).toBe(`${n.kind}-${kebab(n.title)}`);
    }
  });

  it('every node has a 1-2 sentence non-empty description', () => {
    for (const n of nodes) expect(n.description.trim().length, `empty description: ${n.id}`).toBeGreaterThan(0);
  });

  it('every edge references known types and resolvable endpoints', () => {
    for (const e of edges) {
      expect(EDGE_TYPE_SET.has(e.type), `unknown edge type: ${e.type}`).toBe(true);
      expect(ids.has(e.srcId), `dangling srcId: ${e.srcId}`).toBe(true);
      expect(ids.has(e.dstId), `dangling dstId: ${e.dstId}`).toBe(true);
    }
  });
});

describe('SAMPLE_GRAPH lint thresholds', () => {
  const findings = lintGraph(SAMPLE_GRAPH);

  it('has zero orphans', () => {
    expect(findings.filter((f) => f.message.includes('has no relationships yet'))).toHaveLength(0);
  });

  it('has zero why-chain gaps', () => {
    expect(findings.filter((f) => f.message.includes('Nothing says why'))).toHaveLength(0);
  });

  it('has between 1 and 3 unverified surfaces (health card always has content)', () => {
    const unverified = findings.filter((f) => f.message.includes('No test evidence'));
    expect(unverified.length).toBeGreaterThanOrEqual(1);
    expect(unverified.length).toBeLessThanOrEqual(3);
  });
});

describe('SAMPLE_GRAPH e2e anchor nodes', () => {
  const byId = (id: string) => SAMPLE_GRAPH.nodes.find((n) => n.id === id);

  it('contains the persona-architect anchor titled "System architect"', () => {
    expect(byId('persona-architect')?.title).toBe('System architect');
  });

  it('contains the module-store anchor titled "Graph store", with incoming verifies', () => {
    expect(byId('module-store')?.title).toBe('Graph store');
    const verified = SAMPLE_GRAPH.edges.some((e) => e.dstId === 'module-store' && e.type === 'verifies');
    expect(verified).toBe(true);
  });

  it('contains the component-force-graph anchor titled "ForceGraph"', () => {
    expect(byId('component-force-graph')?.title).toBe('ForceGraph');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- sample`
Expected: FAIL — `Cannot find module '../../src/lib/sample-data.json'` (and, once created but sparse, threshold assertions fail).

- [ ] **Step 3: Create `sample-data.json` and the wrapper**

Create `web/src/lib/sample-data.json` as `{ "nodes": [...], "edges": [...] }` authored per the process/skeleton/anchors above. Then rewrite `web/src/lib/sample.ts` to:

```ts
import type { Graph } from './schema';
import data from './sample-data.json';

// The dogfooded sample: Bropilot Studio modelling itself, extracted from this
// repo. Canonical { nodes, edges } Bropilot JSON in sample-data.json; this
// wrapper just types it. Seeded on first run; wiped on import/reset.
export const SAMPLE_GRAPH: Graph = data as Graph;
```

JSON-import note: `astro/tsconfigs/strict` enables `resolveJsonModule`, and Vite/Vitest resolve JSON natively. If `npm run check` reports a JSON-import error, add `"resolveJsonModule": true` to `compilerOptions` in `web/tsconfig.json` (do not change other options).

- [ ] **Step 4: Author until the threshold test passes**

Iterate: run `npm run test -- sample`, read the failing assertion (each carries a message naming the missing kind / edge type / bad id), extend `sample-data.json`, repeat until green. Then confirm the id format: every `id` must equal `{kind}-{kebab(title)}` (the test enforces this — use the same `kebab` from `schema.ts`).

Run: `npm run test -- sample`
Expected: PASS (all threshold/anchor assertions).

- [ ] **Step 5: Confirm the full unit suite and check are green**

Run: `npm run test`
Expected: PASS. (`query.test.ts` and `lint.test.ts` are already decoupled from Task 2; `narrative.test.ts` and `schema.test.ts` never referenced the sample; sim tests are content-independent.)

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Add the central-node helper to e2e**

Append to `web/e2e/helpers.ts`:

```ts
/**
 * Return the label text of the N node circles closest to the SVG canvas
 * centre, in instance mode. Central nodes are guaranteed away from the fixed
 * corner overlays (title, mode toggle, legend), so clicking/dragging them
 * survives any sample layout — unlike hard-coded node titles, whose fitted
 * positions depend entirely on sample content.
 */
export async function nMostCentralNodeLabels(page: Page, n: number): Promise<string[]> {
  return page.evaluate((count) => {
    const svg = document.querySelector('svg');
    if (!svg) return [] as string[];
    const r = svg.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const items: { label: string; d: number }[] = [];
    for (const g of document.querySelectorAll('svg g.cursor-pointer')) {
      const circles = g.querySelectorAll('circle');
      const own = circles[circles.length - 1];
      const text = g.querySelector('text');
      if (!own || !text) continue;
      const b = own.getBoundingClientRect();
      const x = b.x + b.width / 2;
      const y = b.y + b.height / 2;
      items.push({ label: text.textContent ?? '', d: Math.hypot(x - cx, y - cy) });
    }
    items.sort((a, b) => a.d - b.d);
    return items.slice(0, count).map((i) => i.label);
  }, n);
}
```

- [ ] **Step 7: Re-anchor the sample-dependent e2e tests**

Edit `web/e2e/verification.spec.ts`:

1. Add `KIND_MAP` to the schema import and `nMostCentralNodeLabels` to the helpers import:
   ```ts
   import {
     freshPage, clickInspectorTab, waitForGraphSettle, svgNodeLabel,
     clickSvgNode, dragSvgNode, clickFit, readClipboard, nMostCentralNodeLabels,
   } from './helpers';
   import { KINDS, KIND_MAP } from '../src/lib/schema';
   ```
   Just below `const SAMPLE_FINDINGS = lintGraph(SAMPLE_GRAPH);` add a derived anchor for the finding-driven tests:
   ```ts
   // First lint finding that points at a node — used to drive the health-card
   // navigation and Inspector-badge tests without hard-coding a node id that
   // depends on sample content.
   const FINDING = SAMPLE_FINDINGS.find((f) => f.nodeId)!;
   const FINDING_NODE = SAMPLE_GRAPH.nodes.find((n) => n.id === FINDING.nodeId)!;
   const FINDING_PART = KIND_MAP[FINDING_NODE.kind].part;
   ```

2. **Test 6 (health card navigation)** — replace the hard-coded `'Schema'` / `module-schema` body with the derived finding:
   ```ts
   await health.locator('li button', { hasText: FINDING_NODE.title }).first().click();
   await expect(page).toHaveURL(new RegExp(`#/${FINDING_PART}/${FINDING_NODE.id}$`));
   await clickInspectorTab(page, 'Details');
   await expect(page.locator('code', { hasText: FINDING_NODE.id })).toBeVisible();
   ```
   (Keep the `await expect(health.locator('li')).toHaveCount(SAMPLE_FINDINGS.length);` assertion — the suggestions row added in Task 5 is NOT an `<li>`, so this count stays correct.)

3. **Test 7 (Inspector badge)** — navigate to the finding node instead of `module-store`:
   ```ts
   await freshPage(page, `#/${FINDING_PART}/${FINDING_NODE.id}`);
   await clickInspectorTab(page, 'Details');
   const findingsForNode = SAMPLE_FINDINGS.filter((f) => f.nodeId === FINDING_NODE.id).length;
   expect(findingsForNode).toBeGreaterThan(0);
   await expect(page.getByText(`⚠ ${findingsForNode}`, { exact: true })).toBeVisible();
   ```

4. **Test 8 (copy context)** — unchanged; keeps `#/implementation/module-store` and `'# Graph store'` (both are guaranteed anchors).

5. **Regression — "health card navigation works with a prior selection"** — apply the same substitution as Test 6 (click `hasText: FINDING_NODE.title`, assert the `#/${FINDING_PART}/${FINDING_NODE.id}$` URL, assert `code` shows `FINDING_NODE.id`). The keep-count assertion stays `SAMPLE_FINDINGS.length`.

6. **Regression — "relayout preserves dragged instance positions"** — replace the two hard-coded labels (`'ForceGraph'`, `'Graph store'`) with runtime-central nodes, and replace the absolute control-drift sanity check with a **relative-distance** check that survives a dense graph (dragging one node in a 110-node force sim nudges neighbours, so an untouched control is no longer motionless — but the drag still changes the *relative* geometry, whereas a background pan would not). After `await clickFit(page);` at the top of the test:
   ```ts
   const [dragLabel, controlLabel] = await nMostCentralNodeLabels(page, 2);

   const draggedBefore = await svgNodeLabel(page, dragLabel).first().boundingBox();
   const controlBefore = await svgNodeLabel(page, controlLabel).first().boundingBox();
   expect(draggedBefore).not.toBeNull();
   expect(controlBefore).not.toBeNull();
   const relBefore = Math.hypot(draggedBefore!.x - controlBefore!.x, draggedBefore!.y - controlBefore!.y);

   await dragSvgNode(page, dragLabel, 140, -90);
   await page.waitForTimeout(300);
   const draggedRightAfter = await svgNodeLabel(page, dragLabel).first().boundingBox();
   const controlRightAfter = await svgNodeLabel(page, controlLabel).first().boundingBox();
   expect(draggedRightAfter).not.toBeNull();
   expect(controlRightAfter).not.toBeNull();
   const dragDistance = Math.hypot(
     draggedRightAfter!.x - draggedBefore!.x,
     draggedRightAfter!.y - draggedBefore!.y,
   );
   const relAfter = Math.hypot(
     draggedRightAfter!.x - controlRightAfter!.x,
     draggedRightAfter!.y - controlRightAfter!.y,
   );
   expect(dragDistance).toBeGreaterThan(60); // the dragged node moved substantially
   expect(Math.abs(relAfter - relBefore)).toBeGreaterThan(40); // relative geometry changed → a drag, not a background pan

   await waitForGraphSettle(page);
   await clickFit(page);
   const boxAfterDrag = await svgNodeLabel(page, dragLabel).first().boundingBox();
   expect(boxAfterDrag).not.toBeNull();
   ```
   Then in the remainder of the test replace the two later `svgNodeLabel(page, 'ForceGraph')` reads with `svgNodeLabel(page, dragLabel)` (the ontology round-trip + relayout preservation assertion on `boxAfterRoundTrip` vs `boxAfterDrag` is otherwise unchanged).

7. **Tests 1, 2, 4, 5 and regression "search escapes ontology mode"** are unchanged — they rely on `persona-architect` / "System architect" (a guaranteed anchor) and on ontology mode (which renders `KINDS`, independent of the sample).

- [ ] **Step 8: Run e2e and commit**

Run: `npx playwright install chromium` (first time only)
Run: `npm run e2e`
Expected: PASS (all verification specs, including the re-anchored ones).

```bash
git add web/src/lib/sample-data.json web/src/lib/sample.ts web/tests/unit/sample.test.ts \
        web/e2e/verification.spec.ts web/e2e/helpers.ts web/tsconfig.json
git commit -m "feat: dogfooded rich sample graph + threshold gate; re-anchor e2e"
```

---

### Task 4: Inspector — "Suggestions" section

Add a Suggestions section below Relationships in the Inspector's Details tab. Each suggestion is one row (reason + up to 3 candidate buttons); clicking a candidate adds the edge immediately (undoable, toast). Zero-candidate suggestions render as muted guidance. Per-node, per-session dismissible (a "hide" affordance, not persisted).

**Files:**
- Modify: `web/src/components/form/Inspector.vue`

**Interfaces:**
- Consumes: `suggest.ts` `suggestFor(graph, nodeId): Suggestion[]` and `Suggestion` (Task 1); `store.ts` `state`, `addEdge(srcId, dstId, type)`, `undo`, `getNode(id)`; `toast.ts` `toast(message, { action: { label, handler } })`; `schema.ts` `KIND_MAP`.

- [ ] **Step 1: Add script logic**

In `web/src/components/form/Inspector.vue`, extend the `<script setup>`:

- Add imports:
  ```ts
  import { addEdge } from '../../lib/store';
  import { suggestFor, type Suggestion } from '../../lib/suggest';
  ```
  (Merge `addEdge` into the existing `from '../../lib/store'` import; `state, getNode, removeNode, edgesOf, undo` are already imported.)

- Add reactive dismissal state + computed suggestions (place after the existing `nodeFindings` computed):
  ```ts
  // per-node, per-session dismissals — a Set of suggestion keys, reset when the node changes
  const hidden = ref<Set<string>>(new Set());
  watch(
    () => node.value?.id,
    () => {
      hidden.value = new Set();
    },
  );

  const suggestKey = (s: Suggestion) => `${s.dir}|${s.type}|${s.otherKind}`;

  const suggestions = computed(() =>
    node.value ? suggestFor(state.graph, node.value.id).filter((s) => !hidden.value.has(suggestKey(s))) : [],
  );

  function candidateTitle(id: string): string {
    return getNode(id)?.title ?? id;
  }
  function candidateIcon(id: string): string {
    const n = getNode(id);
    return n ? KIND_MAP[n.kind]?.icon ?? '•' : '•';
  }

  function applySuggestion(s: Suggestion, candidateId: string) {
    if (!node.value) return;
    const added =
      s.dir === 'out'
        ? addEdge(node.value.id, candidateId, s.type)
        : addEdge(candidateId, node.value.id, s.type);
    if (added) {
      toast(`Linked “${candidateTitle(candidateId)}”`, { action: { label: 'Undo', handler: undo } });
    }
  }

  function hideSuggestion(s: Suggestion) {
    hidden.value = new Set(hidden.value).add(suggestKey(s));
  }
  ```
  (`ref`, `computed`, `watch` are already imported from `vue`; `KIND_MAP` and `toast` are already imported.)

- [ ] **Step 2: Add the template section**

In the Details tab, immediately after the `Relationships` `<section>` (the one containing `<RelationshipEditor :node="node" />`) and before the `Sources` section, insert:

```html
<section v-if="suggestions.length">
  <h3 class="label mb-3">Suggestions</h3>
  <ul class="space-y-2">
    <li v-for="s in suggestions" :key="`${s.dir}-${s.type}-${s.otherKind}`" class="group border hairline bg-ink-950 px-2.5 py-2">
      <div class="flex items-start justify-between gap-2">
        <p class="text-xs leading-relaxed text-ink-300">{{ s.reason }}</p>
        <button
          class="btn btn-ghost shrink-0 !px-1.5 !py-0.5 text-xs opacity-0 group-hover:opacity-100"
          title="Hide this suggestion"
          @click="hideSuggestion(s)"
        >✕</button>
      </div>
      <div v-if="s.candidates.length" class="mt-1.5 flex flex-wrap gap-1.5">
        <button
          v-for="cid in s.candidates.slice(0, 3)"
          :key="cid"
          class="btn btn-ghost !px-2 !py-1 text-[0.68rem]"
          :title="`Add: ${s.dir === 'out' ? node!.title : candidateTitle(cid)} ${s.type} ${s.dir === 'out' ? candidateTitle(cid) : node!.title}`"
          @click="applySuggestion(s, cid)"
        >
          <span class="font-mono uppercase tracking-[0.08em] text-accent">{{ s.type }}</span>
          <span class="ml-1 truncate">{{ candidateIcon(cid) }} {{ candidateTitle(cid) }}</span>
        </button>
      </div>
      <p v-else class="mt-1 text-[0.68rem] italic text-ink-400">
        No {{ s.otherKind }} node exists yet to connect.
      </p>
    </li>
  </ul>
</section>
```

- [ ] **Step 3: Verify it renders and behaves**

Run: `npm run check` → expected: no errors.
Run: `npm run build` → expected: success (a passing build does not prove render — the e2e in Task 6 does).
Start `npm run dev`, open `http://localhost:4433/#/implementation/module-store`, click Details: a Suggestions section appears below Relationships; a candidate button adds an edge (visible in Relationships) and fires an "Undo" toast; the ✕ hides a suggestion.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/form/Inspector.vue
git commit -m "feat: Inspector Suggestions section (advisory, undoable)"
```

---

### Task 5: Overview health card — suggestions row

Add one row to the Overview health card: "⚡ N suggested connections across M nodes". Clicking selects `topNodeId` and navigates to its part via the existing `emit('navigate')` pattern.

**Files:**
- Modify: `web/src/components/views/OverviewView.vue`

**Interfaces:**
- Consumes: `suggest.ts` `suggestStats(graph): { nodes, total, topNodeId }`; the existing `jump(nodeId?)` function (already sets `state.selectedId` and `emit('navigate', part)`); `state`.

- [ ] **Step 1: Add the stats computed**

In `web/src/components/views/OverviewView.vue` `<script setup>`, add the import and computed (after the existing `findings` computed):

```ts
import { suggestStats } from '../../lib/suggest';

const suggestions = computed(() => suggestStats(state.graph));
```

- [ ] **Step 2: Render the row inside the health card**

Change the graph-health `<section>` opening tag so it shows when there are findings **or** suggestions:

```html
<section v-if="findings.length || suggestions.total" class="mt-4 border hairline bg-ink-900 px-5 py-4">
```

Then, immediately after the `<h3 class="display text-xl">Graph health</h3>` line (and before the findings `<p>`/`<ul>`), insert the suggestions row as a **non-`<li>`** element (so the e2e `health.locator('li')` finding-count assertion is unaffected):

```html
<button
  v-if="suggestions.total"
  class="mt-2 flex w-full items-center gap-2 text-left text-xs text-ink-200 transition hover:text-accent"
  @click="jump(suggestions.topNodeId ?? undefined)"
>
  <span>⚡</span>
  <span>{{ suggestions.total }} suggested connection{{ suggestions.total > 1 ? 's' : '' }} across {{ suggestions.nodes }} node{{ suggestions.nodes > 1 ? 's' : '' }}</span>
  <span class="ml-auto text-ink-400">Review →</span>
</button>
```

(The existing `findings.length`-gated `<p>`/`<ul>` block stays; when `findings.length` is 0 but suggestions exist, the section still renders with just this row.)

- [ ] **Step 3: Verify**

Run: `npm run check` → expected: no errors.
Run `npm run dev`, open `http://localhost:4433/#/overview`: the health card shows the "⚡ N suggested connections across M nodes" row; clicking it navigates into a part with a node selected.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/views/OverviewView.vue
git commit -m "feat: Overview health-card suggestions row"
```

---

### Task 6: e2e — suggestion flow + overview row

Codify the two new UI surfaces in Playwright, content-robustly (drive via `topNodeId` so no sample id is hard-coded).

**Files:**
- Modify: `web/e2e/verification.spec.ts` (append two test blocks)

**Interfaces:**
- Consumes: helpers `freshPage`, `clickInspectorTab`; the Overview suggestions row (Task 5); the Inspector Suggestions section (Task 4).

- [ ] **Step 1: Write the failing tests**

Append to `web/e2e/verification.spec.ts`:

```ts
test.describe('9 — overview suggestions row navigates', () => {
  test('clicking the suggestions row selects the top node and opens its part', async ({ page }) => {
    await freshPage(page, '#/overview');

    const row = page.getByRole('button', { name: /suggested connection/ });
    await expect(row).toBeVisible();
    await row.click();

    // lands on a part route with a node selected (not overview, not bare graph)
    await expect(page).toHaveURL(/#\/(foundations|domain|implementation|graph)\/[a-z0-9-]+$/);
  });
});

test.describe('10 — Inspector suggestion adds an edge', () => {
  test('clicking a suggestion candidate adds a relationship row and fires a toast', async ({ page }) => {
    // navigate via the overview row to the node with the most suggestions (guaranteed to have candidates)
    await freshPage(page, '#/overview');
    await page.getByRole('button', { name: /suggested connection/ }).click();
    await clickInspectorTab(page, 'Details');

    const suggestions = page.locator('section', {
      has: page.getByRole('heading', { level: 3, name: 'Suggestions' }),
    });
    await expect(suggestions).toBeVisible();

    // a candidate button carries an "Add: …" title — pick the first
    const candidate = suggestions.locator('button[title^="Add:"]').first();
    await expect(candidate).toBeVisible();

    const relationships = page.locator('section', {
      has: page.getByRole('heading', { level: 3, name: 'Relationships' }),
    });
    const rowsBefore = await relationships.locator('ul li').count();

    await candidate.click();

    await expect(relationships.locator('ul li')).toHaveCount(rowsBefore + 1);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible(); // toast action
  });
});
```

- [ ] **Step 2: Run to verify (they should pass against Tasks 4 & 5)**

Run: `npm run e2e -- --grep "suggestions row|Inspector suggestion"`
Expected: PASS. (If the top node's suggestions were somehow all zero-candidate, test 10 would fail on the `candidate` locator — for a ≥110-node graph the max-suggestion node is guaranteed to have candidate buttons; if it ever regresses, that is a real signal, not flakiness.)

- [ ] **Step 3: Full green + commit**

Run: `npm run check` → no errors.
Run: `npm run test` → all pass.
Run: `npm run e2e` → all pass.

```bash
git add web/e2e/verification.spec.ts
git commit -m "test: e2e for suggestion flow and overview suggestions row"
```

---

## Self-Review

**1. Spec coverage:**
- Part 1 rich SAMPLE_GRAPH + all numeric thresholds → Task 3 (`sample.test.ts` gate) + Task 2 (decouple). ✓
- Storage move to `sample-data.json` + typed wrapper + importGraph validation test → Task 3. ✓
- `lib/suggest.ts` full interface (suggestFor/suggestStats, ranking, ordering, exclusion, caps, zero-candidate, possible excluded) → Task 1. ✓
- Inspector Suggestions section (candidate add + toast + undo, hide, zero-candidate guidance) → Task 4. ✓
- Overview health-card suggestions row (suggestStats, navigate via emit) → Task 5. ✓
- e2e (suggestion click flow + overview row) → Task 6; existing e2e re-anchored → Task 3. ✓
- Constraints (no schema/ONTOLOGY change, no deps, advisory, sim content-independent, seeding unchanged) → Global Constraints. ✓

**2. Placeholder scan:** No TBD/TODO. The only "process not verbatim content" is Task 3's `sample-data.json` authoring — deliberate and spec-sanctioned (the graph is data; the threshold test is the acceptance gate), with concrete sources, a why-chain skeleton, and anchor requirements enumerated.

**3. Type consistency:** `Suggestion` shape and `suggestFor`/`suggestStats` signatures defined in Task 1 are consumed verbatim in Tasks 4/5. `suggestKey` format (`dir|type|otherKind`) is internal to Task 4. `FINDING_NODE`/`FINDING_PART` defined once in Task 3. Helper `nMostCentralNodeLabels` defined in Task 3 Step 6, used in Step 7. Anchor ids (`persona-architect`, `module-store`, `component-force-graph`) are asserted in `sample.test.ts` and relied on by e2e.
