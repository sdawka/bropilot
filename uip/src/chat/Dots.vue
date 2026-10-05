<script setup lang="ts">
// Confidence as 3 dots by band (SPEC §1 #9); the exact value is in the tooltip.
import type { Band } from '../types';
const props = defineProps<{ band: Band; confidence: number }>();
const n = { act: 3, offer: 2, ask: 1 }[props.band];
</script>
<template>
  <span class="inline-flex gap-0.5 align-middle" :title="`${band} · ${confidence.toFixed(2)}`">
    <span v-for="i in 3" :key="i" class="size-1.5 rounded-full" :class="i <= n ? 'bg-foreground/70' : 'bg-foreground/15'" />
  </span>
</template>
