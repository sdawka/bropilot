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
- **Board** — representation spaces as columns, left to right. Cards per node with status and provenance badge. Dogfood check on top (unknown kinds, dangling edges, unknown edge types, orphans). Click a card for the inspector: edges in/out, provenance quote, which kernel rules apply.
- **Path** — the questions with locked / unlocked / answered state. Answer → staged changeset → review checkboxes → commit (one undo step) → undo.
- **Kernel** — everything in `kernel.ts` as tables; immutable vs extensible tagged; "show only inferred" filter to challenge my extrapolations.
- **Flows** — all flows, tagged core / stub / later; clicking one lights up the kernel objects it touches; reports objects no flow touches.

## The loop
1. Look at one column (start: basics, then problem).
2. React. I edit `kernel.ts` / `graph.json`. Reload.
3. When a column feels right, set `settled: true` on its space in `kernel.ts`; move one column right.
4. Every change to how Bropilot works also changes Bropilot's own graph in the same commit.
5. Commit and push to `v4` at every step. See `LOG.md`.
