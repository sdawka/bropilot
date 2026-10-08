<script setup lang="ts">
// The verdict of one edge's solidity check, beside the edge in a column row or node-pane chip
// (CHECKS-SPEC §4). Hover/focus opens evidence, repairs, model · confidence · age and Re-check.
import { computed, onMounted, ref, watch } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { flags } from '@/flags';
import VerdictDots from './VerdictDots.vue';
import { age, applyRepair, checkLabel, checksApi, modelTag, orderedRepairs } from '@/checks/applyRepair';

const props = defineProps<{ edgeId: string }>();
const api = checksApi();
const r = computed(() => { void api.results.value; return api.forEdge(props.edgeId); });
const pending = computed(() => api.isPending([`edge:${props.edgeId}`]));
const show = computed(() => flags.verdictStyle !== 'hidden' && (r.value || pending.value));
const open = ref(false);
let t: ReturnType<typeof setTimeout> | undefined;
const enter = () => { clearTimeout(t); t = setTimeout(() => (open.value = true), 180); };
const leave = () => { clearTimeout(t); t = setTimeout(() => (open.value = false), 220); };
const lazyEnsure = () => { if (flags.checks === 'lazy' && flags.verdictStyle !== 'hidden') void api.ensure({ edgeIds: [props.edgeId] }); };
onMounted(lazyEnsure);
watch(() => props.edgeId, lazyEnsure);
</script>

<template>
  <Popover v-if="show" :open="open" @update:open="(v: boolean) => (open = v)">
    <PopoverAnchor as-child>
      <button type="button" class="inline-flex shrink-0 items-center rounded px-0.5 py-0.5 outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
              :data-edge-pill="edgeId" :aria-label="r ? `${checkLabel(r.checkId)}: ${r.verdict}` : 'checking'"
              @mouseenter="enter" @mouseleave="leave" @focus="open = true" @blur="leave" @click.stop="open = !open">
        <VerdictDots :verdict="r?.verdict" :pending="pending" :finding="r?.finding" :words="flags.verdictStyle === 'words'" />
      </button>
    </PopoverAnchor>
    <PopoverContent side="right" align="start" class="w-[320px] p-2.5 text-[12px]" @mouseenter="enter" @mouseleave="leave" @open-auto-focus.prevent @click.stop>
      <template v-if="r">
        <div class="flex items-center gap-1.5">
          <VerdictDots :verdict="r.verdict" />
          <span class="font-medium">{{ checkLabel(r.checkId) }}</span>
          <span class="text-muted-foreground">· {{ r.finding }}</span>
        </div>
        <p class="mt-1 leading-snug text-foreground/90">{{ r.evidence }}</p>
        <div v-if="r.repairs.length" class="mt-2 flex flex-wrap gap-1">
          <button v-for="(rp, i) in orderedRepairs(r)" :key="i" type="button"
                  class="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent" :class="i === 0 ? 'border-foreground/40 font-medium' : 'text-muted-foreground'"
                  @click="applyRepair(rp, r); open = false">{{ rp.op === 'question' ? 'Ask: ' : '' }}{{ rp.label }}</button>
        </div>
        <div class="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>{{ modelTag(r) }} · {{ r.confidence.toFixed(2) }} · {{ age(r.at) }}</span>
          <span class="flex-1" />
          <button type="button" class="flex items-center gap-0.5 hover:text-foreground" @click="api.recheck({ edgeIds: [edgeId] })"><RefreshCw class="size-2.5" />Re-check</button>
        </div>
      </template>
      <div v-else class="text-muted-foreground">Checking this link…</div>
    </PopoverContent>
  </Popover>
</template>

