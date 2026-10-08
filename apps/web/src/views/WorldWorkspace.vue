<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronRight, CircleHelp, GitBranch } from '@lucide/vue';
import { readRouteState, routeQuery } from '../route-state';
import { views, type WorkspaceView } from '../router';
import { getExamples, liveWorldApi, type Example, type WorkspaceResult } from '../services/world-api';
import { createLoadFence } from '../load-fence';
import { ancestry, hierarchyPath } from '../hierarchy';

const route = useRoute();
const router = useRouter();
const state = computed(() => readRouteState(route));
const loading = ref(true);
const unavailable = ref(false);
const error = ref<string>();
const workspace = ref<WorkspaceResult>();
const examples = ref<Example[]>([]);
const fence = createLoadFence();
const snapshot = computed(() => workspace.value?.snapshot);
const readiness = computed(() => workspace.value?.readiness);

const objects = computed(() => snapshot.value?.objects ?? []);
const invalidSelected = computed(() => snapshot.value && state.value.selected && !objects.value.some(object => object.id === state.value.selected) ? state.value.selected : undefined);
const search = ref('');
const visibleObjects = computed(() => {
  const term = search.value.trim().toLowerCase();
  return term ? objects.value.filter((object) => `${object.title} ${object.kind}`.toLowerCase().includes(term)) : objects.value;
});
const selected = computed(() => objects.value.find((object) => object.id === state.value.selected));
const current = computed(() => selected.value ?? objects.value.find((object) => !object.parentId));
const children = computed(() => current.value ? visibleObjects.value.filter((object) => object.parentId === current.value!.id) : []);
const ancestors = computed(() => ancestry(objects.value, current.value?.id));
const title = computed(() => snapshot.value?.title ?? state.value.worldId);
const environment = computed(() => snapshot.value?.environment.title ?? 'Environment unknown');
const phase = computed(() => snapshot.value?.phase ?? 'Phase unknown');
const purpose = computed(() => snapshot.value?.purpose.statement ?? 'Purpose has not been recorded.');

function objectTitle(object: { id: string; title: string }) { return object.title; }
function objectId(object: { id: string }) { return object.id; }
function select(id?: string) { router.replace({ query: routeQuery({ ...state.value, selected: id, path: hierarchyPath(objects.value, id) }) }); }
function changeView(view: WorkspaceView) { router.push({ name: 'world', params: { worldId: state.value.worldId, revisionId: state.value.revisionId, view }, query: route.query }); }
function setLens(lens: string) { router.replace({ query: routeQuery({ ...state.value, lens }) }); }
function statusText(value?: string) { return value ?? 'Unknown'; }

async function load() {
  const token = fence.next();
  loading.value = true; unavailable.value = false; error.value = undefined; workspace.value = undefined;
  try {
    const result = await liveWorldApi.getWorkspace(state.value.worldId, state.value.revisionId);
    if (!fence.current(token)) return;
    if (result.kind === 'unavailable') { unavailable.value = true; return; }
    workspace.value = result.workspace;
  } catch (cause) { if (fence.current(token)) error.value = cause instanceof Error ? cause.message : 'Unable to load this pinned revision.'; }
  finally { if (fence.current(token)) loading.value = false; }
}
async function loadExamples() { try { examples.value = await getExamples(); } catch { examples.value = []; } }
function switchRevision(event: Event) { const found = examples.value.find((example) => `${example.worldId}/${example.revisionId}` === (event.target as HTMLSelectElement).value); if (found) router.push({ name: 'world', params: { worldId: found.worldId, revisionId: found.revisionId, view: state.value.view }, query: routeQuery(state.value) }); }
onMounted(() => { void load(); void loadExamples(); }); watch(() => `${state.value.worldId}/${state.value.revisionId}`, load);
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">World <span>Control</span></div>
      <nav class="nav" aria-label="World views">
        <a v-for="view in views" :key="view" href="#" :class="{ 'router-link-active': state.view === view }" @click.prevent="changeView(view)">{{ view[0].toUpperCase() + view.slice(1) }}</a>
      </nav>
      <small>Keyboard: use Tab to browse the hierarchy and Enter to inspect.</small>
    </aside>
    <main class="content">
      <header class="context">
        <h1>{{ title }}</h1>
        <label>World<select :value="state.worldId" aria-label="World"><option :value="state.worldId">{{ state.worldId }}</option></select></label>
        <label>Revision<select :value="`${state.worldId}/${state.revisionId}`" aria-label="Revision" @change="switchRevision"><option :value="`${state.worldId}/${state.revisionId}`">{{ state.revisionId }}</option><option v-for="example in examples.filter((item) => `${item.worldId}/${item.revisionId}` !== `${state.worldId}/${state.revisionId}`)" :key="example.revisionId" :value="`${example.worldId}/${example.revisionId}`">{{ example.title }} · {{ example.revisionId }}</option></select></label>
        <label>Search<input v-model="search" type="search" placeholder="Objects and kinds" aria-label="Search World objects" /></label>
        <div class="context-meta">
          <span class="badge">Environment · {{ environment }}</span><span class="badge">Phase · {{ phase }}</span>
          <span class="badge">{{ snapshot?.stateKind ?? 'state unknown' }} · pinned revision</span><span class="badge warn">Deployment state unavailable</span>
        </div>
      </header>

      <p class="example"><strong>Read-only example.</strong> Calendar is not connected and no live agent activity is shown.</p>
      <p v-if="invalidSelected" class="example"><strong>Pinned object unavailable.</strong> {{ invalidSelected }} does not exist in this revision; the link remains unchanged.</p>
      <div v-if="loading" class="panel">Loading the pinned revision…</div>
      <div v-else-if="unavailable" class="panel"><h2>Pinned revision unavailable</h2><p class="placeholder">{{ state.worldId }} / {{ state.revisionId }} could not be found. It has not been replaced with the latest revision.</p></div>
      <div v-else-if="error" class="panel"><h2>Workspace unavailable</h2><p class="placeholder">{{ error }}</p></div>
      <div v-else-if="snapshot" class="workspace">
        <section class="main">
          <template v-if="state.view === 'overview'">
            <p class="section-title">Purpose</p><article class="panel"><p>{{ purpose }}</p></article>
            <p class="section-title">Model and outcome state</p><div class="grid"><article class="panel metric"><small>Model readiness</small><strong>{{ statusText(readiness?.status) }}</strong><p class="placeholder">Readiness comes from the rule evaluator.</p></article><article class="panel metric"><small>Outcomes</small><strong>Unknown</strong><p class="placeholder">No outcome observation has been reported.</p></article></div>
          </template>
          <template v-else-if="state.view === 'map'">
            <p class="crumbs"><button v-for="(item, index) in ancestors" :key="item.id" @click="select(item.id)">{{ index ? ' › ' : '' }}{{ item.title }}</button></p>
            <div class="lens" aria-label="Map lens"><button v-for="lens in ['structure', 'causal', 'change', 'risk', 'observed', 'candidate']" :key="lens" :class="{ active: state.lens === lens }" @click="setLens(lens)">{{ lens }}</button></div>
            <article class="panel"><h2>Focused map</h2><p class="placeholder">The {{ state.lens || 'structure' }} lens is reserved for the connected graph renderer. Direction, relationship type, and uncertainty will appear when the revision supplies them.</p></article>
          </template>
          <template v-else><p class="section-title">{{ state.view }}</p><article class="panel"><h2>{{ state.view[0].toUpperCase() + state.view.slice(1) }} workspace</h2><p class="placeholder">Detailed {{ state.view }} editors, comparison, and activity are not connected in this foundation. This view preserves the World, revision, and selection context.</p></article></template>

          <p class="section-title">Hierarchy</p><article class="panel"><p v-if="current" class="crumbs">Viewing {{ current.title }}</p><ul class="tree"><li v-for="object in children" :key="objectId(object)"><button :aria-pressed="state.selected === objectId(object)" @click="select(objectId(object))"><GitBranch :size="14" /> {{ objectTitle(object) }} <small>· {{ object.kind }}</small></button></li><li v-if="!children.length" class="placeholder">No matching child objects in this revision.</li></ul></article>
        </section>
        <aside class="panel inspector" aria-label="Shared inspector"><CircleHelp :size="18" /><h2>Inspector</h2><template v-if="selected"><strong>{{ objectTitle(selected) }}</strong><p class="placeholder">{{ selected.kind }} · {{ objectId(selected) }} · source: {{ selected.source.kind }} / {{ selected.source.reference }}</p><p v-if="Object.keys(selected.properties).length" class="placeholder">Properties: {{ Object.entries(selected.properties).map(([key, value]) => `${key}: ${value}`).join(', ') }}</p><p class="placeholder">Relations: {{ snapshot.relations.filter((relation) => relation.fromId === selected!.id || relation.toId === selected!.id).map((relation) => relation.fromId === selected!.id ? `${relation.kind} → ${relation.toId}` : `${relation.fromId} → ${relation.kind}`).join(', ') || 'None' }}</p><p class="placeholder">Readiness findings: {{ readiness?.findings.filter((finding) => finding.objectIds.includes(selected!.id)).map((finding) => finding.message).join(' · ') || 'None' }}</p></template><p v-else class="placeholder">Select an item in the hierarchy to inspect it. The same selection remains pinned across views.</p></aside>
      </div>
    </main>
  </div>
</template>
