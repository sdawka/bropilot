# Decision log

- **2026-10-08T00:38:43-04:00** — Use the plan and requirements document as the authority for the first Cloudflare-deployed version; LFP and UIP remain exploratory prototypes.

- **2026-10-08T00:38:43-04:00** — Plan work by dependencies and acceptance criteria, without timelines. Rationale: the user asked to focus on planning and executing the work with AI agents.

- **2026-10-08T00:38:43-04:00** — The first deployed version serves invited collaborators and their local agents.

- **2026-10-08T00:38:43-04:00** — A small real web app will anchor initial end-to-end acceptance.

- **2026-10-08T00:38:43-04:00** — Convert the Word requirements to canonical, versioned Markdown; preserve the original Word file unchanged as a source snapshot.

- **2026-10-08T00:38:43-04:00** — Implement the approved GRREAT adoption plan, including the requirements conversion, canonical project records, validation and pull request.

- **2026-10-08T00:49:30-04:00** — Use a personal assistant as the example World for initial end-to-end acceptance; this supersedes the unspecified small real web-app example.

- **2026-10-08T00:49:30-04:00** — Rename the domain concept Artifact to Thing. Rationale: avoid confusion with the Cloudflare Artifacts offering; keep the Cloudflare product name unchanged.

- **2026-10-08T01:15:07-04:00** — The personal assistant’s Purpose is to improve the user’s life by connecting to external systems, interacting with the user and organizing the user’s information.

- **2026-10-08T01:18:18-04:00** — Use GRREAT only as design inspiration for the personal assistant; do not select an existing-app integration or embed its domain core as part of this decision.

- **2026-10-08T01:21:03-04:00** — The first personal-assistant workflow includes organizing goals, identifying next actions and reviewing progress.

- **2026-10-08T01:22:07-04:00** — Use Automatic mode for routine assistant changes to goals, plans and organized information, governed by explicit rules.

- **2026-10-08T01:28:06-04:00** — Use a calendar-connected personal assistant that breaks goals into tasks and places them on the calendar as a concrete example workflow; develop illustrative scenarios and routine-change rules.

- **2026-10-08T01:44:24-04:00** — Implement the approved foundation plan: a Rust domain core and fresh UI shell developed in parallel, with layout and clearly marked placeholders; use UIP/LFP only as loose inspiration.

- **2026-10-08T01:44:24-04:00** — Use a portable Rust core for domain behavior, with TypeScript Cloudflare storage/API adapters and a Vue UI; verify the Workers/Wasm compilation and loading path.

- **2026-10-08T07:59:18-04:00** — Formalize criteria-linked executable checks for Thing implementations, using a full-stack Worker web app with artifact-existence and health-check criteria as the basic example.

- **2026-10-08T07:59:18-04:00** — Realizing a Move submits a new implementation/artifact version as a candidate and tests that version against the relevant hooks.

- **2026-10-08T07:59:18-04:00** — Support deterministic checks and LLM/decision-model checks, including combinations; reserve checks with significant cost for selected Realization candidates.

- **2026-10-08T07:59:18-04:00** — Include optional contributor-funded platform verification for open-source Worlds, considering Cloudflare-compatible header-based agent payments. No specific payment provider or protocol was selected.

- **2026-10-08T08:10:01-04:00** — Review and merge the older PRs, subject to the existing requirement that every CI check is green.

- **2026-10-08T08:10:01-04:00** — Implement the next candidate-verification slice and try it locally first; consolidate ongoing work onto one branch and one PR for iteration, avoiding additional task-sized PRs.

- **2026-10-08T09:19:34-04:00** — Use a large blank canvas, intentional components and a centered, delightful experience as continuing UI principles; remove inputs for choices already settled in the plan.

- **2026-10-08T10:05:00-04:00** — Add a Visual / Text toggle to Map, taking spatial-layout inspiration from UIP while preserving the clean, spacious design.

- **2026-10-09T00:27:12-04:00** — Deploy realized applications into the user's connected Cloudflare account.

- **2026-10-09T00:27:12-04:00** — Connect deployment accounts through Cloudflare OAuth.

- **2026-10-09T00:27:12-04:00** — The example uses one full-stack application Thing, backed by one canonical Cloudflare Artifacts repository, deployed to one Worker.

- **2026-10-09T00:27:12-04:00** — Implement the approved hosted deployment plan using parallel subagents, retaining the existing iterative branch and PR.

- **2026-10-09T12:36:27-04:00** — Create an isolated test page for messy description/chat → filled ontology → criteria feedback, with a central ontology, floating agent panel and right-side logs; stepping through logs highlights the corresponding input, agent or changed nodes.

- **2026-10-09T12:53:18-04:00** — Use locally signed-in Codex for live description-to-ontology extraction, with saved runs available for replay.

- **2026-10-09T13:02:19-04:00** — Consider the assistant's personality and ability to surface sensible, thoughtful questions while helping users create their Thing.

- **2026-10-09T21:34:46-04:00** — Benchmark the ontology pipeline for actual usefulness and answer quality across familiar app ideas, and assess dependence on Ascent plus System One models.

- **2026-10-09T21:36:35-04:00** — Use the existing credential in the neighboring AskCat project for the live TypeSafe/System One benchmark.

- **2026-10-09T22:13:45-04:00** — Open a local credential placeholder for the user to fill and prepare a bottleneck-driven improvement plan for the ontology pipeline.

- **2026-10-09T22:15:57-04:00** — Implement the ontology improvement plan; use Luna for fast intelligent questions, allow faster general opening questions, and ground later specific questions in failed criteria. Increase System One checks for semantic coherence beyond Ascent structural checks.

- 2026-10-09T23:00:10-04:00: Use a Sol agent to fix ontology-lab styling, following the supplied screenshot.

- **2026-10-10T14:10:58-04:00** — Use the normal World workspace for advisory change-impact analysis of the personal assistant example; preserve the existing Visual/Text Map and inspector.

- **2026-10-10T14:10:58-04:00** — Support comparisons of saved revisions and a bounded what-if editor. Analysis explains consequences and evidence applicability without changing promotion policy or writing canonical state.

- **2026-10-10T14:10:58-04:00** — Compute and explain completed versus planned work from clearly synthetic sample plans and completion observations, with an explicit reporting window and metric definition.

- **2026-10-10T14:10:58-04:00** — Use Sol agents for all implementation, with the primary agent limited to orchestration.

- **2026-10-10T15:02:52-04:00** — Lead change analysis with a concise consequence summary; distinguish actual edits, potential effects, recomputed metrics and evidence rechecks. Start explanations at the actual Thing revision change and prioritize useful consequences while retaining full detail on demand.

- **2026-10-12T15:48:20-04:00** — Build the template-agnostic ontology engine as a library in the bropilot repository (`packages/ontology-engine`), consumed by `artyfact-cf`.

- **2026-10-12T15:48:20-04:00** — Keep the `@artyfact/rules` Datalog dialect as the engine's rule language.

- **2026-10-12T15:48:20-04:00** — Keep YAML in `artyfact-cf` behind a loader adapter; the engine's canonical instance format is the JSON graph.

- **2026-10-12T17:20:00-04:00** — Add deterministic, template-declarable text-quality checks (minimum length, placeholder words, title distinct from id) to the ontology engine.

- **2026-10-12T17:20:00-04:00** — Add a real-provider semantic suite for vague and contradictory content, run through the OpenRouter decisions API with the Perplexity decision model, behind a provider abstraction so the model is swappable.

- **2026-10-13T00:48:00-04:00** — Replace the single "is this vague?" semantic question with a defect-ontology-driven funnel: per labelled node ask whether it is an instance of its declared kind plus a tangibility score; ask consistency at sibling, cross-section and direct scopes; the engine ships a versioned internal defect ontology that the questioning walks to narrow the diagnosis.

- **2026-10-13T00:48:00-04:00** — Pair checks go through the funnel; the walk must be more efficient than asking every sibling pair (the defect tree drives chained choice questions).

- **2026-10-13T00:48:00-04:00** — Follow-up questions spawn only on confident answers by default, with a per-question knob to lower the bar to review. Review counts as detection in the live assertion.

- **2026-10-13T00:48:00-04:00** — The defect ontology is a full taxonomy three levels deep with four to five categories per level, all families live.

- **2026-10-13T00:48:00-04:00** — Confirmed inconsistencies are explained by gpt-6-luna through OpenRouter chat completions behind a separate explainer seam; the explanation is advisory and never changes a level.

- **2026-10-13T01:25:00-04:00** — Extend the funnel beyond defects to change routing: a System One decision tree first identifies which part of the system a user message affects, at increasing depth, and only then a model translates the message into concrete changes or a clarifying question, so smaller models with a slice can replace a large model given the whole graph. Build a dataset and evaluations for it so the engine's breakdown can be measured across models; Claude acts as the reference for the translation role for now.

## 2026-10-13T02:05:00-04:00 — Criteria come from the ontology itself

Decision (user): preserve guidance on how to write a good ontology, with the criteria for each section and the parent criteria that ensure consistency among child nodes. The engine's mechanism is to apply the ontology's own criteria at every level: the exact criteria passed to System One calls come from the ontology (template), not only from the engine's built-in defect taxonomy. This is in addition to the general checks for what constitutes a sensible, usable ontology.
