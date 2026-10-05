<script setup lang="ts">
import { computed } from 'vue';
import type { ProjectSummary } from '@/types';
import { SPACES } from '@/ontology';
const props = defineProps<{ project: ProjectSummary; h?: number }>();
const H = computed(() => props.h ?? 18);
const bars = computed(() => {
  const max = Math.max(1, ...SPACES.map((s) => props.project.counts?.[s.id] ?? 0));
  return SPACES.map((s) => { const n = props.project.counts?.[s.id] ?? 0; return { id: s.id, n, h: n ? Math.max(2, Math.round((Math.log1p(n) / Math.log1p(max)) * H.value)) : 1, label: s.label }; });
});
</script>
<template>
  <span class="relative inline-flex items-end gap-[2px]" :style="{ height: H + 'px' }" :title="bars.map((b) => `${b.label} ${b.n}`).join(' · ')">
    <template v-for="(b, i) in bars" :key="b.id">
      <span v-if="i === 4" class="mx-[2px] w-px self-stretch bg-border" />
      <span class="w-[5px] rounded-[1px]" :style="{ height: b.h + 'px', background: `var(--space-${b.id})`, opacity: b.n ? 1 : 0.25 }" />
    </template>
    <span v-if="project.openCount > 0" class="absolute -right-2 top-0 h-2 w-[2px] rounded bg-destructive" :title="`${project.openCount} open`" />
  </span>
</template>
