<script setup lang="ts">
// Audit (CHECKS-SPEC §4): every check result for the project, by family, worst first. Run all with
// a cost estimate and progress, verdict filter, per-row evidence and repairs, export JSON.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Download, Play, Square } from 'lucide-vue-next';
import { useGraph } from '@/store/graph';
import { FLAGS, flags } from '@/flags';
import type { CheckResult, Family, Verdict } from '@/checks/types';
import { age, applyRepair, checkLabel, checksApi, modelTag, nodeSubjects, orderedRepairs, worstFirst } from '@/checks/applyRepair';
import VerdictDots from '@/components/checks/VerdictDots.vue';
import NodeChip from '@/chat/NodeChip.vue';

const g = useGraph();
const route = useRoute();
const router = useRouter();
const project = computed(() => route.params.project as string);
watch(project, (id) => { if (id) void g.ensureProject(id); }, { immediate: true });
const api = checksApi();

const results = computed<CheckResult[]>(() => Object.values(api.results.value ?? {}));
const score = computed(() => { void api.results.value; return api.score(); });
const pct = computed(() => (score.value.checked ? Math.round((score.value.solid / score.value.checked) * 100) : null));
const est = computed(() => { void g.graph.value; void flags.checkModel; return g.ready.value ? api.estimate() : null; });
const running = computed(() => !!api.progress.value);
const prog = computed(() => api.progress.value);
const usd = (n: number) => (n < 0.001 && n > 0 ? '<$0.001' : `$${n.toFixed(3)}`);

type Tab = 'all' | Family;
const TABS: { id: Tab; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'solidity', label: 'Solidity' }, { id: 'completeness', label: 'Completeness' }, { id: 'consistency', label: 'Consistency' }];
const tab = ref<Tab>('all');
const VERDICTS: Verdict[] = ['broken', 'weak', 'unknown', 'solid'];
const shown = ref<Set<Verdict>>(new Set(['broken', 'weak', 'unknown']));
function toggle(v: Verdict) { const s = new Set(shown.value); s.has(v) ? s.delete(v) : s.add(v); shown.value = s; }
const inTab = computed(() => results.value.filter((r) => tab.value === 'all' || r.family === tab.value));
const count = (fam: Tab, v?: Verdict) => results.value.filter((r) => (fam === 'all' || r.family === fam) && (!v || r.verdict === v)).length;
const rows = computed(() => inTab.value.filter((r) => shown.value.has(r.verdict)).sort(worstFirst));

function openRow(r: CheckResult) { const id = nodeSubjects(r)[0]; if (id) void router.push(`/p/${project.value}/n/${encodeURIComponent(id)}`); }
function exportJson() {
  const d = new Date(); const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const url = URL.createObjectURL(new Blob([api.exportJson()], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `audit-${project.value}-${ymd}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const setModel = (m: string) => { (flags as Record<string, string>).checkModel = m; };
</script>

<template>
  <div class="scroll-thin h-full overflow-y-auto" data-audit>
    <div class="mx-auto max-w-[1180px] px-8 py-6">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="text-[17px] font-semibold tracking-tight">Audit</h1>
        <span class="text-[13px] tabular-nums">
          <template v-if="pct != null"><b>{{ score.solid }}/{{ score.checked }}</b> solid ({{ pct }}%)</template>
          <template v-else><span class="text-muted-foreground">not checked yet</span></template>
          <span class="text-muted-foreground"> · </span><span :class="score.weak ? 'text-gap' : 'text-muted-foreground'">{{ score.weak }} weak</span>
          <span class="text-muted-foreground"> · </span><span :class="score.broken ? 'text-destructive' : 'text-muted-foreground'">{{ score.broken }} broken</span>
          <span class="text-muted-foreground"> · {{ score.unknown }} unknown</span>
        </span>
        <span class="flex-1" />
        <span class="flex items-center gap-1 text-[11px] text-muted-foreground" title="checkModel flag: which Clef model answers">
          model
          <span class="flex gap-0.5 rounded-md bg-muted p-0.5">
            <button v-for="m in FLAGS.checkModel" :key="m" type="button" class="rounded px-1.5 py-px" :data-flag="`checkModel:${m}`"
                    :class="flags.checkModel === m ? 'bg-background font-medium text-foreground shadow-sm' : 'hover:text-foreground'" @click="setModel(m)">{{ m }}</button>
          </span>
        </span>
        <button v-if="!running" type="button" class="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[12px] text-primary-foreground hover:opacity-90" data-run-all @click="api.runAll()">
          <Play class="size-3" />Run all<span v-if="est && est.questions" class="opacity-70">(≈ {{ est.questions }} questions · {{ est.requests }} requests · ≈ {{ usd(est.usd) }})</span><span v-else-if="est" class="opacity-70">(all cached)</span>
        </button>
        <button v-else type="button" class="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] hover:bg-accent" @click="api.cancel()"><Square class="size-3" />Cancel</button>
        <button type="button" class="flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] hover:bg-accent disabled:opacity-50" :disabled="!results.length" @click="exportJson"><Download class="size-3" />Export JSON</button>
      </div>
      <p class="mt-0.5 text-[12px] text-muted-foreground">Clef reads the words behind each link, what is missing and what disagrees. Checks never change the map; a repair goes through the changes like any proposal.</p>

      <div v-if="prog" class="mt-3" data-audit-progress>
        <div class="h-1 overflow-hidden rounded-full bg-muted"><div class="h-full bg-foreground/60 transition-[width]" :style="{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%` }" /></div>
        <div class="mt-1 text-[11px] tabular-nums text-muted-foreground">
          {{ prog.questions }}<template v-if="est">/{{ est.questions }}</template> questions · {{ prog.requests }}<template v-if="est">/{{ est.requests }}</template> requests · {{ usd(prog.usd) }}
        </div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3 border-b">
        <button v-for="t in TABS" :key="t.id" type="button" class="-mb-px border-b-2 px-1 pb-1.5 text-[12px]"
                :class="tab === t.id ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'" @click="tab = t.id">
          {{ t.label }} <span class="tabular-nums text-muted-foreground">{{ count(t.id) }}</span>
        </button>
        <span class="flex-1" />
        <div class="flex gap-1 pb-1.5">
          <button v-for="v in VERDICTS" :key="v" type="button" class="flex items-center gap-1 rounded-full border px-2 py-px text-[11px]" :data-verdict-filter="v"
                  :class="shown.has(v) ? 'border-foreground/40 bg-accent' : 'text-muted-foreground opacity-70'" @click="toggle(v)">
            <VerdictDots :verdict="v" />{{ v }} <span class="tabular-nums">{{ count(tab, v) }}</span>
          </button>
        </div>
      </div>

      <div v-if="!g.ready.value" class="py-6 text-[12px] text-muted-foreground">Loading…</div>
      <div v-else-if="!results.length" class="mt-4 rounded-md border border-dashed p-6 text-center text-[12px] text-muted-foreground">
        No checks yet for this project. Run all to check every link<template v-if="est"> (≈ {{ est.questions }} questions, ≈ {{ usd(est.usd) }} on {{ est.model }})</template>.
      </div>
      <div v-else-if="!rows.length" class="mt-4 rounded-md border border-dashed p-6 text-center text-[12px] text-muted-foreground">Nothing matches this filter.</div>
      <table v-else class="mt-1 w-full table-fixed border-collapse text-[12px]">
        <colgroup><col class="w-[64px]"><col class="w-[132px]"><col class="w-[220px]"><col><col class="w-[64px]"><col class="w-[220px]"><col class="w-[112px]"></colgroup>
        <thead>
          <tr class="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th class="py-1.5 font-normal">Verdict</th><th class="font-normal">Check</th><th class="font-normal">Subjects</th><th class="font-normal">Evidence</th>
            <th class="text-right font-normal">Conf.</th><th class="pl-3 font-normal">Repairs</th><th class="text-right font-normal">Model · age</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="cursor-default border-t align-top hover:bg-accent/50" :data-check="r.checkId" :data-verdict="r.verdict" @click="openRow(r)">
            <td class="py-1.5"><VerdictDots :verdict="r.verdict" :finding="r.finding" :words="flags.verdictStyle === 'words'" /></td>
            <td class="py-1.5 pr-2"><div class="font-medium">{{ checkLabel(r.checkId) }}</div><div class="text-[11px] text-muted-foreground">{{ r.finding }}</div></td>
            <td class="py-1.5 pr-2"><div class="flex flex-wrap gap-1" @click.stop><NodeChip v-for="id in nodeSubjects(r).slice(0, 3)" :key="id" :id="id" class="max-w-[200px]" /></div></td>
            <td class="py-1.5 pr-2 leading-snug text-foreground/90">{{ r.evidence }}</td>
            <td class="py-1.5 text-right tabular-nums text-muted-foreground">{{ r.confidence.toFixed(2) }}</td>
            <td class="py-1.5 pl-3">
              <div class="flex flex-wrap gap-1" @click.stop>
                <button v-for="(rp, i) in orderedRepairs(r).slice(0, 3)" :key="i" type="button" class="max-w-full truncate rounded border px-1.5 py-px text-left text-[11px] hover:bg-accent"
                        :class="i === 0 ? 'border-foreground/40' : 'text-muted-foreground'" :title="rp.label" @click="applyRepair(rp, r)">{{ rp.op === 'question' ? 'Ask: ' : '' }}{{ rp.label }}</button>
              </div>
            </td>
            <td class="py-1.5 text-right text-[11px] text-muted-foreground"><span :class="r.fake ? 'italic' : ''">{{ modelTag(r) }}</span> · {{ age(r.at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
