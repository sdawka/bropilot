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
