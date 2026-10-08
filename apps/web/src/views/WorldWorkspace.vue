<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowUpRight, Check, ChevronDown, ChevronRight, LoaderCircle, Search, X } from '@lucide/vue';
import type { ModelObject, WorldCommand, WorldState } from '@bropilot/contracts';
import { readRouteState, routeQuery } from '../route-state';
import { views, type WorkspaceView } from '../router';
import { getExamples, getLocalKit, getLocalWorld, getLocalWorlds, liveWorldApi, sendWorldCommand, startLocalSession, type Example, type WorkspaceResult, type WorldSummary } from '../services/world-api';
import { createLoadFence } from '../load-fence';
import { ancestry, hierarchyPath } from '../hierarchy';

const route = useRoute();
const router = useRouter();
const state = computed(() => readRouteState(route));
const workspace = ref<WorkspaceResult>();
const loading = ref(true);
const unavailable = ref(false);
const error = ref('');
const commandError = ref('');
const pending = ref('');
const examples = ref<Example[]>([]);
const localEnabled = ref(false);
const localWorlds = ref<WorldSummary[]>([]);
const localState = ref<WorldState>();
const worker = ref('');
const indexHtml = ref('');
const kit = ref<Awaited<ReturnType<typeof getLocalKit>>>();
const search = ref('');
const searchOpen = ref(false);
const contextDialog = ref<HTMLDialogElement>();
const searchInput = ref<HTMLInputElement>();
const workspaceFence = createLoadFence();
const localFence = createLoadFence();
let pollTimer: number | undefined;
let sourceWorldId = '';
let sessionReady = false;
let disposed = false;
let creation: { worldId: string; title: string; requestId: string } | undefined;

const snapshot = computed(() => workspace.value?.snapshot);
const readiness = computed(() => workspace.value?.readiness);
const title = computed(() => root.value?.title ?? snapshot.value?.title ?? state.value.worldId);
const purpose = computed(() => snapshot.value?.purpose.statement ?? '');
const objects = computed(() => snapshot.value?.objects ?? []);
const selected = computed(() => objects.value.find(object => object.id === state.value.selected));
const root = computed(() => objects.value.find(object => !object.parentId));
const current = computed(() => selected.value ?? root.value);
const ancestors = computed(() => ancestry(objects.value, current.value?.id));
const invalidSelected = computed(() => snapshot.value && state.value.selected && !selected.value ? state.value.selected : undefined);
const children = computed(() => {
  const term = search.value.trim().toLowerCase();
  return term ? objects.value.filter(object => `${object.title} ${object.kind}`.toLowerCase().includes(term))
    : objects.value.filter(object => object.parentId === current.value?.id);
});
const isLocal = computed(() => localState.value?.worldId === state.value.worldId);
const isHead = computed(() => isLocal.value && state.value.revisionId === localState.value?.headRevisionId);
const currentMove = computed(() => isHead.value ? localState.value?.moves.find(move => move.status === 'open' && move.baseRevisionId === localState.value?.headRevisionId) : undefined);
const currentCandidate = computed(() => currentMove.value ? localState.value?.candidates.filter(candidate => candidate.moveId === currentMove.value!.moveId).at(-1) : undefined);
const currentRun = computed(() => currentCandidate.value ? localState.value?.runs.find(run => run.candidateId === currentCandidate.value!.candidateId) : undefined);
const visibleRuns = computed(() => {
  if (!isLocal.value || !localState.value) return [];
  const revision = localState.value.revisions.find(item => item.revisionId === state.value.revisionId);
  return localState.value.runs.filter(run => run.candidateId === revision?.candidateId || (isHead.value && localState.value?.candidates.some(candidate => candidate.candidateId === run.candidateId && candidate.baseRevisionId === state.value.revisionId)));
});
const latestRun = computed(() => currentRun.value ?? visibleRuns.value.at(-1));
const inFlight = computed(() => currentRun.value?.status === 'queued' || currentRun.value?.status === 'running');
const canPromote = computed(() => !!(currentCandidate.value && currentRun.value?.status === 'completed' && currentRun.value.aggregate === 'ready' && currentCandidate.value.baseRevisionId === localState.value?.headRevisionId && currentMove.value?.baseRevisionId === localState.value?.headRevisionId));
const sourceSaved = computed(() => currentCandidate.value?.source.files['worker.ts'] === worker.value && currentCandidate.value?.source.files['public/index.html'] === indexHtml.value);
const selectedExample = computed(() => {
  for (const name of ['working', 'brokenHealth'] as const) {
    const files = kit.value?.sources[name].files;
    if (files && files['worker.ts'] === worker.value && files['public/index.html'] === indexHtml.value) return name;
  }
  return undefined;
});
const worldChoices = computed(() => [
  ...(examples.value[0] ? [{ worldId: examples.value[0].worldId, title: 'Personal assistant World', revisionId: examples.value[0].revisionId }] : []),
  ...localWorlds.value.map(world => ({ ...world, revisionId: world.headRevisionId })),
]);
const revisionChoices = computed(() => isLocal.value && localState.value
  ? [
      { revisionId: localState.value.desired.revisionId, title: 'Desired model' },
      ...localState.value.revisions.filter(revision => revision.candidateId).map((revision, index) => ({ revisionId: revision.revisionId, title: `Canonical version ${index + 1}` })),
    ]
  : examples.value.filter(example => example.worldId === state.value.worldId).map(example => ({ revisionId: example.revisionId, title: example.title })));
const selectedRelations = computed(() => snapshot.value?.relations.filter(relation => relation.fromId === selected.value?.id || relation.toId === selected.value?.id) ?? []);
const selectedFindings = computed(() => readiness.value?.findings.filter(finding => selected.value && finding.objectIds.includes(selected.value.id)) ?? []);
const assayNames: Record<string, string> = { 'artifact.exists': 'Source exists', 'artifact.build-start': 'Build and start', 'app.health': 'Health check', 'app.surfaces': 'Page and API' };

function id(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
function changeView(view: WorkspaceView) { return router.push({ name: 'world', params: { worldId: state.value.worldId, revisionId: state.value.revisionId, view }, query: route.query }); }
function select(objectId?: string) {
  search.value = '';
  return router.replace({ query: routeQuery({ ...state.value, selected: objectId, path: hierarchyPath(objects.value, objectId) }) });
}
function navigate(worldId: string, revisionId: string, preserveSelection = false) {
  contextDialog.value?.close();
  return router.push({ name: 'world', params: { worldId, revisionId, view: state.value.view }, query: preserveSelection ? route.query : {} });
}
function closeContextBackdrop(event: MouseEvent) {
  const dialog = contextDialog.value;
  if (!dialog || event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
}
function openContext() { if (!contextDialog.value?.open) contextDialog.value?.showModal(); }
async function openSearch() {
  await changeView('map');
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}
function objectName(objectId: string) { return objects.value.find(object => object.id === objectId)?.title ?? objectId; }
function objectPath(object: ModelObject) { return ancestry(objects.value, object.id).slice(0, -1).map(item => item.title).join(' / '); }
function clearPoll() { window.clearTimeout(pollTimer); pollTimer = undefined; }

async function loadWorkspace() {
  const token = workspaceFence.next();
  const { worldId, revisionId } = state.value;
  loading.value = true;
  error.value = ''; unavailable.value = false; workspace.value = undefined;
  try {
    const result = await liveWorldApi.getWorkspace(worldId, revisionId);
    if (!workspaceFence.current(token) || disposed) return;
    if (result.kind === 'unavailable') unavailable.value = true;
    else workspace.value = result.workspace;
  } catch (cause) {
    if (workspaceFence.current(token) && !disposed) error.value = cause instanceof Error ? cause.message : 'This World could not be loaded.';
  } finally { if (workspaceFence.current(token) && !disposed) loading.value = false; }
}
async function loadLocal() {
  const token = localFence.next();
  const worldId = state.value.worldId;
  try {
    if (!localEnabled.value) return;
    const worlds = await getLocalWorlds();
    const local = worlds.some(world => world.worldId === worldId) ? await getLocalWorld(worldId) : undefined;
    if (!localFence.current(token) || disposed) return;
    localWorlds.value = worlds;
    localState.value = local;
    if (local && sourceWorldId !== worldId) {
      sourceWorldId = worldId;
      await fillKit('working');
      const move = local.moves.find(item => item.status === 'open' && item.baseRevisionId === local.headRevisionId);
      const candidate = local.candidates.filter(item => item.moveId === move?.moveId).at(-1);
      if (candidate && state.value.worldId === worldId && !disposed) {
        worker.value = candidate.source.files['worker.ts'] ?? '';
        indexHtml.value = candidate.source.files['public/index.html'] ?? '';
      }
    }
  } catch (cause) {
    if (localFence.current(token) && !disposed) commandError.value = cause instanceof Error ? cause.message : 'Local state could not be loaded.';
  }
}
async function loadRoute() {
  clearPoll();
  localState.value = undefined;
  commandError.value = '';
  await Promise.all([loadWorkspace(), loadLocal()]);
}
async function command(commandValue: WorldCommand, nextView?: WorkspaceView) {
  if (pending.value || !isHead.value) return;
  const worldId = state.value.worldId;
  pending.value = commandValue.kind;
  commandError.value = '';
  try {
    const response = await sendWorldCommand(worldId, commandValue);
    if (disposed || state.value.worldId !== worldId) return;
    localState.value = response.state;
    if (response.result.kind === 'candidatePromoted') {
      await router.push({ name: 'world', params: { worldId, revisionId: response.result.revisionId, view: 'overview' }, query: {} });
    } else if (nextView) await changeView(nextView);
  } catch (cause) {
    if (!disposed && state.value.worldId === worldId) commandError.value = cause instanceof Error ? cause.message : 'The change could not be saved.';
  } finally { pending.value = ''; }
}
async function createWorld() {
  if (pending.value) return;
  creation ??= { worldId: id('worker-app'), title: 'Worker web app', requestId: id('create') };
  pending.value = 'createWorld'; commandError.value = '';
  try {
    const response = await fetch('/api/v1/worlds', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(creation) });
    const body = await response.json();
    if (!response.ok || body.status !== 'ok') throw new Error(body.message ?? 'The example World could not be created.');
    const worldId = creation.worldId;
    creation = undefined;
    await router.push({ name: 'world', params: { worldId, revisionId: body.state.desired.revisionId, view: 'work' }, query: {} });
  } catch (cause) { commandError.value = cause instanceof Error ? cause.message : 'The example World could not be created.'; }
  finally { pending.value = ''; }
}
async function fillKit(kind: 'working' | 'brokenHealth') {
  const worldId = state.value.worldId;
  try {
    kit.value ??= await getLocalKit();
    if (disposed || state.value.worldId !== worldId) return;
    worker.value = kit.value.sources[kind].files['worker.ts'] ?? '';
    indexHtml.value = kit.value.sources[kind].files['public/index.html'] ?? '';
  } catch (cause) { commandError.value = cause instanceof Error ? cause.message : 'Example source could not be loaded.'; }
}
function submitCandidate() {
  if (currentMove.value) void command({ kind: 'submitCandidate', moveId: currentMove.value.moveId, candidateId: id('candidate'), source: { files: { 'worker.ts': worker.value, 'public/index.html': indexHtml.value } }, requestId: id('request') });
}
function runChecks() {
  if (currentCandidate.value) void command({ kind: 'startVerification', candidateId: currentCandidate.value.candidateId, requestId: id('request') }, 'evaluations');
}
function promote() {
  if (canPromote.value && currentCandidate.value && localState.value) void command({ kind: 'promote', candidateId: currentCandidate.value.candidateId, expectedHeadRevisionId: localState.value.headRevisionId, requestId: id('request') });
}

onMounted(async () => {
  try { localEnabled.value = (await startLocalSession()).enabled; } catch { localEnabled.value = false; }
  if (disposed) return;
  sessionReady = true;
  void getExamples().then(items => { if (!disposed) examples.value = items; }).catch(() => {});
  await loadRoute();
});
watch(() => `${state.value.worldId}/${state.value.revisionId}`, () => { if (sessionReady) void loadRoute(); });
watch(currentRun, run => {
  clearPoll();
  if (run && (run.status === 'queued' || run.status === 'running')) pollTimer = window.setTimeout(() => void loadLocal(), 750);
});
onBeforeUnmount(() => { disposed = true; workspaceFence.next(); localFence.next(); clearPoll(); });
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand" aria-label="World home">World</RouterLink>
      <div class="topbar-tools">
        <button class="context-trigger" @click="openContext">World context <ChevronDown :size="14" /></button>
        <button class="icon-button" aria-label="Search World" @click="openSearch"><Search :size="18" /></button>
      </div>
    </header>
    <nav class="nav" aria-label="World views">
      <RouterLink v-for="view in views" :key="view" :to="{ name: 'world', params: { worldId: state.worldId, revisionId: state.revisionId, view }, query: route.query }" :class="{ 'router-link-active': state.view === view }" :aria-current="state.view === view ? 'page' : undefined">{{ view[0].toUpperCase() + view.slice(1) }}</RouterLink>
    </nav>

    <main class="canvas">
      <p v-if="commandError" class="notice" role="alert">{{ commandError }} <button class="text-button" :disabled="!!pending" @click="loadLocal">Refresh state</button></p>
      <p v-if="invalidSelected" class="notice"><strong>Pinned object unavailable.</strong> {{ invalidSelected }} is absent from this revision. <button class="text-button" @click="select()">Clear selection</button></p>
      <section v-if="loading" class="hero" aria-live="polite"><LoaderCircle class="loading-icon" :size="22" /><p class="lede">Opening your World…</p></section>
      <section v-else-if="unavailable || error" class="hero">
        <h1>{{ unavailable ? 'Pinned revision unavailable' : 'Workspace unavailable' }}</h1>
        <p class="lede">{{ unavailable ? 'This exact revision could not be found. Your link has been kept intact.' : error }}</p>
        <button class="text-button" @click="openContext">Choose another revision</button>
      </section>
      <template v-else-if="snapshot">
        <section v-if="state.view === 'overview'" class="hero">
          <svg class="world-mark" viewBox="0 0 56 56" fill="none" aria-hidden="true"><path d="M17 30 28 17l12 15-23-2Z" stroke="currentColor" stroke-width="1.3" /><circle cx="17" cy="30" r="5" fill="var(--paper)" stroke="currentColor" stroke-width="1.4" /><circle cx="28" cy="17" r="5" fill="var(--paper)" stroke="currentColor" stroke-width="1.4" /><circle cx="40" cy="32" r="5" fill="var(--paper)" stroke="currentColor" stroke-width="1.4" /></svg>
          <h1>{{ title }}</h1>
          <p class="lede">{{ purpose }}</p>
          <p class="quiet-status"><span class="status-dot" :class="readiness?.status" /> Model <span aria-label="Model readiness">{{ readiness?.status ?? 'unknown' }}</span><span v-if="isLocal" class="state-caption">{{ snapshot.stateKind === 'canonical' ? 'Canonical version' : 'Desired model' }}</span></p>
          <div class="actions">
            <button class="primary" @click="changeView(isLocal ? (snapshot.stateKind === 'canonical' ? 'evaluations' : 'work') : 'map')">{{ isLocal ? (snapshot.stateKind === 'canonical' ? 'View verification' : 'Work on a candidate') : 'Explore this World' }}<ArrowUpRight :size="15" /></button>
            <button v-if="localEnabled && !isLocal" class="secondary" :disabled="!!pending" @click="createWorld">{{ pending === 'createWorld' ? 'Opening…' : 'Try a realization' }}</button>
          </div>
          <p class="footnote">{{ isLocal ? 'Local workspace. Not deployed.' : 'Example World. Calendar not connected.' }}</p>
          <details v-if="readiness?.findings.length" class="readiness-details"><summary>What needs attention</summary><p v-for="finding in readiness.findings" :key="finding.ruleId + finding.message">{{ finding.message }}</p></details>
        </section>

        <section v-else-if="state.view === 'map'" class="workspace">
          <header class="view-heading"><h1>Inside this World</h1><p>Explore its Things and how they fit together.</p></header>
          <div class="structure-toolbar">
            <div class="crumbs"><template v-for="(item, index) in ancestors" :key="item.id"><ChevronRight v-if="index" :size="13" /><button @click="select(item.id)">{{ item.title }}</button></template></div>
            <button class="icon-button" aria-label="Search hierarchy" @click="openSearch"><Search :size="16" /></button>
          </div>
          <label v-if="searchOpen" class="search-field"><span class="sr-only">Search World objects</span><input ref="searchInput" v-model="search" type="search" placeholder="Find a Thing, goal, or operation" aria-label="Search World objects" /><button class="icon-button" aria-label="Close search" @click="searchOpen = false; search = ''"><X :size="16" /></button></label>
          <ul class="tree"><li v-for="object in children" :key="object.id"><button class="object-row" :aria-pressed="selected?.id === object.id" @click="select(object.id)"><span class="row-icon" aria-hidden="true" /><span class="object-copy"><span>{{ object.title }}</span><span v-if="search" class="object-path">{{ objectPath(object) }}</span></span><small>{{ object.kind }}</small><ChevronRight :size="15" /></button></li></ul>
          <p v-if="!children.length" class="empty-note">{{ search ? 'No objects match this search.' : 'This is the most detailed level of this object.' }}</p>
        </section>

        <section v-else-if="state.view === 'work' && isLocal" class="workspace">
          <header class="view-heading"><p>{{ title }}</p><h1>Build a candidate</h1><p>A Worker with a page, an API, and a healthy response.</p></header>
          <div class="surface">
            <template v-if="!isHead"><p>This is a pinned revision. Candidate work begins from the current head.</p><div class="actions"><button class="primary" @click="navigate(state.worldId, localState!.headRevisionId)">Open current revision</button></div></template>
            <template v-else-if="currentMove">
              <p class="move-caption">{{ currentMove.title }}</p>
              <div class="work-options" aria-label="Example source"><button :aria-pressed="selectedExample === 'working'" :disabled="!!pending" @click="fillKit('working')"><Check v-if="selectedExample === 'working'" :size="14" />Working example</button><button :aria-pressed="selectedExample === 'brokenHealth'" :disabled="!!pending" @click="fillKit('brokenHealth')"><Check v-if="selectedExample === 'brokenHealth'" :size="14" />Broken health example</button></div>
              <p class="source-description">{{ selectedExample === 'brokenHealth' ? 'The page and API work. The health response deliberately fails.' : selectedExample === 'working' ? 'A minimal app that satisfies all four checks.' : 'Your edited source will be saved as a new candidate.' }}</p>
              <details class="source-editor"><summary>Edit source</summary><label>worker.ts<textarea v-model="worker" spellcheck="false" aria-label="worker.ts" /></label><label>public/index.html<textarea v-model="indexHtml" spellcheck="false" aria-label="public/index.html" /></label></details>
              <details class="evidence-details"><summary>What will be tested</summary><p v-for="assay in localState?.assayPlan.assays" :key="assay.assayId">{{ assayNames[assay.assayId] ?? assay.assayId }}</p></details>
              <p v-if="sourceSaved" class="candidate-note"><Check :size="15" /> Candidate saved. This version is immutable.</p>
              <p v-if="currentRun" class="quiet-status" aria-label="Verification status">{{ currentRun.status }} · {{ currentRun.aggregate }}</p>
              <div class="actions">
                <button v-if="!sourceSaved" class="primary" :disabled="!!pending || !worker || !indexHtml" @click="submitCandidate">{{ pending === 'submitCandidate' ? 'Saving…' : 'Submit candidate' }}</button>
                <button v-else-if="!currentRun" class="primary" :disabled="!!pending" @click="runChecks">{{ pending === 'startVerification' ? 'Starting…' : 'Run checks' }}</button>
                <button v-else class="primary" @click="changeView('evaluations')">{{ inFlight ? 'View running checks' : 'View checks' }}</button>
              </div>
            </template>
            <template v-else><p>{{ localState?.moves.length ? 'The previous Move is complete. Start another when you’re ready.' : 'Begin a Move to turn this model into a working app.' }}</p><div class="actions"><button class="primary" :disabled="!!pending" @click="command({ kind: 'createMove', moveId: id('move'), title: 'Improve the Worker web app', requestId: id('request') })">Start a Move</button></div></template>
          </div>
        </section>

        <section v-else-if="state.view === 'evaluations' && isLocal" class="workspace">
          <header class="view-heading"><h1>{{ latestRun?.aggregate === 'ready' ? 'The checks passed.' : latestRun?.aggregate === 'blocked' ? 'A check needs attention.' : 'Check the candidate.' }}</h1><p>{{ latestRun ? 'Local verifier evidence for the immutable candidates associated with this revision.' : 'Submit a candidate and run its checks to see evidence here.' }}</p></header>
          <div v-if="visibleRuns.length" class="surface run-list">
            <article v-for="(run, runIndex) in visibleRuns" :key="run.runId" class="run-result">
              <div class="run-heading"><h2>Candidate {{ runIndex + 1 }}</h2><span class="quiet-status" aria-label="Verification status"><LoaderCircle v-if="run.status === 'queued' || run.status === 'running'" class="loading-icon" :size="15" />{{ run.status }} · {{ run.aggregate }}</span></div>
              <template v-for="evaluation in run.evaluations" :key="evaluation.attempt">
                <div v-for="observation in evaluation.observations" :key="observation.assayId" class="assay-row"><span class="assay-symbol" :class="observation.result"><Check v-if="observation.result === 'pass'" :size="16" /><X v-else-if="observation.result === 'fail'" :size="16" /><span v-else>–</span></span><div><strong>{{ assayNames[observation.assayId] ?? observation.assayId }}</strong><p>{{ observation.summary }}</p></div><span class="assay-outcome">{{ observation.result }}</span></div>
                <details class="evidence-details"><summary>Inspect evidence</summary><dl class="metadata"><dt>Verifier</dt><dd>{{ evaluation.verifierId }}</dd><dt>Source</dt><dd>{{ evaluation.sourceDigest }}</dd><dt>Contract</dt><dd>{{ evaluation.contractHash }}</dd><dt>Plan</dt><dd>{{ evaluation.planHash }}</dd><dt>Build</dt><dd>{{ evaluation.buildDigest ?? 'Unavailable' }}</dd></dl><details v-for="observation in evaluation.observations" :key="observation.assayId"><summary>{{ observation.assayId }} · {{ observation.executionStatus }}</summary><p>{{ observation.summary }}</p><code v-if="observation.raw">{{ observation.raw }}</code></details></details>
              </template>
              <p v-if="!run.evaluations.length" class="empty-note">{{ run.status === 'error' ? 'The verifier could not finish. No passing evidence is recorded.' : 'Waiting for the local verifier. This page updates as the checks finish.' }}</p>
            </article>
            <div v-if="canPromote" class="promotion"><p>Use this version as the World’s canonical implementation.</p><div class="actions"><button class="primary" :disabled="!!pending" @click="promote">{{ pending === 'promote' ? 'Promoting…' : 'Promote candidate' }}</button></div><p class="footnote">Promotion does not deploy the app.</p></div>
            <div v-else-if="isHead && latestRun?.aggregate === 'blocked'" class="actions"><button class="secondary" @click="changeView('work')">Revise the candidate</button></div>
          </div>
          <div v-else class="actions"><button v-if="isHead" class="primary" @click="changeView('work')">Work on a candidate</button><button v-else class="secondary" @click="navigate(state.worldId, localState!.headRevisionId)">Open current revision</button></div>
        </section>

        <section v-else-if="state.view === 'theory'" class="workspace">
          <header class="view-heading"><h1>Why this should work</h1><p>Claims to test, rather than outcomes to assume.</p></header>
          <article v-for="claim in snapshot.theory.claims" :key="claim.id" class="theory-claim"><h2>{{ claim.title }}</h2><p class="quiet-status">{{ claim.source.kind }}</p><details class="evidence-details"><summary>What would tell us</summary><p>Outcome: {{ objectName(claim.outcomeId) }}</p><p v-for="indicatorId in claim.indicatorIds" :key="indicatorId">{{ objectName(indicatorId) }}</p><p class="footnote">No outcome observation has been reported.</p></details></article>
          <p v-if="!snapshot.theory.claims.length" class="empty-note">No Theory claims have been recorded.</p>
        </section>

        <section v-else-if="state.view === 'history' && isLocal" class="workspace">
          <header class="view-heading"><h1>The World, over time</h1><p>Revisit an exact version.</p></header><ul class="tree"><li v-for="(revision, index) in localState?.revisions" :key="revision.revisionId"><button class="object-row" @click="navigate(state.worldId, revision.revisionId)"><span>{{ revision.candidateId ? `Canonical version ${index}` : 'Initial desired model' }}</span><small>{{ revision.revisionId === localState?.headRevisionId ? 'Current head' : 'Pinned revision' }}</small><ChevronRight :size="15" /></button></li></ul>
        </section>

        <section v-else class="hero placeholder-stage"><h1>{{ state.view === 'work' ? 'A place for the next Move.' : state.view === 'evaluations' ? 'Evidence belongs here.' : 'A history worth keeping.' }}</h1><p class="lede">{{ state.view === 'work' ? 'This assistant is an example model. Try a local Worker app to explore real candidate work.' : state.view === 'evaluations' ? 'This example has model readiness, but no live implementation checks or outcome observations.' : 'This example has no live changes to show.' }}</p><div v-if="localEnabled" class="actions"><button class="primary" :disabled="!!pending" @click="createWorld">Try a realization</button></div></section>

        <aside v-if="selected" class="inspector workspace" aria-label="Shared inspector">
          <div class="inspector-heading"><div><p class="quiet-status">{{ selected.kind }}</p><h2>{{ selected.title }}</h2></div><button class="icon-button" aria-label="Clear selected object" @click="select()"><X :size="17" /></button></div>
          <div class="inspector-content"><p v-for="(value, name) in selected.properties" :key="name"><span class="property-name">{{ name }}</span> {{ value }}</p><details class="evidence-details"><summary>Connections and provenance</summary><p v-for="relation in selectedRelations" :key="relation.id">{{ relation.kind }}: {{ objectName(relation.fromId === selected.id ? relation.toId : relation.fromId) }}</p><p>{{ selected.source.kind }} / {{ selected.source.reference }}</p><p v-for="finding in selectedFindings" :key="finding.ruleId + finding.message">{{ finding.message }}</p><p class="footnote">Object {{ selected.id }}</p></details></div>
        </aside>
      </template>
    </main>

    <dialog ref="contextDialog" class="context-panel" aria-labelledby="context-title" @click="closeContextBackdrop">
      <header class="context-header"><h2 id="context-title">World context</h2><button class="icon-button" aria-label="Close World context" @click="contextDialog?.close()"><X :size="18" /></button></header>
      <section class="context-section"><h3>Worlds</h3><div class="context-list"><button v-for="world in worldChoices" :key="world.worldId" :aria-current="state.worldId === world.worldId ? 'true' : undefined" @click="navigate(world.worldId, world.revisionId)"><span>{{ world.title }}</span><Check v-if="state.worldId === world.worldId" :size="15" /></button></div></section>
      <section class="context-section"><h3>Revision</h3><div class="context-list"><button v-for="revision in revisionChoices" :key="revision.revisionId" :aria-current="state.revisionId === revision.revisionId ? 'true' : undefined" @click="navigate(state.worldId, revision.revisionId, true)"><span>{{ revision.title }}</span><Check v-if="state.revisionId === revision.revisionId" :size="15" /></button></div></section>
      <details class="context-section"><summary>Model details</summary><dl class="metadata"><dt>World</dt><dd>{{ state.worldId }}</dd><dt>Revision</dt><dd>{{ state.revisionId }}</dd><dt>Environment</dt><dd>{{ snapshot?.environment.title ?? 'Unknown' }}</dd><dt>Phase</dt><dd>{{ snapshot?.phase ?? 'Unknown' }}</dd><dt>State</dt><dd>{{ snapshot?.stateKind ?? 'Unknown' }}</dd><dt>Model readiness</dt><dd>{{ readiness?.status ?? 'unknown' }}</dd><dt>Outcomes</dt><dd>Unknown. No observation reported.</dd><dt>Deployment</dt><dd>{{ isLocal ? 'Not deployed' : 'Unavailable for this example' }}</dd></dl></details>
    </dialog>
  </div>
</template>
