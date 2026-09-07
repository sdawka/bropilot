# lfp log

Newest first. One entry per loop iteration: what we looked at, what changed, what's next.

## 2026-09-07 — v0
- Scaffolded lfp (Vite + Vue 3 + TS). Four screens: Board, Path, Kernel, Flows.
- Kernel first cut: 5 representation spaces + 3 reality stubs; 22 kinds (13 kernel, 9 template); 15 edge types; 11 questions; 8 invariants; 21 flows; 15 kernel objects; 46-statement bank.
- Seed graph: Bropilot in Bropilot. 43 nodes, 29 edges. Basics and Problem columns filled; Hypothesis and Solution sketched; Functions holds 9 agents as placeholders.
- Inferred items to challenge first: `metric` kind, `satisfies`/`has`/`references`/`triggers` edges, `q-metric` question, Answer immutability, undo-whole-commit, Fadell's eight stages, Engineer + Domain modeller agents.
- Smoke test (Playwright, `smoke.mjs`): board 42 nodes/29 edges, dogfood clean; answer → 2 effects → commit → 44 cards → undo → 42; kernel 79 rows, 10 inferred; flows highlight works. No console errors.
- **First holes found by the lfp itself:**
  - 12 orphan nodes: the 3 assumptions and all 9 agents have no edges. Assumptions need a link to what they underpin (hypothesis? capability?); agents need `owns → function` edges, but there are no `function` nodes yet.
  - Kernel objects `Layer` and `Kind` are touched by no flow. Either template authoring (declaring kinds) is a missing flow, or they are pure structure and should be marked as such.
- Next: look at **Basics** together, then **Problem**.
