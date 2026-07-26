# Simulator & Testing Implementation Plan

> Executes `docs/superpowers/specs/2026-07-21-simulator-testing-design.md` (approved). That spec is the requirements source — this plan adds wave structure, file ownership, and verification contracts for parallel execution.

**Goal:** Seeded ontology-driven simulator core + Vitest suites + Playwright e2e + CI, per the spec.

## Global Constraints

- npm commands from `web/`; git from repo root. Branch: `dev`.
- Wave-1 agents run in parallel in ONE working tree: each agent creates ONLY the new files it owns, never edits `package.json`/lockfile/configs/other agents' files, never runs `npm install`, and NEVER commits or touches git state — the controller commits per wave.
- Framework decision (user-approved): Vitest + Playwright. No linter/formatter tooling.
- Simulator/test failures must always print the seed and op index (reproducibility contract).
- The store is a module-level singleton; tests reset via `clearGraph()`/`importGraph()` per test. `hydrate()` requires the localStorage stub from `tests/setup.ts`.
- Advisory rule holds in tests: off-ontology edges are legal — assert they lint as findings, never that they're rejected.

## Wave 0 — Foundation (sequential, one agent)

**Files (owns):** `web/package.json` (+lock), `web/vitest.config.ts`, `web/playwright.config.ts`, `web/tests/setup.ts`, `web/src/lib/sim/rng.ts`, `web/src/lib/sim/ops.ts`, `web/src/lib/sim/invariants.ts`, `web/src/lib/sim/run.ts`.

- Deps: `vitest`, `@playwright/test` (latest stable). Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"e2e": "playwright test"`.
- `vitest.config.ts`: `test: { environment: 'node', include: ['tests/**/*.test.ts'], setupFiles: ['./tests/setup.ts'] }`.
- `playwright.config.ts`: `testDir: 'e2e'`, chromium only, `use: { permissions: ['clipboard-read', 'clipboard-write'] }`, `webServer: { command: 'npm run dev', port: 4433, reuseExistingServer: true }`.
- `tests/setup.ts`: install a Map-backed `localStorage` on `globalThis` when absent (getItem/setItem/removeItem/clear/key/length).
- Sim core interfaces (later waves depend on these exact exports):
  - `rng.ts`: `mulberry32(seed: number): () => number` plus helpers `pick<T>(rnd, arr): T`, `int(rnd, min, max): number`.
  - `ops.ts`: `type SimOp` (discriminated union per spec §1 op list), `generateOps(rnd: () => number, count: number): SimOp[]` (weights per spec: ~85% licensed edges via `triplesFrom`; hostile strings incl. newlines/markdown/10k-char/emoji/empty), `applyOp(op: SimOp): void` (drives the real store mutators).
  - `invariants.ts`: `checkInvariants(): InvariantFailure[]` with `interface InvariantFailure { invariant: string; detail: string }` — the spec §1 list verbatim (referential integrity, id discipline, never-throws probe set, round-trip identity, undo/redo restore, derived consistency).
  - `run.ts`: `simulate(opts: { seed: number; ops: number }): SimReport` where `interface SimReport { seed: number; applied: number; failures: (InvariantFailure & { opIndex: number; op: SimOp })[]; stats: { nodes: number; edges: number } }`. Undo/redo and round-trip invariants may run every K=25 ops (they're O(graph)); cheap invariants run every op.
- Verify: throwaway `npx tsx` run — `simulate({ seed: 1, ops: 300 })` and `simulate({ seed: 2, ops: 300 })` complete with zero failures (fix sim core OR report genuine app bugs — do not weaken invariants to pass); `npm run check` green. Controller commits: `Add simulator core and test scaffolding`.

## Wave 1 — Parallel (four agents, disjoint files, no commits)

**Agent U — unit suites.** Owns `web/tests/unit/schema.test.ts`, `lint.test.ts`, `query.test.ts`. Content per spec §2: promote the build's scratch batteries (ONTOLOGY validity/dupes/derivations; the six SAMPLE_GRAPH lint findings + unknown-kind skip + null robustness; query semantics: BGP joins, same-var equality, not-pattern placement independence, `^`/`+` composition, transitive-licensing warning suppression, malformed-shape validation errors listing alternatives, whyChain incl. outgoing serves, neighborhood depth bounds, contextMarkdown 10k budget). Assert against real current behavior — investigate before asserting; do not weaken to pass. Verify: `npx vitest run tests/unit` green.

**Agent S — simulator property tests.** Owns `web/tests/sim/simulator.test.ts` AND (only if it finds core bugs) `web/src/lib/sim/*.ts`. 25 seeds × 400 ops each as individual `test.each` cases asserting zero invariant failures (message includes seed + op index); one 5,000-op soak behind `test.skipIf(!!process.env.CI)`. Genuine app bugs surfaced by invariants: do NOT fix app code — record precisely in report, mark the specific seed test `.fails` with a comment referencing the finding. Verify: `npx vitest run tests/sim` green.

**Agent E — Playwright verification suite.** Owns `web/e2e/verification.spec.ts`, `web/e2e/helpers.ts`. The 8-point pass + 3 fix-batch regressions as individual tests (spec §3 list). Real input events only (`page.mouse`, `page.keyboard`); fresh context per test (sample graph seeds itself); SVG node targeting via text-label bounding boxes. Verify: `npx playwright install chromium` then `npm run e2e -- e2e/verification.spec.ts` green locally (dev server via webServer config).

**Agent C — CI + docs.** Owns `.github/workflows/ci.yml`, edits `CLAUDE.md` only. Workflow per spec §4 (single job: npm ci, check, build, vitest, playwright chromium --with-deps, e2e, sync-skills drift gate `git diff --exit-code`); CLAUDE.md testing-paragraph replacement per spec Docs section. Verify: `npx tsx -e` YAML parse or actionlint if available; run the sync-skills drift gate locally.

Controller then: run full `npm run check && npm run build && npm run test`, review combined wave diff, commit per area (`Add unit and simulator test suites`, `Add Playwright verification suite`, `Add CI workflow; document testing in CLAUDE.md`).

## Wave 2 — Integration (sequential, one agent)

**Owns:** `web/e2e/sim-smoke.spec.ts`. Replays a short seeded op sequence (seed 7, ~15 ops: adds + licensed edges + one undo — generated via the sim core, filtered to UI-replayable ops) through the real UI (part-view forms, RelationshipEditor, ⌘Z), exports via the Export modal, and deep-equals nodes/edges (ignoring edge ids and sourceRefs) against the model-level result of the same filtered sequence. Verify: full `npm run e2e` green. Controller commits: `Add simulator-driven UI smoke test`.

## Finish

Controller: whole-branch gates (`check`, `build`, `test`, `e2e`, sync-skills drift), one reviewer over the branch diff, fixes if needed, push `dev`, PR `dev → main` (histories now common). Update `.superpowers/sdd/progress.md` throughout.
