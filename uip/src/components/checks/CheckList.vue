<script setup lang="ts">
// Chat reply for intent `check` (CHECKS-SPEC §4): head + ≤ 8 rows worst first + "Open audit".
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { CheckResult } from '@/checks/types';
import { useGraphApi } from '@/chat/graphApi';
import { applyRepair, checkLabel, checksApi, nodeSubjects, orderedRepairs, worstFirst } from '@/checks/applyRepair';
import { flags } from '@/flags';
import NodeChip from '@/chat/NodeChip.vue';
import VerdictDots from './VerdictDots.vue';

const props = defineProps<{ head: string; resultIds: string[]; pending: boolean }>();
const api = checksApi();
const g = useGraphApi();
const router = useRouter();
const rows = computed<CheckResult[]>(() => props.resultIds.map((id) => api.results.value?.[id]).filter((r): r is CheckResult => !!r).sort(worstFirst).slice(0, 8));
const openAudit = () => { const p = g.project.value?.id; if (p) void router.push(`/p/${p}/audit`); };
</script>
<template>
  <div class="rounded-md border border-border bg-card p-2 text-sm" data-check-list>
    <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
      <VerdictDots v-if="pending" pending />
      <span>{{ head }}</span>
    </div>
    <ul v-if="rows.length" class="mt-1 space-y-1">
      <li v-for="r in rows" :key="r.id" class="flex min-w-0 items-start gap-1.5 text-xs">
        <VerdictDots class="mt-[4px] shrink-0" :verdict="r.verdict" :finding="r.finding" :words="flags.verdictStyle === 'words'" :title="`${r.finding} · ${r.confidence.toFixed(2)}`" />
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 flex-wrap items-center gap-1">
            <span class="font-medium">{{ checkLabel(r.checkId) }}</span>
            <NodeChip v-for="id in nodeSubjects(r).slice(0, 2)" :key="id" :id="id" class="max-w-[140px]" />
          </div>
          <div class="truncate text-muted-foreground" :title="r.evidence">{{ r.evidence }}</div>
          <button v-if="r.verdict !== 'solid' && orderedRepairs(r)[0]" type="button" class="mt-0.5 rounded border border-border px-1.5 py-px text-[11px] hover:bg-accent"
                  @click="applyRepair(orderedRepairs(r)[0], r)">{{ orderedRepairs(r)[0].op === 'question' ? 'Ask: ' : '' }}{{ orderedRepairs(r)[0].label }}</button>
        </div>
      </li>
    </ul>
    <div class="mt-1 flex gap-2 text-[11px]">
      <button type="button" class="text-muted-foreground hover:underline" @click="openAudit">Open audit</button>
      <button v-if="rows.length" type="button" class="text-muted-foreground hover:underline" @click="g.dispatch({ verb: 'filter', ids: [...new Set(rows.flatMap(nodeSubjects))] })">show on canvas</button>
    </div>
  </div>
</template>
