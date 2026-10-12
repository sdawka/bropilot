import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractionText, lexicalSignals, summarizeRuns } from './pipeline.mjs';

test('benchmark fact signals exclude quotes and questions that could inflate recall', () => {
  const proposal = { title: 'Tasks', purpose: 'Organize work', entities: [{ title: 'Task list', properties: [{ key: 'mode', value: 'offline' }], evidence: [{ quote: 'sync and payments' }] }], questions: ['Should we add sync and payments?'] };
  assert.doesNotMatch(extractionText(proposal), /sync|payments/);
  const signals = lexicalSignals({ expectedFacts: [{ id: 'offline', patterns: ['offline'] }, { id: 'sync', patterns: ['sync'] }], forbiddenFacts: [] }, proposal);
  assert.deepEqual(signals.expected, [{ id: 'offline', matched: true }, { id: 'sync', matched: false }]);
});

test('failed or missing completions are not counted as successful graph evaluations', () => {
  const runs = [
    { caseId: 'one', repeat: 1, terminal: 'run.completed', elapsedMs: 100, evaluation: { status: 'ready' }, questionCards: [] },
    { caseId: 'two', repeat: 1, terminal: 'run.failed', elapsedMs: 1000, evaluation: { status: 'ready' }, questionCards: [] },
    { caseId: 'three', repeat: 1, terminal: 'transport.failed', elapsedMs: 1000, questionCards: [] },
  ];
  const summary = summarizeRuns(runs);
  assert.equal(summary.attempted, 3);
  assert.equal(summary.completed, 1);
  assert.equal(summary.failed, 2);
  assert.equal(summary.readiness.ready, 1);
  assert.deepEqual(summary.latencyMs, { median: 100, max: 100 });
  assert.equal(summarizeRuns([]).latencyMs, null);
});
