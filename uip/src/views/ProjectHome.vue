<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useGraph } from '@/store/graph';
import { SPACES, KINDS, kind, kindLabel, edgeLabel, type SpaceDef } from '@/ontology';
import { PERSPECTIVES, PERSP_FOR_SPACE } from '@/perspectives';
import { coverage, thinnestLink, unmetNeeds } from '@/store/traverse';
import type { PerspId } from '@/types';
import SpaceTile from '@/components/atlas/SpaceTile.vue';
import PerspectiveCard from '@/components/atlas/PerspectiveCard.vue';
import AuditScore from '@/components/checks/AuditScore.vue';

const g = useGraph();
const route = useRoute();
watch(() => route.params.project as string, (id) => { if (id) void g.ensureProject(id); }, { immediate: true });

const bySpace = computed(() => {
  const m: Record<string, { count: number; open: number; kinds: { id: string; label: string; icon: string; n: number }[] }> = {};
  for (const s of SPACES) m[s.id] = { count: 0, open: 0, kinds: [] };
  const ix = g.ix.value;
  for (const k of KINDS) {
    const n = ix.byKind.get(k.id)?.length ?? 0;
    if (!n) continue;
    m[k.space].count += n;
    m[k.space].kinds.push({ id: k.id, label: n === 1 ? k.label : k.plural, icon: k.icon, n });
    m[k.space].open += (ix.byKind.get(k.id) ?? []).reduce((t, node) => t + unmetNeeds(ix, node).length, 0);
  }
  for (const s of SPACES) m[s.id].kinds.sort((a, b) => b.n - a.n);
  return m;
});
const rep = computed(() => SPACES.filter((s) => s.layer === 'representation'));
const real = computed(() => SPACES.filter((s) => s.layer === 'reality'));
const levels = computed(() => [1, 2, 3].map((L) => {
  const ks = KINDS.filter((k) => k.space === 'solution' && k.level === L);
  return { L, kinds: ks.filter((k) => g.ix.value.byKind.get(k.id)?.length).map((k) => k.label.toLowerCase()), n: ks.reduce((t, k) => t + (g.ix.value.byKind.get(k.id)?.length ?? 0), 0) };
}));
const unlevelled = computed(() => KINDS.filter((k) => k.space === 'solution' && !k.level).reduce((t, k) => t + (g.ix.value.byKind.get(k.id)?.length ?? 0), 0));
const thin = computed(() => (g.ready.value ? thinnestLink(g.ix.value) : null));
const thinText = computed(() => {
  const t = thin.value; if (!t) return '';
  const target = t.kinds.filter((k) => k !== t.hop.from).map((k) => kindLabel(k).toLowerCase()).join('·') || t.kinds.join('·');
  return `${kindLabel(t.hop.from).toLowerCase()} ${t.hop.dir === 'out' ? `─${edgeLabel(t.hop.edge)}→` : `←${edgeLabel(t.hop.edge)}─`} ${target}`;
});
function askThin() {
  const t = thin.value; if (!t) return;
  const from = kind(t.hop.from);
  g.openGap(t.kinds[0], null, `Only ${t.linked} of ${t.parents} ${from.plural.toLowerCase()} have a ${edgeLabel(t.hop.edge)} link. Which ${t.kinds.map((k) => kindLabel(k, 2).toLowerCase()).join(' or ')} does each one ${edgeLabel(t.hop.edge)}?`);
}
function showThin() {
  const t = thin.value; if (!t) return;
  const parents = g.ix.value.byKind.get(t.hop.from) ?? [];
  const linked = parents.find((p) => g.ix.value.count(p.id, t.hop.edge, t.hop.dir) > 0);
  if (linked) { const pid = t.persp as PerspId; g.go(pid, g.resolvePath(pid, linked.id) ?? [linked.id]); }
}
const covs = computed(() => PERSPECTIVES.map((p) => ({ p, ...coverage(g.ix.value, p) })));
function openSpace(s: SpaceDef) { g.go(PERSP_FOR_SPACE[s.id] ?? 'domain', []); }
const proj = computed(() => g.project.value);
const go = (p: PerspId) => g.go(p, []);
</script>

<template>
  <div class="scroll-thin h-full overflow-y-auto">
    <div v-if="!g.ready.value" class="grid h-full place-items-center text-[12px] text-muted-foreground">Loading…</div>
    <div v-else class="mx-auto max-w-[1080px] px-8 py-6">
      <div class="mb-5">
        <h1 class="text-[20px] font-semibold tracking-tight">{{ proj?.name }}</h1>
        <p class="text-[13px] text-muted-foreground">{{ proj?.purpose }}</p>
        <p class="mt-1 max-w-[760px] text-[12px] text-muted-foreground/90">{{ proj?.summary }}</p>
      </div>

      <section>
        <div class="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Representation</div>
        <div class="flex items-stretch gap-1.5">
          <template v-for="(s, i) in rep" :key="s.id">
            <span v-if="i" class="self-center text-muted-foreground/60">→</span>
            <SpaceTile :space="s" :count="bySpace[s.id].count" :open="bySpace[s.id].open" :kinds="bySpace[s.id].kinds" :class="s.id === 'solution' ? 'flex-[2]' : ''" @open="openSpace(s)" />
          </template>
        </div>
        <div class="ml-auto mt-1.5 grid w-[46%] grid-cols-3 gap-px overflow-hidden rounded-md border bg-border text-[11px]">
          <div v-for="l in levels" :key="l.L" class="bg-card px-2 py-1.5">
            <div><b>L{{ l.L }}</b> <span class="tabular-nums text-muted-foreground">{{ l.n }}</span></div>
            <div class="truncate text-muted-foreground">{{ l.kinds.join(' · ') || '—' }}</div>
          </div>
        </div>
        <div class="mt-0.5 text-right text-[10px] text-muted-foreground">solution by C4 level · {{ unlevelled }} more without a level (capabilities, features, flows, screens…)</div>
      </section>

      <div class="my-2 flex justify-around font-mono text-[11px] text-muted-foreground"><span>↑ realises</span><span>↓ planned</span><span>↑ reports</span></div>

      <section>
        <div class="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Reality</div>
        <div class="flex items-stretch gap-1.5">
          <SpaceTile v-for="s in real" :key="s.id" :space="s" :count="bySpace[s.id].count" :open="bySpace[s.id].open" :kinds="bySpace[s.id].kinds" @open="openSpace(s)" />
        </div>
      </section>

      <section v-if="thin" class="mt-5 flex items-center gap-3 rounded-md border border-dashed border-gap/60 bg-gap/5 px-4 py-2.5">
        <span class="text-[10px] font-medium uppercase tracking-[0.12em] text-gap">thinnest link</span>
        <span class="font-mono text-[12px]">{{ thinText }}</span>
        <span class="text-[12px] text-muted-foreground">({{ thin.linked }} of {{ thin.parents }})</span>
        <span class="flex-1" />
        <button class="rounded-md border px-2 py-0.5 text-[12px] hover:bg-accent" @click="showThin">show</button>
        <button class="rounded-md border border-gap/60 px-2 py-0.5 text-[12px] text-gap hover:bg-gap/10" @click="askThin">ask about it</button>
      </section>

      <section class="mt-6">
        <div class="mb-1 flex items-baseline gap-3">
          <span class="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Perspectives</span>
          <span class="flex-1" />
          <AuditScore v-if="proj" :project="proj.id" />
          <RouterLink v-if="proj" :to="`/p/${proj.id}/audit`" class="text-[12px] text-muted-foreground hover:text-foreground hover:underline" data-audit-link>Audit →</RouterLink>
        </div>
        <div class="divide-y rounded-md border bg-card">
          <PerspectiveCard v-for="c in covs" :key="c.p.id" :persp="c.p" :with-data="c.withData" :total="c.total" :stats="c.stats" @open="go(c.p.id)" />
          <button class="grid w-full grid-cols-[88px_1fr_auto] items-center gap-3 px-3 py-2 text-left hover:bg-accent/60" @click="go('raw')">
            <span class="text-[13px] font-semibold">Raw</span><span class="text-[12px] text-muted-foreground">no chain: every node, then every neighbour grouped by edge</span><span />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
