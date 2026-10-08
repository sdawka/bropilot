<script setup lang="ts">
// A check verdict (CHECKS-SPEC §4): solid ●●●, weak ●●○ amber, broken ●○○ red, unknown ○○○ grey;
// pending = one pulsing dot. `words` mode shows the finding as a chip instead.
import { computed } from 'vue';
import type { Verdict } from '@/checks/types';
const props = defineProps<{ verdict?: Verdict; pending?: boolean; finding?: string; words?: boolean; title?: string }>();
const filled = computed(() => ({ solid: 3, weak: 2, broken: 1, unknown: 0 })[props.verdict ?? 'unknown']);
const tone = computed(() => ({ solid: 'bg-foreground/60', weak: 'bg-gap', broken: 'bg-destructive', unknown: 'bg-transparent' })[props.verdict ?? 'unknown']);
const chip = computed(() => ({ solid: 'text-muted-foreground border-border', weak: 'text-gap border-gap/50', broken: 'text-destructive border-destructive/50', unknown: 'text-muted-foreground border-dashed border-border' })[props.verdict ?? 'unknown']);
</script>
<template>
  <span v-if="pending && !verdict" class="inline-flex items-center align-middle" :title="title ?? 'checking…'" data-verdict="pending">
    <span class="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
  </span>
  <span v-else-if="words" class="inline-flex items-center rounded border px-1 text-[10px] leading-[14px]" :class="[chip, pending ? 'animate-pulse' : '']" :title="title" :data-verdict="verdict">{{ finding ?? verdict }}</span>
  <span v-else class="inline-flex items-center gap-[2px] align-middle" :class="pending ? 'animate-pulse' : ''" :title="title" :data-verdict="verdict">
    <span v-for="i in 3" :key="i" class="size-1.5 rounded-full border"
          :class="i <= filled ? [tone, 'border-transparent'] : verdict === 'unknown' || !verdict ? 'border-muted-foreground/50' : 'border-foreground/20'" />
  </span>
</template>
