# Simulator & testing plan for Bropilot Studio

**Date:** 2026-07-21 · **Status:** draft — awaiting user review

## Problem

The repo's only static gate is `npm run check`; behavioral verification has been ad-hoc (throwaway tsx scripts, one-off Playwright drives) and evaporates after each session. The meta-ontology branch shipped with real bugs that only browser passes and adversarial review caught. The user has explicitly revisited the standing "no test framework" decision: adopt **Vitest + Playwright**, built around an **application simulator**.

## Solution overview

Three layers, one shared core:

1. **Simulator core** (`web/src/lib/sim/`) — a seeded, ontology-driven random operation engine over the store: generates plausible-and-hostile graph editing sessions and checks invariants after every operation. Pure TypeScript, no framework dependency, importable from both test layers.
2. **Vitest** (`web/tests/`) — unit tests for schema/lint/query semantics plus property-style simulator runs (N seeds × M ops).
3. **Playwright** (`web/e2e/`) — the 8-point browser verification codified permanently, plus a simulator-driven UI smoke that replays generated op sequences through real clicks/typing.

Plus **GitHub Actions CI** running all gates on push/PR — making the user's "never merge red CI" rule enforceable on this repo for the first time.

## 1 · Simulator core (`web/src/lib/sim/`)

- `rng.ts` — `mulberry32(seed)` PRNG; every simulator artifact is a pure function of its seed (reproducible failures: a failing report always prints the seed + op index).
- `ops.ts` — weighted op generator producing a typed `SimOp[]` stream:
  - `addNode` (kind chosen with realistic skew), `updateNode` (title/description/props per the kind's `FieldDef`s, including hostile strings: newlines, markdown, 10k-char, emoji, empty), `removeNode`, `addEdge` (85% ontology-licensed via `triplesFrom`, 15% off-ontology — the advisory rule means both must work), `updateEdge`, `removeEdge`, `undo`, `redo`, `importGraph` (round-trip of own export + occasional malformed payloads), `clearGraph`, `resetToSample`.
- `invariants.ts` — checked after every op, each a named pure function over store state:
  - **Referential integrity**: every edge's `srcId`/`dstId` resolves to a live node.
  - **Id discipline**: node ids unique; `{kind}-…` prefix matches `node.kind`.
  - **Never-throws surface**: `lintGraph`, `ontologyGraph`, `runQuery` (a fixed probe set incl. not-patterns, `^`/`+`, malformed shapes), `whyChain`/`neighborhood`/`contextMarkdown` on a random live node — none throw.
  - **Round-trip identity**: `importGraph(exportGraph())` reproduces a deep-equal graph.
  - **Undo/redo**: `undo(); redo();` restores the exact pre-undo serialization; undo after N ops never throws and never resurrects deleted-edge orphans.
  - **Derived consistency**: `counts` totals equal filtered recounts; `SUGGESTED_EDGE_TYPES` non-empty for every kind.
- `run.ts` — `simulate({ seed, ops: number }): SimReport` (ops applied, invariant failures with seed/op-index/op payload, final graph stats).

The store's `localStorage` access already no-ops when `typeof localStorage === 'undefined'`; simulator runs use Vitest's jsdom-free node environment with a tiny in-memory localStorage stub in `web/tests/setup.ts` (undo history depends on the autosave watch, so `hydrate()` must run under the stub).

## 2 · Vitest (`web/tests/`)

- Dependencies: `vitest` (+ `@vitest/ui` optional) in `web/` devDependencies; `web/vitest.config.ts` with `environment: 'node'`, setup file, and an alias matching the tsconfig.
- `tests/unit/schema.test.ts` — ONTOLOGY row validity (kinds/types/dupes — promoting the Task 1 scratch checks to permanent tests), derived `SUGGESTED_EDGE_TYPES` ordering, `ontologyGraph` projection shape.
- `tests/unit/lint.test.ts` — the exact six SAMPLE_GRAPH findings; unknown-kind skipping; null-entry robustness.
- `tests/unit/query.test.ts` — the full semantic battery from the build (BGP joins, same-var equality, not-pattern placement independence, `^`/`+` composition, transitive licensing warnings, malformed-shape validation, verbs, contextMarkdown budget).
- `tests/sim/simulator.test.ts` — 25 seeds × 400 ops (fast: pure in-memory); one long soak (1 seed × 5,000 ops) tagged `.skip`-able for CI time control.
- Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

## 3 · Playwright (`web/e2e/`)

- Dependencies: `@playwright/test` in `web/`; `web/playwright.config.ts` (chromium only, `webServer: npm run dev` on 4433, real input events by default — the documented PointerEvent gotcha is why Playwright, not CDP dispatch).
- `e2e/verification.spec.ts` — the 8-point pass as individual tests: editor chips add edges; fits-ontology ranking; ontology toggle renders 28 kinds with dash coding; KindCard cross-layer jump; kind-chip deep link; health-card navigation; Inspector badge; Copy context clipboard content. Plus the three fix-batch checks (relayout in ontology mode preserves instance layout; search pick escapes ontology mode).
- `e2e/sim-smoke.spec.ts` — replay a short seeded op sequence through the UI (create nodes via part-view forms, wire edges via the RelationshipEditor, undo via keyboard) and assert the exported JSON equals the simulator's model-level result for the same sequence — the model and the UI are exercised as one system.
- Script: `"e2e": "playwright test"`.

## 4 · CI (`.github/workflows/ci.yml`)

On push to main and all PRs: install (`npm ci` in `web/`), `npm run check`, `npm run build`, `npm run test`, `npx playwright install chromium --with-deps` + `npm run e2e`, and `npm run sync-skills && git diff --exit-code` (skills-block drift gate). Single job, ~3–4 min.

## Docs

CLAUDE.md: replace the "no test suite and no linter configured" paragraph with the new commands (`npm run test`, `npm run e2e`) and one line on the simulator (seed-reproducible; always quote the failing seed). The "verify in a browser" guidance stays but points at the e2e suite first.

## Explicitly out of scope

Linting/formatting tooling (untouched decision); visual-regression screenshots; CI deployment; multi-browser matrices.

## Build order

1. Simulator core + in-memory localStorage stub (pure, no framework yet — verifiable via tsx).
2. Vitest config + unit suites (promote the build's scratch batteries).
3. Simulator property tests.
4. Playwright config + verification.spec.
5. sim-smoke.spec.
6. CI workflow + CLAUDE.md update.
