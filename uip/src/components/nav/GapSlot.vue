<script setup lang="ts">
import type { GapSlot } from '@/store/traverse';
import { useGraph } from '@/store/graph';
import { kindLabel } from '@/ontology';
const props = defineProps<{ slot: GapSlot; dense?: boolean }>();
const g = useGraph();
const open = () => g.openGap(props.slot.kind, props.slot.parentId, props.slot.question);
</script>
<template>
  <button
    class="group flex w-full items-start gap-2 rounded-[5px] border border-dashed border-gap/50 px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:border-gap hover:bg-gap/5 hover:text-foreground"
    data-gap @click="open"
  >
    <span class="text-gap">┄</span>
    <span class="min-w-0 flex-1">
      <span class="font-medium text-foreground/80">+ {{ kindLabel(slot.kind || 'node').toLowerCase() }}</span>
      <span v-if="!dense">: {{ slot.question }}</span>
      <span v-else class="line-clamp-2 block">{{ slot.question }}</span>
    </span>
    <span class="shrink-0 rounded border px-1 text-[10px] group-hover:border-gap group-hover:text-gap">answer</span>
  </button>
</template>
