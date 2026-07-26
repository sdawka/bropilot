# Workshop Section — Design

**Goal:** A new top-level **Workshop** view with four structured exercises that make the graph richer: an event-storming board, guided interview decks, paste-a-document extraction, and a gap-fix sprint. LLM assistance uses a **copy-paste bridge** (no API keys, app stays client-only): the app generates a prompt, the user pastes it into any LLM chat, then pastes the JSON reply back; every inbound change goes through a **merge review** diff before touching the graph.

**Branch:** `feat/workshop` (off `dev`, after `feat/graph-slices` and `feat/rich-graph` merge). Own PR into `dev`.

## Navigation

`Studio.vue` nav gains **Workshop** between the parts and Graph; hash view id `workshop` (existing `buildHash` routing). The view is a hub of four exercise cards; entering an exercise swaps the hub for that exercise's screen (a `ref`, like Graph's tabs — not new hash views). Unfinished exercises show a "resume" badge on their card.

## Shared machinery (build first — every exercise funnels through it)

### `lib/changeset.ts` (pure)

```ts
interface StagedNode { id: string; kind: string; title: string; description?: string; props?: Record<string, unknown>; op: 'add' | 'update' }
interface StagedEdge { id: string; srcId: string; dstId: string; type: string; op: 'add' }
interface Changeset { nodes: StagedNode[]; edges: StagedEdge[]; warnings: string[] }
diffAgainstGraph(graph, raw): Changeset   // classifies add vs update (id or exact-title match), drops exact duplicates, flags unknown kinds/edge types + dangling edge endpoints as warnings (never errors)
applyChangeset(cs, selectedIds): void     // applies only selected items via store mutations, as ONE undo step; edges whose endpoints were deselected are skipped with a toast count
```

Ids for new nodes are generated `{kind}-{kebab-title}` with `-2`, `-3` suffixes on collision (matching store convention).

### `lib/bridge.ts` (pure)

```ts
buildPrompt(opts: { exercise: 'extract' | 'interview' | 'storm'; docText?: string; graph: Graph }): string
parseReply(text: string): { raw: { nodes: unknown[]; edges: unknown[] }; warnings: string[] } | { error: string }
```

- The prompt embeds: a compact ontology digest (kinds per part with one-line meanings; the 17 edge types with guidance; ~20 example triples), a digest of the current graph (ids + titles + kinds only, so the LLM can link to existing nodes), the exercise-specific instructions, and a strict output contract: *reply with one fenced JSON block* `{ "nodes": [{ "kind", "title", "description", "props"? }], "edges": [{ "src", "dst", "type" }] }` where `src`/`dst` are titles or existing ids.
- `parseReply` is tolerant: finds the first JSON object in the text (fenced or raw), resolves `src`/`dst` titles against graph + staged nodes, and reports anything unresolvable as warnings. Malformed JSON → `{ error }` with a helpful message; never throws.

### `MergeReview.vue`

Modal listing the changeset grouped by part (nodes) then edges: checkbox per item (all checked by default), add/update badges, warnings banner on top, live count in the Apply button ("Apply 12 changes"). Cancel discards. Apply calls `applyChangeset` and toasts with Undo (existing toast/undo machinery).

## Exercises

### 1. Event storming board (`EventStorm.vue`)

- Sticky-note canvas with five colour-coded columns: **Actors** (yellow) · **Commands** (blue) · **Aggregates** (tan) · **Events** (orange) · **Hotspots** (pink). Add/edit/delete stickies (title + optional note); drag to reorder within and move across columns.
- **Pairing:** drag one sticky onto another to link them; links render as thin connectors. Legal pairs and their graph mapping:
  - Actor→Command ⇒ `persona —uses→ behaviour`
  - Command→Aggregate ⇒ `entity —has→ behaviour`
  - Command→Event ⇒ `behaviour —emits→ event`
  - Hotspot→anything ⇒ `hypothesis —references→ *`
- **Convert to graph:** stickies map Actors⇒`persona`, Commands⇒`behaviour`, Aggregates⇒`entity`, Events⇒`event`, Hotspots⇒`hypothesis`; pairs become the edges above → one `Changeset` → MergeReview. Stickies matching an existing node title become `update`/link rather than duplicates (via `diffAgainstGraph`).
- Optional bridge assist: "✨ Refine with an LLM" builds a `storm` prompt embedding the stickies; the pasted reply goes through the same MergeReview.

### 2. Guided interview decks (`InterviewDeck.vue` + `lib/decks.ts`)

- Three decks (Foundations / Domain / Implementation), 8–12 questions each, defined as data in `decks.ts`: `{ id, prompt, kind, followups?: { edgeType, targetKind, prompt }[] }`. Example: "What can a user accomplish with this system? (one per answer)" ⇒ `capability` nodes; follow-up "who does this serve?" ⇒ `serves` edge to a persona picked from graph + earlier answers.
- Runner UI: one question per screen, multi-answer input (add several answers before advancing), skip freely, progress bar, back navigation. Answers accumulate into a `Changeset`; **Finish → MergeReview**.
- Optional bridge assist per deck: "✨ Have an LLM interview you instead" copies an `interview` prompt (the deck's questions + contract); paste-back → MergeReview.

### 3. Document extraction (`DocExtract.vue`)

- Textarea: paste any document (PRD, README, meeting notes). **Copy extraction prompt** builds the `extract` prompt with the doc embedded. Second textarea: paste the LLM reply → `parseReply` → MergeReview. Parse errors render inline with the message, never a dead end. Extracted nodes get `sourceRefs` excerpts when the LLM provides them (contract asks for an optional `excerpt` per node).

### 4. Gap-fix sprint (`GapSprint.vue`)

- Work queue = `lintGraph(graph)` findings + top `suggestFor` suggestions (from `feat/rich-graph`), deduped, one card at a time with a progress counter ("3 of 14").
- Each card offers a concrete inline action: add the suggested edge (candidate buttons), write the missing description (inline textarea saving to the node), or jump to the node in its part view. **Skip** moves on; queue recomputes after each fix so resolved findings disappear.

## Persistence

Exercise drafts (stickies, deck answers, pasted doc text) autosave to `localStorage` key `bropilot:workshop:v1`, separate from the graph key; cleared per-exercise on successful apply or explicit reset. Same hydrate-guard pattern as the store (SSR-safe).

## Constraints

- Client-only, no API keys, no new dependencies (drag is hand-rolled pointer events like ForceGraph).
- Merge review is the only path into the graph — no exercise writes to the store directly.
- Advisory ontology stance unchanged; unknown kinds in a paste are warnings, and applying them is allowed.
- No schema/ONTOLOGY changes; `sync-skills` untouched.

## Testing

- Unit: `changeset` (add/update classification, duplicate drop, dangling-edge warning, partial-selection apply as one undo step, id collision suffixes); `bridge` (prompt contains ontology digest + contract; parse of fenced/raw/malformed/title-resolution cases); `decks` (answer→changeset mapping incl. follow-up edges).
- e2e: Workshop hub renders 4 cards; storm: add stickies → pair → convert → review → apply → nodes in graph; doc extract: paste canned reply → review shows counts → apply; gap sprint: fix one finding and see the queue shrink; draft survives reload.

## Out of scope

- Real-time LLM calls, API-key storage; multiplayer/workshop sharing; timer/facilitation features; storm canvas free-form 2D positioning (columns only in v1); persisting merge-review state across reloads.
