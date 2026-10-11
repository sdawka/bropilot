<!-- grreat:record id=roadmap.next kind=roadmap_item status=active parent=goal.north-star -->
# A — Canonical model authoring and draft adoption

- Supports: `goal.model` in [[goals]].
- Depends on: Accepted typed foundation and the personal-assistant Template; independent of hosted provisioning.
- Work: Specify then implement the smallest inspect/correct/apply contract for local-agent drafts and desired revisions: exact base, stable identities, provenance, permission/scope, rejection, repeat application and stale-base behavior. Domain/API integration also owns the follow-on minimum model/Template/Kit/Rule Pack version lifecycle and compatibility/migration contract; runtime rule programs remain protected.
- Acceptance: A draft can become an immutable desired model revision without executing external effects or changing protected schemas/rules; corrections remain attributable and required gaps remain visible. Before A closes, approved version changes preserve historical pins and reject incompatible composition or unsupported migration rather than silently changing meaning.
- Evidence boundary: Typed readiness/lab are locally verified; canonical draft adoption and generic authoring are open.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.assistant-contract kind=roadmap_item status=planned parent=goal.assistant -->
# B — Assistant operation and acceptance contract

- Supports: `goal.assistant` in [[goals]].
- Depends on: Accepted assistant Purpose and Automatic mode; can be specified alongside A.
- Work: Qualify goal/task/calendar/progress operations, exact permission boundaries, success criteria, evidence sources and provider-selection questions.
- Acceptance: The capture→clarify→next action→schedule→replan→review example has explicit routine-change rules, unresolved decisions and observable pass/fail/unknown criteria before real calendar writes.
- Evidence boundary: Broad workflow accepted; draft scheduling defaults remain proposals.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.agent-packets kind=roadmap_item status=planned parent=goal.agents -->
# C — Task Packets and harness-neutral CLI

- Supports: `goal.agents` in [[goals]].
- Depends on: A provides pinned model identities and desired/base revisions.
- Work: Specify role-specific packets, semantic-to-source mappings, scoped credentials, commands, stale-packet detection, context expansion and checkpoint/resume format.
- Acceptance: A compatible local CLI can read one bounded packet, expand attributable context, detect stale inputs and return a candidate/checkpoint without treating instructions as permission enforcement.
- Evidence boundary: Model/query APIs exist; complete packet/handoff contract is open.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.concurrent-realization kind=roadmap_item status=planned parent=goal.agents -->
# D — Concurrent Realizations and isolated workspaces

- Supports: `goal.agents` in [[goals]].
- Depends on: A and C; live fork acceptance also needs the independently runnable H provider preflight.
- Work: Complete claim/expiry/retry/checkpoint transitions and isolated Artifacts workspace lifecycle for competing and complementary agent work.
- Acceptance: Two real local agents claim, checkpoint/resume and submit pinned Thing commits; retries create no duplicates, expiry gives no promotion rights and canonical/protected storage stays isolated.
- Evidence boundary: Single-candidate lifecycle/leases are locally verified; real concurrent agents and live fork lifecycle are unverified.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.verification kind=roadmap_item status=planned parent=goal.assurance -->
# E — Protected exact-version verification

- Supports: `goal.assurance` in [[goals]].
- Depends on: D supplies pinned Realizations; reuse the existing deterministic runner and evidence contracts.
- Work: Close provider acceptance for existence/build/start/health/frontend/backend Assays, trusted transport, retained packages and stale-evidence rejection.
- Acceptance: Authorized execution records exact inputs, protected hook versions, runner identity and observations; missing/broken/stale candidates fail appropriately and cannot reuse another version’s results. After deterministic acceptance, close accepted LLM, decision-model and combined Assay support with pinned model/prompt/rubric/combination versions, prerequisites, selection/budget policy and required-unknown blocking.
- Evidence boundary: Deterministic implementation and local runtime tests pass; live Artifacts/hosted verification remains unverified. Accepted semantic/combined Assay capability is deferred; execution selection is policy-bound and contributor funding remains optional.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.composition kind=roadmap_item status=planned parent=goal.assurance -->
# F — Candidate comparison, composition and promotion

- Supports: `goal.assurance` in [[goals]].
- Depends on: D and E.
- Work: Define selected Thing-version compositions, file/semantic/permission conflicts, compatibility checks, affected-evidence invalidation and current-head CAS.
- Acceptance: Compare candidates under one contract, compose compatible Things, reverify affected checks and reject stale or unauthorized promotion. Individually passing candidates are insufficient.
- Evidence boundary: Single-candidate CAS/promotion is locally verified; generic composition remains open. Advisory impact is analysis, not promotion clearance.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.workspace kind=roadmap_item status=planned parent=goal.workspace -->
# G — Complete the World workspace journey

- Supports: `goal.workspace` in [[goals]].
- Depends on: A, C and F; use existing pinned navigation, inspector and Visual/Text Map.
- Work: Connect creation/proposed edits, Theory, concurrent Work, comparisons, Evaluations, History and explicit next actions to real protocol state, including minimum extensible phase identity/history.
- Acceptance: Invited users can perform the full revision-pinned journey on desktop/mobile and keyboard; unresolved information, readiness, conformance, outcome and deployment remain distinct. Phase identity and history are stored separately from readiness, candidate and deployment state; a full lifecycle engine remains optional.
- Evidence boundary: Shell, candidate flow, lab and advisory analysis are locally verified; generic creation and multi-Move/composition views remain open.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.hosted kind=roadmap_item status=planned parent=goal.hosted -->
# H — Hosted provider proof and invited release

- Supports: `goal.hosted` in [[goals]].
- Depends on: Full release requires E, F and G. Account/resource/OAuth/Access preflight can proceed independently now.
- Work: Provision and verify the platform, collaborator identity, Artifacts/fork lifecycle, encrypted owner connection and exact-package Worker publication; then exercise live A→B→rollback.
- Acceptance: Retain authenticated platform/source/build/verification/provider/observation lineage and trying instructions. Rollback A leaves canonical B unchanged; revoked or expired grants fail safely.
- Evidence boundary: Hosted code is locally verified and repo mirror is live verified. Neither proves hosted platform or realized-app release. Required external setup is pending.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.assistant-calendar kind=roadmap_item status=planned parent=goal.assistant -->
# I — Real calendar-connected assistant acceptance

- Supports: `goal.assistant` in [[goals]].
- Depends on: B, G and H; provider/consent decisions must be resolved before dependent writes.
- Work: Realize the goal/task/calendar/progress workflow with selected adapter capabilities, Automatic rules and reconciliation.
- Acceptance: Create linked permitted blocks, preserve unrelated events, replan a clash once, respect overrides and expose partial sync failure. Reported completion retains its source.
- Evidence boundary: Modeled/synthetic examples exist; no live calendar behavior or assistant application outcome is verified.
- Execution: [[execution]]; assessment: [[analysis]].

<!-- grreat:record id=roadmap.outcome-learning kind=roadmap_item status=planned parent=goal.assistant -->
# J — Deployed observation and Theory learning

- Supports: `goal.assistant` in [[goals]].
- Depends on: H and I plus the outcome/measurement contract from B.
- Work: Collect appropriate observations, compare them with user goal criteria and Theory assumptions, and create a prefilled Move when behavior or assumptions warrant revision.
- Acceptance: Raw observations, interpretations, limitations and conformance remain distinct; a changed completion metric alone does not establish causal benefit. Preserve provenance and unknown outcomes.
- Evidence boundary: Observed-benefit evidence is absent; synthetic impact calculations establish only the bounded analyzer behavior.
- Execution: [[execution]]; assessment: [[analysis]].

## Scope preserved across these slices

A–J split the prior M1–M5 acceptance groups without changing their criteria: M1→A/B/C; M2→C/D; M3→E/F; M4→A/G; M5→H/I/J. The earlier increment contracts are retained in [[journals/2026-10-10]]. Plan by dependencies and criteria, without delivery dates.

Deferred accepted capability: LLM, decision-model and combined Assays after the deterministic path, closed through E; each candidate's execution selection follows prerequisites and cost policy. Optional or deferred extensions: platform-hosted agents, advanced lifecycle automation, complete external-effect orchestration, arbitrary non-code adapters and contributor-funded verification. Keep capability limits explicit; adopt Cloudflare services only when required. No payment provider or hosted authoring/model runtime is selected as a prerequisite for the first release. All CI must be green before a separately authorized merge.
