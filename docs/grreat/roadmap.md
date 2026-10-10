<!-- grreat:record id=roadmap.next kind=roadmap_item status=active parent=goal.north-star -->
# Define the foundation

- Supports: [[goals]].
- Current focus: improve ontology question selection and semantic checks using the completed usefulness benchmark in [[execution]], on `feat/candidate-verification` and [PR #9](https://github.com/sdawka/bropilot/pull/9). The one-Thing hosted realization/deployment increment is locally verified; staging OAuth/Access, Artifacts/Git and A→B→rollback remain pending. Broader Task Packets, composition, model/payment Assays and assistant integrations remain deferred.
- Plan by dependencies and acceptance criteria, without dates or duration estimates. The adoption record is established; the product milestones below are not implemented or verified by that documentation work.

| Milestone | Dependency | Completion criteria and evidence |
| --- | --- | --- |
| M1 — Foundation | Canonical requirements and adoption baseline | Define the system ontology, World/Thing Templates, typed facts, initial Kit/Rule Pack, capability boundaries and personal assistant World’s goals → tasks → calendar blocks → progress review workflow, automatic-change rules and outcome indicators; qualify the draft scenarios in Research. Specify the readiness rule interface, mapping, Task Packet/CLI contract, criterion/Assay/hook bindings, immutable implementation versions, verifier trust, freshness and deployment boundaries. Validate known valid and invalid models; record unresolved decisions as blockers rather than guessed contracts. |
| M2 — Concurrent realization | M1 contracts | Persist desired and realized manifests; issue scoped role-specific packets and isolated Artifacts workspaces. Two or more real local agents register, claim, checkpoint and submit competing or complementary candidates. Verify retries, duplicate events, expired claims and stale packets without inventing agent activity. |
| M3 — Evaluate and promote | M2 candidates and M1 acceptance contract | Run protected Assays against exact submitted implementation versions; separate execution, assessment and trust states. Start with deterministic inspection and runtime checks, then support policy-selected substantial deterministic/semantic checks with bounded budgets. Record attributable evidence; compare and compose Thing versions. Required checks and authorization block invalid, unauthorized or stale promotion. Verify permission violations, scope changes, evidence freshness, file/hard/evidence/soft conflicts, composition checks and atomic head updates. |
| M4 — World workspace | M1 identities and model, integrated M2/M3 protocol | Provide creation, Overview, semantic Map, Theory, Work, Evaluations and History with a shared inspector. Verify revision-pinned deep links, keyboard/list access, preserved selection and reviewable edits. Distinguish readiness, conformance, outcomes, canonical state, candidates and deployment. Refine interactions before building them. |
| M5 — Deploy and prove | Integrated M1–M4 and verified provider adapters | Deploy the platform to Cloudflare for invited collaborators. Exercise the personal assistant World through readiness, concurrent realization, evaluation, authorized promotion, separate deployment and observation. Verify isolation and deployed evidence. Supply trying instructions, permissive source licensing and a demonstration of the actual workflow as required by the source document. |

Hosted agents, advanced lifecycle automation and complete external-effect orchestration remain optional or deferred. Minimal phase identity/history and declared external-Thing capabilities stay in the model. Later outcome evaluations may remain unknown; they must not be represented as achieved merely because the release works.

Use these same criteria in [[analysis]]; update them only with a recorded reason or explicit changed decision. Final release integration requires all CI checks green, with no bypass.

Optional extension after the deterministic verification path: contributor-funded Assays for open-source Worlds, with payment separated from verification and promotion authority. Protocol/provider selection and live payment feasibility remain future work; they do not block the basic slice.


## Ontology authoring improvement plan

Status: implemented in the local lab with optional semantic review and Luna questions; broader usefulness acceptance remains unmet (19/33 top-rated held-out first questions, zero human ratings). Evidence: [benchmark](../../packages/ontology-lab/benchmark/README.md). Spec: [requirements sections 5 and 10](../world-platform-plan-and-requirements.md). Goal: turn a messy description into a faithful, progressively clarified Thing with one worthwhile next question and inspectable uncertainty.

Architecture: local Codex proposes interpretations and question candidates; Rust remains authoritative for structural rules and deterministic policy. A bounded local System One adapter supplies provisional semantic judgments, never authorization or proof of execution. Preserve separate structural readiness, semantic review and observed conformance.

Constraints: retain user decisions and source provenance; assistant suggestions are not user facts; keep canonical Worlds untouched in the lab; preserve the central ontology, processor panel and step-through logs. Reuse this branch and PR. No deployment, calendar effects, remote credential storage or new orchestration framework in this slice.

### 1. Fix question selection first

Files: `packages/ontology-lab/domain.mjs`, `domain.d.mts`, `test/domain.test.mjs`; create `packages/ontology-lab/question-policy.mjs` and `test/question-policy.test.mjs`.

- [x] Preserve the complete candidate pool before deduplication and selection. Remove keyword-based suppression of specific Codex questions and the unconditional graph-first ordering. Retain origins, evidence references and reasons for selection/deferment.
- [ ] Represent unresolved decisions separately from unanswered schema fields. Track answered, deferred and superseded questions against the exact conversation/draft revision. Explicit corrections invalidate affected answers rather than retaining contradictory decisions.
- [x] Lead with one consequential unresolved decision; permit no question when there is nothing useful to ask. Keep remaining findings inspectable. Do not ask approval merely because a read-only search operation lacks an authorization edge; retain applicable access-policy checks.
- [x] Pin regressions for booking slot holds, Friday review already answered, journal search, grocery permission correction and ambiguous short replies. Compare candidate availability and visible selection separately.

Acceptance: those five regressions pass; no dropped candidates merely because they share approval/success vocabulary; no answered question returns without changed context or a concrete contradiction. This deterministic baseline must work without a TypeSafe credential.

### 2. Make completeness appropriate to the authoring stage

Files: `crates/world-core/src/lib.rs`, `crates/world-core/tests/readiness.rs`, generated `packages/contracts/`; `packages/ontology-lab/domain.mjs` and its tests.

- [ ] Distinguish exploring purpose/scope, defining behavior and preparing a realization. Stage controls question priority and explicit completeness declarations, not permission enforcement. Preserve all applicable hard rules and expose deferred obligations.
- [x] Keep unknown scopes unknown. Do not require every rough idea to supply an outcome review schedule and executable Assay immediately. When preparing a realization, surface missing required acceptance/test definitions as blockers under the existing contract.
- [ ] Test the same incomplete draft across stages, a read operation with access restrictions, an externally mutating operation without authorization, and a health criterion without an Assay. Verify native/Wasm parity and contract generation.

Acceptance: exploration does not overwhelm users with premature formalization; no stage can make an unauthorized action permissible or an incomplete realization ready by hiding findings.

### 3. Add narrow semantic checks, then optional ranking

Files: create `packages/ontology-lab/semantic-review.mjs` and `test/semantic-review.test.mjs`; integrate in `runner.mjs`, `test/runner.test.mjs`, `domain.mjs` and `domain.d.mts`. Reuse benchmark question-ranking contracts after review, not its experimental confidence tie-breaker as authority.

- [x] Check claim support, relation relevance, contradictory interpretations and permission-scope meaning against role-aware user evidence. A result records its check kind, subject, exact input digest, model/prompt version, answer distribution and accepted/rejected/unknown disposition.
- [x] Batch independent checks with bounded concurrency, timeouts and budget; cache only by exact relevant inputs and versions. Changed evidence invalidates results. Missing key, timeout, malformed output and uncertain judgment leave explicit unknowns.
- [x] Use local credentials only in the runner. Keep quoted input inert and prevent proposals from choosing endpoints, models, budgets or policy thresholds. Semantic approval must never grant capabilities or mark an Assay executed.
- [x] Start checks in shadow mode against the actual graph counterexamples. Evaluate relevance/answered status before ranking candidates. Strong contradictions take priority over cosmetic gaps; abstain instead of forcing a winner from weak candidates.
- [x] Test unsupported claims with real quotes, unrelated indicators/Assays, contradictory authorization prose, scope mismatch, assistant-only suggestions, prompt injection, timeout and stale-cache invalidation.

Acceptance: all seeded semantic counterexamples are flagged or explicitly unresolved; valid controls remain usable. No automatic acceptance threshold is enabled solely because the small microbenchmark had zero errors. Held-out evidence in step 5 governs rollout.

### 4. Make the reasoning visible and the conversation natural

Files: `apps/web/src/components/OntologyLab.vue`, `apps/web/src/components/ontology-lab/replay.ts`, `apps/web/src/ontology-lab.css`; event contracts in `packages/ontology-lab/domain.mjs`/`domain.d.mts`, `runner.mjs`, `tests/e2e/ontology-lab.spec.ts` and `apps/web/src/components/ontology-lab/replay.test.ts`.

- [x] Add replayable events for semantic checks and question selection: candidates considered, relevant user evidence, uncertainty, selected question and why it matters. Store observable decisions rather than model chain of thought.
- [x] Show separate structural and semantic statuses. Keep processor activity truthful; do not label sequential functions as independently deliberating agents. Retain the existing central canvas and sidebar layout.
- [ ] Phrase questions with the user's nouns and a concrete tradeoff. Offer a reversible suggestion when useful, clearly distinguished from an accepted decision. Respect “not sure”, deferral and corrections without repeatedly asking.
- [x] Verify live/replay equivalence, failed-provider states, keyboard navigation and short desktop/mobile layouts. Confirm new events neither overwrite live state while replaying nor leak credentials.

Acceptance: a user can trace a question to the input and graph gap, understand uncertainty, answer briefly or defer, and see the affected nodes update on the next run.

### 5. Prove gains and measure latency before expanding autonomy

Files: `packages/ontology-lab/benchmark/` harness/cases/report; add a separate held-out case set frozen before tuning. Retain the original baseline unchanged.

- [ ] Compare current baseline, revised deterministic policy and optional semantic policy on identical inputs. Include at least 30 distinct held-out conversations spanning familiar apps, sparse/long inputs, contradictions, role confusion and adaptive follow-ups; report unique cases separately from repeated calls.
- [ ] Randomize/blind question comparisons where feasible; collect human usefulness ratings and disagreement evidence. Proposed release target: at least 80% concrete consequential first questions, no known-answer repeats in the targeted regressions, and no material fidelity/permission regression. This is a target, not an achieved result or calibrated safety guarantee.
- [x] Report accepted errors and abstention by semantic check, including false rejection of valid proposals. Test exact graph counterexamples end-to-end; do not substitute easier microcases. High-consequence uncertain judgments remain review-required.
- [x] Instrument extraction, mapping, Rust checks, semantic checks and feedback separately; report p50/p95, provider identity when available, tokens and failures. Only then consider incremental extraction for edited facts and parallel independent checks; preserve full-context correction tests.
- [x] Run focused tests, full repository gates and independent review before enabling the optional semantic path. Retain deterministic fallback and a disable switch; update this plan with observed evidence, not inferred intelligence.

Dependency order: 1 → 2 → 3 → 4 → 5 rollout gate. After the interfaces are agreed, held-out case authoring can run independently of implementation; semantic adapter tests and UI replay work can proceed in parallel with disjoint ownership. Primary owns contracts, policy, integration and final evidence. Keep deployment verification a separate track.

Current evidence and remaining work: [benchmark results](../../packages/ontology-lab/benchmark/README.md). Stages are implemented in the conversation layer; no new Rust readiness contract was needed. The 33 frozen conversations and one adaptive live follow-up are complete, but human/blind comparisons and a durable cross-revision decision ledger remain pending. Question quality misses the proposed 80% target; exclusions, approval-subject drift and generic fallbacks need the next iteration. Incremental extraction remains deferred until correction/provenance preservation is tested. No unattended authoring is enabled.
