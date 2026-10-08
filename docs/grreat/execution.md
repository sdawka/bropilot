<!-- grreat:record id=execution.next kind=execution_item status=active parent=roadmap.next -->
# Define the first World and foundational contracts

## Now

- Goal: [[goals]]. Milestone: deterministic candidate-verification slice across M1 contracts, M2 persistence/submission and M3 verification.
- Next action: Try the local create → submit → verify → promote flow; continue iteration on this single branch/PR. Hosted authentication, provider-backed source versions and deployment need a later slice.
- Working state: `feat/candidate-verification`, isolated worktree `/private/tmp/bropilot-world-foundation`, based on merged main `733f6b9`. Older PRs #5–#8 merged with all checks green; #1 closed as superseded, branch preserved. Single iterative PR delivery pending.
- Blockers: No local implementation blocker. Git/Artifacts provider storage, hosted verifier/authentication, model checks, payments and deployment remain outside this slice. GRREAT sync remains pending credentials.
- Latest verification: Build/check pass: 37 Rust, 6 UI, 17 verifier, 16 actual Worker and 12 desktop/mobile browser tests. Final shared-limit cases, clippy and strict mobile-width checks also pass; independent review findings resolved. [[journals/2026-10-08]] has evidence and limits.
- Last updated: 2026-10-08T08:50:09-04:00.

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

## Candidate-verification implementation plan

Spec: [requirements sections 3.1–3.3](../world-platform-plan-and-requirements.md). Use the existing isolated branch and one PR; try the actual flow locally first.

Architecture: Rust applies pure `WorldCommandRequest {apiVersion,state,actor,nowMs,command}` transitions and generates contracts. A per-World SQLite Durable Object atomically persists each accepted transition. A separately credentialed local verifier builds bounded, content-backed source bundles and executes actual workerd checks; candidate code receives no platform credentials, host filesystem or outbound capability. Registered executable hashes bind protected hooks to run evidence. The initial Worker app Kit is `worker.ts` plus `public/index.html`, `/health` and `/api/message` contracts.

- [x] Rust (`crates/world-core/src/realization.rs`, tests, Wasm/CLI forwarding, generated contracts): create World/Move, immutable submit, queue/claim/complete and CAS promotion. Test role spoofing, exact replay versus changed request IDs, competing candidate stale bases, digest/contract mismatch, expired verifier leases and missing/failed evidence. Keep model readiness separate from candidate conformance.
- [x] Persistence/API (`apps/worker/src/world-authority.ts`, local auth/routes): inject authenticated role/time and registered runner hash; atomically store state/revisions/idempotency. Implement owner/implementer/verifier capabilities for the local operator; remotely deployed configuration rejects this local mutation surface. HTTP tests prove persistence across Worker restart, World separation, unauthorized evidence/promotion, malformed/oversize input and exact retries.
- [x] Verifier (`packages/local-verifier/`): protected runner hash, bounded in-memory build, isolated workerd preview and attributable existence/build/health/surface observations. Test missing files, compile and health failure, source/runner mismatch, network denial, response/deadline bounds and cleanup. Source is an immutable content-backed bundle for this local slice; do not claim unimplemented Git/Artifacts resolution.
- [x] Workspace (`apps/web/`, new local browser tests): create a World, submit working/broken candidates, request/poll real runs, inspect evidence and promote only an eligible exact candidate. Show no invented activity or deployment. Verify reload, desktop/mobile geometry and server-side rejection paths.
- [x] Primary integration: fresh patched Wasm and registered-runner manifest, local development process/separate credentials, complete build/check and independent whole-branch review. Merge older current PRs only with all checks green, preserve historical branches, prepare this locally verified branch for one iterative PR; delivery is recorded in Now.

Boundary: no remote deployment, paid/model Assay execution, calendar effects or general package-install/shell execution. Those follow this tested protocol rather than blocking it.
