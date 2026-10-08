# B — Information architecture for the uip

Stance: the project is a repo, a **perspective** is a branch-like way of laying the graph out as a
tree, a **node** is a file, the **commit log** is history, the **staged changeset** is a PR, and
**violations/open questions** are issues that live *inside* the tree, not on a separate screen.
Overview.vue already does "spaces as kanban columns of cards"; the uip must not repeat that. Space
is a colour and a facet here, never the layout.

Seed graph (`lfp/src/graph.json`): 243 nodes, 448 edges, all `committed`, 3 orphans
(name, summary, one term). Kinds with 0 nodes: `design-system`. Edge types with 0 edges: `refutes`.

## 1. Perspectives derived from EDGE_TYPES

Edge roles. **Down** edges refine one thing into its parts (the next column). **Across** edges link
peers or jump to another perspective (shown in the node pane, never as a column).

| role   | edge types (direction read from the parent's side) |
|--------|----------------------------------------------------|
| down   | contains, has, exposes, emits, carries, combines, implements(rev), satisfies(rev), motivates, verifies(rev), governs(rev), reports(rev), targets |
| across | uses, references, triggers, defines, hosts, realises, monitors, measures, supports, refutes, serves |

A perspective is an ordered chain `kind —edge→ kind`. `(rev)` means we walk the edge dst→src.
Counts are verified against the seed: **distinct nodes reached / edges walked** at each hop,
starting from all roots of that kind.

**P1 User** (who → what they do → where they do it → what it touches)
```
audience ─has→ problem ←satisfies─ feature ─has→ flow ─uses→ screen ─uses→ interface
   3          5 / 6                11 / 11        2 / 2        1 / 1        1 / 1
alt rung (capability-first, richer):
capability ←implements─ screen ─uses→ interface ─carries→ thing
   7                    3 / 4         3 / 4               4 / 6
```
Finding: the path the user named (audience → usecase → flow) is **broken in the seed**:
audience─has→usecase 2/2, but usecase─has→flow **0**, and the one capability that satisfies a
usecase has **0** screens. 31 of 33 flows are unreachable from any feature; they hang only off
`flow ─uses→ thing` (94 edges, 15 things). The IA must make that visible (§5), not hide it.

**P2 Domain** (C4: system → module → API → data → rules → tests)
```
system ─contains→ module ─exposes→ interface ─carries→ thing ←governs─ rule ←verifies─ test
  1               10 / 10          5 / 5               6 / 10          4 / 6           4 / 4
side rungs at module: ─exposes→ screen 9/9 · ←hosts─ infra 2/6 · ←realises─ codebase 2/3
side rung at interface: ─emits→ event 8/8
```
Down: contains, exposes, carries, governs(rev), verifies(rev). Across: uses (module→module 4,
module→external 4), triggers 3, hosts, realises (this is the jump into Reality).

**P3 Intent** (why → bets → assumptions → evidence)
```
purpose ─motivates→ outcome ←references─ hypothesis ←references─ assumption
   1                3 / 3                5 / 5                   3 / 3
side rungs: outcome ←monitors─ metric 3/3 ←measures─ metric-reading 1/1
            hypothesis ←supports─ evidence 1/1   (←refutes─ evidence: 0)
            goal ─combines→ metric 2/2
```

**P4 Delivery** (epic → task → test → result → rule it proves)
```
epic ─contains→ task ─targets→ test ←reports─ test-result      test ─verifies→ rule
  1             2 / 2          2 / 2          2 / 2            (all tests: 7 / 8)
side rung: task ←implements─ agent 1/2
```

**P5 Product** (capability → who does it → what it is → which problem)
```
capability ─has→ agent ─implements→ feature ─satisfies→ problem
    7            12 / 12            11 / 12             1 / 11
```
Note the funnel: 11 features all satisfy the same 1 problem. That is a shape worth seeing.

## 2. The semantic-GitHub mapping

| GitHub          | uip                                                                 | data source |
|-----------------|---------------------------------------------------------------------|-------------|
| repo            | project (one Graph)                                                 | project list |
| branch          | perspective (same content, different tree)                          | chain defs |
| tree view       | Miller columns over the perspective chain                          | edges |
| file view       | node pane: title, description, props, edges grouped, provenance    | Node |
| blame           | per-field "why": `source` statements, `answerId`, commit that added it | Node.source, Commit.effects |
| history         | commit log; diff = `before` graph vs next; `?at=<commit>` time travel | Commit.before |
| PR              | staged Changeset = draft nodes/edges + effects; "files changed" grouped by perspective | Changeset, status:'draft' |
| issue           | Violation / FollowUp / OpenItem, rendered as badges + slots in place | checks.ts, rankOpen |
| CI checks       | kernel invariants + test-results (green/red per rule)               | INVARIANTS, test-result |
| stale review    | edge `trace: 'suspect'` (endpoint changed under it)                 | Edge.trace |
| Actions         | agents and tasks running                                            | agent, task |

URL scheme (every position linkable; back button pops one column):
```
/                                         project list
/p/:project                               → redirects to last perspective or /user
/p/:project/:persp                        root column only
/p/:project/:persp/:id1/:id2/:id3         one id per selected column, chain implied by persp
/p/:project/:persp/…/:idN/~:edge/:idX     an across hop off the chain (e.g. ~uses/ext-stripe)
/p/:project/n/:id                         canonical permalink, perspective-free (resolves, §4)
/p/:project/changes                       the PR (staged changeset)
/p/:project/commits[/:commitId]           history / one commit diff
?at=:commitId   time travel any view      ?q=…   column filter      #chat=:threadId
```
Path ids, not indexes: a renamed title never breaks a link. Ids are already slugs (`name-bropilot`).

## 3. Level navigation: Miller columns (primary)

| option                | strengths | weaknesses |
|-----------------------|-----------|------------|
| **Miller columns**    | the chain *is* the columns; every column header names the kind and the edge that led there; maps 1:1 to the URL; keyboard ←↑↓→ | wide; only one parent shown |
| tree (outline)        | dense, good for scanning a whole perspective | deep chains indent badly; reverse edges read oddly |
| breadcrumb + list     | mobile-friendly | loses siblings of ancestors |
| zoomable canvas       | shows across-edges and shape | poor for reading; no stable position to link |
| ego canvas (hybrid)   | focus node + 1-hop ring, all edge types | not a traversal; best as a peek |

Pick **Miller columns + a node pane on the right**. Strongest alternative: **ego canvas**
(`nav=canvas`): focus node centred, neighbours ringed by edge type, click re-centres and pushes URL.
Breadcrumb+list is the automatic layout under 720px, not a flag.

```
┌ bropilot ▾ ─ [User][Domain●][Intent][Delivery][Product] ─────── ⟲ history  ⎇ changes(0) ─┐
│ System 1      │ ─contains→ Module 10 │ ─exposes→ Interface 1 │ Talk API (interface)        │
│ ▸ Bropilot  ● │ ▸ talk          ⚠1  │ ▸ Talk API          ● │ "POST /talk, streams cues"  │
│               │ ▸ kernel        ⚠1  │ ┄ + interface?  ⚠     │ ─ carries → (3) thing       │
│               │ ▸ store             │                       │   Utterance · Cue · Effect  │
│               │ ▸ system1     ⚠1    │                       │ ─ emits → (2) event         │
│               │ ……                  │                       │ ─ ← uses (2) screen    ⇄User│
│               │ ┄ Unlinked (0)      │                       │ Also: Domain L3 · Reality ▸ │
│               │                     │                       │ blame: said S58 · c-17      │
├───────────────┴─────────────────────┴───────────────────────┴──────────────── Talk ▸ ─────┤
```
Column header = `edge→ Kind count`. `●` = selected, `⚠n` = open items on that node, `┄` = gap slot.

**Many edge types on one node** (module touches 7 edge types in the seed): the node pane groups **by edge
verb, phrased from this node's side** ("exposes 5", "is hosted by 1", "is realised by 1"), in three
bands: (1) down edges of the current perspective (they become the next column), (2) across edges,
(3) edges that belong to other perspectives, collapsed under a lens chip ("⇄ User: exposes 9
screens"). Within a group, items sort by kind then title. Groups with 1 item render inline.

## 4. Switch perspective, keep the node

Every node pane shows **lens chips** for each perspective where the node's kind appears or is one
bridge edge away. Clicking a chip re-roots: walk the target chain *upwards* from the node to a root,
build the id path, push `/p/:project/:persp/…/:id`. Multiple parents → a small "via" picker
(remembered per session). No path → open the target perspective with the node pinned as a
"floating" first column, marked `not on this chain`.

Bridges verified in the seed:
```
screen (User)      ←exposes─  module (Domain)        9 edges
screen (User)      ─uses→     interface (Domain)    10
flow (User)        ─uses→     thing (Domain)        94   ← the heaviest bridge in the graph
test (Domain)      ←targets─  task (Delivery)        2
capability (Product/User) ─references→ hypothesis (Intent) 3
codebase (Reality) ─realises→ module (Domain)        3
```
```
 Talk screen (screen)                               lens:  [User ●] [⇄ Domain via talk module]
 ─ uses → Talk API (interface)                      [⇄ Product via capability "converse"]
```
`/p/:project/n/:id` uses the same resolver with the last-used perspective.

## 5. Empty, sparse, violated: in the tree, not beside it

- **Empty kind** (design-system 0): the column renders as a ghost with the template question as its
  only row: `┄ No design systems yet. What design system do screens use? [answer]`.
- **Missing `needs`** (seed: module→exposes 6/10 missing, rule←verifies 4/11, protocol←realises 2/6,
  test→verifies 5/13): a dashed slot at the top of the *next* column under that parent,
  `┄ + interface: What does "kernel" expose?`. Answering in place stages a draft (PR count +1).
- **Unlinked bucket**: the bottom of each column lists nodes of that kind not reached from the
  selected parent, `┄ Unlinked flows (31)`. This is how the broken usecase→flow path shows up.
- **Badges** `⚠n` roll up: a node's badge counts its own violations plus its subtree's, so the
  root column already tells you where to dig. Tier-1 items (blocking a task) are red.
- **Suspect edges** render dashed with a `stale` tag, like an outdated review comment.
- **Draft** nodes/edges render with a green left rule ("+ in changes"), mirroring a PR diff.
- Header strip per perspective: `coverage 5/7 hops have data · 15 gaps` links to the first gap.

```
│ ─contains→ Module 10    │ ─exposes→ Interface 0                          │
│ ▸ kernel          ⚠1  ● │ ┄ + interface                                  │
│ ▸ talk                  │   What does "kernel" expose to the rest of the │
│                         │   system? Name its interface.                  │
│                         │   [ CheckApi ] [ none, it is internal ] [ …  ] │
```

## 6. Design options (implement all, behind flags)

1. **`nav=columns|canvas|outline`.** Columns are linear and linkable. Canvas shows the shape of across
   edges (the flow→thing mesh only becomes legible there). Outline is the densest scan of a whole
   perspective. Cost: canvas needs a layout lib (elk/dagre) and its own keyboard model; about 2x the
   work of columns. Outline is cheap.
2. **`edgeGroup=verb|kind|lens`.** Grouping by verb reads as sentences ("exposes 5"). Grouping by
   target kind matches how people hunt ("show me its things"). Grouping by lens foregrounds
   cross-perspective jumps. Cost: low; same data, three sorters.
3. **`persp=curated|derived`.** Curated: the five fixed chains above. Derived: System One is asked at
   each column, with the current path as `state`, "which edge type should the next column follow?"
   (choice over the legal EDGE_TYPES from this kind, with confidence); the chain is built on the fly
   and shown as a dotted header until pinned. Unique: perspectives adapt to sparse projects like this
   seed, where the curated User path is broken. Cost: one System One round trip per column, flicker,
   and URLs need `~edge` segments for every hop.
4. **`gaps=inline|lane|off`.** Inline slots (above) vs a narrow right "gap lane" per column that lists
   that column's open items, vs off for a clean read. Reasonable people disagree on whether slots
   pollute the tree. Cost: low.
5. **`time=log|scrubber`.** A GitHub-like commit list with diffs vs a scrubber on the top bar that
   replays `before` graphs over the *current* columns, with nodes fading in/out. Scrubber is unique:
   history read in the perspective you are in. Cost: scrubber must recompute paths per commit and
   handle the selected node not existing yet.

Chat sidebar: the URL path is the `state` handed to the Talk/System One turn, so "what calls this?"
resolves against the selected node, and an answer that names a node can return a URL to push.
