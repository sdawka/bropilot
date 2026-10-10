<!-- grreat:record id=execution.next kind=execution_item status=active parent=roadmap.next -->
# Ontology authoring and hosted realization

## Now

- Goal: [[goals]]. Milestone: ontology usefulness benchmark complete; extraction and replay work, but generic question prioritization and semantic readiness remain gaps. Hosted one-Thing realization/deployment remains implemented but externally unverified.
- Next action: Implement step 1 of the proposed [ontology improvement plan](roadmap.md): question-selection regressions and a deterministic candidate policy. The plan is recorded; production behavior is unchanged. Hosted staging verification remains an independent track.
- Working state: `feat/candidate-verification`, isolated worktree `/private/tmp/bropilot-world-foundation`, based on merged main `733f6b9`. Older PRs #5–#8 merged with all checks green; #1 closed as superseded, branch preserved. [PR #9](https://github.com/sdawka/bropilot/pull/9) is the single open iterative PR; hosted check results remain on that PR.
- Blockers: Public OAuth client/domain setup and authenticated provider resources must be verified before live release. Local implementation continues independently. GRREAT sync remains pending credentials.
- Latest verification: 16/16 real Codex/Rust runs across eight app ideas, ten identical native/Worker graph probes, 108 Jev judgments on 36 fixed microcases, and 16 shadow question-ranking calls. [Benchmark protocol/results](../../packages/ontology-lab/benchmark/README.md) distinguish structural checks, semantic judgments and observed question quality. Prior full build/check evidence remains in [[journals/2026-10-09]].
- Last updated: 2026-10-09T22:13:45-04:00.

## Ontology flow lab

- Scope: Local Codex proposes typed entities/relations with quoted message provenance; deterministic mapping preserves the protected assistant Template and Rust evaluates the resulting draft. A labelled example extraction supports reproducible exploration without a model call.
- UI: Central ontology, floating processor panel, input/chat and right-side logs. Event selection and Previous/Next/Play restore exact recorded checkpoints and highlights; following live activity is explicit.
- Acceptance verified: Actual live extraction plus Rust checks; follow-up descriptions produce isolated new drafts; source quotes are validated; malformed proposals cannot alter Templates/rules; history does not mutate the live draft; desktop/mobile keyboard and replay behavior pass. Thoughtful next questions explain their gaps and short replies retain context without accepting assistant suggestions as user facts. Local process credentials stay out of the browser and production.
- Parallel ownership: shared mapping/contracts/tests; supervised local model runner/tests; lab UI/tests. Primary owns authenticated routing, local-session integration, browser verification and existing documentation. No canonical writes, external calendar effects or deployment actions.

## Foundation implementation contract

This is the accepted first build, not completion of the minimum deployed platform. See [requirements](../world-platform-plan-and-requirements.md) and [decisions](../decision_log.md).

- Rust owns stable model identities, pinned Template/revision references, typed/provenance-bearing facts and relations, hierarchy queries, declarative readiness and finding derivations. Compile built-in Ascent rules; runtime Templates supply constraints and obligations. No arbitrary runtime program execution.
- A `WorldSnapshot` supplies World/revision/title, Purpose and Environment, Template, Things, typed objects, relations, completeness declarations, Theory, Moves and Rule Pack pins. `ReadinessEvaluation` reports exact revision/pack inputs, ready/blocked/unknown, attributed findings, derived facts and separately unknown outcome assessments.
- JSON requests use `apiVersion: 1`, a snapshot and a tagged query (`workspace`, `readiness`, `children`). Responses are tagged success/error; unsupported versions, malformed input and resource limits return explicit errors. Rust is the source for generated TypeScript types and example JSON; UI adapters consume the same contract.
- Readiness validates references and legal relation endpoints, required beneficiary/outcome/indicator/evaluation links, applicable authorization/Assay obligations, configured forbidden cycles and incompatible constraints. Absence is a violation only within a declared complete scope; unresolved mandatory scope or incomplete inference cannot be ready. Future outcome evidence is separate from specification readiness.
- Managed assistant Things: interface, planning service, calendar adapter, progress/context store. The calendar is external; routine policy permits assistant-owned blocks only. Fixtures cover a valid model, missing obligations, a calendar conflict and unknown outcomes. Their activity is example data, never live agent/calendar evidence.
- Core track owns `crates/` and generated `packages/contracts/`. UI track owns `apps/web/`. Primary owns `apps/worker/`, root build/CI configuration, integration and documentation. Shared contract changes are coordinated before consumers change.
- UI: fresh Vue/Vite layout, World/revision/Environment context, Overview/Map/Theory/Work/Evaluations/History, shared inspector, preserved selection, pinned deep links and World→Thing→subsystem→operation hierarchy navigation. Detailed visualizations/editors/activity are clearly marked placeholders.
- Worker: read-only example snapshots and bounded readiness/query endpoint calling actual Rust Wasm. Compile `wasm32-unknown-unknown`, adapt wasm-bindgen output for workerd; no WASI/threading or duplicated TypeScript domain rules.

### Acceptance and delivery

- [x] Native Rust cases distinguish required gaps, unknown scopes/outcomes, invalid references, incompatible constraints and forbidden cycles, with provenance.
- [x] Native and actual workerd/Wasm responses agree for shared fixtures, including errors and sequential query isolation.
- [x] UI selection/navigation/deep links and desktop/mobile controls work; actual Rust readiness is displayed; unavailable activity is explicit.
- [x] Rust tests/lint, TypeScript checks, production builds, browser tests and contract-drift checks pass; independent review is integrated.
- [x] Push and open a PR; never merge with any failing CI check. Update Now/journal/Analysis against observed evidence. GRREAT authenticated sync remains pending when credentials are absent.

## Work history

- [[journals/2026-10-08]] — initial adoption, source conversion and validation evidence.
- [[journals/2026-10-09]] — hosted realization and deployment integration.

## Candidate-verification implementation plan

Spec: [requirements sections 3.1–3.3](../world-platform-plan-and-requirements.md). Use the existing isolated branch and one PR; try the actual flow locally first.

Architecture: Rust applies pure `WorldCommandRequest {apiVersion,state,actor,nowMs,command}` transitions and generates contracts. A per-World SQLite Durable Object atomically persists each accepted transition. A separately credentialed local verifier builds bounded, content-backed source bundles and executes actual workerd checks; candidate code receives no platform credentials, host filesystem or outbound capability. Registered executable hashes bind protected hooks to run evidence. The initial Worker app Kit is `worker.ts` plus `public/index.html`, `/health` and `/api/message` contracts.

- [x] Rust (`crates/world-core/src/realization.rs`, tests, Wasm/CLI forwarding, generated contracts): create World/Move, immutable submit, queue/claim/complete and CAS promotion. Test role spoofing, exact replay versus changed request IDs, competing candidate stale bases, digest/contract mismatch, expired verifier leases and missing/failed evidence. Keep model readiness separate from candidate conformance.
- [x] Persistence/API (`apps/worker/src/world-authority.ts`, local auth/routes): inject authenticated role/time and registered runner hash; atomically store state/revisions/idempotency. Implement owner/implementer/verifier capabilities for the local operator; remotely deployed configuration rejects this local mutation surface. HTTP tests prove persistence across Worker restart, World separation, unauthorized evidence/promotion, malformed/oversize input and exact retries.
- [x] Verifier (`packages/local-verifier/`): protected runner hash, bounded in-memory build, isolated workerd preview and attributable existence/build/health/surface observations. Test missing files, compile and health failure, source/runner mismatch, network denial, response/deadline bounds and cleanup. Source is an immutable content-backed bundle for this local slice; do not claim unimplemented Git/Artifacts resolution.
- [x] Workspace (`apps/web/`, new local browser tests): create a World, submit working/broken candidates, request/poll real runs, inspect evidence and promote only an eligible exact candidate. Show no invented activity or deployment. Verify reload, desktop/mobile geometry and server-side rejection paths.
- [x] Primary integration: fresh patched Wasm and registered-runner manifest, local development process/separate credentials, complete build/check and independent whole-branch review. Merge older current PRs only with all checks green, preserve historical branches, prepare this locally verified branch for one iterative PR; delivery is recorded in Now.

Boundary: no remote deployment, paid/model Assay execution, calendar effects or general package-install/shell execution. Those follow this tested protocol rather than blocking it.

## Hosted realization and deployment

Accepted scope: one full-stack application Thing and canonical Artifacts repository, with isolated Realization forks, deployed to one dedicated Worker in the user's OAuth-connected account. Bropilot owns the source/build storage; target deployment credentials remain private and separate. Preserve the current centered UI and Visual/Text Map.

- [x] Freeze additive principal, source, retained-package, target, deployment and observation contracts; preserve local inline-source compatibility. Record current user decisions and update canonical requirements.
- [x] Rust track: scoped identities, retained-package binding, hosted promotion and separate deployment/rollback transitions with stale-state and idempotency guards.
- [x] Cloudflare track: Access identity, private OAuth connections, global target fencing, durable publication/reconciliation and runtime probes.
- [x] Artifacts/verifier track: isolated source commits, protected canonical storage, hosted lease-bound verifier transport, immutable R2 packages and exact-byte deployment loading.
- [x] UI track: hosted session, on-demand account connection, deployment status/evidence and explicit rollback; retain clean layout and pinned navigation.
- [x] Primary local integration: routing/authority/bindings/generated outputs, complete local gates and independent review. Implementation `288f413` is pushed to the existing PR #9; hosted CI results are linked there. Merging requires all checks green.
- [ ] Live proof: authorize OAuth, deploy A, deploy verified B to the same Worker, roll back to A with canonical B unchanged; retain source/build/provider/observation lineage. Missing external setup remains pending rather than simulated.

Primary owns shared files and integration; each track owns disjoint code and focused tests, preserves concurrent edits, and returns validation evidence. No automatic rollback, target databases, custom domains, hosted shell builds, calendar effects, generic composition, full Task Packets, model checks or payment execution in this slice. Update Now and the linked journal at meaningful boundaries; assess the accepted evidence in Analysis and attempt versioned direct-RPC sync when authenticated.
