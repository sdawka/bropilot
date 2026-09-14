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
- **Definition** (was Path) — the question tree, read-only. The tree is the main pane; the side panel shows the selected question/follow-up and its committed answers. Roots are the template's questions and never change. Under a root: this project's sub-questions and threads (manual now; AI-organised later). Answer → staged changeset → review → commit (one undo step) → undo, all through the Talk panel.
- **Domain** (was Kernel) — a level-0 Map (Representation: problem, bets, solution | Reality: current state = code, infrastructure, practices, test results; planned changes = epics and targeted tasks; effects) and three C4-style levels under Solution. 1 Context: the system as a bubble, the people outside, other systems. 2 Modules: business domains with their infra, arrows between them. 3 Inside a module: things, rules, events, interface, tests; select a thing to see the rules that govern it; every item can link to the code on GitHub (`props.codeRef`). No level 4.
- **Flows** — all flows tagged core / stub / later; clicking one lights up the kernel objects it touches.
- **Reference** — Bropilot's own kernel as tables (`kernel.ts`), with the "show only inferred" filter and the statement bank.
- Side panels (inspector, Domain detail, Glossary) push the page narrower rather than covering it.
- **📖 Glossary** — a drawer reachable from every page, read-only (list + search); add / edit / delete terms through the Talk panel — it commits immediately (escape hatch) and is undoable.

**Provenance in context.** Every said-badge shows, on hover, the quoted sentence with two sentences before and after from the full brief. In the inspector the full brief is one click away with the quote highlighted. `src/brief.ts` holds the briefs verbatim and one exact anchor per statement; the Reference page reports any anchor that no longer resolves.

## Talk panel (the one way to interact)
- **🪞 Talk** toggles the panel: one utterance (say or ask) at a time, what it is pointing at, a "Now" strip (staged effects to approve/discard, or the next question/gap), the transcript, tour controls, and the composer. It is screen-aware — it knows the active tab and what that view is currently rendering (`state.screen`).
- **Read mode**: with the panel closed, every view (Definition, Glossary, …) is read-only — click to select and navigate, nothing to edit inline. Answering, adding follow-ups, editing the glossary, approving, discarding and undo all go through the panel.
- **Mirror ↗** opens `#mirror` in a second window: the phone view. Same Talk panel, bare, driven by the same Context/UserTurn protocol — the panel and the mirror are two channels to one thing.
- Directors speak the Cue protocol in `src/director.ts`. `src/directors/scripted.ts` has the tours (used until an agent connects); `src/directors/remote.ts` forwards user turns to whichever agent said hello.

### Running with the agent
- `npm run agent` starts `agent/server.mjs`: a LAN relay on `:5200` (same as the old `relay.mjs`), plus — when `ANTHROPIC_API_KEY` is set — a Flue "Talk" session that drives the screen through the Cue protocol (`agent/talk.ts`, `agent/tools.ts`, one tool per Cue). Put the key in a gitignored `.env` at the project root (`ANTHROPIC_API_KEY=sk-ant-...`), or export it in the shell.
- On the main screen, click **📡 relay…** and enter `localhost` (or the LAN IP printed by `npm run agent`, for the phone mirror), then reload. Without a key, `npm run agent` behaves exactly like a plain relay — the ScriptedDirector keeps driving tours; with a key, the first `hello` from the agent switches the main screen to `RemoteDirector` and every turn goes to Flue.
- Also start `npm run dev` (or `npm run dev:lan` for the phone) so there is a main screen for the agent's cues to land on — the agent has no effect if no main screen tab is open.

## The loop
1. Look at one column (start: basics, then problem).
2. React. I edit `kernel.ts` / `graph.json`. Reload.
3. When a column feels right, set `settled: true` on its space in `kernel.ts`; move one column right.
4. Every change to how Bropilot works also changes Bropilot's own graph in the same commit.
5. Commit and push to `v4` at every step. See `LOG.md`.
