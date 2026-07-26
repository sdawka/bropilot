// Property-style coverage for the simulator core (web/src/lib/sim/). Each
// case replays one seed's deterministic op stream through the real store and
// asserts `simulate()` reports zero invariant failures. A failure's message
// embeds the seed and the first failure's opIndex/op JSON so it's
// reproducible from test output alone — no need to re-run anything to find
// the offending sequence.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { simulate, type SimReport } from '../../src/lib/sim/run';

// Hygiene: store.ts's autosave `watch` schedules a debounced setTimeout
// (HISTORY_DEBOUNCE_MS = 400ms, see src/lib/store.ts scheduleRecord) after
// plain updateNode/updateEdge ops, and simulate() never flushes it. The
// store is a module-level singleton shared by every case in this file, so a
// leftover real timer from an earlier seed can fire in the middle of a
// later seed's synchronous op loop. Fake timers keep every setTimeout
// pinned for this file's whole lifetime so none ever fires unexpectedly.
// We never advance them: the undo/redo invariant only depends on
// `checkpoint()`, which every structural mutator (and `undo`/`redo`
// themselves) runs synchronously regardless of whether the debounce ever
// fires — see store.ts's `checkpoint()`/`record()`.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function describeFailures(seed: number, report: SimReport): string {
  if (!report.failures.length) return '';
  const first = report.failures[0]!;
  return (
    `seed ${seed}: ${report.failures.length} invariant failure(s) of ${report.applied} ops applied; ` +
    `first at opIndex ${first.opIndex} [${first.invariant}]: ${first.detail}\n` +
    `op: ${JSON.stringify(first.op)}`
  );
}

const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);

describe('simulator property tests', () => {
  test.each(SEEDS)('seed %i — 400 ops, zero invariant failures', (seed) => {
    const report = simulate({ seed, ops: 400 });
    expect(report.failures, describeFailures(seed, report)).toEqual([]);
  });

  // Long soak, skipped in CI to keep the pipeline fast — run locally when
  // touching sim core or store mutators.
  test.skipIf(!!process.env.CI)('soak — seed 424242, 5000 ops, zero invariant failures', () => {
    const seed = 424242;
    const report = simulate({ seed, ops: 5000 });
    expect(report.failures, describeFailures(seed, report)).toEqual([]);
  });
});
