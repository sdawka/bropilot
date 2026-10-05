# uip — UI prototype brief (2026-10-04)

A new UI prototype ("uip") over the Bropilot ontology that the LFP (`../lfp`) already defines.
It is NOT the LFP UI. Think "agent-native semantic GitHub": projects instead of repos, an ontology
graph instead of a file tree, chat + typed AI decisions as the primary way to traverse it.

## Flow (given)
1. Pick a project from a list (several projects; each is a graph).
2. Inside a project: explore the ontology at different levels, with a chat sidebar to talk about it.

## The ontology (source of truth: `lfp/src/kernel.ts` SPACES / KINDS / EDGE_TYPES / QUESTIONS; seed graph `lfp/src/graph.json`; shapes `lfp/src/types.ts`)
Two layers, seven spaces (in order):
- representation: basics (name, purpose, summary) · problem (audience, context, usecase, problem, outcome, goal) ·
  hypothesis "Bets" (hypothesis, assumption, metric) · solution (capability, feature, flow, term, agent, ai-function,
  design-system, screen, and the C4-style domain levels: L1 system/external, L2 module/infra, L3 thing/rule/interface/event/protocol/test)
- reality: current (repository, codebase, infrastructure, practice, asset, test-result) · planned (epic, task) ·
  effects (metric-reading, usage-event, feedback, evidence)
Nodes: { id, kind, title, body?, fields?, space } ; Edges: { id, from, to, type } with 24 typed edge types
(motivates, serves, satisfies, has, implements, contains, exposes, emits, combines, measures, targets, reports,
realises, governs, defines, uses, references, triggers, verifies, monitors, supports, refutes, carries, hosts),
each with from/to kind constraints. Kinds have `level` (1..3, C4-ish) and some have `needs` (invariants).
Template QUESTIONS unlock in order and each produces one kind. Kernel checks produce Violations → open questions.

## Two example traversal perspectives the user named
- User perspective: audience → use case → journey/flow → screens → what each screen implements.
- Domain perspective: system → modules → interfaces (the APIs) → things/events/rules → code that realises them.
Others exist (intent: purpose → outcomes → bets → evidence; delivery: epics → tasks → tests → results).

## System One (must be used)
A fast typed-decision model (TypeSafe "Jev" today; a newer model "Clef" to research). Asked a `state` plus named
`questions` (choice / boolean / ...), answers all in one pass with confidences. See `lfp/src/ai/system1.ts`,
`lfp/agent/system1.ts`, `lfp/src/ai/ontology.ts` (question chains over space → kind → node), `lfp/src/ai/decisionConfig.ts`,
`lfp/docs/AGENT-RUNTIME.md` §9. Keys: OPENROUTER_API_KEY / TYPESAFE_API_KEY in `lfp/.env` (never read the values).

## Cloudflare (must be used)
Research "Cloudflare Artifacts" and decide how the uip is hosted / which Cloudflare primitives it uses.

## Rules for this prototype
- UI is the main concern; minimum testing only.
- Where there are design options, implement ALL of them behind feature flags once each option's uniqueness is clear.
- Pick a component library that makes it fast.
