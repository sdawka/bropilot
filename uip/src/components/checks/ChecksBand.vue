<script setup lang="ts">
// Node pane band (CHECKS-SPEC §4): weak or broken links, missing links, disagreements; each row is
// dots + evidence + primary repair + a menu with the rest. Empty: "All n checked links solid".
import { computed } from 'vue';
import { MoreHorizontal, RefreshCw } from 'lucide-vue-next';
import type { Node } from '@/types';
import type { CheckResult } from '@/checks/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { flags } from '@/flags';
import { age, applyRepair, checkLabel, checksApi, modelTag, orderedRepairs, worstFirst } from '@/checks/applyRepair';
import VerdictDots from './VerdictDots.vue';

const props = defineProps<{ node: Node }>();
const api = checksApi();
const all = computed<CheckResult[]>(() => { void api.results.value; return api.forNode(props.node.id); });
const pending = computed(() => api.isPending([props.node.id]));
const bad = (r: CheckResult) => r.verdict === 'weak' || r.verdict === 'broken';
const groups = computed(() => [
  { id: 'links', title: 'Weak or broken links', items: all.value.filter((r) => r.family === 'solidity' && bad(r)).sort(worstFirst) },
  { id: 'missing', title: 'Missing', items: all.value.filter((r) => r.family === 'completeness' && bad(r)).sort(worstFirst) },
  { id: 'disagree', title: 'Disagreements', items: all.value.filter((r) => r.family === 'consistency' && bad(r)).sort(worstFirst) },
].filter((g) => g.items.length));
const solidLinks = computed(() => all.value.filter((r) => r.family === 'solidity' && r.verdict === 'solid').length);
const unclear = computed(() => all.value.filter((r) => r.verdict === 'unknown').length);
const recheck = () => api.recheck({ nodeIds: [props.node.id] });
const words = computed(() => flags.verdictStyle === 'words');
</script>

<template>
  <section data-checks-band>
    <div class="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
      <span>checks</span>
      <VerdictDots v-if="pending" pending title="checking…" />
      <span class="h-px flex-1 bg-border" />
      <button type="button" class="flex items-center gap-0.5 normal-case tracking-normal hover:text-foreground" title="Run this node's checks again" @click="recheck"><RefreshCw class="size-2.5" />Re-check</button>
    </div>
    <div v-if="groups.length" class="space-y-2">
      <div v-for="grp in groups" :key="grp.id">
        <div class="mb-0.5 text-[11px] text-muted-foreground">{{ grp.title }} <span class="tabular-nums">({{ grp.items.length }})</span></div>
        <ul class="space-y-1">
          <li v-for="r in grp.items" :key="r.id" class="group flex items-start gap-1.5 text-[12px]" :data-check="r.checkId">
            <VerdictDots class="mt-[5px] shrink-0" :verdict="r.verdict" :finding="r.finding" :words="words" :title="`${checkLabel(r.checkId)} · ${modelTag(r)} · ${r.confidence.toFixed(2)} · ${age(r.at)}`" />
            <div class="min-w-0 flex-1">
              <div class="leading-snug"><span class="text-muted-foreground">{{ checkLabel(r.checkId) }} · </span>{{ r.evidence }}</div>
              <button v-if="orderedRepairs(r)[0]" type="button" class="mt-0.5 rounded border border-foreground/30 px-1.5 py-px text-left text-[11px] hover:bg-accent" data-primary-repair
                      @click="applyRepair(orderedRepairs(r)[0], r)">{{ orderedRepairs(r)[0].op === 'question' ? 'Ask: ' : '' }}{{ orderedRepairs(r)[0].label }}</button>
            </div>
            <DropdownMenu v-if="r.repairs.length > 1">
              <DropdownMenuTrigger as-child>
                <button type="button" class="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="More repairs"><MoreHorizontal class="size-3.5" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-64 text-[12px]">
                <DropdownMenuLabel class="text-[11px] font-normal text-muted-foreground">{{ modelTag(r) }} · {{ r.confidence.toFixed(2) }} · {{ age(r.at) }}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem v-for="(rp, i) in orderedRepairs(r).slice(1)" :key="i" class="text-[12px]" @select="applyRepair(rp, r)">{{ rp.op === 'question' ? 'Ask: ' : '' }}{{ rp.label }}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
      </div>
      <div v-if="unclear" class="text-[11px] text-muted-foreground">{{ unclear }} unclear, not shown</div>
    </div>
    <div v-else-if="all.length" class="flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <VerdictDots :verdict="solidLinks ? 'solid' : 'unknown'" /><template v-if="solidLinks">All {{ solidLinks }} checked links solid</template><template v-else>Nothing weak or broken</template><template v-if="unclear"> · {{ unclear }} unclear</template>
    </div>
    <div v-else-if="!pending" class="text-[12px] text-muted-foreground">
      Not checked yet<template v-if="flags.checks === 'off'"> (checks are off)</template> ·
      <button type="button" class="underline-offset-2 hover:text-foreground hover:underline" @click="recheck">check now</button>
    </div>
    <div v-else class="text-[12px] text-muted-foreground">Checking…</div>
  </section>
</template>
