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
- `src/kernel.ts` — spaces, kinds, edge types, questions, invariants, flows, kernel objects, and the **statement bank** (numbered quotes from the brief). Every item carries `source: said(S…)` or `inferred(reason)`. `KindDef.needs` declares per-kind edge cardinality (e.g. every `rule` needs a `test` that `verifies` it); `EdgeTypeDef.from`/`to` declare which kinds an edge type may connect.
- `src/types.ts` — the data model (`Node`, `Edge`, `Graph`, `Answer`, `AICall`, `Effect`, `Changeset`, `Commit`, `FollowUp`, `Violation`, `OpenItem`), Node-runnable (no browser imports) so `checks.ts` and the `scripts/*.mjs` can use the shapes without pulling in `store.ts`. `store.ts` re-exports all of it.
- `src/checks.ts` — the meta layer: `checkInvariants(graph): Violation[]`, pure over a `Graph`, Node-runnable (imports only `kernel.ts` + `types.ts`). Never repairs anything automatically; every `Violation` carries 2–3 repair `options` and a `raise: 'question' | 'task'` kind.
- `src/agents.ts` — the agent roster (`AGENTS: AgentSpec[]`: talk, observer, planner, builder, reviewer, clarifier), Node-runnable, one `TIER_MODELS` map. `kernelDigest()` includes it; `docs/AGENT-RUNTIME.md` explains the why.
- `src/graph.json` — Bropilot described in Bropilot: `{ nodes, edges }`. Node = `{ id, kind, title, description?, props?, status, source?, v?, hash? }`. Edge = `{ id, src, dst, type, trace? }`.
- `src/reality.json` — **observed**, not hand-entered: `{ results: { [testId]: { status, value?, at, codeRef? } }, metrics: {...} }`, written by `npm run observe` (never edited by hand) and merged onto `test-result` nodes at `hydrate()`.

Browser edits (answers, commits) live in `localStorage` (`bropilot:lfp:v1`). "Copy graph JSON" exports the live graph; when we agree on a change it gets folded back into `graph.json`. "Reset to seed" throws the local state away.

## Screens
- **Overview** (was Board) — the three representation spaces (problem, hypothesis, solution) as columns, left to right: the project's name and purpose sit in a compact header with a "show basics" toggle (name, purpose, summary). Cards per node with status and provenance. Dogfood check on top. Click a card for the inspector; it also spotlights the card's cross-column neighbours and draws the lines. Each card lists its links as chips. Domain-level kinds (system, module, thing, rule, …) are summarised as counts; the Domain page shows them.
- **Definition** (was Path) — the question tree, read-only. The tree is the main pane; the side panel shows the selected question/follow-up and its committed answers. Roots are the template's questions and never change. Under a root: this project's sub-questions and threads (manual now; AI-organised later). Answer → staged changeset → review → commit (one undo step) → undo, all through the Talk panel.
- **Domain** (was Kernel) — a level-0 Map (Representation: problem, bets, solution | Reality: current state = code, infrastructure, practices, test results; planned changes = epics and targeted tasks; effects), then three C4-style levels under Solution: **1 Deployment**, **2 Modules**, **3 Cell** — see "Architecture diagrams" below. No level 4.
- **Flows** — all flows tagged core / stub / later; clicking one lights up the graph nodes it touches, everywhere at once (Overview cards, Domain diagrams).
- **Reference** — Bropilot's own kernel as tables (`kernel.ts`), with the "show only inferred" filter, the AI-function registry and call log (see "AI functions and feedback"), and the statement bank.
- Side panels (inspector, Domain detail, Glossary) push the page narrower rather than covering it.
- **📖 Glossary** — a drawer reachable from every page, read-only (list + search); add / edit / delete terms through the Talk panel — it commits immediately (escape hatch) and is undoable.

**Provenance in context.** Every said-badge shows, on hover, the quoted sentence with two sentences before and after from the full brief. In the inspector the full brief is one click away with the quote highlighted. `src/brief.ts` holds the briefs verbatim and one exact anchor per statement; the Reference page reports any anchor that no longer resolves.

## Talk panel (the one way to interact)
- **🪞 Talk** toggles the panel: one utterance (say or ask) at a time, what it is pointing at, a "Now" strip, the transcript, tour controls, and the composer. It is screen-aware — it knows the active tab and what that view is currently rendering (`state.screen`).
- **The "Now" strip** shows, in priority order: staged effects to approve/discard; otherwise `ctx.next` — the top of `store.ts::rankOpen()`, the single next thing worth doing, with a tier badge (`talk-next-tier`: **Blocking** > **Next question** > **Gap** > **Open thread**) and "Answer it"/"Skip". Blocking beats everything: an agent question raised against a stuck task. Next question is the template's next unlocked-and-unanswered question. Gap and Open thread are kernel-violation-raised and hand-added follow-ups respectively, ranked by space order.
- **Suspect strip** (`talk-suspect`): appears whenever an edit has left edges unrevalidated (`ctx.suspect.edges > 0`) — editing a committed node's title/description/props bumps its version and marks every touching edge `suspect`; "Revalidate" (`talk-revalidate`) recomputes the node's content hash — unchanged clears its edges back to valid and the suspicion stops spreading there (the early cutoff); changed bumps the version again and cascades.
- **Outcomes**: every `AICall` that staged the current changeset can end up `approved`, `edited` (with a Levenshtein-based edit distance, if a staged line was double-click-edited before approving), `discarded`, or `ignored` (a new changeset staged before the old one was resolved). Tracked automatically by the panel; shown on Reference's efficacy table.
- **Read mode**: with the panel closed, every view (Definition, Glossary, …) is read-only — click to select and navigate, nothing to edit inline. Answering, adding follow-ups, editing the glossary, approving, discarding and undo all go through the panel.
- **Mirror ↗** opens `#mirror` in a second window: the phone view. Same Talk panel, bare, driven by the same Context/UserTurn protocol — the panel and the mirror are two channels to one thing. The mirror never shows the local-only "Answer it"/"Skip"/revalidate actions or feedback buttons — those are main-screen-only.
- Directors speak the Cue protocol in `src/director.ts` (now including `revalidate` and `raise`). `src/directors/scripted.ts` has the tours (used until an agent connects); `src/directors/remote.ts` forwards user turns to whichever agent said hello.

### Running with the agent
- `npm run agent` starts `agent/server.mjs`: a LAN relay on `:5200` (same as the old `relay.mjs`), plus — when `ANTHROPIC_API_KEY` is set — a Flue "Talk" session that drives the screen through the Cue protocol (`agent/talk.ts`, `agent/tools.ts`, one tool per Cue). Put the key in a gitignored `.env` at the project root (`ANTHROPIC_API_KEY=sk-ant-...`), or export it in the shell.
- On the main screen, click **📡 relay…** and enter `localhost` (or the LAN IP printed by `npm run agent`, for the phone mirror), then reload. Without a key, `npm run agent` behaves exactly like a plain relay — the ScriptedDirector keeps driving tours; with a key, the first `hello` from the agent switches the main screen to `RemoteDirector` and every turn goes to Flue.
- Also start `npm run dev` (or `npm run dev:lan` for the phone) so there is a main screen for the agent's cues to land on — the agent has no effect if no main screen tab is open.

## Rules, questions and tests (v4.1)
Three separate loops keep the graph honest, each closed by a different party (`docs/AGENT-RUNTIME.md` §1 has the full table):

1. **Meta — kernel constraints.** `src/checks.ts::checkInvariants(graph)` checks graph shape against the kernel: every edge fits its type's declared `from`/`to` kinds; every kind's `needs` cardinalities are met; every line of a rule's description ("a condition") is named by a test's `condition` that `verifies` that rule; every protocol is `realises`d by a practice; nothing is orphaned. Nothing is ever auto-repaired — a violation always becomes a **raised question** (`FollowUp.raisedBy.kind = 'violation'`) with 2–3 repair options, for the user to answer through Talk. The seed graph currently surfaces 34 such violations (`#kernel`'s Violations table, `ref-violations`).
2. **Representation → reality.** A rule's condition with no fresh passing test becomes a **task** (`raise: 'task'`); `scripts/dispatch.mjs <taskId>` turns a task into a work order (the rule's lines, the tests and their conditions, provenance quotes, an acceptance line) for a Builder agent to execute in a sandbox until the full suite is green, then a Reviewer agent judges intent vs. over-fitting the test.
3. **Clarification.** When an agent can't derive a measurable "done" from the rule lines and test conditions, it raises a question (`raisedBy.kind = 'agent'`) and its task goes `blocked` until the user answers through Talk; the task then resumes.

`store.ts::rankOpen()` is the single ranked view across all three: tier 1 blocking agent questions, tier 2 the next template question, tier 3 violation-raised threads (by space order), tier 4 everything else open. It drives the Talk panel's "Now" strip and Reference's Open items table (`ref-open`).

A rule's **condition** is one line of its description (or its whole title if it has none — `checks.ts::conditionsOf`); a `test` node names the condition it covers in `props.condition`. Editing a committed node bumps its version and marks its edges `suspect` (see "Talk panel" above) — `checks.ts`'s `test-without-passing-fresh-result-and-no-task` check treats a test whose `reports` edge is stale the same as a missing result.

## AI functions and feedback
Every place the "AI" acts is a named function in `src/ai/registry.ts` (metadata: id, version, purpose, declared context needs, prompt, output shape, feedback options) paired with a deterministic implementation in `src/ai/functions/*.ts` (a `stub` today; a `flue` runtime slots in later without changing the metadata). `src/ai/runtime.ts::runAI` is the only place a function actually gets called: it runs the stub, turns the result into Cues, and records an `AICall` — function, version, runtime, a human-readable context digest, the input, the output, and every cue id it produced — to `state.aiCalls` (persisted). `src/directors/scripted.ts` is a thin keyword router over the nine functions (`describe-screen`, `next-decision`, `answer-to-effects`, `propose-followup`, `explain-node`, `walk-map`, `find-gaps`, `unrealised-to-tasks`, `define-term`); it holds no prompts itself.

The Talk panel shows "fn · version · runtime" under every utterance and staged changeset, with feedback buttons (makes sense / doesn't / bad question, or the function's own set) that rate the call; ratings persist across reloads. The mirror shows the same utterances but never the feedback buttons — rating is a main-screen action.

## Reference (`#kernel`)
Bropilot's own kernel as tables, plus everything the app has observed about itself, all live off the current graph — nothing here is hand-maintained:
- **Kernel tables** — spaces, kinds, edge types, questions, invariants — with the "show only inferred" filter and the statement bank.
- **Violations** (`ref-violations`) — every live `checkInvariants` result: invariant, message, subjects (click to select), repair options, and whether it raises a question or a task.
- **Open items** (`ref-open`) — the full `rankOpen()` list, tiered and ordered exactly as the Talk panel's "Now" strip would show them one at a time.
- **Edge shapes** (`ref-edge-shapes`) — every edge type's declared `from`/`to` kinds alongside every kind's `needs` cardinality that edge type satisfies.
- **AI functions** (`ref-ai-functions`) — the registry, with expandable prompts.
- **AI calls** (`ref-ai-calls`) — the call log, sortable, inline rating, a "Copy calls JSON" export, and an outcome column (approved / edited (Δ) / discarded / ignored).
- **Efficacy scoreboard** (`ref-ai-efficacy`) — per function/version: call count, approved/edited/discarded/ignored percentages, median edit distance, rating distribution; rows under 30 calls are marked "provisional".

## Running on Flue + OpenRouter
`src/ai/runtime.ts::runAI` can run each AI function against a real model instead of the deterministic stub — the "flue" runtime. To turn it on:
1. Create `lfp/.env` (gitignored) with `OPENROUTER_API_KEY=...` — one key covers every tier via `openrouter/<vendor>/<model>` specifiers. Direct `anthropic/...` specifiers still work with `ANTHROPIC_API_KEY` set instead (`agent/agents/from-spec.ts::modelFor` and `agent/ai-service.ts` pick whichever key is present, OpenRouter first).
2. `npm run agent` starts the LAN relay and, once it sees a key, also joins the bus as an agent and answers `ai-request` messages published by the main app (`agent/ai-service.ts`, `agent/server.mjs`).
3. On the Reference page (`#kernel`), flip `state.aiRuntime` from `stub` to `flue` — this switches `src/ai/runtime.ts` from `StubBackend` to `BusBackend` live, no reload.

Tiers and model ids are declared once in `src/agents.ts` (`TIER_MODELS` for OpenRouter, `DIRECT_MODELS` for direct Anthropic). Every AI function in `src/ai/registry.ts` runs on `TIER_MODELS.cheap`, except `answer-to-effects` and `review-change`, which run on `TIER_MODELS.mid` (agent Talk itself also runs on `mid`). Change a model only in that one file.

`FAKE_AI=1 npm run agent` runs the agent server with no key at all and no Flue conversation: it answers `ai-request` with a deterministic canned output for `describe-screen`, `next-decision`, and `find-gaps` (an `error` for any other function), so the `ai-request`/`ai-response` seam can be exercised in CI and local smoke runs without a model key. Without a key and without `FAKE_AI=1`, `npm run agent` is a plain relay — no Talk agent, and switching to `flue` in the Reference page falls back to the stub with a message rather than hanging.

Costs show up wherever an `AICall` is recorded: the Reference page's call log (`src/ai/runtime.ts`, `AICall.costUsd`/`model`) and the agent server's stdout (`[turn] ...cost=$...`, from the same `observe()` "turn" events `agent/ai-service.ts` uses to attach usage to `ai-response`).

## Architecture diagrams
Domain's C4-style levels are **1 Deployment**, **2 Modules**, **3 Cell**, both new diagram levels drawn with Vue Flow (`src/components/arch/`):
- **Deployment** (`arch/Deployment.vue`) — audiences and their client deployable(s) on the left, server deployables (and caches/queues) in the middle, stores and external systems on the right, fixed by `infra.role` and laid out with `src/components/arch/layout.ts::deploymentLayout` (no dagre). Edges are `uses` between deployables/externals; each deployable card lists the modules it `hosts`.
- **Cell** (`arch/Cell.vue`), one per module — a membrane with interface ports on the left (`in`) and right (`out`/events), rules as circuits running through the entities (things) they govern, and a faded data-model band behind for any store-role deployable that hosts the module. Clicking an interface's port spotlights its whole circuit (port → rules → things → events); clicking a thing or rule spotlights it directly.

Both diagrams honour the same spotlight `state.highlight` uses everywhere else: selecting a flow in **Flows** (or clicking a card/node anywhere) dims everything not touched — Overview cards, Deployment nodes, and Cell nodes together, not three separate mechanisms.

## Docs are generated
`docs/ARCHITECTURE.md` (mermaid deployment diagram plus one mermaid diagram per module cell), `docs/FLOWS.md`, `docs/AI-FUNCTIONS.md`, `docs/AGENTS.md`, `docs/CONSTRAINTS.md` (edge shapes, kind needs, invariants and their raise kind, current violations on the seed), `docs/OPEN.md` (the ranked open items on the seed), and `agent/prompt.md` are all rendered by `scripts/emit-docs.mjs` straight from `src/kernel.ts`, `src/ai/registry.ts`, `src/agents.ts`, and `src/graph.json` — the same sources the app itself reads, so the docs and the running app can never disagree. Run `npm run docs` after any change to those files and commit the result; `npm run smoke` runs it too and fails if `git diff --quiet -- docs agent/prompt.md` is not clean, so stale generated docs never slip into a commit. `docs/AGENT-RUNTIME.md` is the one exception — hand-written, never regenerated.

## Scripts
Both Node-only (no build step), importing `src/kernel.ts`/`src/checks.ts`/`src/graph.json` directly per the "node-runnable" import rule (explicit `.ts` imports, no store/browser code):
- **`npm run observe`** (`scripts/observe.mjs`) — runs `smoke.mjs` with `REALITY_OUT` set so every `t('test-<id>', fn)`-wrapped check's pass/fail lands in `src/reality.json` under `results`, then adds git/kernel metrics (`metric-commits-since-reset`, `metric-violations`) under `metrics`. Never invents a result — only what the smoke run actually observed.
- **`npm run dispatch -- <taskId> [--state queued|running|blocked|done|verified] [--out dir]`** (`scripts/dispatch.mjs`) — with no `--state`, prints a work order (rules served, tests targeted with their conditions and last-observed result, an acceptance line) to stdout and `scratch/workorders/<taskId>.md`; with `--state`, validates and applies one task-lifecycle transition (`queued → running → blocked ↔ running → done → verified`) directly in `src/graph.json`.

## The loop
1. Look at one column (start: basics, then problem).
2. React. I edit `kernel.ts` / `graph.json`. Reload.
3. When a column feels right, set `settled: true` on its space in `kernel.ts`; move one column right.
4. Every change to how Bropilot works also changes Bropilot's own graph in the same commit.
5. Commit and push to `v4` at every step. See `LOG.md`.
