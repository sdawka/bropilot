<script setup lang="ts">
// Column header badge (CHECKS-SPEC §4): ⚠ n = weak + broken results touching the column's items;
// click filters the canvas to those items. Hidden at 0.
import { computed } from 'vue';
import type { Column } from '@/store/graph';
import { useGraphApi } from '@/chat/graphApi';
import { checksApi } from '@/checks/applyRepair';

const props = defineProps<{ col: Column }>();
const api = checksApi();
const g = useGraphApi();
const hit = computed(() => {
  const ids = new Set(props.col.items.map((i) => i.node.id));
  const touched = new Set<string>(); let n = 0;
  for (const r of Object.values(api.results.value ?? {})) {
    if (r.verdict !== 'weak' && r.verdict !== 'broken') continue;
    const mine = r.subjects.filter((s) => ids.has(s));
    if (!mine.length) continue;
    n++; mine.forEach((s) => touched.add(s));
  }
  return { n, ids: [...touched] };
});
</script>
<template>
  <button v-if="hit.n" type="button" class="shrink-0 rounded px-1 text-[11px] tabular-nums text-gap hover:bg-gap/10" data-check-badge
          :title="`${hit.n} weak or broken check(s) on ${hit.ids.length} item(s) here · click to filter`"
          @click.stop="g.dispatch({ verb: 'filter', ids: hit.ids })">⚠ {{ hit.n }}</button>
</template>
