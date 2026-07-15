---
name: bropilot-extract
description: Analyze a codebase and produce a Bropilot-compatible knowledge graph (spec). Use when the user wants to extract a Bropilot graph/spec from an existing repo, or reverse-engineer code into the Bropilot schema (basics/problem/solution/crosscutting spaces).
---

# Bropilot Extract: Repo → Spec

Analyze a codebase and produce a Bropilot-compatible knowledge graph.

**Related**: Use `/bropilot-generate` to scaffold code from a graph.

---

## Bropilot Schema

### Spaces

| Space | Purpose |
|-------|---------|
| **basics** | What is this app? |
| **problem** | Who uses it and why? |
| **solution** | How does it work? |
| **crosscutting** | Spans all concerns |

### Node Kinds

```
BASICS (singular where noted)
  name        — App name [singular]
  purpose     — Core mission [singular]
  capability  — High-level features

PROBLEM
  persona     — User types/roles
  usecase     — What users accomplish
  constraint  — Hard limitations
  assumption  — Things assumed true
  requirement — Must-have functionality
  goal        — Value delivered, above and beyond
  hypothesis  — Unvalidated belief about value

SOLUTION
  entity       — Domain objects/models
  relationship — How entities connect
  term         — Ubiquitous-language definition
  flow         — Step-by-step journeys
  screen       — UI views/pages
  module       — Logical groupings
  component    — Reusable UI pieces
  interface    — Contracts/types
  api          — Backend endpoints
  event        — System events
  state        — Tracked data
  behaviour    — Business rules
  logic        — Algorithms

CROSSCUTTING
  repository    — Code/data locations
  tests         — Testing strategy
  observability — Logging/monitoring
  external      — Third-party services
  design        — Visual/UX decisions
```

Note: `flow` and `screen` live in the **solution** space (they describe how the domain is realised in UI), not problem — don't group them with persona/usecase/constraint.

### Edge Types

```
has         — Parent contains child
uses        — Runtime dependency
triggers    — Causes action
implements  — Realizes spec
depends_on  — Build/logical dependency
extends     — Specializes/inherits
contains    — Structural containment
references  — Points to without ownership
```

---

## Extraction Process

### 1. Basics

| Source | Node |
|--------|------|
| `package.json` name | `name` |
| README.md first paragraph | `purpose` |
| README features list | `capability` (one per feature) |
| package.json description | `purpose` or `capability` |

### 2. Problem Space

| Source | Node |
|--------|------|
| Auth roles, user types in code | `persona` |
| README "Usage" or user stories | `usecase` |
| `.env.example` required vars | `constraint` |
| README caveats, limitations | `constraint` |
| Comments with ASSUME/ASSUMPTION | `assumption` |
| README "success looks like", OKRs, metrics | `goal` |
| Comments/docs with "we believe"/HYPOTHESIS | `hypothesis` |

### 3. Solution Space

| Source | Node |
|--------|------|
| TypeScript interfaces | `entity` |
| `src/components/*.tsx`, `*.vue`, `*.astro` | `component` |
| API route handlers | `api` |
| State stores, contexts | `state` |
| Event emitters, handlers | `event` |
| Utility functions with business logic | `behaviour` |
| Algorithm implementations | `logic` |
| Routes/pages directory | `screen` |
| Multi-step flows in comments/docs | `flow` |
| Glossary, domain docs, JSDoc on shared types | `term` |

### 4. Crosscutting

| Source | Node |
|--------|------|
| `*.test.ts`, `__tests__/` | `tests` |
| Logger setup, metrics | `observability` |
| Third-party SDK imports | `external` |
| Design tokens, theme files | `design` |

### 5. Edges

| Pattern | Edge Type |
|---------|-----------|
| Import A from B | A `uses` B |
| Component renders child | Parent `contains` child |
| Route renders component | Screen `has` component |
| Class implements interface | `implements` |
| Test covers function | Test `references` function |

---

## Node Structure

```json
{
  "id": "entity-user",
  "kind": "entity",
  "title": "User",
  "description": "A registered user with email, name, and role.",
  "props": { "attributes": ["email", "name", "role"] },
  "sourceRefs": [
    { "turnId": "extract", "excerpt": "src/lib/types.ts:15" }
  ]
}
```

### props (kind-specific fields)

Several kinds carry extra fields beyond title/description, stored in `node.props`. Populate them when the source gives a confident answer — omit rather than guess:

| Kind | Prop(s) | Derive from |
|------|---------|-------------|
| `persona` | `role` | Role/context description |
| `requirement` | `priority` (must/should/could/wont) | Language cues ("critical", "nice to have") |
| `usecase` | `situation` | The triggering context |
| `constraint` | `invariant` | What must always remain true |
| `goal` | `metric` | Stated success metric |
| `hypothesis` | `belief`, `validation` | "We believe…" / "We will know…" framing |
| `term` | `aka` | Synonyms |
| `entity` | `attributes` | Field list from the type/schema definition |
| `relationship` | `cardinality` | one-to-one / one-to-many / many-to-many |
| `flow` | `steps` | Ordered step list |
| `module`, `component`, `logic` | `path`, `repo` | File path and repo/source link |
| `api` | `method`, `route`, `repo` | HTTP method, route pattern, source link |
| `repository`, `external` | `url` | Repo or docs URL |

### ID Convention

`{kind}-{kebab-title}` — e.g., `screen-dashboard`, `entity-user`, `component-sidebar`

### sourceRefs

Include file:line for traceability:
```json
{ "turnId": "extract", "excerpt": "src/components/Button.tsx:1" }
```

---

## Output Format

### JSON (preferred for programmatic use)

```json
{
  "nodes": [
    { "id": "...", "kind": "...", "title": "...", "description": "...", "sourceRefs": [...] }
  ],
  "edges": [
    { "id": "...", "srcId": "...", "dstId": "...", "type": "...", "label": "..." }
  ]
}
```

### Markdown (human-readable)

```markdown
# Knowledge Graph Export

## Basics
### Name
#### AppName
The application name...

### Capability
#### Real-time Updates
Live updates via WebSocket...

## Problem Space
### Screen
#### Dashboard
Main view showing metrics...

**Relationships:**
- contains -> MetricCard (component)
- contains -> Sidebar (component)

**Sources:**
- "src/routes/dashboard.tsx:1"
```

---

## Extraction Heuristics

### React/Next.js
```
src/pages/*.tsx or app/*/page.tsx  → screen
src/components/*.tsx               → component
src/types.ts or types/*.ts         → entity
src/api/* or app/api/*             → api
src/store.ts, *Context.tsx         → state
```

### Svelte/SvelteKit
```
src/routes/+page.svelte            → screen
src/lib/components/*.svelte        → component
src/lib/types.ts                   → entity
src/routes/api/*                   → api
src/lib/stores/*.ts                → state
```

### Vue/Nuxt
```
pages/*.vue                        → screen
components/*.vue                   → component
types/*.ts                         → entity
server/api/*                       → api
stores/*.ts                        → state
```

### Generic
```
README.md                          → name, purpose, capability
package.json                       → name, external deps
.env.example                       → constraint
docker-compose.yml                 → constraint, external
tests/, *.test.*                   → tests
```

---

## Example Output

```
Analyzing repo...

BASICS
- [name:acme-dashboard] Acme Dashboard
- [purpose:analytics] Internal analytics for sales team  
- [capability:realtime] Real-time metrics
- [capability:export] Export reports

PROBLEM (12 nodes)
- [persona:sales-rep] Sales Rep
- [persona:admin] Admin
- [screen:dashboard] Dashboard
- [screen:reports] Reports  
- [screen:settings] Settings
- [usecase:view-metrics] View daily metrics
- [constraint:auth-required] All routes require authentication

SOLUTION (18 nodes)
- [entity:user] User
- [entity:metric] Metric
- [entity:report] Report
- [component:metric-card] MetricCard
- [component:chart] Chart
- [component:sidebar] Sidebar
- [api:get-metrics] GET /api/metrics
- [api:export-report] POST /api/reports/export
- [state:auth-store] authStore
- [state:metrics-store] metricsStore

CROSSCUTTING (4 nodes)
- [external:stripe] Stripe SDK
- [external:sentry] Sentry error tracking
- [tests:vitest] Vitest test suite
- [observability:console] Console logging

EDGES (67 total)
- [screen:dashboard] contains [component:metric-card]
- [screen:dashboard] contains [component:chart]
- [component:metric-card] uses [entity:metric]
- [api:get-metrics] implements [usecase:view-metrics]
...

Output: 34 nodes, 67 edges
```

---

## Usage

```
/bropilot-extract

# Or with options:
/bropilot-extract --format json
/bropilot-extract --output ./spec.json
/bropilot-extract --include-tests
```

The extracted graph can be:
1. Imported into Bropilot for visualization and refinement
2. Used with `/bropilot-generate` to scaffold in another repo
3. Compared against existing spec to find drift
