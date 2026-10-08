<!-- grreat:record id=execution.next kind=execution_item status=active parent=roadmap.next -->
# Define the first World and foundational contracts

## Now

- Goal: [[goals]]. Milestone: M1 foundation increment and M4 workspace layout locally verified; full milestones remain open.
- Next action: Review [PR #7](https://github.com/sdawka/bropilot/pull/7), stacked on adoption PR #6; verify remote CI before integration. Then define persistence and scoped agent/Task Packet contracts before M2.
- Working state: Isolated worktree `/private/tmp/bropilot-world-foundation`, based on `28d9eea`; original untracked lockfile and prototypes preserved.
- Blockers: None for this increment. GRREAT sync remains pending credentials. Provider selection, real calendar effects, trusted verification and promotion remain later work.
- Latest verification: `npm run build` and `npm run check` pass: 23 Rust tests, 5 UI tests, 11 actual workerd HTTP/parity tests and 8 desktop/mobile browser tests; contract drift, formatting, lint and type checks pass. Independent review is clear. Evidence: [[journals/2026-10-08]]. PR #7 is open; both hosted Foundation CI runs passed on `a970f5d` (application source `e20c4e9`).
- Last updated: 2026-10-08T02:25:11-04:00.

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
