<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { SPACES, KIND_MAP, kindsForPart, PARTS, ontologyGraph, ONTOLOGY, type Space, type Part } from '../../lib/schema';
import { state, nodesByKind } from '../../lib/store';
import type { LayoutNamespace } from '../../lib/layout';
import { graphMode, focusedKind } from '../../lib/graphMode';
import ForceGraph from '../graph/ForceGraph.vue';
import ThreadView from './ThreadView.vue';
import KindCard from '../graph/KindCard.vue';

const graphRef = ref<InstanceType<typeof ForceGraph> | null>(null);

// ── tabs ──
type GraphTab = 'all' | Part | 'thread';
const TAB_KEY = 'bropilot:ui:graphTab:v1';
const TABS: { id: GraphTab; label: string }[] = [
  { id: 'all', label: 'All' },
  ...PARTS.map((p) => ({ id: p.id as GraphTab, label: p.label })),
  { id: 'thread', label: 'Thread' },
];
const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

function readTab(): GraphTab {
  if (typeof localStorage === 'undefined') return 'all';
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v && TAB_IDS.has(v)) return v as GraphTab;
  } catch {
    /* ignore */
  }
  return 'all';
}
const activeTab = ref<GraphTab>(readTab());

function setTab(t: GraphTab) {
  if (activeTab.value === t) return;
  activeTab.value = t;
  if (t !== 'all') {
    graphMode.value = 'instance';
    focusedKind.value = null;
  }
}
watch(activeTab, (t) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TAB_KEY, t);
  } catch {
    /* ignore */
  }
});

const isPartTab = computed(() => activeTab.value !== 'all' && activeTab.value !== 'thread');
const isThread = computed(() => activeTab.value === 'thread');
const isForceTab = computed(() => !isThread.value);
const namespace = computed<LayoutNamespace>(() =>
  isPartTab.value ? (activeTab.value as LayoutNamespace) : 'all',
);

// ── space filters ──
const active = reactive<Record<Space, boolean>>({
  basics: true,
  problem: true,
  solution: true,
  crosscutting: true,
});
function toggle(sp: Space) {
  active[sp] = !active[sp];
}

// ── ontology (All tab only) ──
const isOntology = computed(() => activeTab.value === 'all' && graphMode.value === 'ontology');
const onto = ontologyGraph();
const DASH: Record<string, string> = { canonical: '', typical: '6 4', possible: '2 5' };
const ontoDash: Record<string, string> = Object.fromEntries(
  ONTOLOGY.map((t) => [`o-${t.src}-${t.type}-${t.dst}`, DASH[t.strength]]),
);
const ontoNodes = computed(() =>
  onto.nodes.map((n) => ({ ...n, title: `${n.title} · ${nodesByKind(n.kind).length}` })),
);

// ── part subsetting + ghosts ──
const nodeById = computed(() => new Map(state.graph.nodes.map((n) => [n.id, n])));
const partNodeIds = computed<Set<string>>(() => {
  if (!isPartTab.value) return new Set();
  const kinds = new Set(kindsForPart(activeTab.value as Part).map((k) => k.kind));
  return new Set(state.graph.nodes.filter((n) => kinds.has(n.kind)).map((n) => n.id));
});
// 1-hop cross-part neighbours of home nodes, known-kind only.
const ghostIds = computed<Set<string>>(() => {
  if (!isPartTab.value) return new Set();
  const home = partNodeIds.value;
  const ghosts = new Set<string>();
  const consider = (id: string) => {
    if (home.has(id)) return;
    const n = nodeById.value.get(id);
    if (n && KIND_MAP[n.kind]) ghosts.add(id);
  };
  for (const e of state.graph.edges) {
    if (home.has(e.srcId)) consider(e.dstId);
    if (home.has(e.dstId)) consider(e.srcId);
  }
  return ghosts;
});
const tabNodeIds = computed<Set<string>>(() => new Set([...partNodeIds.value, ...ghostIds.value]));

// ── base node/edge set for the active force tab ──
const baseNodes = computed(() => {
  if (isOntology.value) return ontoNodes.value;
  if (isPartTab.value) return state.graph.nodes.filter((n) => tabNodeIds.value.has(n.id));
  return state.graph.nodes;
});
const baseEdges = computed(() => {
  if (isOntology.value) return onto.edges;
  if (isPartTab.value)
    return state.graph.edges.filter((e) => tabNodeIds.value.has(e.srcId) && tabNodeIds.value.has(e.dstId));
  return state.graph.edges;
});

const visibleNodes = computed(() =>
  baseNodes.value.filter((n) => {
    const sp = KIND_MAP[n.kind]?.space;
    return sp ? active[sp] : true;
  }),
);
const visibleIds = computed(() => new Set(visibleNodes.value.map((n) => n.id)));
const visibleEdges = computed(() =>
  baseEdges.value.filter((e) => visibleIds.value.has(e.srcId) && visibleIds.value.has(e.dstId)),
);

// ── selection (ghost click = jump to home part tab) ──
function select(id: string | null) {
  if (isOntology.value) {
    focusedKind.value = id;
    return;
  }
  if (id && isPartTab.value && ghostIds.value.has(id)) {
    const part = KIND_MAP[nodeById.value.get(id)!.kind]?.part;
    if (part) setTab(part);
    state.selectedId = id;
    return;
  }
  state.selectedId = id;
}

function setMode(m: 'instance' | 'ontology') {
  graphMode.value = m;
  if (m === 'instance') focusedKind.value = null;
}
function jumpToInstance(id: string) {
  graphMode.value = 'instance';
  focusedKind.value = null;
  state.selectedId = id;
}

// re-frame when the mode (and thus the whole node set) swaps
watch(isOntology, () => setTimeout(() => graphRef.value?.fit(), 650));

// an instance selection (search palette, health card) landing while the
// graph is in ontology mode must escape back to instance mode.
watch(
  () => state.selectedId,
  (id) => {
    if (id && graphMode.value === 'ontology') {
      graphMode.value = 'instance';
      focusedKind.value = null;
    }
  },
);
</script>

<template>
  <div class="relative h-full w-full">
    <ForceGraph
      v-if="isForceTab"
      ref="graphRef"
      :key="activeTab"
      :nodes="visibleNodes"
      :edges="visibleEdges"
      :selected-id="isOntology ? focusedKind : state.selectedId"
      :dash="isOntology ? ontoDash : undefined"
      :persist="!isOntology"
      :ghost-ids="ghostIds"
      :namespace="namespace"
      @select="select"
    />
    <ThreadView v-else />

    <!-- top bar: title · tab strip · controls in one non-overlapping row
         (three absolutes at top-5 collided in narrow mains: the Fit/Relayout
         overlay sat on the Thread tab and swallowed its clicks) -->
    <div class="pointer-events-none absolute inset-x-5 top-5 flex flex-wrap items-start justify-between gap-3">
      <div v-if="isForceTab" class="min-w-0 flex-1">
        <h1 class="display truncate text-3xl">Knowledge graph</h1>
        <p class="mt-1 truncate font-mono text-[0.66rem] uppercase tracking-[0.12em] text-ink-400">
          {{ visibleNodes.length }} {{ isOntology ? 'kinds' : 'nodes' }} · {{ visibleEdges.length }} {{ isOntology ? 'relations' : 'edges' }} · drag to move · scroll to zoom
        </p>
      </div>
      <div v-else class="flex-1" />

      <div role="tablist" aria-label="Graph slices" class="pointer-events-auto flex shrink-0 border hairline bg-ink-900">
        <button
          v-for="t in TABS"
          :key="t.id"
          role="tab"
          :aria-selected="activeTab === t.id ? 'true' : 'false'"
          class="px-3 py-1.5 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] transition"
          :class="activeTab === t.id ? 'bg-white/[0.08] text-ink-100' : 'text-ink-400 hover:text-ink-200'"
          @click="setTab(t.id)"
        >{{ t.label }}</button>
      </div>

      <div v-if="isForceTab" class="pointer-events-auto flex shrink-0 flex-wrap justify-end gap-2">
      <button class="btn glass" @click="graphRef?.fit()" title="Fit to view">⤢ Fit</button>
      <button class="btn glass" @click="graphRef?.relayout()" title="Forget saved positions and re-run layout">↻ Relayout</button>
      <div v-if="activeTab === 'all'" class="flex border hairline">
        <button
          v-for="m in (['instance', 'ontology'] as const)"
          :key="m"
          class="px-3 py-1.5 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] transition"
          :class="graphMode === m ? 'bg-white/[0.08] text-ink-100' : 'text-ink-400 hover:text-ink-200'"
          @click="setMode(m)"
        >{{ m }}</button>
      </div>
      </div>
      <div v-if="!isForceTab" class="flex-1" />
    </div>

    <!-- bottom-left: legend / filters -->
    <div v-if="isForceTab" class="absolute bottom-5 left-5 flex flex-wrap gap-1.5 border hairline bg-ink-900 px-2.5 py-2">
      <button
        v-for="sp in Object.values(SPACES)"
        :key="sp.id"
        class="flex items-center gap-1.5 px-2 py-1 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] transition"
        :style="{
          color: active[sp.id] ? sp.hue : 'var(--color-ink-400)',
          background: active[sp.id] ? sp.glow : 'transparent',
        }"
        @click="toggle(sp.id)"
      >
        <span class="h-2 w-2" :style="{ background: active[sp.id] ? sp.hue : 'var(--color-ink-600)' }" />
        {{ sp.label }}
      </button>
    </div>

    <KindCard v-if="isOntology && focusedKind" :kind="focusedKind" @close="focusedKind = null" @jump="jumpToInstance" />
  </div>
</template>
