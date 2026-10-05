<script setup lang="ts">
// human: round · agent: square · System One: ◆ (SPEC §4).
import type { Author } from '../types';
defineProps<{ author: Author }>();
</script>
<template>
  <span v-if="author.kind === 's1'" class="inline-flex size-4 shrink-0 items-center justify-center text-[11px] text-primary" :title="author.name">◆</span>
  <span v-else class="inline-flex size-4 shrink-0 items-center justify-center text-[9px] font-semibold uppercase text-primary-foreground"
        :class="author.kind === 'agent' ? 'rounded-[3px] bg-primary/75' : 'rounded-full bg-primary'" :title="author.name">{{ author.name.charAt(0) }}</span>
</template>
