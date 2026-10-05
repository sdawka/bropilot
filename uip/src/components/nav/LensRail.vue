<script setup lang="ts">
import type { Perspective } from '@/types';
import { kindLabel } from '@/ontology';
import { flags } from '@/flags';
defineProps<{ persp: Perspective; current: number; titles?: (string | null)[]; label?: string }>();
const emit = defineEmits<{ step: [i: number] }>();
</script>
<template>
  <div class="flex flex-wrap items-center gap-1 text-[12px]">
    <span class="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">{{ label ?? 'lens' }} {{ persp.label }}</span>
    <template v-for="(s, i) in persp.steps" :key="i">
      <span v-if="i" class="text-muted-foreground/60">›</span>
      <button
        class="rounded px-1.5 py-0.5"
        :class="[i === current ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground', s.waypoint ? 'text-[11px] italic' : '', s.waypoint && flags.waypoints === 'collapse' ? 'opacity-60' : '']"
        :title="titles?.[i] ?? s.kinds.map((k) => kindLabel(k)).join(' · ')"
        @click="emit('step', i)"
      >
        <template v-if="s.waypoint">(</template>{{ s.kinds.map((k) => kindLabel(k).toLowerCase()).join('·') }}<template v-if="s.waypoint">)</template>
        <span v-if="titles?.[i]" class="ml-1 opacity-70">{{ titles[i] }}</span>
      </button>
    </template>
  </div>
</template>
