<script setup lang="ts">
import { computed, watch } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { state } from '../../store';
import { deploymentLayout } from './layout';

const { fitView } = useVueFlow('arch-deployment');

const base = computed(() => deploymentLayout(state.graph));

const hasHighlight = computed(() => !!(state.highlight.nodes.length || state.highlight.edges.length));
const litNode = (id: string) => state.highlight.nodes.includes(id) || state.highlight.edges.some((eid) => {
  const e = state.graph.edges.find((e) => e.id === eid);
  return !!e && (e.src === id || e.dst === id);
});

const nodes = computed(() => base.value.nodes.map((n) => ({
  ...n,
  class: [hasHighlight.value && !litNode(n.id) ? 'dim' : '', state.selectedId === n.id ? 'selected' : ''].filter(Boolean).join(' '),
})));
const edges = computed(() => base.value.edges.map((e) => ({
  ...e,
  class: hasHighlight.value && !state.highlight.edges.includes(e.id) && !(litNode(e.source) && litNode(e.target)) ? 'dim' : '',
})));

function onPaneReady() { fitView(); }
watch(nodes, () => fitView(), { flush: 'post' });

function select(id: string) { state.selectedId = state.selectedId === id ? null : id; }
</script>

<template>
  <div class="arch-deployment" data-testid="arch-deployment">
    <VueFlow id="arch-deployment" :nodes="nodes" :edges="edges" :default-viewport="{ zoom: 0.8 }" :min-zoom="0.2" :max-zoom="1.5" @pane-ready="onPaneReady">
      <Background :gap="24" />
      <template #node-card="{ id, data }">
        <div class="dep-card" :class="'role-' + data.role" :data-node-id="id" :data-role="data.role" @click="select(id)">
          <div class="dep-title">{{ data.label }}</div>
          <ul v-if="data.hosted?.length" class="dep-hosted">
            <li v-for="h in data.hosted" :key="h" class="tag">{{ h }}</li>
          </ul>
        </div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.arch-deployment { height: 640px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
.dep-card { min-width: 190px; border: 1px solid var(--line); border-radius: 8px; padding: .5rem .6rem; background: var(--panel); cursor: pointer; }
.dep-card.role-audience { border-radius: 10px 10px 4px 10px; }
.dep-card.role-client { border-color: var(--kernel); }
.dep-card.role-store, .dep-card.role-cache, .dep-card.role-queue { border-style: dashed; }
.dep-card.role-external { border-style: dotted; }
.dep-title { font-weight: 600; font-size: .85rem; }
.dep-hosted { list-style: none; margin: .3rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: .2rem; }
:deep(.vue-flow__node.dim) { opacity: .25; }
:deep(.vue-flow__edge.dim) { opacity: .15; }
</style>
