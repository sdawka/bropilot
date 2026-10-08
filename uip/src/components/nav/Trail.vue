<script setup lang="ts">
import { computed } from 'vue';
import { useGraph } from '@/store/graph';
import { kindIcon, edgeLabel } from '@/ontology';
import { perspLabel } from '@/perspectives';

const g = useGraph();
const crumbs = computed(() => {
  const cols = g.columns.value;
  return g.segments.value.map((s, i) => {
    const n = g.byId(s.id);
    const col = cols[i];
    let verb = '';
    if (i > 0 && col) {
      const e = col.edges[0];
      verb = col.via ? `~${edgeLabel(col.via.edge)}→` : e ? (e.dir === 'out' ? `─${edgeLabel(e.edge)}→` : `←${edgeLabel(e.edge)}─`) : '›';
      if (col.waypoint) verb = '⋯';
    }
    return { i, id: s.id, title: n?.title ?? s.id, icon: kindIcon(n?.kind ?? ''), verb };
  });
});
const viaChat = computed(() => g.lastMove.value?.source === 'chat');
const key = computed(() => g.segments.value.map((s) => s.id).join('/'));
</script>
<template>
  <div class="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[12px]">
    <RouterLink :to="`/p/${g.view.value.project}`" class="text-muted-foreground hover:text-foreground">◎ {{ g.project.value?.name }}</RouterLink>
    <span class="text-muted-foreground/60">›</span>
    <button class="text-muted-foreground hover:text-foreground" @click="g.popTo(0)">{{ perspLabel(g.view.value.persp) }}</button>
    <template v-for="c in crumbs" :key="c.i === crumbs.length - 1 ? key : c.i + c.id">
      <span class="font-mono text-[10px] text-muted-foreground/70">{{ c.i === 0 ? '›' : c.verb }}</span>
      <button
        class="max-w-[200px] truncate rounded px-1"
        :class="c.i === crumbs.length - 1 ? 'pulse-once font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'"
        @click="g.popTo(c.i + 1)"
      >{{ c.icon }} {{ c.title }}</button>
    </template>
    <span v-if="viaChat && crumbs.length" class="ml-1 rounded-full border px-1.5 text-[10px] text-muted-foreground">via chat</span>
  </div>
</template>
