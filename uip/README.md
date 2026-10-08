# uip

uip is an agent-native semantic GitHub over the LFP ontology. You pick a project and see its atlas, which spans
seven spaces from problem to effects. You then walk the knowledge graph along a *perspective*: a chain of typed
hops such as audience › use case › capability › flow › screen › interface. Gaps in the graph become questions.
A chat sidebar runs one System One (Clef) decision per turn, so you can jump, ask, explain or propose. Agents'
work arrives as changesets that you review and commit, and they never write directly. The app is Vue 3, Vite,
Tailwind v4 and shadcn-vue, running as a Cloudflare Worker with static assets.

The design record lives in `SPEC.md` (the single implementation spec, with the deliberation table in §1),
`design/` (A affordances, B information architecture, C conversational) and `research/`.

## Run

| command | what it does |
|---|---|
| `npm run dev` | UI alone on Vite. System One runs in fake mode, and the chat shows an `offline` tag |
| `npm run cf` | `vite build` then `wrangler dev`: the Worker with Clef through Workers AI. Needs `wrangler login` (you run it) |
| `npm run deploy` | `vite build` then `wrangler deploy` (you run it) |
| `npm run build` | `vue-tsc --noEmit` and `vite build` |
| `npm run check` | `scripts/check-seeds.mjs` checks every graph's edge shapes and perspective hop coverage. This is the only test |

Data scripts write to `public/projects/` and `src/data/`, and the generated JSON is committed:

- `npx tsx scripts/emit-ontology.mjs` runs lfp's kernel and writes `src/data/ontology.json`. It also copies
  `lfp/src/graph.json` to `bropilot.graph.json`, unless you pass `--no-graph`.
- `node scripts/gen-seeds.mjs` writes the synthesized `ledgerly` and `tidepool` graphs.
- `node scripts/gen-timelines.mjs` writes `<project>.timeline.json`, the agent and changeset fixtures.
- `node scripts/build-index.mjs` regenerates `index.json`, the project summaries, from every graph.

The app never imports lfp at runtime.

## Flow

1. **Picker** `/` lists projects with a fingerprint of seven space bars. `Enter` resumes where you left off,
   and `⇧Enter` opens the project home.
2. **Home** `/p/:project` is the atlas. It shows a representation band and a reality band, with Solution split
   by C4 level. It also shows the thinnest link and a card per perspective with its coverage.
3. **Traversal** `/p/:project/:persp/:id1/…` uses one URL segment per column. Across-edge hops add a
   `~edge[:dir]` segment, and `/p/:project/n/:id` is a permalink to any node.
4. **Chat** is open the whole time. It mirrors your selection, moves the view or offers choices, and stages
   changesets. Open changesets are listed at `/p/:project/changes`.

## Flags

Toggle flags in the ⚑ popover. They persist in localStorage `uip.flags`. You can also set them in the URL as
`?ff=nav:focus,gaps:lane`. The URL beats localStorage, and localStorage beats the default. The first value
listed is the default.

| id | values | what it changes |
|---|---|---|
| `nav` | columns · focus · twin · canvas · outline | Miller columns, one node with door chips, focus with two perspective rails, SVG ring of neighbours, or the whole perspective as a tree |
| `waypoints` | explicit · collapse | Collapse turns waypoint steps such as capability into a 56px "via" strip, and ⌥→ skips them |
| `persp` | curated · derived · raw | Curated chains, System One picking each next hop (pin with 📌), or every neighbour grouped by edge |
| `edgeGroup` | verb · kind · lens | How the node pane groups its across edges |
| `gaps` | inline · lane · off | Where gap slots and unlinked buckets render |
| `s1` | act · preview · ask | What a confident turn does: moves with an undo toast, ghost-highlights until Enter, or always offers chips |
| `chat` | sidebar · palette | A 380px right sidebar that collapses to a 44px rail, or a ⌘K palette with a floating thread |
| `agents` | inline · tab | Agent entries in the thread, or in a separate Activity tab |
| `thread` | project · node | One thread per project, or one per selected node plus an Inbox |
| `proposal` | thread · canvas | Review a changeset in its card, or ghost it into the traversal with ✓/✗ pins |
| `picker` | fingerprint · readme · ask | Picker as shape bars, repo cards, or a single System One prompt |
| `store` | static · artifacts | Project data from bundled JSON, or from the Worker's `/api/projects` on Cloudflare Artifacts |

## Keyboard

| key | action |
|---|---|
| ↑ ↓ | rows in the active column |
| ← → | columns. In focus mode they flip through siblings |
| Enter | open, or confirm a System One preview |
| Backspace | up one segment |
| ⌥→ / ⌥← | next or previous perspective step |
| L, then 1 to 6 | perspective menu: switch perspective and keep the node |
| / | filter the column, kept as `?q=` |
| Esc | clear filter, highlight or preview |
| ⌘K | palette, when `chat=palette` |

## System One contract

- Each chat turn makes one `POST /api/decide` request. The questions fan out over intent, perspective,
  uses-context, space, kind and node, and code resolves the chain from the answers.
- Bands set the behaviour. **act** means the confidence is at or above the threshold. **offer** means 0.40 up to
  the threshold, shown as three chips. **ask** means below 0.40 or `none`, shown as a picker. Proposals never act.
- **Repair**: every GuessStrip segment is a dropdown. Changing one re-resolves the levels below with 0 round trips.
- Each repair is logged to localStorage `uip.s1.corrections`. ⚑ › "Export corrections (JSON)" downloads the log.
- Fake mode is used when the Worker is absent or slow. Add `#s1low` to a message to force the offer band, or
  `#s1no` to force the ask band.
- Thresholds live in `src/s1/decisionConfig.ts`, copied from lfp, plus `lens-pick`, `uses-context`,
  `project-pick` and `next-hop`.

## Clef checks the ontology (solidity · completeness · consistency)

Spec: `CHECKS-SPEC.md` (every question string is literal). Code decides what is structural (needs, from/to legality,
orphans); Clef decides only what needs reading the words. 23 checks in three families:

- **Solidity** (`sol-*`): for every semantic edge, "does this relation hold between these two descriptions?"
  (noul), with specialised phrasing for satisfies, implements, verifies, evidence direction, monitors, realises,
  bet→metric, plus a second-pass `sol-retype` choice over the legal relations when weak or broken.
- **Completeness** (`cmp-*`): unmet needs resolved to a candidate target (choice + none); implied-but-missing
  relations (problem names an audience, outcome names a metric, interface names a thing, flow names a screen,
  purpose covers each outcome).
- **Consistency** (`con-*`): rule pairs on the same thing, bet verdict vs its evidence, outcome vs metric, test covers
  the rule's positive and negative case, feature stages vs flows, duplicate titles, summary vs purpose+outcomes,
  term definition vs usage.

Engine `src/checks/`: plan → homogeneous batches (≤64 questions, ≤60k chars) → `/api/decide` (`fn: 'check'`) → resolve
to `solid | weak | broken | unknown` with bands; results cached per content hash (localStorage), re-run incrementally for
a changeset's touched subjects; deterministic fake mode never raises an alarm it cannot justify. Cost on bropilot:
≈545 questions, 24 requests, ≈$0.007 on clef-flash. `npm run checks:test` (20 node tests), `npm run checks:gen-eval`,
`npm run checks:eval -- --model flash --url http://localhost:8787` writes `public/eval/checks-report.json`.

UI: verdict dots on every edge (rows and node-pane chips), a **Checks** band in the node pane (weak links, missing
items, disagreements, each with one-click repairs), column badges, an **Audit** view at `/p/:project/audit` (run all,
estimate, filters, export), an audit score on the atlas and picker, a clef line on every changeset before Accept, and the
chat intent `check` ("is this solid?", "what's missing on X?", "what disagrees here?").

Flags: `checks` lazy · eager · off, `verdictStyle` dots · words · hidden, `repairMode` thread · inline, `checkModel`
flash · escalate · clef.

## Cloudflare

- The Worker in `worker/index.ts` serves static assets from `dist/` with SPA fallback. It runs first for `/api/*`.
- `POST /api/decide` uses the AI binding with `@cf/cloudflare/clef-flash`, or `@cf/cloudflare/clef` when the
  request asks for it, or the model named in `S1_MODEL`. Each attempt times out at 2.5s and is retried once.
  After that, or without the binding, it falls back to fake mode.
- `GET /api/projects[/:id/graph|/:id/timeline]` reads the `ARTIFACTS` binding when it is bound and you set
  `store=artifacts`. Otherwise it proxies the bundled JSON. No Artifacts repos are seeded yet.
- `.dev.vars.example` lists the key names. Keep `.dev.vars` out of git.

## Open items

- Clef has not run live yet: thresholds in `src/s1/decisionConfig.ts` (§5 of CHECKS-SPEC) are unmeasured; run `checks:eval` against the Worker and tune.
- `cmp-flow-screen` dominates bropilot (289 of 527 units) because no flow `uses` a screen; consider capping candidates per flow.

- Seed one Artifacts repo per project, `proj-<id>`, with `project.json`, `graph.json` and `timeline.json`.
- Evaluate the Clef thresholds against Jev with the lfp `s1:eval` harness. The current values are copies.
- Add `/api/answer` for LLM explain prose. It is reserved, and explain is templated in code today.
- Make the `#chat=:threadId` hash restore the thread. The hash is preserved but not read yet.
- Make the chat sidebar resizable. It is fixed at 380px today.
- Add drag-to-cite, dragging a row or chip into the composer.
