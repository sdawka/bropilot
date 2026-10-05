# C — Conversational & agent-native layer (uip chat sidebar)

Stance: the chat is not a help desk next to the graph. It is a second cursor on the graph.
Every message is typed, every reply is a graph object (a jump, a node set, a diff),
and prose is the caption, never the payload. The LFP Talk panel is one current ask/say card
with option buttons. The uip is the opposite: a durable, multi-author thread where humans,
agents and System One all write typed entries against the same graph.

## 1. What the chat is for: four message types, four renderings

| Intent   | Example                                   | Reply renders as                                                      | Canvas effect |
|----------|-------------------------------------------|-----------------------------------------------------------------------|---------------|
| navigate | "show me what the reviewer agent touches" | **Jump card**: target chip + breadcrumb trail (space › kind › node) + edges walked | camera flies, path pulses once, trail stays as crumbs |
| ask      | "which screens have no tests behind them" | **Result list**: node rows, each with its *edge reason* ("no `verifies` from any test") | matching nodes ringed; others dim to 30% |
| propose  | "add an outcome for churn"                | **Diff card**: `+ node`, `+ edge` lines, kernel checks, Accept / Edit / Reject | ghost nodes (dashed) at their would-be positions |
| explain  | "why does H3 matter?"                     | Prose with inline node chips (Wattenberger-style: every noun is hoverable) | hovering a chip highlights it |

Rules:
- A navigation reply is never prose. It is a jump plus a trail you can click back along.
- A question reply always says *why* each row is there. The reason is an edge, or a missing edge.
- A proposal never writes. It stages a changeset; the graph changes only on Accept.
- Result lists cap at 7 rows inline. "Show all 23 on canvas" turns the list into a canvas filter.

## 2. Shared context

**The context bar** sits at the top of the composer, always visible, always editable:

```
┌ looking at ─────────────────────────────────────────┐
│ [◉ Review change · ai-function] [⟂ Domain] [L2] ×   │
└─────────────────────────────────────────────────────┘
```

- Three pills: selected node, perspective, level. Selecting on canvas updates them live.
- Click × on a pill to send a turn *without* that context ("ask about the whole project").
- Every sent turn freezes a copy of the bar into the message header. Re-reading the thread later,
  you see what the user was looking at when they asked. That copy is a link: click restores the view.

**The chat moves the canvas** through four verbs only: `focus(node)`, `trail(path)`,
`filter(nodeSet)`, `ghost(changeset)`. Each is undoable with ⌘Z like any canvas move.
A jump the user did not ask for (agent activity) never moves the camera. It shows a toast instead.

**Signifier: "the assistant is pointing at this".** A node the assistant references gets a
*tether*: a thin 1px line from the chip in the thread to the node on canvas, drawn while the
message or chip is hovered. When not hovered, the node keeps a small accent dot in its corner
(the "cited" dot) so you can find everything the last reply touched. Off-screen targets get an
edge-of-canvas arrow with the node's title. No glow, no pulse loops. One 400ms pulse on arrival.

**Signifier: "you can cite this into the chat".** Hovering a canvas node for 300ms shows a
grab handle `⠿` on its left edge. Drag onto the composer: it becomes an inline chip `@Review change`.
Typing `@` in the composer opens the same chips via a fuzzy picker. Shift-click a node is the
keyboard-free shortcut: it appends the chip at the cursor. Chips in sent messages are live.

## 3. System One per turn: typed questions first, LLM only when needed

Each turn runs one Jev fan-out request (one round trip, about 0.2–2 s). Branches are asked
up front and only the chosen branch is read, the same pattern as `nodeByTextFanoutRequest`.

```
user ──text + context bar──▶ uip
uip ──▶ Jev (1 request, fan-out):
   intent        choice  navigate | ask | propose | explain
   space         choice  the 7 spaces (grounded with kind plurals)
   kind-<space>  choice  per space, grounded with 3 real titles each
   node-<kind>   choice  per pointable kind, + none
   cand          choice  substring candidates, + none (when any)
   uses-context  noul    "does the text refer to the selected node?" ("this", "it", "here")
   perspective   choice  user | domain | intent | delivery | keep-current
Jev ──answers + confidences──▶ uip resolves in code (min over the chosen chain)
uip ──▶ (ask/explain/propose only) LLM agent with the resolved target as hard context
```

`uses-context` is the cheap win. "What tests this?" with a selection never needs a node search.

**Confidence bands** (per decision, thresholds in a uip copy of `decisionConfig.ts`):

| Band            | Rule                       | UI |
|-----------------|----------------------------|----|
| act             | ≥ threshold (nav 0.7)      | Do it. Show a *guess strip* under the reply: `read as: navigate › Agent › Reviewer · 0.91` |
| offer           | ≥ 0.4 and < threshold      | Do nothing yet. Show 2–3 chips: the top choice plus runners-up. Enter picks the first |
| ask back        | < 0.4 or `none`            | One question with a node picker pre-filtered to the guessed kind |
| propose (any)   | always offer, never auto   | Diff cards always wait for Accept. A wrong "act" on a write is a silently wrong graph |

**One-click repair.** Every guess strip segment is a dropdown. Clicking `Agent ▾` lists the other
kinds Jev scored, in score order. Picking one re-resolves only the levels below it (the fan-out
already answered every kind's node branch, so repair is usually zero round trips). The repair
is logged as a labelled example `{text, wrong, right}` for the eval set.

## 4. Agent-native semantic GitHub

Agents are authors, like people. Every thread entry has an author avatar: a round avatar
for humans, a square avatar for agents, and a diamond `◆` for System One. One timeline holds:

- **Changesets** (the PR equivalent). A titled set of node/edge effects with kernel checks.
- **Commits with effects**. A code commit is shown by the ontology nodes it moved, not by files:
  `realises +1 · Review change`, `test-result ✗ · Reviewer tier`.
- **Tasks**. Status changes on `task` nodes, collapsed into one line per agent per hour.
- **Test results**. Red results expand by default and link the `test` and what it `verifies`.

**Review flow.** A changeset card shows: summary line, effect counts, kernel check badge, a
*blast radius* line ("touches 2 screens in the User perspective"), and three buttons.
"Review on canvas" ghosts the whole changeset and turns the sidebar into a checklist of effects,
each with its own ✓ / ✗. Partial accept is allowed. Rejecting one effect asks for a one-line
reason, which goes back to the agent as its next instruction.

**Three agents and one human, collapsed by default:**

```
 ── Today ───────────────────────────────────────────
 ■ extractor   committed 4 changes · 11 nodes  [▸]
 ■ tester      ran 38 tests · 2 ✗  Reviewer tier, Mirror screen   [▸]
 ■ reviewer    opened changeset #12 "Split Review change"  ⚑ needs you
 ● Sahil       accepted #11 (6 of 7 effects)
 ◆ S1          linked 3 of 4 new nodes · 1 needs you  [pick]
 ── you are here ────────────────────────────────────
```

Agent noise folds into one line per agent per burst. Only three things break out of the fold:
a changeset waiting on you, a red test, and anything that @mentions you or your selected node.

## 5. Layout

**Pick: a right sidebar, 380px, resizable, collapsible to a 44px rail.** The canvas is the subject,
read left to right, and the chat comments on it. The rail keeps the author avatars and the
⚑ badge visible when collapsed. The right side also matches Cursor and Claude Code habits.

**Strongest alternative, flag `chat.layout=palette`:** a ⌘K palette at the top centre. Navigate-intent
turns resolve and close in place, like Linear. Ask/propose turns expand it into a floating thread
anchored to the selected node. It suits canvas-first users and wastes no width, but it loses the
always-on agent timeline.

## 6. Options where reasonable designers disagree

1. **Where proposals live** · flag `proposal.surface=thread|canvas`
   (a) `canvas` puts ghost nodes on the graph with inline accept pins; the thread only links them.
   (b) Cost: spatial layout for ghosts, plus collision with real nodes. `thread` is cheap.
2. **Auto-act or always-confirm on navigation** · flag `s1.autoAct=on|off`
   (a) `on` makes navigation feel instant and the guess strip carries the trust.
   (b) Cost: wrong jumps disorient. `off` shows chips every time, so it adds one click per turn.
3. **One thread or one thread per node** · flag `thread.scope=project|node`
   (a) `node` gives every node its own conversation, like code-review comments on a line.
   (b) Cost: chats fragment and cross-node questions have no home. Needs a project inbox too.
4. **Agent activity in the chat or in its own feed** · flag `agents.timeline=inline|tab`
   (a) `inline` makes agents real co-authors; humans reply to them in place.
   (b) Cost: noise. Needs the folding rules above. `tab` keeps chat clean but hides agents.
5. **Show confidence numbers or not** · flag `s1.showScores=number|bar|hidden`
   (a) `number` is honest and teaches the user the model's jaggedness.
   (b) Cost: numbers invite argument over 0.68 vs 0.71. `bar` is a compromise.

## 7. Wireframes

**A. Idle, node selected, agent fold visible**
```
┌─ uip · checkout-app ──────────────── ⚑1  ◫ ┐
│ ■ extractor  4 changes · 11 nodes      [▸] │
│ ■ reviewer   #12 Split Review change   ⚑   │
│ ◆ S1         1 link needs you       [pick] │
│ ───────────── you are here ─────────────── │
│                                            │
│  Try: "what tests this?" · "show the flow" │
│                                            │
│ ┌ looking at ─────────────────────────────┐│
│ │[◉ Review change][⟂ Domain][L3]        × ││
│ │ ask, jump, or propose…        @  ⏎     ││
│ └─────────────────────────────────────────┘│
└────────────────────────────────────────────┘
```

**B. Offer band: Jev unsure, chips shown, nothing moved yet**
```
│ ● you  ⟂Domain·L2                          │
│   show me the review thing                 │
│ ◆ read as: navigate › ? · 0.52             │
│   [◉ Review change · ai-fn] [■ Reviewer ·  │
│    agent] [▭ Review screen] [other…]       │
```

**C. Reviewing changeset #12 on canvas**
```
│ ■ reviewer · changeset #12   checks ✓ 0 ⚠ │
│ "Split Review change into triage + verdict"│
│  touches 2 screens · 1 test now orphaned   │
│ ┌────────────────────────────────────────┐ │
│ │ ✓ + ai-function  Triage change         │ │
│ │ ✓ + ai-function  Verdict               │ │
│ │ ✓ ~ Review change → deprecated         │ │
│ │ ✗ − verifies  Tier test → Review change│ │
│ │   reason: keep until verdict has a test│ │
│ └────────────────────────────────────────┘ │
│  [Accept 3 of 4]  [Send back]  [Discard]   │
```

## 8. Example conversations, verbatim

**One: navigate, act band, repair in one click**
```
● Sahil   [◉ none][⟂ Domain][L2]
  show me what the reviewer agent touches
◆ read as: navigate › Agent › Reviewer · 0.91
  ↳ Reviewer  ─uses→ Review change ─uses→ Reviewer tier ─governs→ Diff rule
  Trail: Solution › Agent › Reviewer  (4 nodes, 3 edges)   [show as filter]
● Sahil   no, the ai-function
◆ read as: navigate › AI function ▾ › Review change · 0.88   (repaired, 0 calls)
  ↳ Review change  ─exposes→ /review  ─verifies← Tier test
```

**Two: question over the graph**
```
● Sahil   [◉ none][⟂ User][L3]
  which screens have no tests behind them
◆ read as: ask › Screen · 0.86
  3 of 9 screens have no test that verifies anything they implement:
  ▭ Mirror        implements Live preview · no `verifies` into it
  ▭ Settings      implements nothing yet · orphan
  ▭ Review queue  implements Triage · test exists, last result ✗
  [show all on canvas]  [propose tests for these]
```

**Three: proposal, then an agent picks it up**
```
● Sahil   [◉ Reduce churn · goal][⟂ Intent][L1]
  add an outcome for churn
◆ read as: propose › Outcome · uses-context 0.94
  Changeset (draft) · checks ✓
   + outcome  "Fewer teams cancel in month two"
   + serves   outcome → Reduce churn
   ⚠ needs a metric (kernel: outcome needs measures)
  [Accept]  [Edit]  [Accept + ask an agent for the metric]
● Sahil   accept + ask an agent
■ planner  opened changeset #13 "Metric for month-two churn" · 2 effects  ⚑ needs you
```
