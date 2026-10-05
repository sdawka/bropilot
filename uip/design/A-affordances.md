# A · Affordances — traversing the ontology (uip)

Stance: Norman (signifiers, mapping, constraints, feedback) + Shneiderman (overview → zoom/filter → details).
Anti-goal: the LFP UI is *space columns of cards* (Overview.vue) and *reference tables* (Kernel.vue).
The uip shows neither. You never see "all of a space at once as cards". You always stand **somewhere**,
and you can always see **which doors lead out**.

## 0. A fact from the seed graph that drives the design

The perspectives the user named are not stored as straight chains:

```
user lens   audience ─has→ usecase ←satisfies─ capability ←implements─ flow ─uses→ screen ─uses→ interface
domain lens system ─contains→ module ─exposes→ interface ─carries→ thing / ─emits→ event
                               module ─contains→ rule|test     codebase ─realises→ module
```

Edges run in both directions, and a lens passes through kinds the user did not name, such as
capability. Links are also sparse: there are 33 flows but only 1 `flow uses screen` edge.
So a lens is a **path template over typed edges, read in either direction**. The UI must show
**waypoints** (the kinds a lens passes through) and **gaps** (a step that has no links yet) as
first-class things. A gap is not an empty state. It is the most useful door in the product,
because it turns into a question.

## 1. The level model: one widget, five altitudes

A "level" is an **altitude of focus**. At every altitude exactly one thing is in focus, and the
screen looks the same: a **Focus card** in the middle, **Doors** around it, and a **Trail** on top.

| Altitude | Focus is…           | Doors are…                                              | Overview it gives                        |
|----------|---------------------|---------------------------------------------------------|------------------------------------------|
| A0 Atlas | the project         | 7 spaces in 2 bands (representation / reality)          | counts, open questions, where it's thin  |
| A1 Space | e.g. Solution       | its kinds; solution is grouped by C4 level L1/L2/L3     | kind counts, gap counts                  |
| A2 Kind  | e.g. Screens (9)    | its nodes, as a ranked list (by degree, recency, gaps)  | sort/filter, inline 1-line bodies        |
| A3 Node  | e.g. "Talk panel"   | **edge doors**: `uses → Interface 2`, `← exposes Module 1` | body, fields, provenance, needs          |
| A4 Door  | one open edge door  | the peers behind it, previewed in place                  | details on demand; enter one = new A3    |

Why one widget: the user learns a single grammar (*focus, doors, trail*) and reuses it at every
altitude. That is consistency as a learnability device. A1/A2 are the "zoom and filter" steps.
A3/A4 are "details on demand". You are on A3 most of the time.

**Signifiers (where am I, what can I do)**
- **Trail** (top bar): `◎ Bropilot › Solution › Screens › 🖥 Talk panel`, and once you move along
  edges it continues with **edge verbs**: `… 🖥 Talk panel ─uses→ 🔌 talk RPC ─carries→ 🔷 Turn`.
  The verbs make the path self-describing. The last crumb is solid. Earlier crumbs are links.
- **Door chips** show `verb · direction arrow · kind icon · count`. The count is the signifier
  that matters: `0` renders as a **dashed** chip ("no screens yet"), which signals a gap.
- **Kind colour** comes from the space hue (SPACES.hue), used only as a 3px left edge. Colour is
  never the only cue: there is always an icon and a label.
- **Status**: a solid border means committed. A dashed border means proposed by an AI/System One
  and not yet committed (the commit gate is visible).

**Moving (mapping)**
- **Down** (deeper): click a door, or `Enter`. A door opens to A4 in place, and clicking a peer
  makes it the new focus.
- **Up**: click any crumb, or `Backspace`. `Esc` closes an open door without moving.
- **Sideways**: `←/→` cycles **siblings**, meaning the other peers behind the door you came
  through, so you can flip through all 9 screens of a module. A `3 / 9` counter sits by the title.
- **Along a lens** (section 2): `⌥→/⌥←` steps to the next or previous kind in the lens template.
- Mapping rule: **horizontal = same depth, vertical = depth.** The trail is the record of depth.

**Feedback for every move**
- **Shared-element transition** (~180ms): the clicked door chip morphs into the new Focus card,
  and the old focus shrinks into the new crumb. You *see* where you came from.
- The trail appends the crumb with its verb, and that crumb pulses once.
- The arrival door is marked `↩ came from` on the new focus, so the way back is always signified.
- Counts reconcile: entering `uses → Interface 2` lands on a list of exactly 2.
- Gap feedback: entering a dashed `0` door does not show "nothing here". It opens a **Question
  stub** in chat ("Which screens does flow *Commit a changeset* use?"), prefilled from the
  kernel QUESTIONS/needs.

## 2. Perspectives: a lens over the same focus (not a mode, not a tab)

A **lens** is a named path template, for example
`user: audience › usecase › (capability) › flow › screen › interface`.
Applying a lens does three things:
1. A **Lens rail** appears under the trail. It shows the template's steps as slots, and the
   current focus lights up its slot. Waypoints are in parentheses and rendered smaller.
2. The doors on the Focus card are **re-ranked**. Doors that continue the lens come first and
   bold. The rest fold under "other edges (n)".
3. `⌥→` follows the lens even across waypoints. From a use case, `⌥→` jumps to its flows
   through the capability, and the trail shows the hop as `usecase ⋯capability⋯ flow`.

**Pivot.** Switching lens keeps the focus. The rail re-renders around the same node.
On a screen in the user lens, press `L`, choose domain, and you are on the same screen with the
rail now reading `system › module(exposes) › [screen] › interface › thing`.
Screens, interfaces and things are **pivot nodes** where lenses cross, and they get a small
⇄ badge. This is the one thing tabs or modes cannot do. A tab switch throws your place away.
A lens keeps the place and changes the meaning of "next".

Lenses shipped: **user**, **domain**, **intent** (purpose › outcome › hypothesis › metric ›
evidence), **delivery** (epic › task › test › test-result). There is also **none**, the raw
graph, where all doors are equal. Lens templates live in data, not code.

Strongest alternative: **twin rails**. The two lenses are shown side by side, the focus sits
where they meet, and you see both "who uses this" and "what implements this" at once. It is
better for pivot-heavy work. It costs half the canvas width, and it gets confusing with 3+
lenses. It is behind a flag (section 5).

## 3. Chat sidebar ↔ canvas

**Shared selection.** The focus is the chat's implicit subject. A chip above the composer reads
`About: 🖥 Talk panel ×`. Clicking × detaches the chat to project scope. Shift-clicking doors
adds more nodes to the context ("compare these two flows").

**What chat can point at.** Chat can reference nodes, edges, doors (`uses→ on Talk panel`),
gaps, and whole paths. Every mention renders as a **node chip**:
- hover highlights the node and its door on the canvas (*brushing*);
- click traverses there, and the trail records a crumb tagged `via chat`;
- an answer that is a path renders as a **mini-rail** with an `Open as trail` action.
The canvas points back: right-clicking any card or door gives `Ask about this`, which inserts a chip.

**System One typed decisions as feedback.** S1 answers small choice questions in one pass:
which kind, which lens, which node, which edge. Each decision renders inline as a **Decision row**:

```
 ⚡ routed: "show me where onboarding gets its screens"
   lens  [ user ●●● ]   anchor [ usecase · Onboard a builder ●●○ ]   step [ screen ●○○ ]
   or:   (domain)  (flow: First commit)                       ↶ undo   ✎ not this
```
- **Confidence** is shown as 3 dots in 3 bands (sure / likely / guess). The cut-offs come from
  `decisionConfig.ts` thresholds. Raw percentages appear only in the tooltip. People act on
  bands, not on 0.73.
- **Bands change behaviour, not just colour.** *Sure*: the canvas moves now and an undo toast
  appears. *Likely*: the canvas previews the move (ghost highlight) and `Enter` confirms it.
  *Guess*: nothing moves, and the decision becomes a question with the options as buttons.
- **When it is wrong**: click an alternative chip and the canvas re-routes with one click.
  `✎ not this` opens the full option list plus free text. `↶` reverts the move. Every correction
  is logged with the S1 question, state and answer as a labelled example for evaluation. The
  correction is acknowledged in place with "noted, using *flow*", so the user sees that it counted.
- Things S1 *proposes* for the graph (a missing `flow uses screen`, for example) appear dashed on
  the canvas and as a Decision row in chat. They become solid only through Commit.

## 4. Project picker: a list of fingerprints, keyboard-first

Each project is like a repo. What you need to recognise it fast is a name, a line of purpose,
and its **shape**. Its shape is the 7-space fingerprint: a tiny bar per space (height = node
count, hue = space) with a red tick where open questions or violations sit. A reader can tell a
"problem-heavy, no reality yet" project from an "all code, no bets" project at a glance.

- The list is ordered by **last touched**. Type to filter by name, purpose or summary. A query
  that reads as a question ("which one has billing?") goes to S1, which ranks projects, and the
  confidence dots show beside each hit.
- Selecting a row with the arrow keys fills a **preview pane**: summary, A0 atlas thumbnail,
  top 3 open questions, and **Resume** at your last focus, with its trail. `Enter` resumes there.
  `⇧Enter` opens at A0.
- Each row shows counts as one line: `243 nodes · 448 edges · 7 open · committed 2h ago`.

## 5. Options → feature flags

| Flag | Values | What makes it unique | Cost |
|---|---|---|---|
| `canvas.focus` | `card` (default) · `ego` · `outline` | **card**: Focus card + door chips, no edge drawing, fully keyboardable. **ego**: radial 1–2 hop node-link drawing around focus, so you see shape and clusters. **outline**: indented tree along the lens, dense, scannable. | ego needs a layout lib and gets hairballs (flow has 94 `uses→thing`). outline breaks on cycles and non-tree edges. |
| `lens.layout` | `rail` · `twin` · `off` | **rail**: one lens + pivot. **twin**: two rails meeting at the focus, so both views are visible. **off**: raw graph, all doors equal. | twin halves the width and is confusing with 3+ lenses. off loses the "next" signifier. |
| `lens.waypoints` | `collapse` · `explicit` | **collapse**: `⌥→` skips capability and the trail shows `⋯capability⋯`. It matches how users speak. **explicit**: every hop is a stop. It is honest about the graph. | collapse hides fan-out (one capability = many flows), so it needs a "via" picker. explicit adds 1–2 extra stops per path. |
| `s1.autonomy` | `act` · `preview` · `ask` | Fixes what the *sure* band does. **act** moves the canvas immediately with undo. **preview** ghost-highlights and waits for `Enter`. **ask** always asks with buttons. | act surprises when S1 is wrong. ask is slow and turns chat into a form. preview costs one keystroke per move. |
| `picker.lead` | `fingerprint` · `readme` · `ask` | **fingerprint**: shape-first rows, as in section 4. **readme**: summary-first cards like GitHub repo cards. **ask**: a single prompt where S1 picks the project and opens at the right focus. | fingerprint must be learned once. readme is slower to scan with 10+ projects. ask fails silently when the guess is wrong, so it needs the Decision row. |

## 6. Key screens

**Picker** (`picker.lead=fingerprint`)
```
┌ uip ───────────────────────────────────────────────────────────────────────────────┐
│ ⌕ filter or ask…                                                     [+ New]       │
├──────────────────────────────────────────────┬─────────────────────────────────────┤
│ ▸ Bropilot      ▂▅▃█ ▁▂▁  243·448  7 open  2h │ Bropilot                            │
│   Help people build self-sustaining software  │ Help people build self-sustaining… │
│   Tidepool      ▃▆▂▂ ▅▃▄  118·201  2 open  1d │ summary: An orchestrator that…     │
│   Ledgerly      ▁▂▁▆ ███   89·170 12 open  5d │ ┌ atlas ─────────────────────────┐ │
│   Курсы         ▅▄▄▁ ▁▁▁   40· 52  0 open  3w │ │ B P H S │ C Pl E               │ │
│                 B P H S  C Pl E               │ └────────────────────────────────┘ │
│                 represen. reality             │ open: 32 flows lack a screen …     │
│                                               │ ⏎ Resume › Solution › 🖥 Talk panel │
└──────────────────────────────────────────────┴─────────────────────────────────────┘
```

**In-project, A3 focus with the user lens** (`canvas.focus=card`, `lens.layout=rail`)
```
┌ ◎ Bropilot › Problem › Use cases › 🎯 Onboard ⋯capability⋯ 🔀 First commit ─uses→ 🖥 Talk panel ┐
│ lens: [user ▾]  audience › usecase › (capability) › flow › [■ screen] › interface   ⇄ L │
├────────────────────────────────────────────────────────────┬──────────────────────────┤
│                     3 / 9  ← →                             │ About: 🖥 Talk panel  ×   │
│   ┌──────────────────────────────────────────────┐         │                          │
│   │ 🖥  Talk panel                        ⇄ pivot │         │ you: what calls this?    │
│   │ The chat surface; routes each utterance…     │         │ ⚡ lens [domain ●●●]      │
│   │ fields: route /talk · said(41)  committed    │         │    → 🔌 talk RPC  ●●○     │
│   └──────────────────────────────────────────────┘         │   or: (🧩 agent module)   │
│   lens doors                                               │   ↶ undo  ✎ not this     │
│   [ uses → 🔌 Interface 2 ] [ implements → 🧰 Capability 1 ]│                          │
│   [ ↩ came from: ← uses 🔀 Flow 1 ]                         │ 🔌 talk RPC carries      │
│   other edges (3) ▾                                        │ 🔷 Turn, 🔷 Utterance     │
│   ┌ - - - - - - - - - - - - - - ┐                          │ [Open as trail]          │
│   ╎ ← measured by 📈 Usage 0     ╎ gap: ask →               │                          │
│   └ - - - - - - - - - - - - - - ┘                          │ ┌──────────────────────┐ │
│                                                            │ │ ask about Talk panel │ │
└────────────────────────────────────────────────────────────┴──────────────────────────┘
```

**A0 atlas** (overview first: bands, not columns of cards)
```
┌ ◎ Bropilot ───────────────────────────────── lens: [none ▾] ───────────────────────────┐
│ REPRESENTATION                                                                         │
│ [ Basics 3 ]→[ Problem 16 · 1? ]→[ Bets 14 · 2? ]→[ Solution 186 · 4? ]                 │
│                                          L1 system·external 6 │ L2 module·infra 14     │
│                                          L3 thing rule iface event proto test 65       │
│ REALITY                       ↑realises           ↓planned          ↑reports           │
│ [ Current 25 ]                [ Planned 3 ]                [ Effects 4 · 1? ]          │
│ thinnest link: flow → screen (1 of 33)   ⏎ open as question                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```
Each space tile is a door with a count and an open-question badge. The cross-band arrows are the
reality loop edges. The single "thinnest link" line is the overview's call to action.
