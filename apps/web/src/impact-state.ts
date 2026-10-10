import type { AffectedObject, ChangeImpactReport, ImpactChange, ImpactPatchOperation, ImpactProperty, ImpactWitness, MetricAssessment, ModelObject, WorldSnapshot } from '@bropilot/contracts';

export type ImpactSelection = {
  title: string;
  witness: ImpactWitness;
  baseline: WorldSnapshot;
  proposed: WorldSnapshot;
  changes?: ImpactChange[];
};
export function impactWitnessSnapshot(selection: ImpactSelection) {
  return selection.witness.side === 'baseline' ? selection.baseline : selection.proposed;
}
const drafts = new Map<string, ImpactPatchOperation[]>();
export function draftKey(worldId: string, baselineHash: string) { return `${worldId}/${baselineHash}`; }
export function readImpactDraft(key: string): ImpactPatchOperation[] { return (drafts.get(key) ?? []).map(operation => ({ ...operation })); }
export function writeImpactDraft(key: string, operations: ImpactPatchOperation[]) { drafts.set(key, operations.map(operation => ({ ...operation }))); }

/** Tokens bind a response to both its pinned baseline and its edited inputs. */
export function createImpactFence() {
  let version = 0;
  let controller: AbortController | undefined;
  return {
    invalidate() { version++; controller?.abort(); controller = undefined; },
    begin(baselineHash: string) {
      controller?.abort(); controller = new AbortController();
      return { version: ++version, baselineHash, signal: controller.signal };
    },
    current(token: { version: number; baselineHash: string }, baselineHash: string) { return token.version === version && token.baselineHash === baselineHash; },
  };
}

export function impactObjectName(id: string, baseline: WorldSnapshot, proposed?: WorldSnapshot) {
  return proposed?.objects.find(object => object.id === id)?.title ?? baseline.objects.find(object => object.id === id)?.title
    ?? proposed?.things.find(thing => thing.id === id)?.title ?? baseline.things.find(thing => thing.id === id)?.title ?? 'Unresolved model object';
}
export function semanticProperties(object: ModelObject): readonly ImpactProperty[] {
  if (!['declared', 'observation'].includes(object.source.kind)) return [];
  if (object.kind === 'planItem') return ['status', 'plannedAt', 'taskId'] as const;
  if (object.kind === 'completionObservation') return ['completedAt', 'taskId'] as const;
  if (object.kind === 'metric') return ['windowStart', 'windowEnd'] as const;
  if (['task', 'goal', 'outcome', 'indicator', 'capability', 'operation', 'interface', 'adapter', 'service', 'store', 'calendarBlock', 'acceptanceCriterion'].includes(object.kind)) return ['statement'] as const;
  return [];
}
export function reportSummary(report: ChangeImpactReport) {
  return report.complete ? 'Complete within declared model scopes' : 'Incomplete: review diagnostics and scope declarations';
}

export function metricValue(metric?: MetricAssessment) {
  return !metric || metric.status === 'unknown' || metric.value === undefined ? 'Unknown' : `${Math.round(metric.value * 1000) / 10}%`;
}

/** Presentation classifies report facts; the core remains the sole impact inference engine. */
export function impactObjectRole(object: AffectedObject, report: ChangeImpactReport, baseline: WorldSnapshot, proposed: WorldSnapshot) {
  if (report.changes.some(change => change.entityKind === 'object' && change.id === object.objectId)) return 'Changed input';
  const owner = proposed.objects.find(item => item.id === object.objectId)?.thingId ?? baseline.objects.find(item => item.id === object.objectId)?.thingId;
  const ownerChange = object.direct && owner ? report.changes.find(change => change.entityKind === 'thing' && change.id === owner) : undefined;
  if (ownerChange) return ownerChange.changedFields.includes('revisionId') ? 'Owner revision changed' : 'Owner input changed';
  if (object.direct && object.witnesses.some(witness => report.changes.some(change => change.entityKind === 'relation' && change.id === witness.seedId))) return 'Relationship changed';
  return 'Downstream affected';
}

const fieldName = (field: string) => field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
const displayValue = (value: unknown) => value === undefined ? 'Absent' : typeof value === 'string' ? value : JSON.stringify(value);

/** Exact before/after input facts, independent of witness model side. */
export function impactChangeDetails(change: ImpactChange, baseline: WorldSnapshot, proposed: WorldSnapshot): string[] {
  if (change.entityKind === 'thing') {
    const before = baseline.things.find(thing => thing.id === change.id), after = proposed.things.find(thing => thing.id === change.id);
    if (before?.revisionId !== after?.revisionId) return [`Revision: ${displayValue(before?.revisionId)} → ${displayValue(after?.revisionId)}`];
  }
  if (change.entityKind === 'relation') {
    const snapshot = change.changeKind === 'removed' ? baseline : proposed;
    const relation = snapshot.relations.find(item => item.id === change.id);
    if (relation) return [`${fieldName(change.changeKind)}: ${impactObjectName(relation.fromId, snapshot)} ${fieldName(relation.kind)} ${impactObjectName(relation.toId, snapshot)}`];
  }
  if (change.entityKind === 'object') {
    const before = baseline.objects.find(object => object.id === change.id), after = proposed.objects.find(object => object.id === change.id);
    const details = [...new Set([...Object.keys(before?.properties ?? {}), ...Object.keys(after?.properties ?? {})])]
      .filter(property => JSON.stringify(before?.properties[property]) !== JSON.stringify(after?.properties[property]))
      .map(property => `${fieldName(property)}: ${displayValue(before?.properties[property])} → ${displayValue(after?.properties[property])}`);
    if (details.length) return details;
    if (before?.title !== after?.title) return [`Title: ${displayValue(before?.title)} → ${displayValue(after?.title)}`];
  }
  return [`${fieldName(change.changeKind)}: ${change.changedFields.map(fieldName).join(', ')}`];
}

export function buildImpactPresentation(report: ChangeImpactReport, baseline: WorldSnapshot, proposed: WorldSnapshot, operations: ImpactPatchOperation[] = []) {
  const name = (id: string) => impactObjectName(id, baseline, proposed);
  const affected = report.affectedThings.flatMap(thing => thing.objects);
  const witnesses = (id: string) => affected.flatMap(object => object.witnesses.filter(witness => witness.seedId === id))
    .sort((a, b) => a.objectIds.length - b.objectIds.length || a.relationIds.length - b.relationIds.length)
    .filter((witness, index, all) => all.findIndex(other => other.side === witness.side) === index);
  const changedInputs = report.origin === 'hypothetical' ? operations.map(operation => {
    let id: string, title: string, details: string[];
    if (operation.kind === 'setThingRevision') { id = operation.thingId; title = name(id); details = [`Revision: ${displayValue(baseline.things.find(thing => thing.id === id)?.revisionId)} → ${operation.revisionId}`]; }
    else if (operation.kind === 'setProperty') { id = operation.objectId; title = name(id); details = [`${fieldName(operation.property)}: ${displayValue(baseline.objects.find(object => object.id === id)?.properties[operation.property])} → ${operation.value}`]; }
    else if (operation.kind === 'setMetricDefinition') { id = operation.metricId; title = name(id); details = [operation.definition === 'completedPlannedTasks' ? 'Definition: completed planned tasks' : 'Definition: include cancelled planned tasks']; }
    else { id = operation.relationId; const change = report.changes.find(change => change.id === id); title = change?.title ?? 'Relationship edit'; details = change ? impactChangeDetails(change, baseline, proposed) : ['No model difference from this edit']; }
    return { id, title, details, witnesses: witnesses(id) };
  }) : report.changes.map(change => ({ id: change.id, title: change.title, details: impactChangeDetails(change, baseline, proposed), witnesses: witnesses(change.id) }));
  const reviewChecks = report.evidence.filter(evidence => evidence.applicability !== 'inputsMatch');
  const downstream = report.affectedThings.map(thing => ({ ...thing, objects: thing.objects.filter(object => impactObjectRole(object, report, baseline, proposed) === 'Downstream affected') })).filter(thing => thing.objects.length);
  const metrics = report.metrics.map(metric => {
    const label = name(metric.metricId), before = metricValue(metric.baseline), after = metricValue(metric.proposed);
    let summary: string;
    if (before === 'Unknown' || after === 'Unknown' || metric.comparability === 'unknown') summary = `${label} is unknown in ${after === 'Unknown' ? 'the proposed model' : before === 'Unknown' ? 'the baseline model' : 'comparability'}.`;
    else if (metric.comparability !== 'comparable') summary = `${label} has a changed ${metric.comparability === 'definitionChanged' ? 'definition' : 'reporting window'}: ${before} baseline, ${after} proposed; values are not directly comparable.`;
    else if (metric.delta === 0) summary = `${label} stays at ${after}.`;
    else summary = `${label} recalculates from ${before} to ${after}${metric.delta === undefined ? '' : ` (${metric.delta > 0 ? '+' : ''}${Math.round(metric.delta * 1000) / 10} percentage points)`}.`;
    return { ...metric, summary };
  });
  const metricAnswer = metrics.map(metric => metric.summary).join(' ');
  const checkAnswer = reviewChecks.length ? `${reviewChecks.length} check${reviewChecks.length === 1 ? ' needs' : 's need'} review${reviewChecks.some(check => check.applicability === 'unknown') ? '; applicability is unknown for some checks' : ''}.` : report.evidence.length ? `${report.evidence.length} check${report.evidence.length === 1 ? ' retains' : 's retain'} matching inputs.` : 'No bound checks were supplied.';
  const consequence = downstream.length ? `${downstream.slice(0, 3).map(thing => thing.title).join(', ')}${downstream.length > 3 ? ` and ${downstream.length - 3} other Things` : ''} may be affected.` : 'No downstream effects were derived within the declared scopes.';
  return { answer: [metricAnswer, checkAnswer, !report.complete ? 'Coverage is incomplete; additional effects may be unknown.' : '', consequence].filter(Boolean).join(' '), metrics, reviewChecks, downstream, changedInputs, editCount: changedInputs.length, modelDifferenceCount: report.changes.length };
}
