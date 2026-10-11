<!-- grreat:record id=execution.next kind=execution_item status=active parent=roadmap.next -->
# Specify canonical authoring and draft adoption

## Now

- Goal: `goal.model` within [[goals]]; slice A in [[roadmap]]. The current task is a local contract, not deployment or hosted model authoring.
- Next action: describe the minimum accepted-Template draft delta and create/correct/apply transitions; pin base revision, provenance, scope, protected fields, idempotency and rejection cases before implementation.
- Independent external action: provider preflight in `execution.provider-preflight` can proceed without blocking the local contract.
- Working state: `feat/candidate-verification`, `/private/tmp/bropilot-world-foundation`, existing [PR #9](https://github.com/sdawka/bropilot/pull/9). No merge or deployment.
- Latest implementation evidence: `f9d700d` passed complete build/check (422 tests including 80 browser cases), independent review and both hosted foundation checks. Advisory impact/clarity is complete locally; canonical adoption, complete packets and composition remain open.
- External/mirror evidence: GitHub/Artifacts repository heads are verified. GRREAT authentication and the initial six-record mirror have verified receipts; enrichment uses independent review and versioned sync, with the current receipt in [[journals/2026-10-10]]. These facts do not establish a deployed platform, OAuth-connected app or live calendar.
- Blockers: live provider acceptance needs external setup/authority; detailed assistant/calendar contract needs decisions. Neither blocks local authoring/packet research. Markdown stays authoritative; preserve `.sync.json` and expose conflicts.
- Last updated: 2026-10-10T20:23:11-04:00. Evidence/history: [[analysis]] and [[journals/2026-10-10]].

- Responsible role: domain/API integration, with UI and verifier review at the acceptance boundary.
- Done when: an implementable contract names exact inputs/outputs and positive, correction, retry, stale-base, unauthorized-field and incomplete-model cases, with an owned follow-on model/Template/Kit/Rule Pack compatibility/migration contract. Subsequent implementation and tests remain separate work.

## Backlog and working policy

The records below are requirements-derived next work, not execution authorization for external writes. Follow their dependencies; independent preflight/research may proceed in parallel. Existing local runner, hosted adapters and workspace capabilities are reused. Every implementation closes an explicit acceptance gap and retains exact tested state. Prior delivered contracts are archived once in [[journals/2026-10-10]].

<!-- grreat:record id=execution.assistant-contract kind=execution_item status=todo parent=roadmap.assistant-contract -->
## Qualify the assistant operation contract

- Responsible role: Assistant domain lead.
- Action and dependency: Resolve the B questions: permitted routine actions, calendar/provider consent, overrides, reconciliation and outcome criteria.
- Starting evidence: Accepted broad Purpose/Automatic mode; the draft defaults are still proposals.
- Done when: An explicit operation/criteria matrix separates accepted rules, required decisions and deferred capabilities.

<!-- grreat:record id=execution.packets kind=execution_item status=todo parent=roadmap.agent-packets -->
## Specify and implement scoped Task Packets

- Responsible role: Agent-protocol lead.
- Action and dependency: After A, pin role/source/Thing/revision context and define bounded expansion, credentials, stale detection and handoff/checkpoint format.
- Starting evidence: Complete packet protocol is open; existing query/submission APIs are inputs.
- Done when: A real compatible local CLI uses the packet and rejects stale/unauthorized work with attributable context.

<!-- grreat:record id=execution.concurrency kind=execution_item status=todo parent=roadmap.concurrent-realization -->
## Exercise concurrent agents and fork lifecycle

- Responsible role: Agent/storage integration.
- Action and dependency: After A/C, complete claims/expiry/events/checkpoints and isolated workspace transitions; use provider preflight for live Artifacts forks.
- Starting evidence: Single-candidate leases are tested; real multi-agent/provider acceptance remains unverified.
- Done when: Two real agents submit competing/complementary immutable candidates; retry, expiry, abandoned workspace and protected-source cases behave as specified.

<!-- grreat:record id=execution.verification kind=execution_item status=todo parent=roadmap.verification -->
## Close live exact-version verification acceptance

- Responsible role: Verifier/storage integration.
- Action and dependency: Reuse protected hooks, runner transport and retained packages; run E on exact live source/instance inputs once provider setup is ready.
- Starting evidence: Deterministic implementation is locally verified; accepted semantic/combined Assay support is deferred and funding is optional.
- Done when: Missing implementation, broken health, altered bytes and stale evidence produce recorded failures; trusted exact-input evidence is retained. Subsequent accepted semantic/combined support pins model/prompt/rubric/combination versions, enforces prerequisites and selection/budget policy, and blocks promotion on required unknowns.

<!-- grreat:record id=execution.composition kind=execution_item status=todo parent=roadmap.composition -->
## Implement candidate comparison and composition

- Responsible role: Core/verifier/UI integration.
- Action and dependency: After D/E, specify selected Thing versions, semantic/file/permission conflicts, affected checks and atomic promotion.
- Starting evidence: Generic composition is open; the existing impact report is advisory.
- Done when: Compatible candidates compose; incompatible or stale selections cannot promote; recomputed evidence pins the same selected manifest.

<!-- grreat:record id=execution.workspace kind=execution_item status=todo parent=roadmap.workspace -->
## Connect the complete World journey

- Responsible role: Workspace integration.
- Action and dependency: After A/C/F, implement missing creation/proposed edits, concurrent Work, comparison and Theory/Evaluation/History flows, with minimum extensible phase identity/history separate from readiness and deployment.
- Starting evidence: Six-view shell and focused local flows are tested; generic creation/composition journey is incomplete.
- Done when: Desktop/mobile/keyboard users complete the real journey while preserving context and distinct readiness/conformance/outcome/deployed states.

<!-- grreat:record id=execution.provider-preflight kind=execution_item status=todo parent=roadmap.hosted -->
## Inventory and qualify live Cloudflare prerequisites

- Responsible role: Cloudflare/identity release lead.
- Action and dependency: Independently inspect selected account, declared bindings, Artifacts forks/token scope, hostname, Access and registered OAuth prerequisites; then execute H when its dependencies and authority are present.
- Starting evidence: Repository Git mirror is verified; live platform/application acceptance is not.
- Done when: The remaining prerequisites are concrete; live A→B→rollback receipts prove selected target/source/package/observation lineage, with canonical B retained.

<!-- grreat:record id=execution.assistant-calendar kind=execution_item status=todo parent=roadmap.assistant-calendar -->
## Realize and verify the connected assistant

- Responsible role: Assistant adapter integration.
- Action and dependency: After B/G/H, implement the selected goal/task/calendar/progress contract with provider-specific reconciliation and Automatic rules.
- Starting evidence: Current assistant data are fixtures; no live calendar is connected.
- Done when: A real goal is broken down and scheduled, a clash replans safely, and attributed review updates the plan without inventing completion.

<!-- grreat:record id=execution.outcomes kind=execution_item status=todo parent=roadmap.outcome-learning -->
## Observe outcomes and feed learning into Moves

- Responsible role: Observation/assurance integration.
- Action and dependency: After H/I, use the B measurement contract to record raw observations, interpretations and Theory findings.
- Starting evidence: No beneficiary outcome or causal benefit is established by existing synthetic metrics.
- Done when: Evidence supports/challenges/leaves unknown the declared claim; changed assumptions or behavior create a traceable proposed Theory revision/Move.
