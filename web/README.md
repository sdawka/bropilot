# Bropilot Studio

A fancy form **and** display for a system's knowledge graph, built with **Astro + Vue 3 + Tailwind v4**. Collect everything you know about a system across three parts, then explore it as an interactive node-link graph.

## The three parts

| Part | What it captures | Bropilot spaces |
|------|------------------|-----------------|
| **Foundations** | Name, purpose, capabilities, personas, requirements, use cases & situations, constraints/invariants, goals, hypotheses, assumptions | `basics` + `problem` |
| **Domain** | Ubiquitous-language terms, entities, relationships, behaviours, events, state, journeys/flows, screens | `solution` |
| **Implementation** | Modules, components, interfaces, APIs, logic, repositories, external services, tests, observability, design — each linked to where the code lives | `solution` + `crosscutting` |

## Features

- **Guided forms** — every node kind has a tailored editor (fields, lists, links, selects) generated from the schema.
- **Interactive graph** — d3-force layout rendered as SVG. Drag nodes, scroll to zoom, pan the canvas, fit-to-view, relayout. Selecting a node highlights its neighbourhood and dims the rest. Nodes are coloured by semantic space; edges are typed and directional.
- **Relationships** — wire any two nodes together with 17 typed edges in five categories (structural / dependency / behavioural / intentional / verification). The `ONTOLOGY` table in `schema.ts` powers one-click suggestion chips and "fits ontology" target ranking; nothing is ever validated or blocked.
- **Ontology view** — an **Instance | Ontology** toggle in the graph view renders the schema itself: kinds as nodes, typical relationships as strength-coded edges, with instance counts and cross-layer navigation (kind chip ⇄ instances).
- **Graph health** — advisory lint findings on the Overview (off-ontology edges, orphans, why-chain gaps, unverified surfaces) that navigate to the node in question.
- **Copy context** — a token-budgeted markdown slice of any node's 2-hop neighbourhood, for pasting into an LLM chat; backed by a schema-validated graph-pattern query engine (`lib/query.ts`).
- **Workshop** — four structured exercises that grow the graph: an event-storming board, guided interview decks, paste-a-document extraction via a copy-paste LLM bridge (no API keys), and a lint-driven gap-fix sprint. Every bulk import lands in a reviewable merge diff before touching the graph.
- **Client-only & portable** — the graph lives in `localStorage` (autosaved on every change). Import/export the canonical Bropilot JSON (`{ nodes, edges }`) to round-trip with `/bropilot-extract`, `/bropilot-generate` and `/bropilot-interview`.

## Develop

```bash
cd web
npm install
npm run dev      # http://localhost:4433
npm run build    # static output in dist/
npm run preview
npm run check    # astro type-check
npm run test     # Vitest: unit + seeded simulator suites
npm run e2e      # Playwright browser tests
```

## Architecture

```
src/
├── lib/
│   ├── schema.ts    # the contract: parts, spaces, node kinds + fields, edge types
│   ├── store.ts     # reactive graph + localStorage persistence + import/export
│   └── sample.ts    # demo graph (Bropilot modelling itself), seeded on first run
├── components/
│   ├── Studio.vue            # root shell: nav, views, inspector, import/export
│   ├── views/                # OverviewView, PartView (×3), GraphView
│   ├── graph/ForceGraph.vue  # d3-force SVG graph
│   ├── form/                 # NodeForm, NodeCard, RelationshipEditor, Inspector
│   └── ui/Modal.vue
├── layouts/Layout.astro      # document shell + fonts + theme
└── pages/index.astro         # mounts <Studio client:only="vue" />
```

`schema.ts` is the single source of truth — add a node kind there and it shows up in the editor, the graph legend, and the part views automatically.
