<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowUpRight, Check, ChevronDown, ChevronRight, LoaderCircle, Search, X } from '@lucide/vue';
import type { DeploymentRecord, ModelObject, WorldCommand, WorldState } from '@bropilot/contracts';
import { readRouteState, routeQuery } from '../route-state';
import { views, type WorkspaceView } from '../router';
import { createDeploymentTarget, disconnectCloudflareConnection, getCloudflareConnection, getExamples, getLocalKit, getLocalWorlds, getSession, getWorldWithMetadata, liveWorldApi, reconcileWorldSource, resumeDeployment, selectCloudflareAccount, sendWorldCommand, startCloudflareConnection, startLocalSession, WorldApiError, type CloudflareConnection, type Example, type Session, type SourceReconciliation, type WorkspaceResult, type WorldSummary } from '../services/world-api';
import WorldMap from '../components/WorldMap.vue';
import DeploymentPanel from '../components/DeploymentPanel.vue';
import CloudflareConnectionDialog from '../components/CloudflareConnectionDialog.vue';
import { createLoadFence } from '../load-fence';
import { ancestry, hierarchyPath } from '../hierarchy';

const route = useRoute();
const router = useRouter();
const state = computed(() => readRouteState(route));
const workspace = ref<WorkspaceResult>();
const loading = ref(true);
const unavailable = ref(false);
const signInRequired = ref(false);
const error = ref('');
const commandError = ref('');
const deliveryNotice = ref('');
const pending = ref('');
const examples = ref<Example[]>([]);
const localEnabled = ref(false);
const localWorlds = ref<WorldSummary[]>([]);
const localState = ref<WorldState>();
const session = ref<Session>({ enabled: false, mode: 'example' });
const connection = ref<CloudflareConnection>();
const connectionOpen = ref(false);
const connectionError = ref('');
const sourceReconciliation = ref<SourceReconciliation | null>(null);
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
const isHosted = computed(() => !!localState.value?.hosted);
const sourceReconciliationPending = computed(() => sourceReconciliation.value?.status === 'pending');
const deploymentTarget = computed(() => localState.value?.hosted?.deploymentTargets[0]);
const deployments = computed(() => localState.value?.deployments ?? []);
const runtimeObservations = computed(() => localState.value?.runtimeObservations ?? []);
const selectedRevision = computed(() => localState.value?.revisions.find(revision => revision.revisionId === state.value.revisionId));
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
function setMapMode(mapMode: 'visual' | 'text') { return router.replace({ query: { ...route.query, map: mapMode } }); }
function select(objectId?: string) {
  search.value = '';
  return router.replace({ query: routeQuery({ ...state.value, selected: objectId, path: hierarchyPath(objects.value, objectId) }) });
}
function navigate(worldId: string, revisionId: string, preserveSelection = false) {
  contextDialog.value?.close();
  return router.push({ name: 'world', params: { worldId, revisionId, view: state.value.view }, query: preserveSelection ? route.query : { map: state.value.mapMode } });
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
  if (signInRequired.value) {
    error.value = 'Sign in through Cloudflare Access to open this hosted World.';
    loading.value = false;
    return;
  }
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
    const response = worlds.some(world => world.worldId === worldId) ? await getWorldWithMetadata(worldId) : undefined;
    const local = response?.state;
    if (!localFence.current(token) || disposed) return;
    localWorlds.value = worlds;
    localState.value = local;
    sourceReconciliation.value = response?.sourceReconciliation ?? null;
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
    if (localFence.current(token) && !disposed) commandError.value = cause instanceof Error ? cause.message : 'World state could not be loaded.';
  }
}
async function loadConnection(worldId = state.value.worldId) {
  if (!isHosted.value) { connection.value = undefined; return; }
  try {
    const current = await getCloudflareConnection();
    if (disposed || state.value.worldId !== worldId) return;
    connection.value = current;
  } catch (cause) {
    if (disposed || state.value.worldId !== worldId) return;
    const code = cause instanceof Error && 'code' in cause ? String(cause.code) : '';
    if (code !== 'unauthorized' && code !== 'session_expired') connectionError.value = cause instanceof Error ? cause.message : 'Cloudflare connection status could not be loaded.';
  }
}
async function loadRoute() {
  clearPoll();
  localState.value = undefined;
  sourceReconciliation.value = null;
  commandError.value = '';
  await Promise.all([loadWorkspace(), loadLocal()]);
  await loadConnection();
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
    const acknowledgement = response as typeof response & { dispatch?: 'pending'; storageReconciliation?: 'pending' };
    if (acknowledgement.dispatch === 'pending') deliveryNotice.value = 'Deployment dispatch is pending. Refresh its status or resume the deployment if it remains pending.';
    else if (acknowledgement.storageReconciliation === 'pending') deliveryNotice.value = 'Source reconciliation is pending. Refresh before expecting verification or deployment changes.';
    if (response.result.kind === 'candidatePromoted') {
      await router.push({ name: 'world', params: { worldId, revisionId: response.result.revisionId, view: 'overview' }, query: { map: state.value.mapMode } });
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
    await router.push({ name: 'world', params: { worldId, revisionId: body.state.desired.revisionId, view: 'work' }, query: { map: state.value.mapMode } });
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
async function connectCloudflare() {
  connectionError.value = '';
  try {
    const result = await startCloudflareConnection(`${window.location.pathname}${window.location.search}`);
    if (!disposed) window.location.assign(result.authorizationUrl);
  } catch (cause) { connectionError.value = cause instanceof Error ? cause.message : 'Cloudflare connection could not be started.'; }
}
async function confirmCloudflareAccount(accountId: string) {
  connectionError.value = '';
  pending.value = 'selectCloudflareAccount';
  try { connection.value = (await selectCloudflareAccount(accountId)).connection; }
  catch (cause) { connectionError.value = cause instanceof Error ? cause.message : 'Cloudflare account could not be confirmed.'; }
  finally { pending.value = ''; }
}
async function disconnectCloudflare() {
  connectionError.value = '';
  pending.value = 'disconnectCloudflare';
  try { await disconnectCloudflareConnection(); connection.value = undefined; }
  catch (cause) { connectionError.value = cause instanceof Error ? cause.message : 'Cloudflare could not be disconnected.'; }
  finally { pending.value = ''; }
}
async function ensureDeploymentTarget() {
  if (!isHosted.value || pending.value) return;
  pending.value = 'createDeploymentTarget'; commandError.value = '';
  try {
    await createDeploymentTarget(state.value.worldId);
    await loadLocal();
  } catch (cause) { commandError.value = cause instanceof Error ? cause.message : 'Deployment target could not be created.'; }
  finally { pending.value = ''; }
}
async function reconcileSource() {
  const worldId = state.value.worldId;
  const response = await reconcileWorldSource(worldId);
  if (disposed || state.value.worldId !== worldId) return false;
  localState.value = response.state;
  sourceReconciliation.value = response.sourceReconciliation;
  return response.sourceReconciliation?.status !== 'pending';
}
async function retrySourceReconciliation() {
  if (pending.value) return;
  pending.value = 'sourceReconciliation'; commandError.value = '';
  try {
    if (await reconcileSource()) deliveryNotice.value = '';
  } catch (cause) { commandError.value = cause instanceof Error ? cause.message : 'Source reconciliation could not be retried.'; }
  finally { pending.value = ''; }
}
async function reconcileBeforeDeployment() {
  pending.value = 'sourceReconciliation'; commandError.value = '';
  try {
    if (await reconcileSource()) return true;
    deliveryNotice.value = 'Source reconciliation is pending. Deployment has not been queued.';
    return false;
  } catch (cause) {
    commandError.value = cause instanceof Error ? cause.message : 'Source reconciliation could not be retried.';
    return false;
  } finally { pending.value = ''; }
}
async function requestDeployment() {
  if (pending.value || !deploymentTarget.value || !selectedRevision.value || !isHead.value) return;
  if (!await reconcileBeforeDeployment()) return;
  void command({ kind: 'requestDeployment', deploymentId: id('deployment'), targetId: deploymentTarget.value.targetId, revisionId: selectedRevision.value.revisionId, expectedHeadRevisionId: localState.value!.headRevisionId, requestId: id('request') });
}
function requestRollback(deployment: DeploymentRecord) {
  if (!deploymentTarget.value || !deployment.providerVersionId) return;
  void command({ kind: 'requestRollback', deploymentId: id('rollback'), targetId: deploymentTarget.value.targetId, previousDeploymentId: deployment.deploymentId, expectedActiveProviderVersionId: deployment.providerVersionId, requestId: id('request') });
}
async function resumePendingDeployment(deployment: DeploymentRecord) {
  if (pending.value) return;
  if (!await reconcileBeforeDeployment()) return;
  pending.value = 'resumeDeployment'; commandError.value = '';
  try {
    const response = await resumeDeployment(state.value.worldId, deployment.deploymentId) as { dispatch?: 'pending'; storageReconciliation?: 'pending' };
    if (response.dispatch === 'pending') deliveryNotice.value = 'Deployment dispatch is pending. Refresh its status or resume again if it remains pending.';
    await loadRoute();
  } catch (cause) { commandError.value = cause instanceof Error ? cause.message : 'Deployment could not be resumed.'; }
  finally { pending.value = ''; }
}

onMounted(async () => {
  try {
    session.value = await getSession();
    localEnabled.value = session.value.enabled && session.value.mode !== 'example';
    if (session.value.mode === 'local') localEnabled.value = (await startLocalSession()).enabled;
  } catch (cause) {
    if (cause instanceof WorldApiError && cause.status === 401) {
      signInRequired.value = true;
      session.value = { enabled: false, mode: 'hosted' };
      localEnabled.value = false;
    } else {
    try { localEnabled.value = (await startLocalSession()).enabled; session.value = { enabled: localEnabled.value, mode: 'local' }; } catch { localEnabled.value = false; }
    }
  }
  if (disposed) return;
  sessionReady = true;
  void getExamples().then(items => { if (!disposed) examples.value = items; }).catch(() => {});
  await loadRoute();
});
watch(() => `${state.value.worldId}/${state.value.revisionId}`, () => { if (sessionReady) void loadRoute(); });
watch([currentRun, () => deployments.value.some(deployment => deployment.status === 'queued' || deployment.status === 'running')], ([run, deploymentPending]) => {
  clearPoll();
  if ((run && (run.status === 'queued' || run.status === 'running')) || deploymentPending) pollTimer = window.setTimeout(() => void loadRoute(), 750);
});
onBeforeUnmount(() => { disposed = true; workspaceFence.next(); localFence.next(); clearPoll(); });
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand" aria-label="World home">World</RouterLink>
      <div class="topbar-tools">
        <RouterLink to="/lab/ontology" class="text-button">Ontology lab</RouterLink>
        <button class="context-trigger" @click="openContext">World context <ChevronDown :size="14" /></button>
        <button class="icon-button" aria-label="Search World" @click="openSearch"><Search :size="18" /></button>
      </div>
    </header>
    <nav class="nav" aria-label="World views">
      <RouterLink v-for="view in views" :key="view" :to="{ name: 'world', params: { worldId: state.worldId, revisionId: state.revisionId, view }, query: route.query }" :class="{ 'router-link-active': state.view === view }" :aria-current="state.view === view ? 'page' : undefined">{{ view[0].toUpperCase() + view.slice(1) }}</RouterLink>
    </nav>

    <main class="canvas">
      <p v-if="commandError" class="notice" role="alert">{{ commandError }} <button class="text-button" :disabled="!!pending" @click="loadLocal">Refresh state</button></p>
      <p v-if="deliveryNotice" class="notice" role="status">{{ deliveryNotice }} <button class="text-button" :disabled="!!pending" @click="loadRoute">Refresh state</button></p>
      <p v-if="sourceReconciliationPending" class="notice" role="status">Source reconciliation is pending for the current canonical version. Deployment has not been queued. <button class="text-button" :disabled="!!pending" @click="retrySourceReconciliation">{{ pending === 'sourceReconciliation' ? 'Retrying…' : 'Retry' }}</button></p>
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
          <p class="footnote">{{ isHosted ? 'Hosted World. Deployment remains a separate owner action.' : isLocal ? 'Local workspace. Not deployed.' : 'Example World. Calendar not connected.' }}</p>
          <details v-if="readiness?.findings.length" class="readiness-details"><summary>What needs attention</summary><p v-for="finding in readiness.findings" :key="finding.ruleId + finding.message">{{ finding.message }}</p></details>
          <DeploymentPanel v-if="isHosted && localState" :revision-id="state.revisionId" :head-revision-id="localState.headRevisionId" :package-ref="selectedRevision?.packageRef" :target="deploymentTarget" :connection-status="connection?.status" :deployments="deployments" :observations="runtimeObservations" :pending="!!pending" @connect="connectionOpen = true" @create-target="ensureDeploymentTarget" @deploy="requestDeployment" @resume="resumePendingDeployment" @rollback="requestRollback" />
        </section>

        <section v-else-if="state.view === 'map'" class="workspace">
          <header class="view-heading" :class="{ 'visual-heading': state.mapMode === 'visual' }"><h1 :class="{ 'sr-only': state.mapMode === 'visual' }">Inside this World</h1><p :class="{ 'sr-only': state.mapMode === 'visual' }">Explore its Things and how they fit together.</p><div class="map-toggle" role="group" aria-label="Map representation"><button :aria-pressed="state.mapMode === 'visual'" @click="setMapMode('visual')">Visual</button><button :aria-pressed="state.mapMode === 'text'" @click="setMapMode('text')">Text</button></div></header>
          <div class="structure-toolbar">
            <div class="crumbs"><template v-for="(item, index) in ancestors" :key="item.id"><ChevronRight v-if="index" :size="13" /><button @click="select(item.id)">{{ item.title }}</button></template></div>
            <button class="icon-button" aria-label="Search hierarchy" @click="openSearch"><Search :size="16" /></button>
          </div>
          <label v-if="searchOpen" class="search-field"><span class="sr-only">Search World objects</span><input ref="searchInput" v-model="search" type="search" placeholder="Find a Thing, goal, or operation" aria-label="Search World objects" /><button class="icon-button" aria-label="Close search" @click="searchOpen = false; search = ''"><X :size="16" /></button></label>
          <WorldMap v-if="state.mapMode === 'visual' && current" :focus="current" :objects="objects" :relations="snapshot.relations" :search="search" @select="select" />
          <ul v-else class="tree"><li v-for="object in children" :key="object.id"><button class="object-row" :aria-pressed="selected?.id === object.id" @click="select(object.id)"><span class="row-icon" aria-hidden="true" /><span class="object-copy"><span>{{ object.title }}</span><span v-if="search" class="object-path">{{ objectPath(object) }}</span></span><small>{{ object.kind }}</small><ChevronRight :size="15" /></button></li></ul>
          <p v-if="state.mapMode === 'text' && !children.length" class="empty-note">{{ search ? 'No objects match this search.' : 'This is the most detailed level of this object.' }}</p>
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
          <header class="view-heading"><h1>{{ latestRun?.aggregate === 'ready' ? 'The checks passed.' : latestRun?.aggregate === 'blocked' ? 'A check needs attention.' : 'Check the candidate.' }}</h1><p>{{ latestRun ? (isHosted ? 'Registered verifier evidence for the immutable candidates associated with this revision.' : 'Local verifier evidence for the immutable candidates associated with this revision.') : 'Submit a candidate and run its checks to see evidence here.' }}</p></header>
          <div v-if="visibleRuns.length" class="surface run-list">
            <article v-for="(run, runIndex) in visibleRuns" :key="run.runId" class="run-result">
              <div class="run-heading"><h2>Candidate {{ runIndex + 1 }}</h2><span class="quiet-status" aria-label="Verification status"><LoaderCircle v-if="run.status === 'queued' || run.status === 'running'" class="loading-icon" :size="15" />{{ run.status }} · {{ run.aggregate }}</span></div>
              <template v-for="evaluation in run.evaluations" :key="evaluation.attempt">
                <div v-for="observation in evaluation.observations" :key="observation.assayId" class="assay-row"><span class="assay-symbol" :class="observation.result"><Check v-if="observation.result === 'pass'" :size="16" /><X v-else-if="observation.result === 'fail'" :size="16" /><span v-else>–</span></span><div><strong>{{ assayNames[observation.assayId] ?? observation.assayId }}</strong><p>{{ observation.summary }}</p></div><span class="assay-outcome">{{ observation.result }}</span></div>
                <details class="evidence-details"><summary>Inspect evidence</summary><dl class="metadata"><dt>Verifier</dt><dd>{{ evaluation.verifierId }}</dd><dt>Source</dt><dd>{{ evaluation.sourceDigest }}</dd><dt>Contract</dt><dd>{{ evaluation.contractHash }}</dd><dt>Plan</dt><dd>{{ evaluation.planHash }}</dd><dt>Build</dt><dd>{{ evaluation.buildDigest ?? 'Unavailable' }}</dd></dl><details v-for="observation in evaluation.observations" :key="observation.assayId"><summary>{{ observation.assayId }} · {{ observation.executionStatus }}</summary><p>{{ observation.summary }}</p><code v-if="observation.raw">{{ observation.raw }}</code></details></details>
              </template>
              <p v-if="!run.evaluations.length" class="empty-note">{{ run.status === 'error' ? 'The verifier could not finish. No passing evidence is recorded.' : isHosted ? 'Waiting for the registered verifier. This page updates as the checks finish.' : 'Waiting for the local verifier. This page updates as the checks finish.' }}</p>
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

        <section v-else class="hero placeholder-stage"><h1>{{ state.view === 'work' ? 'A place for the next Move.' : state.view === 'evaluations' ? 'Evidence belongs here.' : 'A history worth keeping.' }}</h1><p class="lede">{{ state.view === 'work' ? (isHosted ? 'This World has no candidate work at this revision yet.' : 'This assistant is an example model. Try a local Worker app to explore real candidate work.') : state.view === 'evaluations' ? 'This example has model readiness, but no live implementation checks or outcome observations.' : 'This example has no live changes to show.' }}</p><div v-if="localEnabled" class="actions"><button class="primary" :disabled="!!pending" @click="createWorld">Try a realization</button></div></section>

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
      <details class="context-section"><summary>Model details</summary><dl class="metadata"><dt>World</dt><dd>{{ state.worldId }}</dd><dt>Revision</dt><dd>{{ state.revisionId }}</dd><dt>Environment</dt><dd>{{ snapshot?.environment.title ?? 'Unknown' }}</dd><dt>Phase</dt><dd>{{ snapshot?.phase ?? 'Unknown' }}</dd><dt>State</dt><dd>{{ snapshot?.stateKind ?? 'Unknown' }}</dd><dt>Model readiness</dt><dd>{{ readiness?.status ?? 'unknown' }}</dd><dt>Outcomes</dt><dd>Unknown. No observation reported.</dd><dt>Deployment</dt><dd>{{ isHosted ? 'Hosted deployment available' : isLocal ? 'Not deployed' : 'Unavailable for this example' }}</dd></dl></details>
      <section v-if="isHosted" class="context-section"><h3>Cloudflare</h3><button class="secondary" @click="connectionOpen = true">{{ connection?.status === 'connected' ? 'Manage connection' : 'Connect Cloudflare' }}</button></section>
    </dialog>
    <CloudflareConnectionDialog :open="connectionOpen" :connection="connection" :pending="!!pending" :error="connectionError" @close="connectionOpen = false" @start="connectCloudflare" @select-account="confirmCloudflareAccount" @disconnect="disconnectCloudflare" />
  </div>
</template>
