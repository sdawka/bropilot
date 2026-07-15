<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { SPACES, KIND_MAP, type Space } from '../../lib/schema';
import { state } from '../../lib/store';
import ForceGraph from '../graph/ForceGraph.vue';

const graphRef = ref<InstanceType<typeof ForceGraph> | null>(null);

const active = reactive<Record<Space, boolean>>({
  basics: true,
  problem: true,
  solution: true,
  crosscutting: true,
});

const visibleNodes = computed(() =>
  state.graph.nodes.filter((n) => {
    const sp = KIND_MAP[n.kind]?.space;
    return sp ? active[sp] : true;
  }),
);
const visibleIds = computed(() => new Set(visibleNodes.value.map((n) => n.id)));
const visibleEdges = computed(() =>
  state.graph.edges.filter((e) => visibleIds.value.has(e.srcId) && visibleIds.value.has(e.dstId)),
);

function toggle(sp: Space) {
  active[sp] = !active[sp];
}
function select(id: string | null) {
  state.selectedId = id;
}
</script>

<template>
  <div class="relative h-full w-full">
    <ForceGraph
      ref="graphRef"
      :nodes="visibleNodes"
      :edges="visibleEdges"
      :selected-id="state.selectedId"
      @select="select"
    />

    <!-- top-left: title -->
    <div class="pointer-events-none absolute left-5 top-5">
      <h1 class="display text-3xl">Knowledge graph</h1>
      <p class="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-ink-400">
        {{ visibleNodes.length }} nodes · {{ visibleEdges.length }} edges · drag to move · scroll to zoom
      </p>
    </div>

    <!-- top-right: controls -->
    <div class="absolute right-5 top-5 flex gap-2">
      <button class="btn glass" @click="graphRef?.fit()" title="Fit to view">⤢ Fit</button>
      <button class="btn glass" @click="graphRef?.relayout()" title="Forget saved positions and re-run layout">↻ Relayout</button>
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
  </div>
</template>
