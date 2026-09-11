# lfp — Bropilot v4 low-fi prototype

A throwaway SPA whose only job is to make Bropilot's ontology and core domain visible so we can argue about it, one column at a time, and let Bropilot describe itself.

```bash
cd lfp
npm install
npm run dev      # http://localhost:5173
npm run build
```

## What Bropilot v4 is (the brief, condensed)
A **business requirements orchestrator**. A user answers a structured series of questions; each answer stages downstream effects on a representation graph; the user reviews and **commits**; an agentic team (Flue later; implementation detail) makes the committed things happen in reality. The graph is the **representation layer** (problem, hypothesis, solution spaces). The coded, deployed, used system is the **reality layer** (stubbed for now; shape planned). Bropilot must be describable in Bropilot.

Decisions: fully local for now · representation only, reality stubbed · graph view secondary, UI to be revisited · no v3 compatibility · templates author-only for the first cut.

## Source of truth (edit these, the app re-renders)
- `src/kernel.ts` — spaces, kinds, edge types, questions, invariants, flows, kernel objects, and the **statement bank** (numbered quotes from the brief). Every item carries `source: said(S…)` or `inferred(reason)`.
- `src/graph.json` — Bropilot described in Bropilot: `{ nodes, edges }`. Node = `{ id, kind, title, description?, props?, status, source? }`. Edge = `{ id, src, dst, type }`.

Browser edits (answers, commits) live in `localStorage` (`bropilot:lfp:v1`). "Copy graph JSON" exports the live graph; when we agree on a change it gets folded back into `graph.json`. "Reset to seed" throws the local state away.

## Screens
- **Overview** (was Board) — the three representation spaces (problem, hypothesis, solution) as columns, left to right: the project's name and purpose sit in a compact header with a "show basics" toggle (name, purpose, summary). Cards per node with status and provenance. Dogfood check on top. Click a card for the inspector; it also spotlights the card's cross-column neighbours and draws the lines. Each card lists its links as chips. Domain-level kinds (system, module, thing, rule, …) are summarised as counts; the Domain page shows them.
- **Definition** (was Path) — the question tree. The tree is the main pane; inputs sit in a side panel. Roots are the template's questions and never change. Under a root: this project's sub-questions and threads (manual now; AI-organised later). Answer → staged changeset → review → commit (one undo step) → undo.
- **Domain** (was Kernel) — a level-0 Map (Representation: problem, bets, solution | Reality: current state, planned changes, effects) and three C4-style levels under Solution. 1 Context: the system as a bubble, the people outside, other systems. 2 Modules: business domains with their infra, arrows between them. 3 Inside a module: things, rules, events, interface, tests; select a thing to see the rules that govern it; every item can link to the code on GitHub (`props.codeRef`). No level 4.
- **Flows** — all flows tagged core / stub / later; clicking one lights up the kernel objects it touches.
- **Reference** — Bropilot's own kernel as tables (`kernel.ts`), with the "show only inferred" filter and the statement bank.
- Side panels (inspector, Domain detail, Glossary) push the page narrower rather than covering it.
- **📖 Glossary** — a drawer reachable from every page; add / edit / delete terms; edits commit immediately (escape hatch) and are undoable.

**Provenance in context.** Every said-badge shows, on hover, the quoted sentence with two sentences before and after from the full brief. In the inspector the full brief is one click away with the quote highlighted. `src/brief.ts` holds the briefs verbatim and one exact anchor per statement; the Reference page reports any anchor that no longer resolves.

## The loop
1. Look at one column (start: basics, then problem).
2. React. I edit `kernel.ts` / `graph.json`. Reload.
3. When a column feels right, set `settled: true` on its space in `kernel.ts`; move one column right.
4. Every change to how Bropilot works also changes Bropilot's own graph in the same commit.
5. Commit and push to `v4` at every step. See `LOG.md`.
