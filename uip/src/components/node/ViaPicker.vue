<script setup lang="ts">
// "via" picker: several upward paths to a chain root; pick one (remembered per session by the store).
import { useGraph } from '@/store/graph';
import { kindIcon, kindLabel } from '@/ontology';
defineProps<{ paths: string[][]; title?: string }>();
const emit = defineEmits<{ pick: [path: string[]] }>();
const g = useGraph();
const t = (id: string) => g.byId(id)?.title ?? id;
</script>
<template>
  <div class="w-[320px]">
    <div class="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">{{ title ?? 'Several ways in. Reach it via…' }}</div>
    <button
      v-for="p in paths" :key="p.join('/')"
      class="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
      @click="emit('pick', p)"
    >
      <span class="text-[12px] font-medium">
        <template v-if="p.length > 1">{{ kindIcon(g.byId(p[p.length - 2])?.kind ?? '') }} {{ kindLabel(g.byId(p[p.length - 2])?.kind ?? '') }} · {{ t(p[p.length - 2]) }}</template>
        <template v-else>root</template>
      </span>
      <span class="line-clamp-1 text-[11px] text-muted-foreground">{{ p.map(t).join(' › ') }}</span>
    </button>
  </div>
</template>
