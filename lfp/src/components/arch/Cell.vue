<script setup lang="ts">
import { computed, watch } from 'vue';
import { VueFlow, useVueFlow, Handle, Position } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { state } from '../../store';
import { cellLayout, governsOf, type Circuit } from './layout';

const props = defineProps<{ moduleId: string }>();
const { fitView } = useVueFlow('arch-cell-' + props.moduleId);

const built = computed(() => cellLayout(state.graph, props.moduleId));

const activeCircuit = computed<Circuit | undefined>(() => {
  const sel = state.selectedId;
  if (!sel) return undefined;
  return built.value.circuits.find((c) => c.ifaceId === sel);
});
// clicking a rule/thing keeps the existing governs-based dim (independent of the interface circuit dim)
const selectedThingOrRule = computed(() => {
  const id = state.selectedId;
  const n = id ? state.graph.nodes.find((n) => n.id === id) : undefined;
  return n && (n.kind === 'thing' || n.kind === 'rule') ? n : undefined;
});
function governsDims(id: string): boolean {
  const sel = selectedThingOrRule.value;
  if (!sel) return false;
  if (sel.kind === 'thing') return id !== sel.id && built.value.rules.some((r) => r.id === id) && !governsOf(state.graph, id).includes(sel.id);
  if (sel.kind === 'rule') return id !== sel.id && built.value.things.some((t) => t.id === id) && !governsOf(state.graph, sel.id).includes(id);
  return false;
}
const hasHighlight = computed(() => !!(state.highlight.nodes.length || state.highlight.edges.length));
const litNode = (id: string) => state.highlight.nodes.includes(id) || state.highlight.edges.some((eid) => {
  const e = state.graph.edges.find((e) => e.id === eid);
  return !!e && (e.src === id || e.dst === id);
});

function circuitDims(id: string): boolean {
  const c = activeCircuit.value;
  if (!c) return false;
  if (id === built.value.membraneId || id === `iface-${c.ifaceId}`) return false;
  return !(c.ruleIds.includes(id) || c.thingIds.includes(id) || c.eventIds.includes(id));
}

const nodes = computed(() => built.value.nodes.map((n) => {
  const flowDim = hasHighlight.value && !litNode(n.id) && n.id !== built.value.membraneId;
  const dim = flowDim || circuitDims(n.id) || governsDims(n.id);
  return { ...n, class: [dim ? 'dim' : '', state.selectedId === n.id ? 'selected' : ''].filter(Boolean).join(' ') };
}));
const edges = computed(() => built.value.edges.map((e) => {
  const circuit = e.data?.circuit as string | undefined;
  const isActive = !activeCircuit.value || circuit === activeCircuit.value.ifaceId;
  const flowDim = hasHighlight.value && !(litNode(e.source) && litNode(e.target));
  return {
    ...e,
    type: 'default' as const,
    class: [(e.data?.class as string) ?? '', !isActive || flowDim ? 'dim' : ''].filter(Boolean).join(' '),
    domAttributes: (circuit ? { 'data-circuit': circuit } : undefined) as Record<string, unknown> | undefined,
  };
}));

function select(id: string) { state.selectedId = state.selectedId === id ? null : id; }
function onPaneReady() { fitView(); }
watch(() => props.moduleId, () => fitView(), { flush: 'post' });
</script>

<template>
  <div class="arch-cell" data-testid="arch-cell" :data-module-id="moduleId">
    <VueFlow :id="'arch-cell-' + moduleId" :nodes="nodes" :edges="edges" :default-viewport="{ zoom: 0.75 }" :min-zoom="0.2" :max-zoom="1.5" @pane-ready="onPaneReady">
      <Background :gap="24" />
      <template #node-membrane="{ id, data }">
        <div class="membrane" :data-node-id="id" :data-module-id="data.moduleId">
          <div class="membrane-title">{{ data.label }}</div>
          <Handle v-for="i in built.inOnly" :key="'in-' + i.id" type="target" :position="Position.Left" :id="'in-' + i.id"
                  class="port port-in" :style="{ top: (30 + built.inOnly.indexOf(i) * 60) + 'px' }"
                  :data-node-id="'in-' + i.id" @click.stop="select(i.id)" :title="i.title" />
          <Handle v-for="i in built.outOnly" :key="'out-' + i.id" type="source" :position="Position.Right" :id="'out-' + i.id"
                  class="port port-out" :style="{ top: (30 + built.outOnly.indexOf(i) * 60) + 'px' }"
                  :data-node-id="'out-' + i.id" @click.stop="select(i.id)" :title="i.title" />
          <Handle v-for="i in built.bothIfaces" :key="'both-out-' + i.id" type="source" :position="Position.Right" :id="'out-' + i.id"
                  class="port port-out" :style="{ top: (30 + built.bothIfaces.indexOf(i) * 90) + 'px' }"
                  :data-node-id="'out-' + i.id" @click.stop="select(i.id)" :title="i.title" />
        </div>
      </template>
      <template #node-iface="{ id, data }">
        <div class="iface-node" :data-node-id="id" :class="{ selected: state.selectedId === data.ifaceId }" @click.stop="select(data.ifaceId)">
          <Handle type="target" :position="Position.Left" :id="'in-' + data.ifaceId" :data-node-id="'in-' + data.ifaceId" />
          🔌 {{ data.label }}
        </div>
      </template>
      <template #node-store="{ data }">
        <div class="store-band">🗄️ data model — {{ data.label }}</div>
      </template>
      <template #node-rule="{ id, data }">
        <div class="cell-item rule" :data-node-id="id" :class="{ selected: state.selectedId === id }" @click.stop="select(data.nodeId)">⚖️ {{ data.label }}</div>
      </template>
      <template #node-thing="{ id, data }">
        <div class="cell-item thing" :data-node-id="id" :class="{ selected: state.selectedId === id }" @click.stop="select(data.nodeId)">🔷 {{ data.label }}</div>
      </template>
      <template #node-event="{ id, data }">
        <div class="cell-item event" :data-node-id="id" :class="{ selected: state.selectedId === id }" @click.stop="select(data.nodeId)">⚡ {{ data.label }}</div>
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.arch-cell { height: 660px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
.membrane { width: 100%; height: 100%; border: 3px solid var(--kernel); border-radius: 40px; background: rgba(58,63,143,.04); position: relative; }
.membrane-title { position: absolute; top: -.9rem; left: 1rem; background: var(--bg); padding: 0 .5rem; font-weight: 600; font-size: .85rem; }
.port { width: 12px; height: 12px; background: var(--kernel); border: 2px solid var(--panel); cursor: pointer; }
.iface-node { box-sizing: border-box; width: 100%; height: 100%; display: flex; align-items: center; gap: .25rem; overflow: hidden; background: var(--panel); border: 2px solid var(--kernel); border-radius: 8px; padding: 0 .5rem; font-size: .78rem; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; }
.iface-node.selected { outline: 2px solid var(--ink); }
.store-band { box-sizing: border-box; width: 100%; height: 100%; background: repeating-linear-gradient(45deg, #eee, #eee 8px, #f6f5f1 8px, #f6f5f1 16px); border: 1px dashed var(--muted); border-radius: 8px; display: flex; align-items: flex-start; overflow: hidden; padding: .3rem .5rem; font-size: .7rem; color: var(--muted); }
.cell-item { box-sizing: border-box; width: 100%; height: 100%; display: flex; align-items: center; gap: .2rem; overflow: hidden; border: 1px solid var(--line); border-radius: 6px; padding: 0 .45rem; font-size: .74rem; background: var(--panel); cursor: pointer; white-space: nowrap; text-overflow: ellipsis; }
.cell-item.rule { border-color: var(--said); }
.cell-item.event { border-color: var(--inferred); }
.cell-item.selected { outline: 2px solid var(--ink); }
:deep(.vue-flow__node) { overflow: visible; }
:deep(.vue-flow__node.dim), :deep(.vue-flow__handle.dim) { opacity: .2; }
:deep(.vue-flow__edge.dim) { opacity: .12; }
:deep(.vue-flow__edge.circuit-0 .vue-flow__edge-path) { stroke: #2f7d4f; }
:deep(.vue-flow__edge.circuit-1 .vue-flow__edge-path) { stroke: #b8541a; }
:deep(.vue-flow__edge.circuit-2 .vue-flow__edge-path) { stroke: #3a3f8f; }
:deep(.vue-flow__edge.circuit-3 .vue-flow__edge-path) { stroke: #a02b6f; }
:deep(.vue-flow__edge.circuit-4 .vue-flow__edge-path) { stroke: #1a7f9b; }
:deep(.vue-flow__edge.circuit-5 .vue-flow__edge-path) { stroke: #9b7a1a; }
:deep(.vue-flow__edge.circuit-6 .vue-flow__edge-path) { stroke: #6b4fa0; }
:deep(.vue-flow__edge.circuit-7 .vue-flow__edge-path) { stroke: #4f8fa0; }
</style>
