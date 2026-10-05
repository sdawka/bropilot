<script setup lang="ts">
import { computed } from 'vue';
import { Check, X } from 'lucide-vue-next';
import type { ColItem } from '@/store/graph';
import { useGraph } from '@/store/graph';
import { kindIcon, hueOf, kindLabel } from '@/ontology';
import { flags } from '@/flags';
import EdgePill from '@/components/checks/EdgePill.vue';

const props = defineProps<{ item: ColItem; selected?: boolean; showKind?: boolean; compact?: boolean }>();
const emit = defineEmits<{ select: [] }>();
const g = useGraph();
const n = computed(() => props.item.node);
const hl = computed(() => g.highlightIds.value.includes(n.value.id));
const preview = computed(() => g.previewId.value === n.value.id);
const ghost = computed(() => props.item.ghost);
const removing = computed(() => ghost.value && (ghost.value.op === 'remove-edge' || ghost.value.op === 'remove-node'));
function verdict(v: 'accepted' | 'rejected') { if (ghost.value) ghost.value.verdict = ghost.value.verdict === v ? 'pending' : v; }
</script>

<template>
  <div
    role="option" :aria-selected="selected" :data-node="n.id" tabindex="-1"
    class="group relative flex cursor-default items-center gap-2 rounded-[5px] py-[5px] pl-3 pr-2 transition-colors"
    :class="[
      selected ? 'bg-accent text-foreground' : 'hover:bg-accent/60',
      item.draft || (ghost && !removing) ? 'draft-rule' : 'space-rule',
      hl ? 'hl' : '', preview ? 'ghost-hl' : '',
      ghost ? 'border border-dashed border-draft/70' : '',
      removing ? 'line-through opacity-70' : '',
      item.suspect && !removing ? 'border border-dashed border-gap/60' : '',
    ]"
    :style="{ '--hue': hueOf(n.kind) }"
    @click="emit('select')"
  >
    <span class="w-4 shrink-0 text-center text-[12px] leading-none">{{ kindIcon(n.kind) }}</span>
    <span class="min-w-0 flex-1">
      <span class="block truncate" :class="selected ? 'font-medium' : ''">{{ n.title }}</span>
      <span v-if="showKind || (item.draft && !compact)" class="block truncate text-[11px] text-muted-foreground">
        <template v-if="showKind">{{ kindLabel(n.kind) }}</template>
        <template v-if="item.draft"><span class="text-draft"> + in changes</span></template>
      </span>
    </span>
    <EdgePill v-if="item.edge" :edge-id="item.edge.id" />
    <span v-if="item.open" class="shrink-0 text-[11px] tabular-nums text-gap" :title="`${item.open} open item(s)`">⚠{{ item.open }}</span>
    <span v-if="ghost && flags.proposal === 'canvas'" class="flex shrink-0 gap-0.5" @click.stop>
      <button class="grid size-5 place-items-center rounded border" :class="ghost.verdict === 'accepted' ? 'border-draft bg-draft text-white' : 'text-muted-foreground'" title="Accept" @click="verdict('accepted')"><Check class="size-3" /></button>
      <button class="grid size-5 place-items-center rounded border" :class="ghost.verdict === 'rejected' ? 'border-destructive bg-destructive text-white' : 'text-muted-foreground'" title="Reject" @click="verdict('rejected')"><X class="size-3" /></button>
    </span>
    <span class="size-1.5 shrink-0 rounded-full" :class="selected ? 'bg-foreground' : 'bg-transparent'" />
  </div>
</template>
