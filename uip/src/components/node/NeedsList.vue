<script setup lang="ts">
import { computed } from 'vue';
import type { Node } from '@/types';
import { useGraph } from '@/store/graph';
import { needsStatus } from '@/store/traverse';
import { edgeLabel } from '@/ontology';
const props = defineProps<{ node: Node }>();
const g = useGraph();
const needs = computed(() => needsStatus(g.ix.value, props.node));
</script>
<template>
  <div v-if="needs.length" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
    <span class="text-[10px] uppercase tracking-wide text-muted-foreground">needs</span>
    <span v-for="n in needs" :key="n.need.edge + n.need.dir" class="flex items-center gap-1">
      <span :class="n.ok ? 'text-draft' : 'text-gap'">{{ n.ok ? '✓' : '✗' }}</span>
      <span>{{ n.need.dir === 'in' ? '←' : '' }}{{ edgeLabel(n.need.edge) }} ≥{{ n.need.min }}</span>
      <span class="text-muted-foreground tabular-nums">({{ n.have }})</span>
      <button v-if="!n.ok" class="rounded border border-dashed border-gap/60 px-1 text-[10px] text-gap hover:bg-gap/10" @click="g.openGap(n.need.produces ?? '', node.id, n.question)">ask</button>
    </span>
  </div>
</template>
