// Orchestrates one simulator run: seed → op stream → apply-and-check loop →
// report. Cheap invariants run after every op; the expensive tier (never-
// throws probes, round-trip identity, undo/redo restore — each O(graph) or
// worse) runs every `EXPENSIVE_EVERY` ops plus always on the final op, per
// the plan's cost budget. The malformed-importGraph "graph unchanged on
// failed import" check is op-specific (it needs the pre-op snapshot), so it
// lives here rather than in invariants.ts.
import { exportGraph, hydrate, clearGraph, state } from '../store';
import { mulberry32 } from './rng';
import { generateOps, applyOp, type SimOp } from './ops';
import { checkCheapInvariants, checkExpensiveInvariants, type InvariantFailure } from './invariants';

export interface SimReport {
  seed: number;
  applied: number;
  failures: (InvariantFailure & { opIndex: number; op: SimOp })[];
  stats: { nodes: number; edges: number };
}

const EXPENSIVE_EVERY = 25;

export function simulate(opts: { seed: number; ops: number }): SimReport {
  const { seed, ops } = opts;

  // Deterministic starting point regardless of what a prior run (or the
  // localStorage stub) left behind — the store is a module-level singleton.
  hydrate();
  clearGraph();

  const rnd = mulberry32(seed);
  const generated = generateOps(rnd, ops);
  const failures: SimReport['failures'] = [];
  let applied = 0;

  for (let i = 0; i < generated.length; i++) {
    const op = generated[i];
    if (!op) continue;

    const preImportSnapshot = op.type === 'importGraph' && op.malformed ? exportGraph() : null;

    try {
      applyOp(op);
    } catch (err) {
      failures.push({
        invariant: 'apply-op-throws',
        detail: `applyOp threw: ${(err as Error).message}`,
        opIndex: i,
        op,
      });
      continue;
    }
    applied++;

    if (preImportSnapshot !== null) {
      const after = exportGraph();
      if (after !== preImportSnapshot) {
        failures.push({
          invariant: 'import-malformed-noop',
          detail: 'graph changed after a malformed importGraph op (expected no-op on failed import)',
          opIndex: i,
          op,
        });
      }
    }

    for (const f of checkCheapInvariants()) failures.push({ ...f, opIndex: i, op });

    if (i % EXPENSIVE_EVERY === 0 || i === generated.length - 1) {
      for (const f of checkExpensiveInvariants()) failures.push({ ...f, opIndex: i, op });
    }
  }

  return {
    seed,
    applied,
    failures,
    stats: { nodes: state.graph.nodes.length, edges: state.graph.edges.length },
  };
}
