# Bropilot v4 — low-fi prototype (lfp) plan

## Context
The `v4` branch is a clean reset (only `CONCEPT.md`). Bropilot v4 is a **business requirements orchestrator**: a structured series of questions and actions whose downstream effects a user commits to, after which an agentic team makes them happen. The graph is the **representation layer**; the coded, deployed, used system is the **reality layer** (stubbed for now, shape planned).

This plan starts an **ad-hoc SPA called lfp** whose job is to make the ontology and core domain visible so we can loop on it: I put something on screen, we discuss it, we update the graph and the kernel, the lfp re-renders. The lfp's first content is Bropilot describing itself. We enrich the representation layer **left to right**: basics → problem → hypothesis → solution → functions.

Decisions already taken: fully local for now (Flue later, implementation detail); representation only, reality stubbed; graph view is secondary; no v3 compatibility; template authoring is author-only for the first cut.

## Where it lives
- Branch `v4`, new top-level dir `lfp/`. Local worktree so `dev` stays untouched: `git worktree add ../bropilot-v4 v4`.
- Stack: Vite + Vue 3 + TypeScript, no UI framework, one CSS file. Deliberately throwaway.
- Two data files are the **source of truth**, edited by me as we talk, rendered by the app:
  - `lfp/src/kernel.ts` — spaces, kernel kinds, edge types, questions, invariants, statement bank.
  - `lfp/src/graph.json` — the Bropilot-in-Bropilot graph `{ nodes, edges }`.
- Browser edits go to localStorage and can be exported as JSON; when we agree on a change I fold it back into `graph.json`, so the app and the repo converge.

## Kernel (first cut, in `kernel.ts`)
- **Layers:** `representation` (spaces: basics, problem, hypothesis, solution, functions) · `reality` (system, usage, evidence — stub) · `orchestration` (question, answer, effect, commit, action, agent, template).
- **Kernel kinds:** `name`, `purpose` (basics) · `audience`, `context`, `problem`, `outcome` (problem) · `hypothesis`, `assumption`, `metric` (hypothesis) · `capability` (solution). Template kinds come later as we reach solution/functions.
- **Edge types:** `motivates`, `serves`, `satisfies`, `has`, `references`, `monitors`, `verifies`, `implements`, `contains`, `uses`, `depends_on`, `triggers`, `emits` + orchestration-only `answers`, `yields`, `targets`, `accepts`, `dispatches`, `executes`, `produces`, `unlocks`, `asksFor`, `supports`, `refutes`, `inStage`.
- **Immutable vs extensible** is a flag on every kind/edge type/question (`kernel: true|false`); the lfp shows it.
- **Invariants:** a node/edge becomes `committed` only through a Commit; every Effect traces to one Answer or one Action; kernel kinds/edges can be added to but not removed by templates; a Question unlocks only after all its `unlocksAfter` have a committed answer; undo = one whole Commit.
- **Provenance:** every kernel item and every decision carries `source: { kind: 'said', statements: [S#] } | { kind: 'inferred', reason }`, drawn from a statement bank of your brief split into ~44 numbered quotes. A filter shows only inferred items so they can be challenged.

## lfp screens (v0)
1. **Board** — five columns, one per representation space, left to right. Each column lists its nodes as cards (kind icon, title, status draft/committed, provenance badge). Empty columns to the right show what kinds *will* go there. Click a card → inspector with description, props, edges in/out, provenance quote.
2. **Kernel** — the kinds, edge types, and invariants as a table, immutable vs extensible coloured, each with its provenance badge. This is the page we argue about.
3. **Path** — the ordered questions with lock/unlock state; answering one produces a staged changeset (add/update nodes + edges); a **Review & commit** panel with checkboxes; commit applies and marks nodes committed; one-step undo. Low-fi: answers are free text, and effects are hand-mapped per question (e.g. "who is it for?" → `audience` nodes, one per line).
4. **Flows** — the flow list (project / path / commit / orchestration / explore / reality-stub), each tagged core/stub/later, clicking one highlights the kernel objects it touches.

Graph explorer is not in v0.

## Seed graph (Bropilot in Bropilot, left two columns filled, rest sketched)
- basics: name, purpose.
- problem: 3 audiences, 4 problems, 3 outcomes with their metrics.
- hypothesis: H1–H5, 3 assumptions.
- solution: 7 capabilities (2 marked stub).
- functions: 9 agents (3 core, 6 stub) as placeholder nodes until we define that space's kinds.
- Edges: purpose motivates outcomes; audiences have problems; capabilities serve audiences and satisfy problems; metrics monitor outcomes; hypotheses reference outcomes.

## The loop we'll run
1. I ship lfp v0 with the seed and open it.
2. We look at one column (starting with **basics**, then **problem**), you react, I edit `kernel.ts` / `graph.json`, page reloads.
3. When a column's kinds, fields, and edges feel right, mark that space `settled` in the kernel and move one column right.
4. Whenever we change how Bropilot works, we also change Bropilot's own graph in the same commit, so the dogfood stays honest.

## Verification
- `npm run dev` in `lfp/`, open the Board, confirm all five columns render the seed with provenance badges.
- Kernel page: every item shows a badge; inferred filter lists only inferred items.
- Path: answer the "name" question → changeset shows one node → commit → card turns committed → undo reverts it.
- Dogfood check line on the Board: zero nodes with an unknown kind, zero dangling edges.
