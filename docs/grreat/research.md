<!-- grreat:record id=research.current kind=research status=active parent=goal.north-star -->
# Current understanding

- Informs: [[goals]] and [[roadmap]]. Source inspection and adoption evidence: [[journals/2026-10-08]].

## Established requirements

- The example World is a personal assistant. The domain component is Thing; Cloudflare Artifacts remains the versioned storage product. See [explicit decisions](../decision_log.md).

- The collaboration protocol is World → Move → Realizations → Evaluations → Promotion. Immutable World manifests pin model and implementation inputs; deployment and observation are separate actions.
- Readiness combines typed facts, deterministic rules and bounded semantic review. Missing information is unknown unless a declared completion obligation requires it. Model answers propose interpretations; deterministic policy governs acceptance.
- The Cloudflare design assigns the canonical head to a World Durable Object, versioned workspaces to Artifacts, and discovery indexes to D1. Other services are adopted when their capabilities are needed, not as a mandatory stack checklist.
- Role separation, protected Assays, scoped capabilities, provenance, evidence freshness, idempotent coordination and stale-base rejection are required. CLI instructions alone cannot enforce permissions on a user's computer.

## Inspected baseline

- [LFP](../../lfp/README.md): local ontology, question and staged-change exploration; agent runtime and checks are described. Its historical smoke results and metrics were not reproduced during adoption.
- [UIP](../../uip/README.md): ontology navigation, chat, checks and review exploration. [Worker configuration](../../uip/wrangler.jsonc) declares Static Assets, Workers AI and Artifacts bindings; this establishes configuration, not provisioned resources or deployment success.
- Prototype documentation includes stale statements about uncommitted files. Git at adoption shows the prototypes committed at `c39db52c8a7792adea8ce949c4ce1e8ed914ad81`; only the Word source and unrelated root lockfile were initially untracked.
- Provider references in the requirements report verification on October 7. No live provider/API feasibility, prototype runtime or deployed system was verified in this adoption.

## Personal assistant research and proposed first workflow

Accepted Purpose: improve the user’s life through external-system connections, interaction and information organization. GRREAT is design inspiration only; integration or embedded-core reuse was not selected. The accepted first workflow includes goals, next actions and progress review; its detailed feature contract is still to be defined.

- **GRREAT patterns:** The neighboring source at `d32fb64` provides goal-linked Goals, Research, Roadmap, Execution, Analysis and Time; typed/versioned records; reversible changes; attributable context; and bounded proposal review. [Current architecture](../../../grreat/docs/implementation.md) and [MCP tools](../../../grreat/src/mcp/tools.ts) were inspected locally. Important distinction: Enhancement staging awaits owner review, while separate write-scoped tools can mutate records directly. Policy must explicitly govern writes; using an agent protocol does not itself establish that policy. The example assistant’s selected Automatic mode is distinct from GRREAT’s owner-reviewed Enhancement path. No live connection or model workflow was tested.
- **Timelaps:** Source at `fd600a3` has task/session history, manual completions and optional proof with account sync. It could inform future activity-evidence design. Its [Worker](../../../timelaps/apps/app/worker.ts) uses authenticated app APIs; delegated assistant access and a connector are not established. A recording is evidence to interpret, not automatic proof of a goal outcome. No integration selected or tested. A focused Biblocal probe did not establish a relevant integration and was not pursued.
- **Assistant capabilities:** [Microsoft’s contextual-assistant research](https://www.microsoft.com/en-us/research/project/contextually-intelligent-assistants/) supports intent/context understanding, capture, retrieval and selective proactive help. [Human–AI interaction guidance](https://www.microsoft.com/en-us/research/articles/guidelines-for-human-ai-interaction-eighteen-best-practices-for-human-centered-ai-design/) supports clear capabilities, relevant timing, explanations, easy correction/dismissal and user controls. [Anthropic’s connector example](https://claude.com/resources/articles/connectors-directory) illustrates organizing plans using existing tool context. These inform design; they do not identify one universally best assistant.

Proposed capability families: conversation and clarification; inspectable personal context; information capture/organization/retrieval; goal-to-action planning; connected-system actions; progress review and context-sensitive follow-through. Goals, next-action planning and progress review are selected for the first workflow; the broader families describe possible capabilities, not an approved feature list.

**Accepted workflow scope:** capture scattered intentions → clarify goals and success criteria → identify next actions → revisit actual progress and revise. Routine structured changes use Automatic mode under explicit rules; operation coverage and prioritization details remain design questions. Keep reported progress and observed evidence attributable; do not infer completion from an agent assertion or observation alone. The selected mode is Automatic. Define which operations are routine, what grounds a change, and when missing context or authority prevents applying it; do not substitute a blanket review gate for the chosen mode.

**Proposed Theory:** clearer priorities and lower-friction capture may reduce organizing effort and improve follow-through. Candidate indicators are user-rated clarity/effort, ability to identify a useful next action, and evidence against the user’s own goal criteria. This is a hypothesis, not an established benefit. Calendar connection and concrete scheduling examples are now selected. Provider, exact rule coverage, consent scope, reminder behavior and final acceptance criteria still need definition.

## Calendar-connected example scenarios and draft rules

The user selected calendar connection, goal breakdown and scheduling as the concrete example. The scenarios and defaults below are assistant-authored proposals, not additional user decisions; no provider or external write is implied. User activity deadlines belong to the product scenario, not the Bropilot delivery plan.

| Scenario | Assistant behavior | Observable acceptance example |
| --- | --- | --- |
| Goal to calendar: “Help me learn French; I can spend three 25-minute sessions a week.” | Clarify the intended learning outcome if missing; split the goal into manageable practice tasks; schedule linked blocks around actual availability and permitted hours. | Three non-overlapping blocks appear in the selected calendar, linked to their goal/tasks with a visible next action. Existing appointments are preserved. Calendar occupancy does not establish learning success. |
| Dependency-aware project: “Finish my portfolio homepage by Friday.” | Break down content, layout, implementation and review; estimate effort, preserve prerequisites and place work in available slots before the stated target. Explain insufficient capacity and offer scope or target changes. | Tasks retain dependency order and calendar links. A full calendar produces an explicit infeasibility finding rather than hidden overlaps, unapproved out-of-hours work or an invented completion promise. |
| Replan and review: a meeting takes a planned practice slot, then the user reports another task unfinished. | Detect the clash, move the assistant-owned block to a permitted available slot, and revise the remaining plan using the user's progress report. Explain changes concisely and retain actual history. | The conflicting block is rescheduled once, repeated notifications create no duplicates, reported unfinished work remains unfinished, and the calendar and task plan agree after reconciliation. |

Draft rules for Automatic routine changes:

- Schedule within the selected calendars, permitted hours, capacity and goal constraints; respect busy time, task dependencies, stated priorities and deadlines. Keep uncertain duration estimates visible.
- Automatically create or adjust assistant-owned task blocks within that scope. Preserve unrelated events and explicit user overrides; sending invitations or changing other people's commitments needs separately defined authority.
- Retain stable links between goals, tasks and calendar blocks. Reconcile retries and external edits without duplicate events or silent overwrite of newer user changes. Provider-specific behavior must be verified.
- Record progress with its source. Elapsed calendar time is not task completion; a reported completion is a user report, not independent proof of a beneficiary outcome.
- If capacity, meaning, permission or freshness prevents a valid change, record the unresolved issue and request only the missing decision. Do not replace the selected Automatic mode with a review step for every routine action.
- Keep an understandable change history and a way to undo assistant-owned scheduling changes, subject to the calendar adapter's actual capabilities. On partial calendar failure, expose unsynchronized state and resume safely rather than claiming the plan was fully applied.

Suggested first demonstration: goal capture and three scheduled practice blocks, a calendar conflict that triggers an automatic revision, and a progress review that updates remaining work. Candidate managed Things are the assistant interface, goal/task planning service, calendar adapter and progress/context store; the user's real calendar is an external system whose effects are observable and individually reconciled, not part of atomic source promotion. These are proposed model boundaries to qualify in M1.

## Questions that affect the next milestone

Resolve section 12's boundaries through focused design or research, preserving answers in the appropriate existing record:

1. Define the smallest initial system ontology, World/Thing Templates, Kit, Rule Pack and personal assistant scenario, including readiness and demonstration criteria.
2. The foundation now uses compiled Ascent rules with runtime Template data, bounded derivation, deterministic witnesses and source attribution. Native/actual workerd parity is locally verified; persistent fact storage and the trusted verifier boundary remain open.
3. Define semantic-to-source mappings, Task Packet format and harness-neutral CLI/API operations, including stale packet detection, scoped credentials and on-demand context expansion.
4. Establish the verifier trust boundary, protected Assay storage, exact-input evidence freshness and permission enforcement. Resolve composition compatibility and conflict handling before promotion implementation.
5. Verify current Artifacts fork/token/event capabilities and the minimum deployment adapter; choose additional Cloudflare services only as required. Define collaborator authentication and domain capabilities.
6. Refine workspace interactions, especially semantic zoom, synchronized hierarchy, proposed model edits and candidate review. Prototype options remain unselected design evidence.

Non-code and external Things retain capability declarations and explicit limits; complete external-effect orchestration is deferred. The example World is a personal assistant with the accepted broad Purpose above; its initial workflow, capabilities and acceptance contract still need definition. Remote GRREAT synchronization is pending authenticated preview and receipts, not assumed complete.

## Verified foundation boundary

The accepted first implementation contract is in [[execution]]. Rust owns the model, generated contracts and deterministic readiness; Vue consumes revision-pinned reads through a thin TypeScript Worker. Four fixtures qualify valid, missing, conflicting and incomplete models. The assistant/calendar workflow is modeled example data, with a disconnected calendar Thing. Thing Template and Rule Pack versions are validated against supported catalogs; evaluation hashes bind snapshot and Template contents, not just caller labels. Local compiled-Wasm/workerd checks establish runtime feasibility for this boundary, without establishing Artifacts APIs, external calendar writes, persistence or remote deployment.

## Candidate verification and funding clarification

[Requirements sections 3.1–3.3 and 9.1](../world-platform-plan-and-requirements.md) now formalize the user's basic web-app example, protected execution hooks, immutable submissions, verification levels and optional funding. Current source at foundation `11e1c0d` implements `WorldSnapshot`, Things, `MoveSummary` and model-readiness queries; its Worker serves read-only fixtures. It has no persisted Realizations/implementation manifests, Assay execution contract, submission endpoint, trusted runner/evidence records, promotion mutation or funding adapter. Existing local workerd/browser tests prove the foundation runtime; they are not a candidate-testing service.

The smallest useful next implementation is one deterministic vertical slice: persist and submit an exact web-app version, run protected existence/build/start/health/surface checks in isolation, attribute and store results, and reject stale or incomplete required evidence. Select the runner/storage adapter during that design. Selective LLM/decision-model assessment and contributor funding follow this working path; no delivery duration is inferred.

Payment feasibility checked against primary documentation on 2026-10-08: [x402](https://developers.cloudflare.com/agents/tools/payments/x402/) documents HTTP 402 and payment headers; [MPP](https://developers.cloudflare.com/agents/tools/payments/mpp/) documents payment challenges/credentials/receipts through HTTP authentication headers. [Monetization Gateway](https://developers.cloudflare.com/monetization-gateway/) is a separate closed-beta service with US buyer/seller eligibility. No provider, currency, wallet, charging/refund contract or live transaction is selected or tested. This research supports an adapter boundary, not a claim of availability for this project.
