---
name: bropilot-interview
description: Interview the user about a system and build/update a Bropilot knowledge-graph JSON through conversation. Use when the user wants to describe a new system conversationally, flesh out an existing Bropilot graph, or turn a product idea into a spec by answering questions.
---

# Bropilot Interview: Conversation → Graph

Build a Bropilot instance graph by interviewing the user. You edit the **instance graph only** — never the ontology or schema.

**Related**: `/bropilot-extract` (repo → graph), `/bropilot-generate` (graph → code). The output imports directly into Bropilot Studio.

## File handling

- Default file: `./bropilot-graph.json` (ask only if the user names a different path).
- If the file exists, load it and **resume** — never start over. Treat it as authoritative.
- **Write after every 2–3 answers**, not only at the end. Announce saves briefly.
- **Patch, don't regenerate**: read the current JSON, apply add/update operations to specific nodes/edges, write back. Never rebuild the whole file from memory — regeneration silently drops nodes.

## Graph format

`{ "nodes": [...], "edges": [...] }` — node ids are `{kind}-{kebab-title}` (e.g. `persona-sales-rep`); kind-specific fields go in `node.props` (see the props table in /bropilot-extract), never top-level. Edges: `{ "id": "e-...", "srcId", "dstId", "type", "label?" }`.

**Provenance**: every node created from an answer records the user's words:

```json
"sourceRefs": [{ "turnId": "interview-3", "excerpt": "mostly field techs who hate typing" }]
```

`turnId` is `interview-{n}` where n counts your questions; `excerpt` quotes (or tightly paraphrases) the user.

## Opening questions (Act 1)

Ask **one at a time**, in this order, adapting wording to context. Skip any the user already answered.

1. What do you wanna make?  → `name`, `purpose`
2. Who is it for, and why are they using it?  → `persona` (+ `persona motivates usecase`)
3. What does them using it look like?  → `usecase`, `flow`, `screen`
4. Why do you think doing it this way works? What is the essence?  → `hypothesis`, `capability`
5. What can we simplify, and what can we double down on?  → `capability` priorities, `assumption`
6. What needs to be true for the magic to happen?  → `constraint`, `assumption`, `requirement`

After each answer: create/update nodes, connect them with edges from the ontology table below (canonical first), save, then ask the next question.

## Gap-driven follow-ups

After the opening round, find the biggest hole and ask about it. Holes, in priority order:

1. A `capability`, `usecase`, or `goal` with no incoming `motivates`/`serves` — ask *why* it exists.
2. A `persona` with no `motivates`/`triggers` edge to any usecase — ask what they do with the system.
3. A `usecase` no `flow` satisfies — ask how it plays out step by step.
4. A `flow` with no `screen` — ask what the user sees.
5. Entities mentioned in answers but never modelled — ask what they are and how they relate.
6. A `module`/`api`/`behaviour` with no incoming `verifies` — ask how they'd know it works.

Stop interviewing when the user says so or when two consecutive follow-ups add nothing new.

## Edge selection

Use the ontology table below. Prefer canonical, then typical. `references` is the last resort. Never invent edge types.

<!-- ontology:begin -->

**Edge types** (✱ = stock, always round-trips):

- *Structural*: `contains`✱, `has`✱, `extends`✱, `implements`✱, `exposes`
- *Dependency & reference*: `uses`✱, `depends_on`✱, `describes`, `references`✱
- *Behavioural*: `triggers`✱, `emits`
- *Intentional*: `motivates`, `serves`, `satisfies`, `constrains`
- *Verification*: `verifies`, `monitors`

**Kind→kind ontology** (canonical and typical triples — prefer these when choosing edges):

| src | edge | dst | strength |
|---|---|---|---|
| name | has | purpose | canonical |
| name | has | capability | canonical |
| purpose | motivates | goal | canonical |
| purpose | serves | persona | canonical |
| purpose | motivates | capability | typical |
| purpose | depends_on | hypothesis | typical |
| goal | motivates | usecase | typical |
| goal | motivates | capability | typical |
| hypothesis | motivates | goal | typical |
| hypothesis | motivates | capability | typical |
| persona | motivates | usecase | canonical |
| persona | motivates | requirement | typical |
| persona | triggers | usecase | typical |
| persona | triggers | flow | typical |
| persona | uses | capability | typical |
| capability | serves | persona | canonical |
| capability | satisfies | requirement | canonical |
| capability | satisfies | usecase | typical |
| usecase | uses | screen | typical |
| usecase | uses | capability | typical |
| requirement | constrains | module | typical |
| requirement | constrains | design | typical |
| constraint | constrains | module | canonical |
| constraint | constrains | api | typical |
| term | describes | entity | canonical |
| term | describes | behaviour | typical |
| entity | has | relationship | typical |
| entity | extends | entity | typical |
| relationship | references | entity | canonical |
| behaviour | emits | event | canonical |
| behaviour | uses | state | typical |
| event | triggers | behaviour | canonical |
| event | triggers | flow | typical |
| state | references | entity | typical |
| flow | satisfies | usecase | canonical |
| flow | uses | screen | canonical |
| flow | uses | capability | typical |
| flow | triggers | event | typical |
| screen | contains | component | canonical |
| screen | serves | persona | typical |
| screen | uses | state | typical |
| screen | uses | api | typical |
| screen | uses | design | typical |
| screen | uses | module | typical |
| design | describes | screen | canonical |
| design | describes | component | typical |
| design | constrains | component | typical |
| module | contains | component | canonical |
| module | contains | module | typical |
| module | contains | logic | typical |
| module | exposes | api | canonical |
| module | exposes | interface | typical |
| module | implements | capability | canonical |
| module | implements | behaviour | canonical |
| module | satisfies | requirement | canonical |
| module | depends_on | module | canonical |
| module | uses | external | canonical |
| module | uses | interface | typical |
| component | implements | screen | canonical |
| component | implements | capability | typical |
| component | implements | design | typical |
| component | emits | event | canonical |
| component | uses | api | typical |
| component | uses | entity | typical |
| component | uses | state | typical |
| component | uses | external | typical |
| component | uses | module | typical |
| logic | implements | behaviour | canonical |
| logic | uses | entity | typical |
| api | implements | interface | canonical |
| api | satisfies | requirement | typical |
| api | emits | event | canonical |
| api | uses | module | typical |
| interface | extends | interface | canonical |
| interface | references | entity | typical |
| repository | contains | module | canonical |
| external | triggers | event | typical |
| tests | verifies | module | canonical |
| tests | verifies | api | canonical |
| tests | verifies | behaviour | canonical |
| tests | verifies | hypothesis | canonical |
| tests | verifies | component | typical |
| tests | verifies | flow | typical |
| observability | monitors | goal | canonical |
| observability | monitors | api | typical |
| observability | monitors | module | typical |
<!-- ontology:end -->

## Exit

1. Save the file a final time.
2. Summarise: node count by kind, edge count, and the 2–3 biggest remaining gaps.
3. Point the user at: import into Bropilot Studio (Import JSON), or `/bropilot-generate` to scaffold code.
