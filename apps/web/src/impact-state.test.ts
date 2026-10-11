import { expect, it } from 'vitest';
import { reactive } from 'vue';
import { createImpactFence, draftKey, readImpactDraft, semanticProperties, writeImpactDraft } from './impact-state';
import * as impactState from './impact-state';
import type { ChangeImpactReport, MetricAssessment, WorldSnapshot } from '@bropilot/contracts';
import baselineFixture from '../../../packages/contracts/fixtures/assistant-impact-baseline.json';
import adapterFixture from '../../../packages/contracts/fixtures/assistant-impact-calendar-adapter.json';

const baseline = baselineFixture as WorldSnapshot;
const proposed = adapterFixture as WorldSnapshot;
const assessment: MetricAssessment = { metricId: 'metric-completed-planned-work', definition: 'completedPlannedTasks', definitionHash: 'same', window: { startUtc: '2026-10-05T00:00:00Z', endUtc: '2026-10-12T00:00:00Z' }, status: 'known', completedCount: 3, plannedCount: 5, value: .6, inputRefs: [], diagnostics: [] };
function exampleReport(): ChangeImpactReport {
  return { baseline: { worldId: baseline.worldId, revisionId: baseline.revisionId, snapshotHash: 'a' }, target: { worldId: proposed.worldId, revisionId: proposed.revisionId, snapshotHash: 'b' }, origin: 'saved', complete: true, rulePacks: [], diagnostics: [], criteria: [], assays: [],
    changes: [{ id: 'thing-calendar-adapter', title: 'Managed calendar adapter', entityKind: 'thing', changeKind: 'modified', thingId: 'thing-calendar-adapter', changedFields: ['revisionId'] }],
    affectedThings: [{ thingId: 'thing-planning', title: 'Personal task planning', objects: [{ objectId: 'scheduling', title: 'Scheduling', kind: 'operation', side: 'both', direct: false, witnesses: [] }] }],
    evidence: ['assay-1', 'assay-planning', 'assay-progress'].map(assayId => ({ evidenceId: assayId, assayId, applicability: 'needsRecheck', provenance: 'synthetic', reasons: [], objectIds: [] })),
    metrics: [{ metricId: assessment.metricId, baseline: assessment, proposed: assessment, comparability: 'comparable', delta: 0 }] };
}

it('leads with unchanged recorded value while separately identifying downstream risk and review checks', () => {
  expect(impactState.buildImpactPresentation).toBeTypeOf('function');
  const view = impactState.buildImpactPresentation(exampleReport(), baseline, proposed);
  expect(view.metrics[0].summary).toContain('stays at 60%');
  expect(view.answer).toContain('3 checks need review');
  expect(view.downstream.map(group => group.title)).toEqual(['Personal task planning']);
  expect(view.reviewChecks).toHaveLength(3);
});

it('separates recalculated records, changed definitions, and unknown coverage in the answer', () => {
  const report = exampleReport();
  report.metrics[0].proposed = { ...assessment, value: .4, completedCount: 2 };
  report.metrics[0].delta = -.2;
  expect(impactState.buildImpactPresentation(report, baseline, proposed).answer).toContain('60% to 40%');
  report.metrics[0] = { ...report.metrics[0], proposed: { ...assessment, definition: 'completedPlannedTasksIncludingCancelled', value: .5, plannedCount: 6 }, comparability: 'definitionChanged', delta: undefined };
  const definition = impactState.buildImpactPresentation(report, baseline, proposed);
  expect(definition.answer).toContain('not directly comparable');
  expect(definition.answer).not.toContain('percentage points');
  report.complete = false;
  report.metrics[0] = { ...report.metrics[0], proposed: { ...assessment, status: 'unknown', value: undefined }, comparability: 'unknown' };
  report.evidence.forEach(evidence => { evidence.applicability = 'unknown'; });
  const unknown = impactState.buildImpactPresentation(report, baseline, proposed);
  expect(unknown.answer).toContain('unknown');
  expect(unknown.answer).toContain('Coverage is incomplete');
  expect(unknown.reviewChecks.every(check => check.applicability === 'unknown')).toBe(true);
  expect(unknown.answer).not.toContain('stays at');
});

it('does not present owner revision invalidation as an explicit object edit', () => {
  const report = exampleReport();
  const availability = { objectId: 'availability-calendar', title: 'Calendar availability', kind: 'capability', side: 'both' as const, direct: true, witnesses: [] };
  expect(impactState.impactObjectRole(availability, report, baseline, proposed)).toBe('Owner revision changed');
  report.changes = [{ id: 'interface-1', entityKind: 'object', changeKind: 'modified', title: 'Assistant interface', changedFields: ['properties'] }];
  report.affectedThings = [];
  report.evidence.forEach(evidence => { evidence.applicability = 'inputsMatch'; });
  expect(impactState.impactObjectRole({ ...availability, objectId: 'interface-1' }, report, baseline, proposed)).toBe('Changed input');
  const view = impactState.buildImpactPresentation(report, baseline, proposed);
  expect(view.downstream).toEqual([]);
  expect(view.reviewChecks).toEqual([]);
  expect(view.answer).not.toContain('need review');
});

it('counts draft operations separately from expanded model differences', () => {
  const report = exampleReport(); report.origin = 'hypothetical';
  report.changes.push({ id: 'metric-completed-planned-work', title: 'Metric', entityKind: 'object', changeKind: 'modified', changedFields: ['properties', 'source'] }, { id: 'definition-completed-planned-work', title: 'Definition', entityKind: 'object', changeKind: 'modified', changedFields: ['properties', 'source'] }, { id: 'world-context', title: 'World context', entityKind: 'context', changeKind: 'modified', changedFields: ['stateKind'] });
  const view = impactState.buildImpactPresentation(report, baseline, proposed, [{ kind: 'setThingRevision', thingId: 'thing-calendar-adapter', revisionId: 'v2' }, { kind: 'setMetricDefinition', metricId: 'metric-completed-planned-work', definition: 'completedPlannedTasksIncludingCancelled' }]);
  expect(view.editCount).toBe(2);
  expect(view.modelDifferenceCount).toBe(4);
  expect(view.changedInputs).toHaveLength(2);
});

it('does not mislabel owner title changes or relationship seeds as revision edits', () => {
  const report = exampleReport(); report.changes[0].changedFields = ['title'];
  const object = { objectId: 'availability-calendar', title: 'Calendar availability', kind: 'capability', side: 'both' as const, direct: true, witnesses: [] };
  expect(impactState.impactObjectRole(object, report, baseline, proposed)).toBe('Owner input changed');
  report.changes = [{ id: 'scheduling-availability', entityKind: 'relation', changeKind: 'removed', title: 'Dependency', changedFields: ['existence'] }];
  expect(impactState.impactObjectRole({ ...object, witnesses: [{ seedId: 'scheduling-availability', side: 'baseline', ruleId: 'relation', objectIds: [object.objectId], relationIds: ['scheduling-availability'] }] }, report, baseline, proposed)).toBe('Relationship changed');
});

it('resolves all inspector neighbor names from the selected proof side', () => {
  const selection = { title: 'Child', baseline: { ...baseline, objects: [{ ...baseline.objects[0], id: 'neighbor', title: 'Baseline neighbor' }] }, proposed: { ...proposed, objects: [{ ...baseline.objects[0], id: 'neighbor', title: 'Proposed neighbor' }] }, witness: { seedId: 'neighbor', side: 'proposed' as const, ruleId: 'changed', objectIds: [], relationIds: [] } };
  expect(impactState.impactObjectName('neighbor', impactState.impactWitnessSnapshot(selection))).toBe('Proposed neighbor');
  expect(impactState.impactObjectName('neighbor', impactState.impactWitnessSnapshot({ ...selection, witness: { ...selection.witness, side: 'baseline' } }))).toBe('Baseline neighbor');
});

it('rejects responses from previous analyses, edits, and changed baselines', () => {
  const fence = createImpactFence();
  const first = fence.begin('baseline-a');
  const second = fence.begin('baseline-a');
  expect(first.signal.aborted).toBe(true);
  expect(fence.current(first, 'baseline-a')).toBe(false);
  expect(fence.current(second, 'baseline-b')).toBe(false);
  fence.invalidate();
  expect(second.signal.aborted).toBe(true);
  expect(fence.current(second, 'baseline-a')).toBe(false);
});

it('limits semantic editing to admitted kind/property pairs and factual source', () => {
  const object = { id: 'plan', kind: 'planItem', title: 'Planned task', properties: {}, source: { kind: 'declared' as const, reference: 'fixture' } };
  expect(semanticProperties(object)).toEqual(['status', 'plannedAt', 'taskId']);
  expect(semanticProperties({ ...object, kind: 'metric' })).toEqual(['windowStart', 'windowEnd']);
  expect(semanticProperties({ ...object, source: { kind: 'hypothesis', reference: 'idea' } })).toEqual([]);
  expect(semanticProperties({ ...object, kind: 'world' })).toEqual([]);
});

it('keeps drafts separately by baseline hash and returns independent editable copies', () => {
  const key = draftKey('world', 'hash-a');
  writeImpactDraft(key, [{ kind: 'setThingRevision', thingId: 'calendar', revisionId: 'v2' }]);
  const editable = readImpactDraft(key);
  editable.length = 0;
  expect(readImpactDraft(key)).toHaveLength(1);
  expect(readImpactDraft(draftKey('world', 'hash-b'))).toEqual([]);
});

it('accepts reactive draft operations without cloning browser proxies', () => {
  const operations = reactive([{ kind: 'setThingRevision' as const, thingId: 'calendar', revisionId: 'v2' }]);
  const key = draftKey('reactive-world', 'baseline');
  expect(() => writeImpactDraft(key, operations)).not.toThrow();
  operations[0].revisionId = 'v3';
  expect(readImpactDraft(key)[0]).toMatchObject({ revisionId: 'v2' });
});
