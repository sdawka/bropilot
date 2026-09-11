# lfp log

Newest first. One entry per loop iteration: what we looked at, what changed, what's next.

## 2026-09-11 — v1.2 (feedback on v1.1 applied)
- H1 stays as the specific testable version next to H6 (S78).
- **Domain level 0 "Map"** (S79–S81): Representation (problem, bets, solution) on the left, Reality on the right, two arrows between: solution → planned changes, effects → bets (confirm or deny). Reality spaces are now temporal: `current` (Current state), `planned` (Planned changes), `effects` (Effects: measurements, usage, feedback). `system` / `usage` / `evidence` spaces are gone; the `evidence` kind lives in `effects`. Clicking Solution opens the C4 levels; Problem/Bets jump to Overview.
- **Bets** (S82): the hypothesis space and kind are labelled Bets / Bet (ids unchanged); the question help no longer demands falsifiability.
- **Overview connections** (S83): every card lists its cross-column links as chips (clickable). Selecting a card spotlights its neighbours in other columns, dims the rest, and draws labelled lines between them.
- **Definition** (S84): the tree is the wide main pane; the answer box, changeset review and commit history are a sticky 380px side panel.
- Briefs 3 and 4 (v1 and v1.1 feedback) added verbatim to `brief.ts`; S71–S84 anchor to them. All anchors resolve.
- Next: react to the Map and the Overview spotlight; then decide the kinds inside Current state and Planned changes.

## 2026-09-07 — v1.1 (feedback on v1 applied)
- **Side panels push the page** (S75): inspector, Domain detail pane and Glossary are 400px wide and the view gets a matching right margin while one is open.
- **Functions are features** (S71, S72): the `function` kind and the `functions` space are gone. The nine former functions are `feature` nodes (kernel kind now, with lifecycle stages); each agent `implements` its feature and is a sub-item (`has`) of the *Agent orchestration* capability. Overview has three columns: problem, hypothesis, solution.
- **Root problem + H6** (S72, S73): "The user hasn't spent years in every department of a startup" is the main problem; the four earlier problems hang under it; every feature `satisfies` it. H6 states the bet: standard constraints and procedures, simple choices with options → baseline quality and much less burden. Guided path and orchestration capabilities reference H6.
- **Screens recorded** (S76): Overview, Definition, Domain, Flows, Reference, Glossary drawer, Inspector as `screen` nodes exposed by their modules, each with a `codeRef`. The two `ui`-style interface nodes are gone (screens replace them; resolves the domain agent's note).
- **Events in the vocabulary** (S74): new kernel kind `event` (level 3) and `emits` edge (inferred). Six events (AnswerGiven, FollowUpAdded, EffectsStaged, Committed, Undone, TermEdited) emitted by the store RPC; Domain level 3 gained an Events column; glossary term *Event*.
- Design system left empty on purpose (S77). Dogfood check fully clean: 111 nodes, 167 edges, no orphans.
- Next: your reaction to the restructured Overview (problem column now has a root), then Domain level by level.

## 2026-09-07 — v1 (feedback on v0 applied)
- Renames: Board → **Overview**, Path → **Definition**, Kernel → **Domain**; the old kernel tables live on as **Reference**. Legacy `#board` / `#path` hashes redirect.
- **Provenance in context** (S47, S48): `src/brief.ts` holds all three briefs verbatim plus one exact anchor per statement (S1–S70). Hovering a said-badge shows the sentence ±2; the inspector shows it inline and can expand the full brief with the quote highlighted. The Reference page reports any anchor that stops resolving (currently none).
- **Basics**: new singular kind `summary` + question; Overview hides basics behind a "show basics" toggle in a compact project header (S49, S50).
- **Definition** tree (S51–S54): template questions are immutable roots grouped by space; project-specific sub-questions and threads hang under them (`FollowUp` in the store, manual for now; AI-organised later). Answering a follow-up stages effects exactly like a root question.
- **Domain** C4 levels (S56–S70): new kinds `system`, `external`, `module`(kernel), `infra`, `thing`, `rule`(kernel), `interface`(replaces `rpc`), `test`(stub), each with a `level`; new edges `governs`, `defines`; `LEVELS` and `NO_LEVEL_4` in kernel.ts. Level 1 context, level 2 modules with infra chips and inter-module arrows (as rows), level 3 things / rules / interface / tests with thing↔rule highlighting and `props.codeRef` links to GitHub. Answer to "am I missing something": flows/journeys and inter-module events are cross-cutting, not a level 4.
- **Glossary** drawer on every page (S59); edits commit immediately (escape hatch Q5) and are undoable.
- Seed grew to 97 nodes / 110 edges: Bropilot's own modules (Representation, Definition, Orchestration, Reality stub, Metrics stub), 15 things, 8 rules, 4 interfaces, 7 terms, 9 functions owned by the 9 agents. This closes the v0 orphan holes (assumptions now reference the hypotheses they underpin; agents own functions). New flows Q7, Q8, G1, T1, D1 close the "Layer/Kind touched by no flow" hole.
- Smoke (`smoke.mjs`): all screens exercised; no console errors.
- Open from the domain agent's review: `interface-domain-ui` sits under Representation (arguable); only 4 of 15 things have a defining glossary term; no `test` nodes yet.
- Next: react to Overview and Definition first, then argue the Domain levels one at a time.

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
