<script setup lang="ts">
import type { Nb } from '@/store/traverse';
import { kindIcon, hueOf } from '@/ontology';
import EdgePill from '@/components/checks/EdgePill.vue';
defineProps<{ label: string; items: Nb[] }>();
const emit = defineEmits<{ go: [nb: Nb] }>();
</script>
<template>
  <div v-if="items.length === 1" class="flex items-baseline gap-1.5 text-[12px]">
    <span class="shrink-0 font-mono text-[11px] text-muted-foreground">{{ label }}</span>
    <button class="truncate hover:underline" :class="items[0].edge.status === 'draft' ? 'text-draft' : ''" :style="items[0].edge.trace === 'suspect' ? 'text-decoration: underline dashed' : ''" @click="emit('go', items[0])">
      {{ kindIcon(items[0].other.kind) }} {{ items[0].other.title }}
    </button>
    <EdgePill :edge-id="items[0].edge.id" />
  </div>
  <div v-else class="text-[12px]">
    <div class="font-mono text-[11px] text-muted-foreground">{{ label }} <span class="tabular-nums">{{ items.length }}</span></div>
    <div class="mt-0.5 flex flex-wrap gap-1">
      <span
        v-for="nb in items" :key="nb.edge.id" class="space-rule inline-flex max-w-[200px] items-center gap-0.5 rounded border bg-background py-0.5 pl-2 pr-1 text-[11px] hover:bg-accent"
        :class="[nb.edge.status === 'draft' ? 'draft-rule border-draft/50' : '', nb.edge.trace === 'suspect' ? 'border-dashed border-gap' : '']"
        :style="{ '--hue': hueOf(nb.other.kind) }"
      ><button type="button" class="min-w-0 truncate" @click="emit('go', nb)">{{ kindIcon(nb.other.kind) }} {{ nb.other.title }}</button><EdgePill :edge-id="nb.edge.id" /></span>
    </div>
  </div>
</template>
