# uip SPEC (2026-10-04)

The single implementation spec. Inputs: BRIEF.md, design/A, B, C, research/*. Implementers read only this file
plus the files it names. Kernel ids are real (`lfp/src/kernel.ts`). Node/Edge shapes are `lfp/src/types.ts`
(edges use `src`/`dst`, not from/to).

## 1. Deliberation record

| # | Disagreement | Decision | Loser |
|---|---|---|---|
| 1 | Primary traversal: A focus card + door chips at 5 altitudes; B Miller columns + node pane; A ego / B canvas; A+B outline | **Miller columns + node pane** is default: the chain is the columns, one URL segment per column, siblings stay visible | flag `nav`: `focus` (A, unique: one node, doors, sideways ←/→ flipping), `canvas` (A ego and B canvas are the same idea, merged: radial 1-hop SVG), `outline` (A and B, merged) |
| 2 | A "lens" vs B "perspective" | Same concept, one name: **perspective**. Data shape is B's chain, extended so each step lists hops per parent kind (fixes A's waypoint finding and the broken User path, §3) | A's rail is kept as the focus-mode rendering of the chain. A's twin rails become `nav=twin` (only meaningful with a focus) |
| 3 | Waypoints (capability between usecase and flow): collapse vs explicit (A) | Default `explicit`: honest, and the seed fan-out (1 capability → many flows) needs the stop | flag `waypoints=collapse`: waypoint column renders as a 56px "via" strip, focus-mode ⌥→ skips it |
| 4 | Switch perspective keep node: A pivot ⇄ badge, B re-root resolver | Agree; one implementation: B's upward resolver + "via" picker, A's ⇄ badge on bridge nodes | none |
| 5 | B curated vs derived chains; A lens `off` | Default `curated` (5 chains, §3) | flag `persp`: `derived` (B, unique: S1 picks each next hop, adapts to sparse graphs), `raw` (A's off: every column = all neighbours of the selection, grouped by edge) |
| 6 | Gaps: A dashed `0` door → chat question stub; B inline slots / gap lane / off | Default `inline`. Clicking any gap anywhere opens A's question stub in chat, prefilled from kind `needs[].ask` | flag `gaps`: `lane`, `off` |
| 7 | Chat placement: C right sidebar vs ⌘K palette | Default right sidebar 380px, collapsible to 44px rail | flag `chat=palette` (unique: zero width, navigate turns resolve and close in place) |
| 8 | S1 autonomy: A act/preview/ask; C autoAct on/off; B derived | A's set is a superset of C's (on=act, off=ask). Merged into `s1` flag. B's derived decides structure, not moves, so it stays in `persp` | flag `s1`: `preview`, `ask` |
| 9 | Confidence display: A 3 dots/bands; C number/bar/hidden | **3 dots by band**, exact value in tooltip. C's values are dropped: they change a label, not behaviour | dropped |
| 10 | History: B commit log / scrubber; C agent timeline + changeset PRs | Seeds carry no commit history, so B's `time` flag is dropped for now. C's timeline + changeset card ships, from fixtures | flags `agents` (inline/tab), `proposal` (thread/canvas), `thread` (project/node) from C; `edgeGroup` from B; `picker` from A |

## 2. Flow and URLs

1. **Picker** `/`. User sees project rows (fingerprint: 7 space bars, counts, open items, last touched) and a
   preview pane. Types to filter. ↑↓ selects, `Enter` resumes at `lastFocus`, `⇧Enter` opens project home.
2. **Project home** `/p/:project`. The atlas: two bands (representation, reality), 7 space tiles with counts and
   open badges, Solution split by C4 level, "thinnest link" call to action, perspective cards (each with its
   chain and coverage `n/m hops have data`). Click a space tile → traversal in the perspective rooted in that
   space. Click a perspective card → `/p/:project/:persp`. Chat sidebar is already open, scoped to the project.
3. **Traversal** `/p/:project/:persp/:id1/:id2/...`. Columns per `nav`. Selecting a row pushes its id and opens
   the next column + node pane. Perspective tabs in the top bar switch chain and keep the node (re-root, §3).
   Across edges in the node pane push `~edge:id` segments. Back button pops one segment.
4. **Chat** at any time. The context bar mirrors selection. A turn runs one System One request, resolves in
   code, and either moves the view (act), offers chips (offer) or asks back (ask). Proposals stage a changeset
   card. Agents' entries appear in the timeline.

```
/                                   picker            /p/:project               project home (atlas)
/p/:project/:persp                  root column        :persp = user|domain|intent|delivery|product|raw
/p/:project/:persp/:id1/.../:idN    one id per column  /p/:project/:persp/.../:idN/~:edge/:idX  across hop
/p/:project/n/:id                   permalink → resolves to last-used persp path
/p/:project/changes[/:changesetId]  changeset list / review
?ff=key:value,key:value  flags      ?q=  column filter    #chat=:threadId  (thread=node uses node id)
```
`lastFocus` = `{persp, path}` saved to localStorage `uip.last.<project>` on every navigation.

## 3. Perspectives (`uip/src/perspectives.ts`)

A step lists kinds and the hops that reach them **from the parent row's kind**. Column N items = union of hops
in step N whose `from` equals the selected node's kind in column N-1. `in` means walk dst→src.

```
user      audience
          ─has→ {usecase, problem}                    [audience has usecase, audience has problem]
          ←satisfies─ {capability, feature}  waypoint [usecase|problem ←satisfies capability|feature]
          {flow, screen}                              [capability ←implements flow|screen; feature ─has→ flow]
          {screen, interface}                         [flow ─uses→ screen; screen ─uses→ interface]
          {interface, thing}                          [screen ─uses→ interface; interface ─carries→ thing]
domain    system ─contains→ module ─exposes→ {interface, screen} ─carries→ thing ←governs─ rule ←verifies─ test
          (interface also ─emits→ event at the thing step: step kinds {thing, event})
intent    purpose ─motivates→ outcome
          {hypothesis, metric}       [outcome ←references hypothesis; outcome ←monitors metric]
          {assumption, evidence, metric-reading}
                                     [hypothesis ←references assumption; ←supports|←refutes evidence;
                                      metric ←measures metric-reading]
delivery  epic ─contains→ task ─targets→ test  {test-result, rule}  [test ←reports test-result; test ─verifies→ rule]
product   capability ─has→ agent ─implements→ feature ─satisfies→ {problem, usecase}
```
Seed check (bropilot): every user hop has edges (has 2+6, satisfies 1+5+11, implements 3+4, has-flow 2,
uses-screen 1, uses-interface 10, carries ✓). The thin `flow uses screen` (1 of 33) shows as a gap, not a dead end.

**Edge roles on a node** (node pane bands, in order):
1. *Down*: edges that are hops of the current perspective from this kind. They feed the next column.
2. *Across*: all other edges, phrased from this node's side ("exposes 5", "is realised by 1"). Grouped per
   `edgeGroup` (verb | target kind | perspective). Groups of 1 render inline.
3. *Other perspectives*: lens chips for each perspective whose chain contains this kind, or is one bridge edge
   away, e.g. `⇄ Domain via module talk`. Bridge kinds (screen, interface, thing, test, capability, module) get ⇄.

**Re-root** (perspective switch, `/n/:id`): walk the target chain upwards from the node to a step-0 kind with
reverse hops, BFS, shortest. Several parents → "via" picker popover (remembered per session). No path → node
pinned as a floating first column marked `not on this chain`.

**Derived** (`persp=derived`): column N+1's hop is chosen by `pickNextHop` (§10 types) from all legal edges of
the selected kind; the column header is dotted until the user clicks 📌, which pins it. URL carries `~edge`.

**Raw** (`persp=raw`): no chain; column N+1 = all neighbours of the selection, grouped by edge verb.

## 4. Screens (⚑ = varies by flag)

**Top bar (all in-project screens)**
```
◎ uip ▾ bropilot │ [User][Domain●][Intent][Delivery][Product][Raw]  coverage 5/6 · 15 gaps │ ⎇ changes 1 │ ⚑ │ ◐ │ ◫
```
Components: ProjectSwitcher, PerspectiveTabs, CoverageChip (click → first gap), ChangesButton, FlagsPopover,
ThemeToggle, ChatToggle.

**Picker** ⚑`picker`
```
┌ uip ─────────────────────────────────────────────────────────────── ⌕ filter or ask…  ⚑ ◐ ┐
│ ▸ Bropilot   ▂▅▃█ ▁▂▁  243·448  7 open  2h │ Bropilot                                       │
│   Help people build self-sustaining…        │ Help people build self-sustaining software      │
│   Ledgerly   ▃▅▃▅ ▃▂▂   64·120  3 open  1d │ ┌ atlas thumbnail ───────────────┐             │
│   Tidepool   ▄▄▃▅ ▂▂▃   58·110  4 open  3d │ │ B P H S │ C Pl E               │             │
│              B P H S  C Pl E                │ └────────────────────────────────┘             │
│                                             │ open: flow → screen thin (1 of 33)            │
│                                             │ ⏎ Resume › Domain › module talk  ⇧⏎ home       │
└─────────────────────────────────────────────┴───────────────────────────────────────────────┘
```
`fingerprint` (above). `readme`: grid of cards (name, purpose, summary, counts, last touched), no bars.
`ask`: one big input; S1 `project-pick` choice over projects + none; result row shows dots, Enter opens.
Components: ProjectRow, Fingerprint (7 bars, hue = space, red tick if open > 0), ProjectPreview, AtlasThumb.

**Project home (atlas)**
```
┌ top bar ───────────────────────────────────────────────────────────────────┬ chat ──────┐
│ REPRESENTATION                                                              │            │
│ [Basics 3]→[Problem 16 ·1?]→[Bets 14 ·2?]→[Solution 186 ·4?]                │            │
│                              L1 system·external 6 │ L2 module·infra 14      │            │
│                              L3 thing rule iface event proto test 65        │            │
│ REALITY        ↑realises         ↓planned            ↑reports              │            │
│ [Current 25]   [Planned 3]   [Effects 4 ·1?]                               │            │
│ thinnest link: flow → screen (1 of 33)   [ask about it]                     │            │
│ PERSPECTIVES                                                                │            │
│ User   audience › usecase › (capability) › flow › screen › interface  6/6  │            │
│ Domain system › module › interface › thing › rule › test             6/6  │            │
│ …                                                                           │            │
└─────────────────────────────────────────────────────────────────────────────┴────────────┘
```
Components: AtlasBand, SpaceTile (hue left rule 3px, icon, count, open badge), LevelSplit, ThinnestLink
(the perspective hop with the lowest edges/parents ratio), PerspectiveCard.

**Traversal** ⚑`nav` ⚑`waypoints` ⚑`gaps` ⚑`persp`
```
nav=columns (default)
│ System 1     │ ─contains→ Module 10 │ ─exposes→ Interface·Screen 1 │ node pane            │
│ ▸ Bropilot ● │ ▸ talk           ⚠1 ●│ ▸ Talk API                 ● │ (below)              │
│              │ ▸ kernel          ⚠1 │ ┄ + interface: What does     │                      │
│              │ ▸ store              │   "talk" expose? [answer]     │                      │
│              │ ┄ Unlinked (0)       │ ┄ Unlinked screens (3)       │                      │
```
Column header = `edge→ Kinds count`. `●` selected, `⚠n` open items rolled up, `┄` gap slot / unlinked bucket.
`waypoints=collapse`: waypoint column is a 56px strip `via capability 1`, auto-selects when it has 1 row.
`gaps=lane`: slots move to a 160px lane right of each column; `off`: hidden (badges stay).
```
nav=focus                                                 nav=twin
│ lens: audience › usecase › (capability) › flow › [■screen] › interface │  rail user  ─┐
│   3 / 9  ← →                                                            │              [■ Talk screen]
│ ┌ 🖥 Talk screen                       ⇄ ┐                              │  rail domain ─┘
│ │ body · fields · committed               │                             │ (second rail picks the
│ └─────────────────────────────────────────┘                             │  best bridging perspective,
│ [uses → 🔌 Interface 2] [implements → 🧰 Capability 1] [↩ came from]     │  dropdown to change)
│ other edges (3) ▾   ┌- - - - - - - - - ┐ measured by Usage 0 · ask →    │
```
`nav=canvas`: hand-rolled SVG, focus centred, ≤24 neighbours on a ring grouped by edge verb (arcs labelled),
"+n" bucket node per group beyond cap; click re-centres and pushes the URL. No layout library.
`nav=outline`: indented tree of the whole perspective from all step-0 roots, expand/collapse, cycles cut with
a visited set and rendered as `↻ title`.
Keys (all modes): ↑↓ rows, ←→ columns (focus: siblings), Enter open, Backspace up, `L` perspective menu,
⌥→/⌥← next/prev step, `/` filter, `⌘K` palette (when `chat=palette`).

**Node pane** ⚑`edgeGroup`
```
┌ 🔌 Talk API · interface · solution L3        ⇄  [Ask about this] ┐
│ POST /talk, streams cues                                          │
│ props: route /talk     status committed    source: said S58       │
│ needs: ✓ carries ≥1   ✗ emits ≥1  → [ask]                         │
│ ── down (Domain) ─ carries → thing (3)  Utterance · Cue · Effect  │
│ ── across ─ emits → event (2) · ← uses screen (2)                  │
│ ── other perspectives ─ [⇄ User via screen Talk] [⇄ Delivery …]   │
└───────────────────────────────────────────────────────────────────┘
```
Components: NodeHeader, PropsList, NeedsList, EdgeBand, EdgeGroup, LensChips, ViaPicker.
Drafts (from accepted/ghosted changesets) render with a green left rule `+ in changes`; suspect edges dashed.

**Chat sidebar** ⚑`chat` ⚑`agents` ⚑`thread` ⚑`s1`
```
A. idle                                  B. offer band                          C. collapsed rail (44px)
┌ chat · project ──────── ⚑1 ◫ ┐        │ ● you  [Domain · L2]               │ ┌──┐
│ ■ extractor 4 changes · 11 [▸]│        │   show me the review thing         │ │■ │ agent avatars
│ ■ reviewer  #12 Split… ⚑      │        │ ◆ read as: navigate › ? ●●○        │ │■ │
│ ◆ S1 1 link needs you  [pick] │        │   [◉ Review change · ai-fn]        │ │◆ │
│ ─────── you are here ───────  │        │   [■ Reviewer · agent] [other…]    │ │⚑1│ needs-you badge
│ Try: "what tests this?"       │        │   Enter = first chip               │ │💬│
│ ┌ looking at ───────────────┐ │        └────────────────────────────────────┘ └──┘
│ │[◉ Talk API][⟂ Domain][L3]×│ │
│ │ ask, jump, or propose… @ ⏎│ │
│ └───────────────────────────┘ │
```
Entry types: human (round avatar), agent (square), S1 (◆). Navigate replies = JumpCard (target chip + trail
with edge verbs + "show as filter"). Ask = ResultList (≤7 rows, each with an edge reason, "show all"). Explain =
prose from node description + edges, every noun a NodeChip. Propose = ChangesetCard. Every S1 reply has a
GuessStrip: `read as: navigate › Agent ▾ › Reviewer ▾ ●●●` where each segment is a dropdown (repair, §6).
NodeChip hover highlights the node in the traversal view; click navigates (crumb tagged `via chat`).
Each sent turn freezes the context bar into its header; clicking restores that view.
`chat=palette`: ⌘K centred input; navigate resolves and closes; ask/explain/propose expand a floating thread
anchored under the top bar. `agents=tab`: timeline entries move to a "Activity" tab beside "Chat".
`thread=node`: thread keyed by selected node id (project thread kept as "Inbox"); switching node switches thread.
`s1`: see §6.

**Agent timeline + changeset review card** ⚑`proposal`
```
│ ■ reviewer · changeset #12   checks ✓ 0 ⚠1 │
│ "Split Review change into triage + verdict"│
│  touches 2 screens in User · 1 test orphaned│
│ ┌────────────────────────────────────────┐ │
│ │ ✓ + ai-function  Triage change         │ │
│ │ ✓ + ai-function  Verdict               │ │
│ │ ✓ ~ Review change → deprecated         │ │
│ │ ✗ − verifies  Tier test → Review change│ │
│ │   reason: keep until verdict has a test│ │
│ └────────────────────────────────────────┘ │
│ [Review on canvas] [Accept 3 of 4] [Send back] [Discard] │
```
Fold rule: one line per agent per burst; break out only changesets awaiting you, red tests, and mentions of you
or the selected node. `proposal=thread` (default): review happens in the card. `proposal=canvas`: "Review on
canvas" ghosts effects into the traversal view (dashed draft rows/doors/ring nodes) with ✓/✗ pins inline; the
card shrinks to a checklist. Accept applies accepted effects to the in-memory graph (status `draft` until a
"Commit" button flips them to `committed`). Send back requires a reason per rejected effect and appends a canned
agent reply after 1.2 s.

## 5. Feature flags

Toggled in the ⚑ popover (top bar, also on picker). Persisted in localStorage `uip.flags`; `?ff=` overrides
for the session and is rewritten into the URL on change. Precedence: URL > localStorage > default.

| id | values (first = default) | what each value uniquely changes |
|---|---|---|
| `nav` | columns · focus · twin · canvas · outline | columns: Miller chain. focus: one node, door chips, sibling flipping, lens rail. twin: focus with two rails (pivot work). canvas: SVG ego ring, shows across-edge shape. outline: whole perspective as a tree |
| `waypoints` | explicit · collapse | collapse: waypoint steps become a via strip / are skipped by ⌥→ |
| `persp` | curated · derived · raw | derived: S1 picks each next hop. raw: no chain, neighbours by edge |
| `edgeGroup` | verb · kind · lens | node pane across-band grouping by edge verb, target kind, or perspective |
| `gaps` | inline · lane · off | where gap slots and unlinked buckets render |
| `s1` | act · preview · ask | what the *act* band does: move now + undo toast; ghost highlight + Enter; always chips |
| `chat` | sidebar · palette | right sidebar with timeline vs ⌘K palette with floating thread |
| `agents` | inline · tab | agent entries interleaved in the thread vs a separate Activity tab |
| `thread` | project · node | one thread per project vs per selected node (+ Inbox) |
| `proposal` | thread · canvas | changeset review in the card vs ghosted into the traversal view |
| `picker` | fingerprint · readme · ask | picker layout: shape bars, repo cards, single S1 prompt |
| `store` | static · artifacts | project data from bundled JSON vs Worker `/api/projects` on Cloudflare Artifacts |

## 6. System One contract

**One request per chat turn** (`fn: 'turn'`), all branches fanned out, only the chosen chain read.
```
state = { text, context: { node?: {title, kind}, persp, level? },
          candidates: string[] /* ≤12 substring/token-overlap title hits */ }
questions:
  intent        choice navigate | ask | propose | explain | none            threshold route-utterance .70
  persp         choice user | domain | intent | delivery | product | keep   threshold lens-pick .65
                (criteria carry the chain text, e.g. "audience → use case → flow → screen")
  uses-context  noul  "Does the text refer to the selected node (this, it, here)?"  threshold uses-context .55
                (only when context.node is set)
  space         choice problem | hypothesis | solution | current | planned | effects | none
  kind-<space>  choice per space, non-singular kinds, each criterion "Label: blurb, e.g. "A", "B", "C"" + none
  node-<kind>   choice per kind with ≥1 node: ≤40 titles + none                threshold find-by-title .65
  cand          choice candidates + none (only when candidates.length > 0)    threshold find-by-title .65
```
Budget: ≤64 questions (Clef cap) and ≤64k tokens (JSON chars / 4). Seed: 4 + 1 + 6 + 39 = 50. If over,
drop `node-<kind>` for kinds with the fewest candidate hits first.

**Resolution in code** (`src/s1/resolve.ts`): target node = `uses-context` (if confident) → selected node;
else confident `cand`; else `space → kind-<space> → node-<kind>`. Confidence of a chain = min of its answers
(noul confidence = |p-.5|·2). Thresholds live in `uip/src/s1/decisionConfig.ts`, a copy of
`lfp/src/ai/decisionConfig.ts` values plus three uip keys: `lens-pick .65`, `uses-context .55`,
`project-pick .65`, `next-hop .65`.

| band | rule | UI |
|---|---|---|
| act | chain confidence ≥ threshold | per `s1` flag: act moves the view + undo toast; preview ghost-highlights, Enter confirms; ask shows chips |
| offer | ≥ 0.40 and < threshold | nothing moves; top choice + 2 runners-up as chips, Enter = first |
| ask | < 0.40 or `none` | one question with a node picker pre-filtered to the guessed kind |
Propose never acts: always a ChangesetCard awaiting Accept. Ask/explain with a resolved target render in code
(ResultList over neighbours / templated prose). No LLM call in v1; `POST /api/answer` is reserved.

**Repair**: each GuessStrip segment is a dropdown of the other options in probability order. Picking one
re-resolves only the levels below from the answers already held (0 round trips). Every repair is logged as
`{at, text, state, question, wrong, right}` to localStorage `uip.s1.corrections`; the ⚑ popover has
"Export corrections (JSON)". The reply shows "noted, using *flow*".

**Other decisions** (same endpoint, other `fn`): `project-pick` (picker=ask; choice over project names +
none), `next-hop` (persp=derived; choice over legal `edge:dir` keys of the selected kind, state = path titles).

**Fake mode** (`src/s1/fake.ts`, pure, imported by the client and the Worker): intent by keyword regex
(show/go/open/where → navigate; add/create/propose/link → propose; why/explain → explain; `?`/which/what/how
→ ask); persp by keyword lists per perspective; choices by token overlap with option text/criteria. Confidences:
exact title 0.92, one strong hit 0.75, several 0.50, none 0.20 with choice `none`. Tokens `#s1low` force 0.50
and `#s1no` force 0.20. Client uses fake when `/api/decide` fails, 404s, or exceeds 6 s; the GuessStrip shows
an `offline` tag when `fake: true`.

## 7. Cloudflare

Worker + static assets. `uip/worker/index.ts`:
- `POST /api/decide` body `DecideRequest` → `DecideResponse`. With `env.AI`: `env.AI.run(modelId,
  {model, state, questions})`, modelId `@cf/cloudflare/clef-flash` (default, or `env.S1_MODEL`), `@cf/cloudflare/clef`
  when `req.model === 'clef'`. Per-attempt timeout 2.5 s, one retry, then fake. Without `env.AI`: fake.
- `GET /api/projects` and `GET /api/projects/:id/graph`, `GET /api/projects/:id/timeline`: if `env.ARTIFACTS`
  exists, `list()` repos prefixed `proj-`, `readFile({ref:'main', path:'project.json' | 'graph.json' |
  'timeline.json'})`; otherwise proxy `env.ASSETS` to `/projects/...`. Seeding Artifacts repos is out of scope.
- Everything else → `env.ASSETS.fetch(req)`.

`uip/wrangler.jsonc`:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "uip",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-04",
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application",
              "binding": "ASSETS", "run_worker_first": ["/api/*"] },
  "ai": { "binding": "AI" },
  "artifacts": [{ "binding": "ARTIFACTS", "namespace": "default" }],
  "observability": { "enabled": true }
}
```
If the installed wrangler rejects `artifacts`, remove that block and note it in README (store=static still works).
`uip/.dev.vars.example` (key names only, gitignore `.dev.vars`): `S1_MODEL=`, `OPENROUTER_API_KEY=` (reserved
for a Jev fallback, unused in v1). Scripts: `dev` = `vite` (UI alone, fake S1), `cf` = `vite build && wrangler
dev` (Worker + AI binding; AI needs `wrangler login`, user-run), `deploy` = `vite build && wrangler deploy`
(user-run).

## 8. Data

Files under `uip/public/projects/`: `index.json` (ProjectSummary[]), `<id>.graph.json` (Graph),
`<id>.timeline.json` (Timeline). Ontology: `uip/src/data/ontology.json`, emitted by `uip/scripts/emit-ontology.mjs`
(runs lfp's kernel under node, writes SPACES {id,label,layer,order,hue,blurb}, KINDS {id,label,plural,space,icon,
level,singular,needs,blurb}, EDGE_TYPES {id,label,category,from,to}). Commit the JSON; the app never imports lfp.

Projects:
- `bropilot`: copy of `lfp/src/graph.json`. Name/purpose/summary from its singular nodes.
- `ledgerly`: invoicing and cash-flow for freelancers (audiences: freelancer, accountant). 60-80 nodes.
- `tidepool`: citizen-science coastal monitoring field app (audiences: volunteer, marine biologist). 40-60 nodes.

Each synthesized graph must include: name, purpose, summary; ≥2 audience, ≥2 usecase, ≥2 problem, ≥2 outcome,
1 goal, 1 context; ≥3 hypothesis, ≥2 assumption, ≥2 metric; ≥3 capability, ≥3 feature, ≥4 flow, ≥4 screen,
≥2 agent, ≥2 term; 1 system, ≥1 external, ≥3 module, ≥1 infra, ≥3 interface, ≥4 thing, ≥3 rule, ≥2 event,
≥1 protocol, ≥3 test, ≥1 ai-function; repository, codebase, ≥1 practice, ≥3 test-result; 1 epic, ≥2 task;
metric-reading, usage-event, feedback, ≥2 evidence (one `supports`, one `refutes`, which the seed lacks).
Edges: every hop of every perspective (§3) has ≥2 edges, plus `codebase realises module`, `infra hosts module`,
`term defines thing`, `goal combines metric`, `capability references hypothesis`. Deliberately leave 2-3 gaps
(a module with no `exposes`, a flow with no screen, a rule with no test) so gap UI demos. All edges respect
EDGE_TYPES from/to. All statuses `committed`. Ids are slugs `<kind>-<title-slug>`.
`uip/scripts/check-seeds.mjs` validates edge shapes and hop coverage per project; this is the only test.

Timeline fixtures per project: 6-10 entries: 2 agent commit bursts, 1 red test, 1 task change, 1 open changeset
(4 effects, one removal) awaiting the user, 1 accepted changeset, 1 S1 link entry.

## 9. Stack (decided)

Vue 3 + Vite + TypeScript, Tailwind v4 (`@tailwindcss/vite`), shadcn-vue on reka-ui (button, input, popover,
dropdown-menu, tabs, tooltip, scroll-area, badge, card, separator, toggle-group, command, sonner), vue-router,
Pinia, lucide-vue-next. Desktop-first (≥1280 target; <720 falls back to breadcrumb + list, no flag). Dark mode
via `.dark` class, toggle persisted. Space hues come from ontology.json SPACES.hue as CSS variables
`--space-<id>`. No vue-flow. Dev deps: wrangler, @cloudflare/workers-types.

## 10. Build plan

**Shared contract**: WP1 writes these two files first, verbatim, before anything else.

`uip/src/types.ts`
```ts
import type { Ref, ComputedRef } from 'vue';
export type Status = 'draft' | 'committed';
export interface Node { id: string; kind: string; title: string; description?: string;
  props?: Record<string, string>; status: Status; source?: unknown; answerId?: string }
export interface Edge { id: string; src: string; dst: string; type: string; status?: Status; trace?: 'valid' | 'suspect' }
export interface Graph { nodes: Node[]; edges: Edge[] }
export type SpaceId = 'basics' | 'problem' | 'hypothesis' | 'solution' | 'current' | 'planned' | 'effects';
export type PerspId = 'user' | 'domain' | 'intent' | 'delivery' | 'product' | 'raw';
export interface ProjectSummary { id: string; name: string; purpose: string; summary: string;
  counts: Record<SpaceId, number>; nodeCount: number; edgeCount: number; openCount: number;
  updatedAt: string; lastFocus?: { persp: PerspId; path: string[] } }
export interface Hop { from: string; edge: string; dir: 'out' | 'in' }
export interface PerspStep { kinds: string[]; via: Hop[]; waypoint?: boolean }
export interface Perspective { id: Exclude<PerspId, 'raw'>; label: string; blurb: string; steps: PerspStep[] }
export interface ViewState { project: string; persp: PerspId; path: string[]; across?: { edge: string; id: string } }
export type Band = 'act' | 'offer' | 'ask';
export type Intent = 'navigate' | 'ask' | 'propose' | 'explain' | 'none';
// System One wire types: identical to lfp/src/ai/types.ts
export type S1Criterion = string | { definition: string; examples: string[] };
export type S1Question =
  | { type: 'noul'; instructions: string; criteria?: { true?: S1Criterion; false?: S1Criterion } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };
export type S1Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> };
export interface DecideRequest { fn: 'turn' | 'project-pick' | 'next-hop'; state: unknown;
  questions: Record<string, S1Question>; model?: 'clef-flash' | 'clef' }
export interface DecideResponse { answers: Record<string, S1Answer>; model: string; ms: number; fake: boolean; error?: string }
export interface TurnContext { node?: string; persp: PerspId; level?: 0 | 1 | 2 | 3 }
export interface Option { value: string; label: string; confidence: number }
export interface Decision { key: 'intent' | 'persp' | 'space' | 'kind' | 'node'; value: string; label: string;
  confidence: number; alternatives: Option[] }
export interface TurnResolution { intent: Intent; band: Band; confidence: number; decisions: Decision[];
  usesContext: boolean; target?: { persp: PerspId; path: string[] }; nodeSet?: string[]; fake: boolean }
export type CanvasCommand =
  | { verb: 'focus'; id: string } | { verb: 'trail'; persp: PerspId; path: string[] }
  | { verb: 'filter'; ids: string[] } | { verb: 'ghost'; changesetId: string } | { verb: 'preview'; id: string }
  | { verb: 'highlight'; ids: string[] } | { verb: 'clear' };
export interface Author { kind: 'human' | 'agent' | 's1'; id: string; name: string }
export interface Effect { id: string; op: 'add-node' | 'add-edge' | 'update-node' | 'remove-edge' | 'remove-node';
  node?: Node; edge?: Edge; before?: Partial<Node>; verdict: 'pending' | 'accepted' | 'rejected'; reason?: string }
export interface Changeset { id: string; number: number; title: string; author: Author;
  status: 'open' | 'accepted' | 'partial' | 'rejected' | 'sent-back' | 'committed'; effects: Effect[];
  checks: { ok: number; warn: number; messages: string[] }; blast: string; createdAt: string }
export type TimelineEntry = { id: string; at: string; author: Author; nodeRefs?: string[] } & (
  | { type: 'message'; text: string; context?: TurnContext; resolution?: TurnResolution; thread?: string }
  | { type: 'changeset'; changeset: Changeset }
  | { type: 'commit'; summary: string; effects: string[] }
  | { type: 'test'; ok: boolean; testId: string; title: string }
  | { type: 'task'; taskId: string; status: string });
export interface Timeline { project: string; entries: TimelineEntry[] }
/** WP1's Pinia store `useGraph()` (src/store/graph.ts) implements this; WP2 only uses this surface. */
export interface GraphApi {
  project: Ref<ProjectSummary | null>; graph: Ref<Graph>; view: Ref<ViewState>;
  selection: ComputedRef<Node | null>; perspectives: Perspective[];
  byId(id: string): Node | undefined;
  neighbours(id: string): { edge: Edge; other: Node; dir: 'out' | 'in' }[];
  resolvePath(persp: PerspId, id: string): string[] | null;   // re-root resolver (§3)
  dispatch(cmd: CanvasCommand): void; undo(): void;
  ghost: Ref<Changeset | null>; applyEffects(effects: Effect[], status: Status): void;
  openGap(kind: string, parentId: string | null, question: string): void; // emits 'gap' for chat
  onGap(cb: (g: { kind: string; parentId: string | null; question: string }) => void): () => void;
}
/** WP2 implements in src/s1/hops.ts; WP1 calls it when persp=derived. */
export type PickNextHop = (a: { kind: string; pathTitles: string[]; options: Hop[] }) =>
  Promise<{ hop: Hop; confidence: number; band: Band; fake: boolean }>;
```

`uip/src/flags.ts`
```ts
import { reactive, watch } from 'vue';
export const FLAGS = {
  nav: ['columns', 'focus', 'twin', 'canvas', 'outline'], waypoints: ['explicit', 'collapse'],
  persp: ['curated', 'derived', 'raw'], edgeGroup: ['verb', 'kind', 'lens'], gaps: ['inline', 'lane', 'off'],
  s1: ['act', 'preview', 'ask'], chat: ['sidebar', 'palette'], agents: ['inline', 'tab'],
  thread: ['project', 'node'], proposal: ['thread', 'canvas'], picker: ['fingerprint', 'readme', 'ask'],
  store: ['static', 'artifacts'],
} as const;
export type FlagId = keyof typeof FLAGS;
export type Flags = { -readonly [K in FlagId]: (typeof FLAGS)[K][number] };
const KEY = 'uip.flags';
const defaults = (): Flags => Object.fromEntries(Object.entries(FLAGS).map(([k, v]) => [k, v[0]])) as Flags;
const valid = (k: string, v: string): k is FlagId => k in FLAGS && (FLAGS as any)[k].includes(v);
function parse(src: string | null): Partial<Flags> {
  const out: Record<string, string> = {};
  for (const pair of (src ?? '').split(',')) { const [k, v] = pair.split(':'); if (k && v && valid(k, v)) out[k] = v; }
  return out as Partial<Flags>;
}
function load(): Flags {
  let stored: Partial<Flags> = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch {}
  const url = parse(new URLSearchParams(location.search).get('ff'));
  return { ...defaults(), ...stored, ...url };
}
export const flags = reactive<Flags>(load());
watch(flags, (f) => {
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch {}
  const d = defaults(); const ff = (Object.keys(f) as FlagId[]).filter((k) => f[k] !== d[k]).map((k) => `${k}:${f[k]}`).join(',');
  const u = new URL(location.href); ff ? u.searchParams.set('ff', ff) : u.searchParams.delete('ff');
  history.replaceState(history.state, '', u);
}, { deep: true });
export const useFlags = () => flags;
```

**WP1 (scaffold, data, store, router, flags, picker, atlas, traversal, node pane)** owns:
`uip/package.json` (all deps for both WPs), `vite.config.ts`, `tsconfig*.json`, `index.html`, `components.json`,
`src/main.ts`, `src/App.vue`, `src/router.ts`, `src/style.css`, `src/types.ts`, `src/flags.ts`,
`src/perspectives.ts`, `src/ontology.ts` (typed accessors over `src/data/ontology.json`), `src/data/*`,
`src/store/*`, `src/components/ui/*` (shadcn), `src/components/shell/*` (TopBar, FlagsPopover, ThemeToggle,
PerspectiveTabs), `src/views/{Picker,ProjectHome,Traversal,Changes}.vue`, `src/components/{picker,atlas,nav,node}/*`,
`public/projects/index.json`, `public/projects/*.graph.json`, `scripts/emit-ontology.mjs`, `scripts/check-seeds.mjs`.
App.vue mounts `src/chat/ChatSidebar.vue` and `src/chat/ChatPalette.vue` (switch on `flags.chat`); Changes.vue
renders `src/agents/ChangesetCard.vue` per open changeset. Traversal imports `pickNextHop` from `src/s1/hops.ts`.
FlagsPopover renders an "Export corrections" button that calls `exportCorrections()` from `src/s1/corrections.ts`.

**WP2 (chat, System One, Worker, timeline, changeset card)** owns:
`src/chat/*` (ChatSidebar, ChatPalette, ContextBar, Composer, GuessStrip, JumpCard, ResultList, NodeChip,
QuestionStub, AgentFold, ActivityTab), `src/s1/*` (client.ts, turn.ts builds the fan-out, resolve.ts,
fake.ts, hops.ts, projectPick.ts, decisionConfig.ts, corrections.ts), `src/agents/*` (timeline store,
ChangesetCard, EffectRow, ReviewChecklist), `worker/*`, `wrangler.jsonc`, `.dev.vars.example`,
`public/projects/*.timeline.json`. **First action:** commit stub files for `src/chat/ChatSidebar.vue`,
`src/chat/ChatPalette.vue`, `src/agents/ChangesetCard.vue` (props `{ changeset: Changeset }`), `src/s1/hops.ts`
(`export const pickNextHop: PickNextHop` returning the first option at 0.5 / offer), `src/s1/corrections.ts`
(`export function exportCorrections(): void`) so WP1 builds green. WP2 uses `useGraph()` only through `GraphApi`.
`src/s1/projectPick.ts` exports `pickProject(text: string, projects: ProjectSummary[]): Promise<{ id: string | null;
confidence: number; band: Band; fake: boolean }>`, which WP1's Picker calls when `picker=ask`.

Synthesizing `ledgerly`/`tidepool` graphs is WP1; their timeline fixtures are WP2 (read node ids from WP1's
graph files once committed; until then use bropilot ids only).

**WP3 integration checklist**
1. `npm run dev` with no Worker: picker shows 3 projects; every perspective on every project has data on every
   hop (`node scripts/check-seeds.mjs` passes); chat turns resolve via fake with the `offline` tag.
2. `vue-tsc --noEmit` and `vite build` pass. `wrangler dev` (after `vite build`) serves the SPA, deep links,
   `/api/projects`, and `/api/decide` (fake without login).
3. Each of the 12 flags toggles from ⚑, survives reload, and round-trips through `?ff=`. Walk all 31 values once.
4. Chat ↔ view: NodeChip hover highlights, click navigates; selection updates the context bar; frozen context
   restores the view; gap click opens a QuestionStub; act/offer/ask bands each demo (`#s1low`, `#s1no`).
5. Repair: change a GuessStrip segment, view re-resolves with 0 requests, correction exported.
6. Changeset: open → review (thread and canvas) → partial accept → drafts render green → Commit → committed.
   Send back appends the agent reply.
7. Perspective switch keeps the node (via picker on multi-parent, floating column when off-chain).
8. Dark mode on every screen. Update `lfp/README.md` "Latest Update" is NOT in scope; write `uip/README.md`
   (how to run, flags list, open items: Artifacts seeding, Clef thresholds eval, `/api/answer`).

## 11. Ownership amendment (lead, 2026-10-04)

A third parallel package **WP-data** owns: `public/projects/ledgerly.graph.json`, `public/projects/tidepool.graph.json`,
`scripts/check-seeds.mjs`, `scripts/build-index.mjs` (regenerates `public/projects/index.json` from every
`*.graph.json`; `updatedAt` fixed strings, `openCount` = unmet `needs` + unlinked-flow count). WP1 still writes the
initial `index.json` (bropilot only) and `bropilot.graph.json`; WP-data's script overwrites `index.json` at the end.
WP-data reads kinds/edge constraints straight from `lfp/src/kernel.ts` (own tsx/node run), not from WP1's ontology.json.
WP2 writes `bropilot.timeline.json` first; `ledgerly`/`tidepool` timelines once their graphs exist on disk.
