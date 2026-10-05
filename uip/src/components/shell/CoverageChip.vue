<script setup lang="ts">
import { computed } from 'vue';
import { useGraph } from '@/store/graph';
import { coverage, unmetNeeds } from '@/store/traverse';
import { perspById, PERSPECTIVES } from '@/perspectives';

const g = useGraph();
const cov = computed(() => {
  const p = g.view.value.persp === 'raw' ? null : perspById[g.view.value.persp];
  return p ? coverage(g.ix.value, p) : null;
});
const gaps = computed(() => g.viewGraph.value.nodes.flatMap((n) => unmetNeeds(g.ix.value, n).map((u) => ({ n, u }))));
function firstGap() {
  const p = g.view.value.persp === 'raw' ? PERSPECTIVES[1] : perspById[g.view.value.persp];
  const inChain = gaps.value.find((x) => p.steps.some((s) => s.kinds.includes(x.n.kind))) ?? gaps.value[0];
  if (!inChain) return;
  const path = g.resolvePath(p.id, inChain.n.id);
  g.go(path ? p.id : g.view.value.persp, path ?? [inChain.n.id]);
  g.openGap(inChain.u.produces, inChain.n.id, inChain.u.question);
}
</script>
<template>
  <button class="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground" title="Jump to the first gap" @click="firstGap">
    <template v-if="cov"><span>coverage</span><span class="tabular-nums text-foreground">{{ cov.withData }}/{{ cov.total }}</span><span>·</span></template>
    <span class="tabular-nums" :class="gaps.length ? 'text-gap' : ''">{{ gaps.length }}</span><span>gaps</span>
  </button>
</template>
