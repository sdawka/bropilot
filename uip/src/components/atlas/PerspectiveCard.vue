<script setup lang="ts">
import type { Perspective } from '@/types';
import type { HopStat } from '@/store/traverse';
import { kindLabel } from '@/ontology';
const props = defineProps<{ persp: Perspective; withData: number; total: number; stats: HopStat[] }>();
const emit = defineEmits<{ open: [] }>();
function stepRatio(si: number) {
  const st = props.stats.filter((s) => s.si === si);
  const parents = st.reduce((t, s) => Math.max(t, s.parents), 0);
  const linked = st.reduce((t, s) => Math.max(t, s.linked), 0);
  return parents ? linked / parents : 0;
}
</script>
<template>
  <button class="group grid w-full grid-cols-[88px_1fr_auto] items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent/60" @click="emit('open')">
    <span class="text-[13px] font-semibold">{{ persp.label }}</span>
    <span class="flex min-w-0 flex-wrap items-center gap-1 text-[12px]">
      <template v-for="(s, i) in persp.steps" :key="i">
        <span v-if="i" class="text-muted-foreground/60">›</span>
        <span :class="s.waypoint ? 'italic text-muted-foreground' : ''">
          <template v-if="s.waypoint">(</template>{{ s.kinds.map((k) => kindLabel(k).toLowerCase()).join('·') }}<template v-if="s.waypoint">)</template>
        </span>
        <span v-if="i" class="inline-block h-1.5 w-5 overflow-hidden rounded-full bg-muted" :title="`${Math.round(stepRatio(i) * 100)}% of parents linked`">
          <span class="block h-full rounded-full" :class="stepRatio(i) === 0 ? '' : stepRatio(i) < 0.34 ? 'bg-gap' : 'bg-foreground/50'" :style="{ width: `${Math.max(stepRatio(i) * 100, stepRatio(i) ? 12 : 0)}%` }" />
        </span>
      </template>
    </span>
    <span class="text-[12px] tabular-nums" :class="withData < total ? 'text-gap' : 'text-muted-foreground'">{{ withData }}/{{ total }} hops</span>
  </button>
</template>
