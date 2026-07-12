<script setup lang="ts">
import { computed } from 'vue';
import { KIND_MAP, nodeHue, type GraphNode } from '../../lib/schema';
import { state, edgesOf } from '../../lib/store';

const props = defineProps<{ node: GraphNode }>();
const emit = defineEmits<{ (e: 'select'): void }>();

const def = computed(() => KIND_MAP[props.node.kind]);
const hue = computed(() => nodeHue(props.node));
const selected = computed(() => state.selectedId === props.node.id);
const links = computed(() => {
  const { outgoing, incoming } = edgesOf(props.node.id);
  return outgoing.length + incoming.length;
});
</script>

<template>
  <button
    class="group relative w-full overflow-hidden rounded-xl glass px-3.5 py-3 text-left transition-all duration-150 hover:-translate-y-0.5"
    :class="selected ? 'ring-1' : ''"
    :style="{
      '--hue': hue,
      boxShadow: selected ? `0 0 0 1px ${hue}, 0 10px 30px -16px ${hue}` : undefined,
    }"
    @click="emit('select')"
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
      <span
        v-if="links"
        class="shrink-0 rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold text-ink-300"
        :style="{ background: 'rgba(255,255,255,0.06)' }"
        :title="`${links} relationship${links === 1 ? '' : 's'}`"
        >🔗 {{ links }}</span
      >
    </div>
  </button>
</template>
