<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { SPACES, KIND_MAP, ontologyGraph, ONTOLOGY, type Space } from '../../lib/schema';
import { state, nodesByKind } from '../../lib/store';
import { graphMode, focusedKind } from '../../lib/graphMode';
import ForceGraph from '../graph/ForceGraph.vue';
import KindCard from '../graph/KindCard.vue';

const graphRef = ref<InstanceType<typeof ForceGraph> | null>(null);

const active = reactive<Record<Space, boolean>>({
  basics: true,
  problem: true,
  solution: true,
  crosscutting: true,
});

const isOntology = computed(() => graphMode.value === 'ontology');
const onto = ontologyGraph();

// Strength per projected edge id → stroke-dasharray (canonical solid).
const DASH: Record<string, string> = { canonical: '', typical: '6 4', possible: '2 5' };
const ontoDash: Record<string, string> = Object.fromEntries(
  ONTOLOGY.map((t) => [`o-${t.src}-${t.type}-${t.dst}`, DASH[t.strength]]),
);

// Ontology-mode node titles carry the instance count as a lightweight badge.
const ontoNodes = computed(() =>
  onto.nodes.map((n) => ({ ...n, title: `${n.title} · ${nodesByKind(n.kind).length}` })),
);

const sourceNodes = computed(() => (isOntology.value ? ontoNodes.value : state.graph.nodes));
const sourceEdges = computed(() => (isOntology.value ? onto.edges : state.graph.edges));

const visibleNodes = computed(() =>
  sourceNodes.value.filter((n) => {
    const sp = KIND_MAP[n.kind]?.space;
    return sp ? active[sp] : true;
  }),
);
const visibleIds = computed(() => new Set(visibleNodes.value.map((n) => n.id)));
const visibleEdges = computed(() =>
  sourceEdges.value.filter((e) => visibleIds.value.has(e.srcId) && visibleIds.value.has(e.dstId)),
);

function toggle(sp: Space) {
  active[sp] = !active[sp];
}
function select(id: string | null) {
  if (isOntology.value) focusedKind.value = id;
  else state.selectedId = id;
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
</script>

<template>
  <div class="relative h-full w-full">
    <ForceGraph
      ref="graphRef"
      :nodes="visibleNodes"
      :edges="visibleEdges"
      :selected-id="isOntology ? focusedKind : state.selectedId"
      :dash="isOntology ? ontoDash : undefined"
      @select="select"
    />

    <!-- top-left: title -->
    <div class="pointer-events-none absolute left-5 top-5">
      <h1 class="display text-3xl">Knowledge graph</h1>
      <p class="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-ink-400">
        {{ visibleNodes.length }} {{ isOntology ? 'kinds' : 'nodes' }} · {{ visibleEdges.length }} {{ isOntology ? 'relations' : 'edges' }} · drag to move · scroll to zoom
      </p>
    </div>

    <!-- top-right: controls -->
    <div class="absolute right-5 top-5 flex gap-2">
      <button class="btn glass" @click="graphRef?.fit()" title="Fit to view">⤢ Fit</button>
      <button class="btn glass" @click="graphRef?.relayout()" title="Forget saved positions and re-run layout">↻ Relayout</button>
      <div class="flex border hairline">
        <button
          v-for="m in (['instance', 'ontology'] as const)"
          :key="m"
          class="px-3 py-1.5 font-mono text-[0.64rem] font-semibold uppercase tracking-[0.12em] transition"
          :class="graphMode === m ? 'bg-white/[0.08] text-ink-100' : 'text-ink-400 hover:text-ink-200'"
          @click="setMode(m)"
        >{{ m }}</button>
      </div>
    </div>

    <!-- bottom-left: legend / filters -->
    <div class="absolute bottom-5 left-5 flex flex-wrap gap-1.5 border hairline bg-ink-900 px-2.5 py-2">
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
