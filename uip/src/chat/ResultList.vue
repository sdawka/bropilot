<script setup lang="ts">
// Ask reply: ≤7 rows, each with the edge (or missing edge) that put it there; "show all" filters.
import { ref } from 'vue';
import type { ResultRow } from './engine';
import { useGraphApi } from './graphApi';
import NodeChip from './NodeChip.vue';

const props = defineProps<{ head: string; rows: ResultRow[]; gap?: { kind: string; parentId: string; question: string } }>();
const g = useGraphApi();
const all = ref(false);
function showAll() { all.value = true; g.dispatch({ verb: 'filter', ids: props.rows.map((r) => r.id) }); }
</script>
<template>
  <div class="rounded-md border border-border bg-card p-2 text-sm">
    <div class="text-xs text-muted-foreground">{{ head }}</div>
    <ul class="mt-1 space-y-0.5">
      <li v-for="r in all ? rows : rows.slice(0, 7)" :key="r.id" class="flex min-w-0 items-center gap-1.5 text-xs">
        <NodeChip :id="r.id" class="shrink-0" /><span class="truncate text-muted-foreground" :title="r.reason">{{ r.reason }}</span>
      </li>
    </ul>
    <div class="mt-1 flex gap-2 text-[11px]">
      <button v-if="rows.length > 7 && !all" type="button" class="text-muted-foreground hover:underline" @click="showAll">show all {{ rows.length }} on canvas</button>
      <button v-else-if="rows.length" type="button" class="text-muted-foreground hover:underline" @click="g.dispatch({ verb: 'filter', ids: rows.map((r) => r.id) })">show on canvas</button>
      <button v-if="gap" type="button" class="text-gap hover:underline" @click="g.openGap(gap.kind, gap.parentId, gap.question)">┄ answer the gap</button>
    </div>
  </div>
</template>
