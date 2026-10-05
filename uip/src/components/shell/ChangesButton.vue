<script setup lang="ts">
import { GitPullRequestArrow } from 'lucide-vue-next';
import { useGraph } from '@/store/graph';
const g = useGraph();
</script>
<template>
  <RouterLink :to="`/p/${g.view.value.project}/changes`" class="flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground" active-class="!text-foreground bg-accent">
    <GitPullRequestArrow class="size-3.5" />changes
    <span v-if="g.openChangesets.value.length" class="rounded-full bg-draft px-1.5 text-[10px] font-medium leading-4 text-white tabular-nums">{{ g.openChangesets.value.length }}</span>
  </RouterLink>
</template>
