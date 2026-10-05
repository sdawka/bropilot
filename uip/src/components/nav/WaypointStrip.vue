<script setup lang="ts">
import type { Column } from '@/store/graph';
import { kindIcon, kindLabel, hueOf } from '@/ontology';
defineProps<{ col: Column }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>
<template>
  <section class="flex h-full w-[56px] shrink-0 flex-col items-center border-r bg-muted/40 py-2" :data-col="col.index" title="Waypoint (collapsed)">
    <div class="text-[10px] text-muted-foreground">via</div>
    <div class="text-[11px] font-medium">{{ kindLabel(col.kinds[0]).toLowerCase().slice(0, 6) }}</div>
    <div class="mb-2 text-[10px] tabular-nums text-muted-foreground">{{ col.items.length }}</div>
    <div class="scroll-thin flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
      <button
        v-for="it in col.items" :key="it.node.id" :title="`${kindLabel(it.node.kind)} · ${it.node.title}`"
        class="space-rule grid size-8 place-items-center rounded text-[13px]"
        :class="it.node.id === col.selectedId ? 'bg-accent ring-1 ring-foreground/30' : 'hover:bg-accent'"
        :style="{ '--hue': hueOf(it.node.kind) }"
        @click="emit('select', it.node.id)"
      >{{ kindIcon(it.node.kind) }}</button>
    </div>
  </section>
</template>
