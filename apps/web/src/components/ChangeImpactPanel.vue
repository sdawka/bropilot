<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { AffectedObject, ChangeImpactApiResponse, ImpactPatchOperation, ImpactProperty, ImpactWitness } from '@bropilot/contracts';
import type { WorkspaceResult } from '../services/world-api';
import { WorldApiError } from '../services/world-api';
import { analyzeChangeImpact } from '../services/change-impact';
import { buildImpactPresentation, createImpactFence, draftKey, impactObjectName, impactObjectRole, metricValue, readImpactDraft, reportSummary, semanticProperties, writeImpactDraft, type ImpactSelection } from '../impact-state';

const props = defineProps<{ workspace: WorkspaceResult; revisionChoices: { revisionId: string; title: string }[]; compareRevisionId?: string; entryTarget?: string }>();
const emit = defineEmits<{ selection: [selection: ImpactSelection | null]; compareRevision: [revisionId: string | undefined] }>();
const open = ref(!!props.compareRevisionId);
const panelElement = ref<HTMLElement>();
const triggerElement = ref<HTMLButtonElement>();
const mode = ref<'saved' | 'hypothetical'>('saved');
const target = ref(props.compareRevisionId ?? '');
const operations = ref<ImpactPatchOperation[]>([]);
const response = ref<ChangeImpactApiResponse>();
const pending = ref(false);
const outdated = ref(false);
const error = ref('');
const errorCode = ref('');
const fence = createImpactFence();
const baseline = computed(() => props.workspace.snapshot);
const hash = computed(() => props.workspace.readiness.snapshotHash);
const key = computed(() => draftKey(baseline.value.worldId, hash.value));
const report = computed(() => response.value?.report);
const presentation = computed(() => response.value ? buildImpactPresentation(response.value.report, response.value.baselineSnapshot, response.value.targetSnapshot, operations.value) : undefined);
const syntheticMetrics = computed(() => response.value?.report.metrics.some(metric => [metric.baseline, metric.proposed].some(assessment => assessment?.inputRefs.some(input => [response.value!.baselineSnapshot, response.value!.targetSnapshot].some(snapshot => snapshot.objects.find(object => object.id === input.objectId)?.source.reference.includes('synthetic'))))) ?? false);
const configured = computed(() => baseline.value.rulePacks.some(pack => pack.id === 'assistant-impact' && pack.version === '1'));
const choices = computed(() => props.revisionChoices.filter(revision => revision.revisionId !== baseline.value.revisionId));
const baselineTitle = computed(() => props.revisionChoices.find(revision => revision.revisionId === baseline.value.revisionId)?.title ?? baseline.value.title);
const targetTitle = computed(() => report.value?.origin === 'hypothetical' ? 'Hypothetical draft' : props.revisionChoices.find(revision => revision.revisionId === report.value?.target.revisionId)?.title ?? 'Pinned saved comparison');

const operationKind = ref<ImpactPatchOperation['kind']>('setThingRevision');
const objectId = ref('');
const secondId = ref('');
const relationId = ref('');
const property = ref<ImpactProperty>('statement');
const value = ref('');
const linked = ref(true);
const definition = ref<'completedPlannedTasks' | 'completedPlannedTasksIncludingCancelled'>('completedPlannedTasks');
const factualObjects = computed(() => baseline.value.objects.filter(object => ['declared', 'observation'].includes(object.source.kind)));
const selectableObjects = computed(() => {
  if (operationKind.value === 'setThingRevision') return baseline.value.things.filter(thing => ['declared', 'observation'].includes(thing.source.kind));
  if (operationKind.value === 'setMetricDefinition') return factualObjects.value.filter(object => object.kind === 'metric');
  if (operationKind.value === 'setCriterionAssay') return factualObjects.value.filter(object => baseline.value.template.allowedRelationEndpoints.some(endpoint => endpoint.relationKind === 'verifiedBy' && endpoint.fromKinds.includes(object.kind)) && object.kind === 'acceptanceCriterion');
  if (operationKind.value === 'setProperty') return factualObjects.value.filter(object => semanticProperties(object).length);
  const endpoints = baseline.value.template.allowedRelationEndpoints.filter(endpoint => endpoint.relationKind === 'dependsOn');
  return factualObjects.value.filter(object => endpoints.some(endpoint => endpoint.fromKinds.includes(object.kind)));
});
const secondaryObjects = computed(() => {
  if (operationKind.value === 'setCriterionAssay') return factualObjects.value.filter(object => object.kind === 'assay' && baseline.value.template.allowedRelationEndpoints.some(endpoint => endpoint.relationKind === 'verifiedBy' && endpoint.toKinds.includes(object.kind)) && baseline.value.relations.some(relation => relation.kind === 'verifiedBy' && relation.fromId === objectId.value && relation.toId === object.id) !== linked.value);
  const from = baseline.value.objects.find(object => object.id === objectId.value);
  const endpoints = baseline.value.template.allowedRelationEndpoints.filter(endpoint => endpoint.relationKind === 'dependsOn' && from && endpoint.fromKinds.includes(from.kind));
  return factualObjects.value.filter(object => object.id !== objectId.value && endpoints.some(endpoint => endpoint.toKinds.includes(object.kind)) && !baseline.value.relations.some(relation => relation.kind === 'dependsOn' && relation.fromId === objectId.value && relation.toId === object.id));
});
const properties = computed(() => { const object = baseline.value.objects.find(item => item.id === objectId.value); return object ? semanticProperties(object) : []; });
const dependencies = computed(() => baseline.value.relations.filter(relation => relation.kind === 'dependsOn' && ['declared', 'observation'].includes(relation.source.kind)));
const canAdd = computed(() => operationKind.value === 'removeDependency' ? !!relationId.value : !!objectId.value && (operationKind.value === 'setMetricDefinition' || (operationKind.value === 'addDependency' || operationKind.value === 'setCriterionAssay' ? !!secondId.value : !!value.value.trim())));
const ownedGroups = computed(() => response.value?.report.affectedThings.map(thing => ({ ...thing, objects: thing.objects.filter(object => role(object).startsWith('Owner')) })).filter(thing => thing.objects.length) ?? []);
const name = (id: string) => impactObjectName(id, response.value?.baselineSnapshot ?? baseline.value, response.value?.targetSnapshot);
const sideName = (side: string) => side === 'baseline' ? 'Baseline only' : side === 'proposed' ? 'Proposed only' : 'Both models';
const role = (object: AffectedObject) => response.value ? impactObjectRole(object, response.value.report, response.value.baselineSnapshot, response.value.targetSnapshot) : 'Affected object';
const assayWitnesses = (id: string) => report.value?.assays.find(assay => assay.objectId === id)?.witnesses ?? [];
function invalidate() {
  fence.invalidate(); pending.value = false;
  outdated.value = !!response.value; error.value = ''; errorCode.value = '';
  emit('selection', null);
}
watch(key, () => { invalidate(); response.value = undefined; outdated.value = false; operations.value = readImpactDraft(key.value); }, { immediate: true });
watch(operations, () => { writeImpactDraft(key.value, operations.value); invalidate(); }, { deep: true });
watch([mode, target], () => { invalidate(); emit('compareRevision', mode.value === 'saved' ? target.value || undefined : undefined); });
watch(() => props.compareRevisionId, revisionId => { if (revisionId) { target.value = revisionId; mode.value = 'saved'; open.value = true; } });
watch(operationKind, () => { objectId.value = ''; secondId.value = ''; relationId.value = ''; value.value = ''; });
watch(objectId, () => { property.value = properties.value[0] ?? 'statement'; secondId.value = ''; });
onBeforeUnmount(() => { fence.invalidate(); emit('selection', null); });

function addOperation() {
  const kind = operationKind.value;
  let operation: ImpactPatchOperation;
  if (kind === 'removeDependency') {
    if (!dependencies.value.some(relation => relation.id === relationId.value)) return;
    operation = { kind, relationId: relationId.value };
  } else {
    if (!selectableObjects.value.some(object => object.id === objectId.value)) return;
    if (kind === 'setThingRevision') { if (!value.value.trim()) return; operation = { kind, thingId: objectId.value, revisionId: value.value.trim() }; }
    else if (kind === 'setProperty') { if (!properties.value.includes(property.value as typeof properties.value[number])) return; operation = { kind, objectId: objectId.value, property: property.value, value: value.value }; }
    else if (kind === 'setMetricDefinition') operation = { kind, metricId: objectId.value, definition: definition.value };
    else {
      if (!secondaryObjects.value.some(object => object.id === secondId.value)) return;
      const existing = baseline.value.relations.find(relation => relation.fromId === objectId.value && relation.toId === secondId.value && relation.kind === (kind === 'addDependency' ? 'dependsOn' : 'verifiedBy'));
      const nextId = kind === 'setCriterionAssay' && !linked.value ? existing?.id ?? '' : `draft-link-${crypto.randomUUID()}`;
      operation = kind === 'addDependency' ? { kind, relationId: nextId, dependentId: objectId.value, dependencyId: secondId.value }
        : { kind, relationId: nextId, criterionId: objectId.value, assayId: secondId.value, linked: linked.value };
    }
  }
  operations.value = [...operations.value, operation];
}
function operationTitle(operation: ImpactPatchOperation) {
  if (operation.kind === 'setThingRevision') return `${name(operation.thingId)}: revision ${operation.revisionId}`;
  if (operation.kind === 'setProperty') return `${name(operation.objectId)}: ${operation.property} = ${operation.value || '(empty)'}`;
  if (operation.kind === 'setMetricDefinition') return `${name(operation.metricId)}: ${operation.definition === 'completedPlannedTasks' ? 'Completed planned tasks' : 'Include cancelled planned tasks'}`;
  if (operation.kind === 'removeDependency') { const relation = baseline.value.relations.find(item => item.id === operation.relationId); return relation ? `Remove ${name(relation.fromId)} dependency on ${name(relation.toId)}` : 'Remove dependency'; }
  if (operation.kind === 'addDependency') return `${name(operation.dependentId)} depends on ${name(operation.dependencyId)}`;
  return `${operation.linked ? 'Link' : 'Unlink'} ${name(operation.criterionId)} and ${name(operation.assayId)}`;
}
async function analyze() {
  const token = fence.begin(hash.value);
  pending.value = true; error.value = ''; errorCode.value = ''; emit('selection', null);
  try {
    const result = await analyzeChangeImpact(baseline.value.worldId, { baselineRevisionId: baseline.value.revisionId,
      target: mode.value === 'saved' ? { kind: 'saved', revisionId: target.value } : { kind: 'hypothetical', patch: { operations: operations.value.map(operation => ({ ...operation })) } },
    }, token.signal);
    if (!fence.current(token, hash.value)) return;
    response.value = result; outdated.value = false;
  } catch (cause) {
    if (!fence.current(token, hash.value)) return;
    error.value = cause instanceof Error ? cause.message : 'Analysis could not be completed.';
    errorCode.value = cause instanceof WorldApiError ? cause.code ?? '' : '';
  } finally { if (fence.current(token, hash.value)) pending.value = false; }
}
function showWitness(title: string, witness: ImpactWitness) {
  if (!response.value || outdated.value) return;
  emit('selection', { title, witness, changes: response.value.report.changes, baseline: response.value.baselineSnapshot, proposed: response.value.targetSnapshot });
}
function close() { open.value = false; emit('selection', null); void nextTick(() => triggerElement.value?.focus()); }
async function toggle() {
  if (open.value) { close(); return; }
  open.value = true;
  await nextTick();
  panelElement.value?.focus({ preventScroll: true });
  panelElement.value?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
</script>

<template>
  <Teleport defer :to="entryTarget ?? 'body'" :disabled="!entryTarget"><div class="impact-entry"><button ref="triggerElement" class="secondary" :aria-expanded="open" @click="toggle">Analyze change</button><span v-if="open && !entryTarget">Advisory analysis</span></div></Teleport>
  <section v-if="open" ref="panelElement" class="impact-panel" aria-label="Change impact analysis" tabindex="-1">
    <header class="impact-heading"><div><h2>What would this change affect?</h2><p>Compare models before changing this World.</p></div><button class="text-button" aria-label="Close change analysis" @click="close">Close</button></header>
    <p v-if="!configured" class="impact-notice">Analysis not configured. This pinned model does not include the assistant-impact@1 rule pack.</p>
    <template v-else>
      <div class="impact-controls">
        <div class="impact-baseline"><span>Baseline</span><strong>{{ baselineTitle }}</strong><small>{{ baseline.revisionId }}</small></div>
        <div class="impact-target"><div class="map-toggle" role="group" aria-label="Analysis target"><button :aria-pressed="mode === 'saved'" @click="mode = 'saved'">Saved revision</button><button :aria-pressed="mode === 'hypothetical'" @click="mode = 'hypothetical'">What if</button></div>
          <label v-if="mode === 'saved'">Compare with<select v-model="target" aria-label="Comparison revision"><option value="" disabled>Choose a saved revision</option><option v-for="revision in choices" :key="revision.revisionId" :value="revision.revisionId">{{ revision.title }}</option><option v-if="target && !choices.some(choice => choice.revisionId === target)" :value="target">Pinned comparison: {{ target }}</option></select></label>
          <p v-else class="impact-note">Hypothetical draft. Saved models stay unchanged. Drafts remain in memory when you navigate; reloading resets them.</p>
        </div>
      </div>
      <div v-if="mode === 'hypothetical'" class="impact-draft">
        <form class="impact-editor" @submit.prevent="addOperation">
          <label>Change<select v-model="operationKind" aria-label="Draft change type"><option value="setThingRevision">Thing revision</option><option value="setProperty">Semantic property</option><option value="addDependency">Add functional dependency</option><option value="removeDependency">Remove functional dependency</option><option value="setCriterionAssay">Criterion and Assay link</option><option value="setMetricDefinition">Metric definition</option></select></label>
          <label v-if="operationKind === 'removeDependency'">Dependency<select v-model="relationId" aria-label="Draft dependency"><option value="" disabled>Choose a dependency</option><option v-for="relation in dependencies" :key="relation.id" :value="relation.id">{{ name(relation.fromId) }} depends on {{ name(relation.toId) }}</option></select></label>
          <template v-else>
            <label>{{ operationKind === 'setThingRevision' ? 'Thing' : operationKind === 'setMetricDefinition' ? 'Metric' : operationKind === 'setCriterionAssay' ? 'Criterion' : 'Object' }}<select v-model="objectId" aria-label="Draft object"><option value="" disabled>Choose an existing object</option><option v-for="object in selectableObjects" :key="object.id" :value="object.id">{{ object.title }}</option></select></label>
            <label v-if="operationKind === 'setProperty'">Property<select v-model="property" aria-label="Draft property"><option v-for="item in properties" :key="item" :value="item">{{ item }}</option></select></label>
            <label v-if="operationKind === 'setThingRevision' || operationKind === 'setProperty'">{{ operationKind === 'setThingRevision' ? 'Proposed revision' : 'Proposed value' }}<select v-if="operationKind === 'setProperty' && property === 'status'" v-model="value" aria-label="Draft value"><option value="planned">Planned</option><option value="cancelled">Cancelled</option></select><input v-else v-model="value" aria-label="Draft value" :placeholder="property.endsWith('At') ? 'UTC timestamp, e.g. 2026-10-01T09:00:00Z' : ''" /></label>
            <label v-if="operationKind === 'addDependency' || operationKind === 'setCriterionAssay'">{{ operationKind === 'setCriterionAssay' ? 'Assay' : 'Depends on' }}<select v-model="secondId" aria-label="Draft linked object"><option value="" disabled>Choose a legal endpoint</option><option v-for="object in secondaryObjects" :key="object.id" :value="object.id">{{ object.title }}</option></select></label>
            <label v-if="operationKind === 'setCriterionAssay'">Link<select v-model="linked" aria-label="Draft link action"><option :value="true">Add link</option><option :value="false">Remove link</option></select></label>
            <label v-if="operationKind === 'setMetricDefinition'">Definition<select v-model="definition" aria-label="Draft metric definition"><option value="completedPlannedTasks">Completed planned tasks</option><option value="completedPlannedTasksIncludingCancelled">Include cancelled planned tasks</option></select></label>
          </template>
          <button class="secondary" type="submit" :disabled="!canAdd">Add to draft</button>
        </form>
        <ol v-if="operations.length" class="draft-operations"><li v-for="(operation, index) in operations" :key="index"><span>{{ operationTitle(operation) }}</span><button class="text-button" :aria-label="`Remove draft change ${index + 1}`" @click="operations = operations.filter((_, item) => item !== index)">Remove</button></li></ol>
        <p v-else class="impact-note">Add a change, then analyze its effect.</p>
        <button v-if="operations.length" class="text-button" @click="operations = []">Reset draft</button>
      </div>
      <div class="impact-actions"><button class="primary" :disabled="pending || (mode === 'saved' ? !target : !operations.length)" @click="analyze">{{ pending ? 'Analyzing…' : 'Analyze' }}</button><p v-if="outdated" role="status">Results are outdated. Analyze again to use the edited inputs.</p></div>
      <p v-if="error" class="impact-notice" role="alert">{{ errorCode === 'not_configured' ? 'Analysis not configured. ' : '' }}{{ error }}{{ mode === 'hypothetical' ? ' Your draft is preserved; edit it and analyze again.' : ' Choose another comparison or retry.' }}</p>
      <div v-if="report && presentation" class="impact-results" :class="{ outdated }" aria-label="Change impact results">
        <section class="impact-answer" aria-label="Impact answer"><p>{{ presentation.answer }}</p><small>Advisory model analysis. Matching inputs do not establish a passing evaluation.</small></section>
        <p class="impact-completeness">{{ reportSummary(report) }}. {{ presentation.editCount }} {{ report.origin === 'hypothetical' ? 'draft edit' : 'changed input' }}{{ presentation.editCount === 1 ? '' : 's' }} · {{ presentation.modelDifferenceCount }} model difference{{ presentation.modelDifferenceCount === 1 ? '' : 's' }}.</p>
        <section aria-label="Checks needing review" class="impact-review"><h3>Checks needing review <small>{{ presentation.reviewChecks.length }}</small></h3>
          <div v-for="evidence in presentation.reviewChecks" :key="evidence.evidenceId" class="impact-object impact-check"><p><strong>{{ name(evidence.assayId) }}</strong>: {{ evidence.applicability === 'needsRecheck' ? 'Needs recheck' : 'Applicability unknown' }} <small>{{ evidence.provenance === 'synthetic' ? 'Synthetic sample evidence' : evidence.provenance === 'unverified' ? 'Unverified evidence' : 'Server-resolved evidence' }}</small></p><button v-for="(witness, index) in assayWitnesses(evidence.assayId)" :key="index" class="proof-button" :disabled="outdated" @click="showWitness(name(evidence.assayId), witness)">Show why · {{ witness.ruleId }} · {{ sideName(witness.side) }}</button><details v-if="evidence.reasons.length"><summary>Why this check needs review</summary><p v-for="reason in evidence.reasons" :key="reason" class="impact-note">{{ reason }}</p></details></div>
          <p v-if="!presentation.reviewChecks.length" class="impact-note">{{ report.evidence.length ? 'Bound checks retain matching inputs. This does not establish passing evaluations.' : 'No bound checks were supplied.' }}</p>
        </section>
        <section aria-label="Changed inputs"><h3>Changed inputs <small>{{ presentation.editCount }}</small></h3><div v-for="(input, inputIndex) in presentation.changedInputs" :key="`${input.id}/${inputIndex}`" class="impact-object impact-input"><p><strong>{{ input.title }}</strong> <small>{{ report.origin === 'hypothetical' ? 'Draft edit' : 'Changed input' }}</small></p><p v-for="detail in input.details" :key="detail" class="impact-note">{{ detail }}</p><button v-for="(witness, index) in input.witnesses" :key="index" class="proof-button" :disabled="outdated" @click="showWitness(input.title, witness)">Show why · {{ witness.ruleId }} · {{ sideName(witness.side) }}</button></div><p v-if="!presentation.changedInputs.length" class="impact-note">No changed inputs.</p>
          <details v-if="ownedGroups.length" class="impact-secondary-results"><summary>Owned objects flagged by the changed input</summary><details v-for="thing in ownedGroups" :key="thing.thingId ?? thing.title" class="impact-group"><summary>{{ thing.title }} <small>{{ thing.objects.length }} owned objects</small></summary><div v-for="object in thing.objects" :key="object.objectId" class="impact-object"><p>{{ object.title }} <small>{{ role(object) }} · {{ sideName(object.side) }}</small></p><button v-for="(witness, index) in object.witnesses" :key="index" class="proof-button" :disabled="outdated" @click="showWitness(object.title, witness)">Show why · {{ witness.ruleId }} · {{ sideName(witness.side) }}</button></div></details></details>
        </section>
        <section aria-label="Potential downstream effects"><h3>Potential downstream effects</h3><p class="impact-note">Dependency and coverage paths flag what may need attention; they do not predict an observed outcome.</p><details v-for="thing in presentation.downstream" :key="thing.thingId ?? thing.title" class="impact-group"><summary>{{ thing.title }} <small>{{ thing.objects.length }} affected objects</small></summary><div v-for="object in thing.objects" :key="object.objectId" class="impact-object"><p>{{ object.title }} <small>{{ role(object) }} · {{ sideName(object.side) }}</small></p><button v-for="(witness, index) in object.witnesses" :key="index" class="proof-button" :disabled="outdated" @click="showWitness(object.title, witness)">Show why · {{ witness.ruleId }} · {{ sideName(witness.side) }}</button></div></details><p v-if="!presentation.downstream.length" class="impact-note">No downstream effects were derived within the declared scopes.{{ report.complete ? '' : ' Coverage is incomplete; additional effects may be unknown.' }}</p></section>
        <section v-if="report.metrics.length" class="impact-metrics"><h3>Recalculated metrics</h3><p class="impact-note">{{ syntheticMetrics ? 'Example plan and completion inputs are synthetic sample data.' : 'Metrics describe modeled inputs; they do not establish observed outcomes.' }}</p><div v-for="metric in presentation.metrics" :key="metric.metricId" class="metric-comparison"><p>{{ metric.summary }}</p><details><summary>Values, definitions and exact inputs</summary><p>{{ metric.comparability === 'comparable' ? 'Comparable definitions and windows' : metric.comparability === 'definitionChanged' ? 'Definition changed; values are not directly comparable' : metric.comparability === 'windowChanged' ? 'Window changed; values are not directly comparable' : 'Comparability unknown' }}</p><div class="metric-sides"><div v-for="(assessment, index) in [metric.baseline, metric.proposed]" :key="index"><strong>{{ index ? 'Proposed' : 'Baseline' }} {{ metricValue(assessment) }}</strong><template v-if="assessment"><p>{{ assessment.completedCount }} completed / {{ assessment.plannedCount }} planned</p><p>{{ assessment.window.startUtc }} to {{ assessment.window.endUtc }}</p><p>{{ assessment.definition === 'completedPlannedTasks' ? 'Completed planned tasks' : 'Includes cancelled planned tasks' }}</p><details><summary>{{ assessment.inputRefs.length }} exact inputs and definition</summary><p v-for="input in assessment.inputRefs" :key="input.objectId">{{ name(input.objectId) }} <small>{{ input.digest }}</small></p><p>Definition hash: {{ assessment.definitionHash }}</p><p v-for="diagnostic in assessment.diagnostics" :key="diagnostic">{{ diagnostic }}</p></details></template><p v-else>Assessment unavailable.</p></div></div></details></div></section>
        <details class="impact-secondary-results impact-all-affected"><summary>All affected Things and objects</summary><details v-for="thing in report.affectedThings" :key="thing.thingId ?? thing.title" class="impact-group"><summary>{{ thing.title }} <small>{{ thing.objects.length }} affected objects</small></summary><div v-for="object in thing.objects" :key="object.objectId" :data-object-id="object.objectId" class="impact-object"><p>{{ object.title }} <small>{{ role(object) }} · {{ sideName(object.side) }}</small></p><button v-for="(witness, index) in object.witnesses" :key="index" class="proof-button" :disabled="outdated" @click="showWitness(object.title, witness)">Show why · {{ witness.ruleId }} · {{ sideName(witness.side) }}</button></div></details></details>
        <details class="impact-secondary-results"><summary>Criteria, Assays and matching evidence</summary><div v-for="criterion in report.criteria" :key="criterion.criterionId" class="impact-object"><p>{{ name(criterion.criterionId) }} <small>{{ sideName(criterion.side) }}</small></p><p class="impact-note">Assays: {{ criterion.assayIds.map(name).join(', ') || 'No linked Assay' }}</p><button v-for="(witness, index) in criterion.witnesses" :key="index" class="proof-button" :disabled="outdated" @click="showWitness(name(criterion.criterionId), witness)">Show why · {{ witness.ruleId }} · {{ sideName(witness.side) }}</button></div><div v-for="assay in report.assays" :key="assay.objectId" class="impact-object"><p>{{ assay.title }} <small>{{ sideName(assay.side) }}</small></p><button v-for="(witness, index) in assay.witnesses" :key="index" class="proof-button" :disabled="outdated" @click="showWitness(assay.title, witness)">Show why · {{ witness.ruleId }} · {{ sideName(witness.side) }}</button></div><p v-for="evidence in report.evidence.filter(item => item.applicability === 'inputsMatch')" :key="evidence.evidenceId" class="impact-note">{{ name(evidence.assayId) }}: inputs match.{{ evidence.provenance === 'synthetic' ? ' Synthetic sample evidence.' : '' }}</p><p v-if="!report.criteria.length && !report.assays.length" class="impact-note">No criteria or Assays were derived as affected.</p></details>
        <section v-if="report.diagnostics.length"><h3>Coverage and diagnostics</h3><p v-for="(diagnostic, index) in report.diagnostics" :key="index" class="impact-notice">{{ diagnostic.message }} <small>{{ sideName(diagnostic.side) }} · {{ diagnostic.code }}</small></p></section>
        <details class="impact-details"><summary>Model differences and comparison pins</summary><div class="comparison-identities"><p><strong>{{ baselineTitle }}</strong><span>Baseline: {{ report.baseline.revisionId }}</span><small>{{ report.baseline.snapshotHash }}</small></p><span aria-hidden="true">→</span><p><strong>{{ report.origin === 'hypothetical' ? 'Hypothetical draft' : targetTitle }}</strong><span>{{ report.origin === 'hypothetical' ? 'Draft' : 'Saved' }}: {{ report.target.revisionId }}</span><small>{{ report.target.snapshotHash }}</small></p></div><p v-for="change in report.changes" :key="change.id">{{ change.title }}: {{ change.changeKind }} {{ change.changedFields.join(', ') }}</p><p v-for="pack in report.rulePacks" :key="pack.id">{{ pack.id }}@{{ pack.version }}</p></details>
      </div>
    </template>
  </section>
</template>

<style scoped>
.impact-entry { display:flex; justify-content:center; align-items:center; gap:.65rem; margin:.3rem 0; }
.impact-entry>span,.impact-note,.impact-heading p { color:var(--muted); font-size:.84rem; line-height:1.5; }
.impact-panel { border:1px solid var(--line); border-radius:18px; padding:1.3rem; margin:0 auto 1.5rem; max-width:940px; background:var(--paper); }
.impact-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; }
h2 { margin:0; font-size:1.18rem; letter-spacing:-.025em; } h3 { font-size:.95rem; margin:1rem 0 .65rem; } h4 { margin:.7rem 0 .35rem; font-size:.86rem; }
.impact-heading p { margin:.35rem 0 1rem; } .impact-controls { display:grid; grid-template-columns:1fr 1.5fr; gap:1.5rem; }
.impact-baseline { display:flex; flex-direction:column; gap:.3rem; padding-top:.4rem; } .impact-baseline>span,.impact-baseline small { font-size:.8rem; color:var(--muted); overflow-wrap:anywhere; }
.impact-target label { margin-top:.65rem; } label { display:flex; flex-direction:column; gap:.3rem; font-size:.8rem; color:var(--muted); min-width:0; }
select,input { max-width:100%; width:100%; min-width:0; border:1px solid var(--line); border-radius:8px; padding:.6rem; background:white; color:var(--ink); font:inherit; font-size:.85rem; }
select:focus-visible { outline:2px solid var(--jade); outline-offset:3px; }
.impact-draft { border-top:1px solid var(--line); padding-top:1rem; margin-top:1rem; } .impact-editor { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.7rem; align-items:end; } .impact-editor>.secondary { justify-self:start; }
.draft-operations { padding-left:1.1rem; font-size:.84rem; } .draft-operations li { padding:.3rem 0; } .draft-operations li>span { overflow-wrap:anywhere; } .draft-operations button { margin-left:.5rem; }
.impact-actions { display:flex; align-items:center; gap:.8rem; margin-top:1rem; } .impact-actions p { font-size:.83rem; color:var(--jade); }
.impact-notice { padding:.7rem .85rem; background:var(--wash); border-radius:8px; font-size:.85rem; line-height:1.5; overflow-wrap:anywhere; } small { color:var(--muted); font-weight:400; } .impact-notice small { display:block; }
.impact-results { border-top:1px solid var(--line); margin-top:1.2rem; padding-top:.8rem; } .impact-results.outdated { opacity:.65; }
.impact-answer { border-left:3px solid var(--jade); padding:.15rem 0 .15rem .9rem; margin:.4rem 0 1rem; }
.impact-answer p { margin:0 0 .4rem; font-size:1rem; line-height:1.6; max-width:75ch; }
.impact-answer small { display:block; font-size:.78rem; line-height:1.5; }
.impact-review { padding-bottom:.4rem; } .impact-check>details { font-size:.8rem; color:var(--muted); }
.comparison-identities { display:grid; grid-template-columns:1fr auto 1fr; gap:1rem; align-items:center; font-size:.85rem; } .comparison-identities p { display:flex; flex-direction:column; gap:.35rem; min-width:0; } .comparison-identities span,.comparison-identities small { overflow-wrap:anywhere; } .comparison-identities small { font-size:.7rem; }
.impact-completeness { font-size:.83rem; color:var(--jade); line-height:1.5; } .impact-result-columns { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; } .impact-group,.impact-secondary-results { margin:.7rem 0; font-size:.86rem; } .impact-group>summary { font-weight:600; } .impact-group>summary small { margin-left:.25rem; } .impact-evidence { margin:1rem 0; font-size:.9rem; } .impact-evidence>summary { font-weight:600; } .impact-object { border-bottom:1px solid var(--line); padding:.4rem 0 .65rem; } .impact-object p { font-size:.86rem; margin:.35rem 0; } .impact-object small { display:block; margin-top:.25rem; }
.proof-button { display:block; max-width:100%; text-align:left; color:var(--jade); font:inherit; font-size:.77rem; border:0; background:transparent; padding:.25rem 0; overflow-wrap:anywhere; } .proof-button:hover { text-decoration:underline; } .proof-button:disabled { cursor:default; }
.metric-comparison { border-top:1px solid var(--line); padding:.5rem 0; font-size:.83rem; } .metric-sides { display:grid; grid-template-columns:1fr 1fr; gap:1rem; } .metric-sides>div { min-width:0; } .metric-sides p { margin:.4rem 0; overflow-wrap:anywhere; } .metric-sides details { font-size:.76rem; }
.impact-details { margin-top:1rem; font-size:.8rem; color:var(--muted); } .impact-details p { overflow-wrap:anywhere; }
@media(max-width:679px) { .impact-panel { padding:1rem; } .impact-controls,.impact-result-columns,.metric-sides { grid-template-columns:1fr; gap:.7rem; } .impact-editor { grid-template-columns:1fr; } .comparison-identities { grid-template-columns:1fr; gap:0; } .comparison-identities>span { display:none; } .impact-actions { flex-wrap:wrap; } }
</style>
