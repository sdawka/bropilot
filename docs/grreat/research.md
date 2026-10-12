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

## Current delivery knowledge

| Area | Established evidence | Remaining uncertainty |
| --- | --- | --- |
| Typed model/inference | Rust owns versioned types, deterministic readiness and bounded Ascent reachability; native/workerd parity and synthetic impact are verified | Generic canonical authoring/adoption, mappings and coverage obligations |
| Verification/promotion | Persisted candidates, protected local runner, evidence bindings, leases and single-candidate CAS are locally verified | Live provider acceptance and generic composition |
| Cloudflare | Hosted identity/OAuth/Artifacts/package/publication adapters are implemented and locally verified; this repository’s Git mirror is live verified | Provisioned platform, registered identity/OAuth and live realized-app release |
| Authoring quality | Codex extraction, optional bounded System One and Luna question selection are locally exercised | Cross-revision answer lifecycle, human usefulness and reliable held-out question selection |
| Project memory | Authenticated GRREAT sync applied six records/five links with clean receipts; Markdown remains authoritative | Expanded records require reviewed preview/sync; mirror is not product deployment |

The focused questions below drive A–J. Non-code/external Things keep explicit capability limits; complete external-effect orchestration remains deferred.

## Verified foundation boundary

The accepted first implementation contract is retained under Foundation implementation contract in [[journals/2026-10-10]]; [[execution]] now selects upcoming draft adoption. Rust owns the model, generated contracts and deterministic readiness; Vue consumes revision-pinned reads through a thin TypeScript Worker. Four fixtures qualify valid, missing, conflicting and incomplete models. The assistant/calendar workflow is modeled example data, with a disconnected calendar Thing. Thing Template and Rule Pack versions are validated against supported catalogs; evaluation hashes bind snapshot and Template contents, not just caller labels. This foundation boundary was verified on October 8. Later candidate/hosted persistence and adapter evidence is recorded in [[analysis]]; it does not establish live calendar writes or remote application deployment.

## Candidate verification and funding clarification

[Requirements sections 3.1–3.3 and 9.1](../world-platform-plan-and-requirements.md) now formalize the user's basic web-app example, protected execution hooks, immutable submissions, verification levels and optional funding. The historical foundation at `11e1c0d` implemented `WorldSnapshot`, Things, `MoveSummary` and model-readiness queries; its Worker serves read-only fixtures. That baseline had no persisted candidates or executable verification. Subsequent local and hosted increments now implement candidate persistence, submission, trusted deterministic execution, evidence and single-candidate promotion; funding remains unimplemented. The evidence and remaining live/composition gaps are in [[analysis]].

The deterministic submit→verify→evidence→promote slice is locally verified. Reuse it for E rather than rebuilding it; live provider acceptance and composition remain separate gates. Selective LLM/decision-model assessment and contributor funding follow that path; no delivery duration is inferred.

Payment feasibility checked against primary documentation on 2026-10-08: [x402](https://developers.cloudflare.com/agents/tools/payments/x402/) documents HTTP 402 and payment headers; [MPP](https://developers.cloudflare.com/agents/tools/payments/mpp/) documents payment challenges/credentials/receipts through HTTP authentication headers. [Monetization Gateway](https://developers.cloudflare.com/monetization-gateway/) is a separate closed-beta service with US buyer/seller eligibility. No provider, currency, wallet, charging/refund contract or live transaction is selected or tested. This research supports an adapter boundary, not a claim of availability for this project.

## Ontology usefulness evidence

The [2026-10-09 benchmark](../../packages/ontology-lab/benchmark/README.md) tests eight app ideas, native/Wasm graph counterexamples, live Jev judgments and shadow question ranking. Extraction preserved the scripted intent; the fixed graph planner often hid a more useful question. Shadow ranking improved 13/16 selections under non-blind model-assisted review. System One remains an evaluated candidate for narrow semantic gates and ranking, not a production truth or permission authority. Prioritize stage-appropriate obligations and held-out multi-turn/user assessment; the small synthetic benchmark does not establish calibration or general intelligence.

<!-- grreat:record id=research.authoring kind=question parent=goal.model -->
## What is the smallest canonical draft-adoption contract?

- Known: Existing typed snapshots, protected Template, local extraction/checkpoints and Rust readiness; requirements §§2, 5 and 10.
- Unresolved: Generic create/correct/apply, accepted fact/proposal separation, base revision, idempotency, migration/version compatibility and required completeness.
- Next investigation: Specify a bounded revision delta and rejection cases against the accepted assistant Template; validate corrected provenance, stale-base and protected-schema failures. Do not require hosted model execution.
- Informs: A and G in [[roadmap]]. Responsible role: Domain/API integration.

<!-- grreat:record id=research.agent-protocol kind=question parent=goal.agents -->
## What context and authority does each local agent receive?

- Known: Requirements §6 enumerates pinned role-specific context; source/query and candidate APIs exist.
- Unresolved: Task Packet wire contract, mapping certainty, scoped credential issuance, context expansion, checkpoint/resume and event/claim expiry semantics.
- Next investigation: Trace one Move to one bounded packet and then two local agents; distinguish source certainty from authored hypotheses and capabilities from CLI instructions.
- Informs: C and D in [[roadmap]]. Responsible role: Agent-protocol integration.

<!-- grreat:record id=research.composition kind=question parent=goal.assurance -->
## How are Thing selections compared and safely composed?

- Known: Single-candidate verification/CAS and advisory baseline/proposed witnesses are locally verified; requirements §§8–9 define conflicts and protected roles.
- Unresolved: Composition manifest, compatibility oracle ownership, required rechecks, conflict findings, authorization and cross-Thing acceptance contract.
- Next investigation: Freeze selected-version inputs and a compatible/incompatible/stale-base example; map every required check to a protected verifier input before allowing promotion.
- Informs: E and F in [[roadmap]]. Responsible role: Core/verifier integration.

<!-- grreat:record id=research.hosted kind=question parent=goal.hosted -->
## Which provider prerequisites still prevent live acceptance?

- Known: Hosted adapters/workflows are locally tested; repository Git transport/mirroring is live verified. No hosted platform or app release is claimed.
- Unresolved: Account/resource provisioning, public hostname, Access identities/audience, registered OAuth scopes/grants, live fork/event/token behavior and deployment/rollback receipt.
- Next investigation: Inventory the declared bindings and external registration requirements; verify only the selected account/resource scopes. Record missing inputs, then run the live source→verify→A→B→rollback path when authorized/configured.
- Informs: D, E and H in [[roadmap]]. Responsible role: Cloudflare/identity release integration.

<!-- grreat:record id=research.assistant-acceptance kind=question parent=goal.assistant -->
## Which calendar operations, permissions and measurements define success?

- Known: Accepted Purpose, goals/actions/review, calendar example and Automatic mode; draft scenarios above are proposals.
- Unresolved: Provider/consent scope, routine operation coverage, overrides, capacity rules, retry/external-edit/partial-failure behavior, goal indicators and observation method.
- Next investigation: Qualify the smallest user scenario and adapter capability contract, including forbidden actions and unknown outcomes; keep scheduling elapsed time separate from completion and benefit.
- Informs: B, I and J in [[roadmap]]. Responsible role: Assistant domain/adapter integration.

<!-- grreat:record id=research.authoring-quality kind=question parent=goal.model -->
## What demonstrates helpful, faithful authoring across revisions?

- Known: Frozen held-out benchmark: 19/33 top-rated first questions and zero human ratings; graph/semantic probes establish only their tested scope.
- Unresolved: Cross-revision answered/deferred/superseded lifecycle, correction handling, held-out usefulness, semantic threshold calibration and latency bottlenecks.
- Next investigation: Use the existing benchmark protocol and preserved failures; prioritize exact permissions/provenance and consequential unresolved decisions, then obtain bounded human/blind evidence before claiming usefulness uplift.
- Informs: A and G in [[roadmap]]. Responsible role: Authoring/evaluation integration.
