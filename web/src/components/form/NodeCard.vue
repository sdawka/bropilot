<script setup lang="ts">
import { computed } from 'vue';
import { KIND_MAP, EDGE_TYPE_LABELS, nodeHue, type GraphNode } from '../../lib/schema';
import { state, edgesOf, getNode } from '../../lib/store';

const props = defineProps<{ node: GraphNode }>();
const emit = defineEmits<{ (e: 'select'): void }>();

const def = computed(() => KIND_MAP[props.node.kind]);
const hue = computed(() => nodeHue(props.node));
const selected = computed(() => state.selectedId === props.node.id);

const MAX_CHIPS = 3;

// connected nodes, shown as clickable chips
const connections = computed(() => {
  const { outgoing, incoming } = edgesOf(props.node.id);
  const all = [
    ...outgoing.map((e) => ({ id: e.dstId, type: e.type, out: true })),
    ...incoming.map((e) => ({ id: e.srcId, type: e.type, out: false })),
  ]
    .map((c) => {
      const n = getNode(c.id);
      return n ? { ...c, node: n } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  return { chips: all.slice(0, MAX_CHIPS), extra: all.length - Math.min(all.length, MAX_CHIPS), total: all.length };
});

function jump(id: string) {
  state.selectedId = id;
}
function chipTitle(c: { node: GraphNode; type: string; out: boolean }) {
  return c.out
    ? `${props.node.title} ${EDGE_TYPE_LABELS[c.type] ?? c.type} ${c.node.title}`
    : `${c.node.title} ${EDGE_TYPE_LABELS[c.type] ?? c.type} ${props.node.title}`;
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="group relative w-full cursor-pointer overflow-hidden rounded-xl glass px-3.5 py-3 text-left transition-all duration-150 hover:-translate-y-0.5"
    :class="selected ? 'ring-1' : ''"
    :style="{
      '--hue': hue,
      boxShadow: selected ? `0 0 0 1px ${hue}, 0 10px 30px -16px ${hue}` : undefined,
    }"
    @click="emit('select')"
    @keydown.enter="emit('select')"
  >
    <span class="absolute inset-y-0 left-0 w-1" :style="{ background: hue }" />
    <div class="flex items-start gap-2.5 pl-1.5">
      <span class="text-base leading-none" aria-hidden="true">{{ def?.icon }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h4 class="truncate text-sm font-semibold text-ink-100">{{ node.title || 'Untitled' }}</h4>
        </div>
        <p v-if="node.description" class="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-300">
          {{ node.description }}
        </p>
      </div>
    </div>

    <!-- connections — editorial citations -->
    <div v-if="connections.total" class="mt-3 border-t hairline pl-1.5 pt-2">
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="c in connections.chips"
          :key="`${c.id}-${c.type}-${c.out}`"
          class="edge-cite"
          :style="{ borderLeftColor: nodeHue(c.node) }"
          :title="chipTitle(c)"
          @click.stop="jump(c.id)"
        >
          <span :class="c.out ? 'text-ink-100' : 'text-ink-400'">{{ c.out ? '→' : '←' }}</span>
          <span class="edge-type" :style="{ color: nodeHue(c.node) }">{{ EDGE_TYPE_LABELS[c.type] ?? c.type }}</span>
          <span class="truncate">{{ c.node.title || 'Untitled' }}</span>
        </button>
        <span v-if="connections.extra > 0" class="label">+{{ connections.extra }}</span>
      </div>
    </div>
  </div>
</template>
