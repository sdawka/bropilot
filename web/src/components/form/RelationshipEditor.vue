<script setup lang="ts">
import { ref, computed } from 'vue';
import { EDGE_TYPES, KIND_MAP, nodeHue, type GraphNode } from '../../lib/schema';
import { state, edgesOf, addEdge, removeEdge, getNode } from '../../lib/store';

const props = defineProps<{ node: GraphNode }>();

const newType = ref('uses');
const newTarget = ref('');

const links = computed(() => edgesOf(props.node.id));

const targets = computed(() =>
  state.graph.nodes
    .filter((n) => n.id !== props.node.id)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title)),
);

function label(id: string) {
  const n = getNode(id);
  return n ? n.title : id;
}
function dot(id: string) {
  const n = getNode(id);
  return n ? nodeHue(n) : '#5b667e';
}
function icon(id: string) {
  const n = getNode(id);
  return n ? KIND_MAP[n.kind]?.icon : '•';
}

function add() {
  if (!newTarget.value) return;
  addEdge(props.node.id, newTarget.value, newType.value);
  newTarget.value = '';
}
function typeLabel(t: string) {
  return EDGE_TYPES.find((e) => e.type === t)?.label ?? t;
}
</script>

<template>
  <div class="space-y-3">
    <!-- existing edges -->
    <ul v-if="links.outgoing.length || links.incoming.length" class="space-y-1.5">
      <li
        v-for="e in links.outgoing"
        :key="e.id"
        class="group flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs"
      >
        <span class="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[0.66rem] text-accent">{{ typeLabel(e.type) }} →</span>
        <span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{ background: dot(e.dstId) }" />
        <span class="truncate text-ink-200">{{ icon(e.dstId) }} {{ label(e.dstId) }}</span>
        <button class="btn-ghost btn ml-auto shrink-0 !px-1.5 !py-0.5 opacity-0 group-hover:opacity-100" @click="removeEdge(e.id)" title="Remove">✕</button>
      </li>
      <li
        v-for="e in links.incoming"
        :key="e.id"
        class="group flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs"
      >
        <span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{ background: dot(e.srcId) }" />
        <span class="truncate text-ink-200">{{ icon(e.srcId) }} {{ label(e.srcId) }}</span>
        <span class="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[0.66rem] text-ink-300">→ {{ typeLabel(e.type) }}</span>
        <button class="btn-ghost btn ml-auto shrink-0 !px-1.5 !py-0.5 opacity-0 group-hover:opacity-100" @click="removeEdge(e.id)" title="Remove">✕</button>
      </li>
    </ul>
    <p v-else class="text-xs text-ink-400">No relationships yet.</p>

    <!-- add edge -->
    <div class="rounded-lg border border-dashed border-white/10 p-2.5">
      <div class="mb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-400">Add relationship</div>
      <div class="flex flex-col gap-2">
        <select v-model="newType" class="field !py-1.5 text-xs" :title="EDGE_TYPES.find((e) => e.type === newType)?.hint">
          <option v-for="t in EDGE_TYPES" :key="t.type" :value="t.type">this {{ t.label }} …</option>
        </select>
        <select v-model="newTarget" class="field !py-1.5 text-xs">
          <option value="">Choose a target node…</option>
          <option v-for="t in targets" :key="t.id" :value="t.id">{{ KIND_MAP[t.kind]?.icon }} {{ t.title }}</option>
        </select>
        <button class="btn btn-primary justify-center" :disabled="!newTarget" @click="add">Link</button>
      </div>
    </div>
  </div>
</template>
