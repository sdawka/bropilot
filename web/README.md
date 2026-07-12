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
- **Relationships** — wire any two nodes together with the eight Bropilot edge types (`has`, `uses`, `triggers`, `implements`, `depends_on`, `extends`, `contains`, `references`).
- **Client-only & portable** — the graph lives in `localStorage` (autosaved on every change). Import/export the canonical Bropilot JSON (`{ nodes, edges }`) to round-trip with `/bropilot-extract` and `/bropilot-generate`.

## Develop

```bash
cd web
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
npm run preview
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
