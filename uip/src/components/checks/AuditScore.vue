<script setup lang="ts">
// "audit 79%" = solid / checked over solidity results, read from the cache only (CHECKS-SPEC §4);
// "audit —" when none. Links to the Audit view. Live results count too for the open project.
import { computed } from 'vue';
import type { CheckResult } from '@/checks/types';
import { useGraphApi } from '@/chat/graphApi';
import { checksApi } from '@/checks/applyRepair';

const props = defineProps<{ project: string }>();
const api = checksApi();
const g = useGraphApi();
function cached(project: string): CheckResult[] {
  try { return Object.values(JSON.parse(localStorage.getItem(`uip.checks.v1.${project}`) ?? '{}') as Record<string, CheckResult>); } catch { return []; }
}
const score = computed(() => {
  const latest = new Map<string, CheckResult>();
  const live = g.project.value?.id === props.project ? Object.values(api.results.value ?? {}) : [];
  for (const r of [...cached(props.project), ...live]) {
    if (r?.family !== 'solidity') continue;
    const prev = latest.get(r.id);
    if (!prev || (r.at ?? '') >= (prev.at ?? '')) latest.set(r.id, r);
  }
  const rs = [...latest.values()];
  const solid = rs.filter((r) => r.verdict === 'solid').length;
  return rs.length ? { pct: Math.round((solid / rs.length) * 100), solid, n: rs.length } : null;
});
</script>
<template>
  <RouterLink :to="`/p/${project}/audit`" class="whitespace-nowrap text-[12px] tabular-nums hover:underline" data-audit-score
              :class="score && score.pct < 70 ? 'text-gap' : 'text-muted-foreground'"
              :title="score ? `${score.solid} of ${score.n} checked links solid · open the audit` : 'No checks yet · open the audit'" @click.stop>
    audit {{ score ? `${score.pct}%` : '—' }}
  </RouterLink>
</template>
