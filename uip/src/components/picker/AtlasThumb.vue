<script setup lang="ts">
import type { ProjectSummary } from '@/types';
import { SPACES } from '@/ontology';
defineProps<{ project: ProjectSummary }>();
const short: Record<string, string> = { basics: 'B', problem: 'P', hypothesis: 'H', solution: 'S', current: 'C', planned: 'Pl', effects: 'E' };
</script>
<template>
  <div class="grid grid-cols-[1fr_1fr_1fr_2fr] gap-1 rounded-md border bg-background p-2">
    <div v-for="s in SPACES.filter((x) => x.layer === 'representation')" :key="s.id" class="space-rule rounded bg-card px-1.5 py-1" :style="{ '--hue': `var(--space-${s.id})` }">
      <div class="text-[10px] text-muted-foreground">{{ short[s.id] }}</div><div class="text-[13px] font-semibold tabular-nums">{{ project.counts?.[s.id] ?? 0 }}</div>
    </div>
    <div class="col-span-4 grid grid-cols-3 gap-1">
      <div v-for="s in SPACES.filter((x) => x.layer === 'reality')" :key="s.id" class="space-rule rounded bg-card px-1.5 py-1" :style="{ '--hue': `var(--space-${s.id})` }">
        <div class="text-[10px] text-muted-foreground">{{ short[s.id] }}</div><div class="text-[13px] font-semibold tabular-nums">{{ project.counts?.[s.id] ?? 0 }}</div>
      </div>
    </div>
  </div>
</template>
