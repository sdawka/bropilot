# Bropilot

**A knowledge graph for your system — collected in a studio, kept honest by an ontology, round-tripped with code.**

Bropilot captures everything known about a software system — why it exists, the language of its domain, and the code that realises it — as one portable graph (`{ nodes, edges }`), and gives you three ways to work with it:

- **Bropilot Studio** (`web/`) — a client-only web app: guided forms for collecting the graph, an interactive force-directed display for exploring it, and an ontology that suggests how things connect.
- **Claude skills** (`.claude/skills/`) — `/bropilot-extract` reverse-engineers a repo into a graph, `/bropilot-generate` scaffolds code from one, `/bropilot-interview` builds one by asking you questions.
- **A workshop** — in-app exercises (event storming, guided interviews, document extraction, gap-fix sprints) that turn raw knowledge into graph structure, with LLM help via copy-paste prompts — no API keys.
- **A queryable model** — a schema-validated graph-pattern engine plus "copy context" export, so an LLM gets the relevant slice of your system instead of the whole dump.

## Quickstart

```bash
cd web
npm install
npm run dev      # → http://localhost:4433
```

The Studio seeds itself with a demo graph (Bropilot modelling itself). Explore the three parts, click around the graph, then **Clear** and describe your own system — everything autosaves to localStorage. **Export JSON** when you want to take the graph elsewhere.

## The model

Knowledge is collected across three parts — **Foundations** (what/why/who), **Domain** (the ubiquitous language), **Implementation** (the code) — over four semantic spaces (`basics`, `problem`, `solution`, `crosscutting`) that drive colour and meaning everywhere.

Underneath sits a two-layer design borrowed from knowledge representation:

- **The ontology (T-Box)** — 28 node kinds, 17 typed edge kinds in five categories, and a ~90-row table of *which kinds typically connect to which* (`persona —motivates→ usecase`, `tests —verifies→ module`, …). It lives in code (`web/src/lib/schema.ts`) and drives suggestion chips in the editor, an **Instance | Ontology** toggle in the graph view, advisory graph-health linting, and query validation.
- **Your graph (A-Box)** — the instances. Nothing is ever validated or blocked: the ontology advises, you decide. `references` is always available as the escape hatch.

## Testing

```bash
cd web
npm run test     # Vitest: unit batteries + a seeded, ontology-driven simulator
npm run e2e      # Playwright: browser verification incl. a simulator-driven UI smoke
```

The simulator (`web/src/lib/sim/`) replays deterministic random editing sessions against the real store and checks invariants after every operation — failures always print the seed, so every bug is reproducible. CI runs the full battery on every push and PR.

## Repository layout

```
web/                      the Studio (Astro + Vue 3 + Tailwind v4) — see web/README.md
.claude/skills/           bropilot-extract · bropilot-generate · bropilot-interview
docs/superpowers/specs/   design documents (meta-ontology, testing/simulator)
.github/workflows/        CI: check · build · test · e2e · skills drift gate
```

The skills' ontology tables are generated from the schema — after editing `ONTOLOGY` or `EDGE_TYPES`, run `npm run sync-skills` from `web/`.
