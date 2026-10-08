<script setup lang="ts">
import { computed, watch } from 'vue';
import { MessageSquarePlus, Link2 } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import type { Node } from '@/types';
import { useGraph } from '@/store/graph';
import { flags } from '@/flags';
import { kind, kindIcon, kindLabel, spaceOf, hueOf, LEVEL_LABEL, phrase, edgeLabel, fieldLabel } from '@/ontology';
import { PERSPECTIVES, BRIDGE_KINDS, perspLabel } from '@/perspectives';
import type { Nb } from '@/store/traverse';
import NeedsList from './NeedsList.vue';
import EdgeGroup from './EdgeGroup.vue';
import LensChips from './LensChips.vue';
import ChecksBand from '@/components/checks/ChecksBand.vue';
import { checksApi } from '@/checks/applyRepair';

const props = defineProps<{ node: Node }>();
const g = useGraph();
const k = computed(() => kind(props.node.kind));
const nbs = computed(() => g.neighbours(props.node.id));
const checks = checksApi();
watch(() => props.node.id, (id) => { if (flags.checks === 'lazy') void checks.ensure({ nodeIds: [id] }); }, { immediate: true });

/** Down = hops of the current perspective from this kind (feed the next column). */
const downHops = computed(() => {
  const p = g.persp.value; if (!p || flags.persp !== 'curated') return [];
  return p.steps.flatMap((s) => s.via.filter((h) => h.from === props.node.kind).map((h) => ({ ...h, kinds: s.kinds })));
});
const isDown = (nb: Nb) => downHops.value.some((h) => h.edge === nb.edge.type && h.dir === nb.dir && h.kinds.includes(nb.other.kind));
const down = computed(() => downHops.value.map((h) => ({ hop: h, items: nbs.value.filter((nb) => nb.edge.type === h.edge && nb.dir === h.dir && h.kinds.includes(nb.other.kind)) }))
  .filter((x, i, a) => a.findIndex((y) => y.hop.edge === x.hop.edge && y.hop.dir === x.hop.dir) === i));

function lensOf(nb: Nb): string {
  for (const p of PERSPECTIVES) for (const s of p.steps) for (const h of s.via) {
    if (h.edge !== nb.edge.type) continue;
    if ((h.from === props.node.kind && h.dir === nb.dir && s.kinds.includes(nb.other.kind)) || (h.from === nb.other.kind && h.dir !== nb.dir && s.kinds.includes(props.node.kind))) return p.label;
  }
  return 'no perspective';
}
const acrossGroups = computed(() => {
  const m = new Map<string, Nb[]>();
  for (const nb of nbs.value) {
    if (isDown(nb)) continue;
    const key = flags.edgeGroup === 'kind' ? kindLabel(nb.other.kind, 2) : flags.edgeGroup === 'lens' ? lensOf(nb) : phrase(nb.edge.type, nb.dir);
    (m.get(key) ?? m.set(key, []).get(key)!).push(nb);
  }
  return [...m].map(([label, items]) => ({ label, items })).sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
});
const acrossCount = computed(() => acrossGroups.value.reduce((s, x) => s + x.items.length, 0));

function goDown(nb: Nb) {
  const cols = g.columns.value;
  const myCol = cols.findIndex((c) => c.selectedId === props.node.id);
  const next = cols[myCol + 1];
  if (myCol >= 0 && next && next.items.some((it) => it.node.id === nb.other.id)) g.select(myCol + 1, nb.other.id);
  else g.across(nb.edge.type, nb.other.id, nb.dir);
}
function goAcross(nb: Nb) {
  const isSel = g.selection.value?.id === props.node.id;
  if (isSel) g.across(nb.edge.type, nb.other.id, nb.dir);
  else g.dispatch({ verb: 'focus', id: nb.other.id });
}
const props2 = computed(() => Object.entries(props.node.props ?? {}).filter(([, v]) => v != null && String(v).length));
const source = computed(() => {
  const s = props.node.source as { kind?: string; statements?: number[]; why?: string } | undefined;
  if (!s) return null;
  if (s.kind === 'said' && s.statements) return `said S${s.statements.join(', S')}`;
  return s.kind ?? null;
});
function ask() { window.dispatchEvent(new CustomEvent('uip:ask', { detail: { nodeId: props.node.id } })); }
function copyLink() {
  const url = `${location.origin}/p/${g.view.value.project}/n/${encodeURIComponent(props.node.id)}`;
  navigator.clipboard?.writeText(url).then(() => toast('Permalink copied', { description: url }), () => toast(url));
}
</script>

<template>
  <article class="fade-in flex h-full flex-col" :key="node.id">
    <header class="space-rule border-b px-4 pb-3 pt-3" :style="{ '--hue': hueOf(node.kind) }">
      <div class="flex items-start gap-2">
        <span class="text-[18px] leading-6">{{ kindIcon(node.kind) }}</span>
        <div class="min-w-0 flex-1">
          <h2 class="text-[15px] font-semibold leading-6 tracking-tight">{{ node.title }}</h2>
          <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{{ k.label.toLowerCase() }}</span><span>·</span>
            <span class="flex items-center gap-1"><span class="space-dot" :style="{ '--hue': hueOf(node.kind) }" />{{ spaceOf(node.kind).label.toLowerCase() }}</span>
            <template v-if="k.level"><span>·</span><span>{{ LEVEL_LABEL[k.level] }}</span></template>
            <span v-if="BRIDGE_KINDS.has(node.kind)" class="rounded border px-1" title="Perspectives cross here">⇄</span>
            <span v-if="node.status === 'draft'" class="text-draft">+ in changes</span>
          </div>
        </div>
        <button class="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" title="Copy permalink" @click="copyLink"><Link2 class="size-3.5" /></button>
        <button class="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] hover:bg-accent" @click="ask"><MessageSquarePlus class="size-3" />Ask about this</button>
      </div>
    </header>
    <div class="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
      <p v-if="node.description" class="whitespace-pre-line text-[13px] leading-relaxed text-foreground/90">{{ node.description }}</p>
      <div v-if="props2.length">
        <div class="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">fields · {{ k.label.toLowerCase() }}</div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
          <template v-for="[pk, pv] in props2" :key="pk"><dt class="text-muted-foreground" :title="pk">{{ fieldLabel(node.kind, pk) }}</dt><dd class="whitespace-pre-line break-words">{{ pv }}</dd></template>
        </dl>
      </div>
      <div>
        <div class="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">node</div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
          <dt class="text-muted-foreground">commit status</dt><dd :class="node.status === 'draft' ? 'text-draft' : ''">{{ node.status }}</dd>
          <template v-if="source"><dt class="text-muted-foreground">source</dt><dd>{{ source }}</dd></template>
        </dl>
      </div>
      <NeedsList :node="node" />
      <ChecksBand :node="node" />

      <section v-if="down.length">
        <div class="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground"><span>down · {{ perspLabel(g.view.value.persp) }}</span><span class="h-px flex-1 bg-border" /></div>
        <div class="space-y-1.5">
          <div v-for="d in down" :key="d.hop.edge + d.hop.dir">
            <EdgeGroup v-if="d.items.length" :label="`${phrase(d.hop.edge, d.hop.dir)} ${d.hop.kinds.map((x) => kindLabel(x).toLowerCase()).join('·')}`" :items="d.items" @go="goDown" />
            <button v-else-if="flags.gaps !== 'off'" class="rounded border border-dashed border-gap/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              @click="g.openGap(d.hop.kinds[0], node.id, `Which ${d.hop.kinds.map((x) => kindLabel(x, 2).toLowerCase()).join(' or ')} ${d.hop.dir === 'out' ? `does “${node.title}” ${edgeLabel(d.hop.edge)}` : `${edgeLabel(d.hop.edge)} “${node.title}”`}?`)">
              ┄ {{ phrase(d.hop.edge, d.hop.dir) }} {{ d.hop.kinds.join('·') }} 0 · ask →
            </button>
          </div>
        </div>
      </section>

      <section v-if="acrossCount">
        <div class="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground"><span>across · by {{ flags.edgeGroup }}</span><span class="tabular-nums">{{ acrossCount }}</span><span class="h-px flex-1 bg-border" /></div>
        <div class="space-y-1.5"><EdgeGroup v-for="grp in acrossGroups" :key="grp.label" :label="grp.label" :items="grp.items" @go="goAcross" /></div>
      </section>

      <section>
        <div class="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground"><span>other perspectives</span><span class="h-px flex-1 bg-border" /></div>
        <LensChips :node="node" />
      </section>
    </div>
  </article>
</template>
