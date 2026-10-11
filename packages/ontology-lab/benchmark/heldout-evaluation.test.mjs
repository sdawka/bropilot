import assert from "node:assert/strict";
import { test } from "node:test";
import { HELDOUT_CASES, validateHeldoutCases } from "./heldout-cases.mjs";
import { scoreHeldoutRuns, summarizeRatings } from "./heldout-evaluation.mjs";

test("held-out corpus is frozen, distinct, and covers corrections ambiguity and privacy", () => {
  assert.ok(HELDOUT_CASES.length >= 30);
  assert.equal(validateHeldoutCases(), HELDOUT_CASES.length);
  assert.equal(new Set(HELDOUT_CASES.map(item => item.id)).size, HELDOUT_CASES.length);
  for (const topic of ["correction", "ambiguity", "privacy"]) {
    assert.ok(HELDOUT_CASES.some(item => item.coverage.includes(topic)), `missing ${topic} coverage`);
  }
});

test("run scoring separates distinct cases, repetitions, failures, and stage percentiles", () => {
  const summary = scoreHeldoutRuns([
    { caseId: "alpha", repeat: 1, terminal: "run.completed", elapsedMs: 100, timings: { extractionMs: 10 }, evaluation: { status: "ready" } },
    { caseId: "alpha", repeat: 2, terminal: "run.completed", elapsedMs: 300, timings: { extractionMs: 30 }, evaluation: { status: "unknown" } },
    { caseId: "beta", repeat: 1, terminal: "run.failed", elapsedMs: 500, timings: { extractionMs: 40 }, error: "provider failed" },
  ], 2);
  assert.deepEqual(summary.cases, { distinct: 2, attemptedRepetitions: 3, completedRepetitions: 2 });
  assert.equal(summary.failures.count, 1);
  assert.deepEqual(summary.stageTimingMs.total, { count: 3, p50: 300, p95: 500 });
  assert.deepEqual(summary.stageTimingMs.extraction, { count: 3, p50: 30, p95: 40 });
  assert.equal(summary.semanticCoverage.completedWithEvaluation, 2);
  assert.equal(summary.semanticCoverage.readiness.ready, 1);
});

test("rating summaries label actual human and model-assisted evidence separately", () => {
  const ratings = summarizeRatings([
    { caseId: "alpha", repeat: 1, ratingSource: "human", disposition: "pass" },
    { caseId: "alpha", repeat: 2, ratingSource: "model-assisted", disposition: "uncertain" },
  ], 3);
  assert.deepEqual(ratings, {
    expectedCompletedRuns: 3,
    ratedRuns: 2,
    unratedCompletedRuns: 1,
    human: { count: 1, pass: 1, fail: 0, uncertain: 0 },
    modelAssisted: { count: 1, pass: 0, fail: 0, uncertain: 1 },
  });
});
