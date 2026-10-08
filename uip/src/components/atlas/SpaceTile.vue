<script setup lang="ts">
import type { SpaceDef } from '@/ontology';
defineProps<{ space: SpaceDef; count: number; open: number; kinds: { id: string; label: string; icon: string; n: number }[] }>();
const emit = defineEmits<{ open: [] }>();
</script>
<template>
  <button
    class="space-rule group flex min-w-0 flex-1 flex-col items-start gap-1 rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
    :style="{ '--hue': `var(--space-${space.id})` }" :data-space="space.id" @click="emit('open')"
  >
    <div class="flex w-full items-baseline gap-1.5">
      <span class="text-[13px] font-semibold">{{ space.label }}</span>
      <span class="text-[13px] tabular-nums text-muted-foreground">{{ count }}</span>
      <span v-if="open" class="ml-auto rounded-full bg-gap/15 px-1.5 text-[10px] font-medium text-gap" :title="`${open} open item(s)`">·{{ open }}?</span>
    </div>
    <div class="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{{ space.blurb }}</div>
    <div class="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
      <span v-for="k in kinds.slice(0, 6)" :key="k.id" class="text-foreground/75">{{ k.icon }} {{ k.label.toLowerCase() }} <span class="tabular-nums text-muted-foreground">{{ k.n }}</span></span>
      <span v-if="kinds.length > 6" class="text-muted-foreground">+{{ kinds.length - 6 }}</span>
    </div>
  </button>
</template>
