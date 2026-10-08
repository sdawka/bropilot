<script setup lang="ts">
// nav=canvas: hand-rolled SVG ego ring. Focus centred, ≤24 neighbours grouped by edge verb on arcs,
// "+n" bucket per group beyond the cap. Click re-centres and pushes the URL. No layout library.
import { computed, ref, watch } from 'vue';
import { useGraph } from '@/store/graph';
import { kindIcon, kindLabel, phrase, hueOf } from '@/ontology';
import type { Nb } from '@/store/traverse';
import Column from './Column.vue';

const g = useGraph();
const sel = computed(() => g.selection.value);
const W = 780, H = 600, cx = W / 2, cy = H / 2, R = 205, CAP = 24;
const expanded = ref(new Set<string>());
watch(() => sel.value?.id, () => (expanded.value = new Set()));

interface Pt { x: number; y: number; a: number }
interface RingNode extends Pt { nb?: Nb; bucket?: { group: string; n: number }; group: string }
const layout = computed(() => {
  const s = sel.value; if (!s) return { nodes: [] as RingNode[], arcs: [] as { label: string; x: number; y: number; a0: number; a1: number; path: string }[] };
  const groups = new Map<string, Nb[]>();
  for (const nb of g.neighbours(s.id)) { const k = phrase(nb.edge.type, nb.dir); (groups.get(k) ?? groups.set(k, []).get(k)!).push(nb); }
  const list = [...groups].map(([label, items]) => ({ label, items: items.sort((a, b) => a.other.title.localeCompare(b.other.title)) })).sort((a, b) => b.items.length - a.items.length);
  const total = list.reduce((t, x) => t + x.items.length, 0);
  // per-group cap, proportional, ≥1 each; buckets take one slot
  const shown = list.map((grp) => {
    if (expanded.value.has(grp.label) || total <= CAP) return { ...grp, show: grp.items, rest: 0 };
    const cap = Math.max(1, Math.floor((CAP * grp.items.length) / total));
    return grp.items.length > cap ? { ...grp, show: grp.items.slice(0, Math.max(1, cap - 1)), rest: grp.items.length - Math.max(1, cap - 1) } : { ...grp, show: grp.items, rest: 0 };
  });
  const slots = shown.reduce((t, x) => t + x.show.length + (x.rest ? 1 : 0), 0);
  const gapA = 0.18; // radians between groups
  const usable = Math.PI * 2 - gapA * shown.length;
  const step = slots ? usable / slots : 0;
  let a = -Math.PI / 2;
  const nodes: RingNode[] = [], arcs: { label: string; x: number; y: number; a0: number; a1: number; path: string }[] = [];
  const pt = (ang: number, r = R): Pt => ({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, a: ang });
  for (const grp of shown) {
    const a0 = a;
    for (const nb of grp.show) { nodes.push({ ...pt(a + step / 2), nb, group: grp.label }); a += step; }
    if (grp.rest) { nodes.push({ ...pt(a + step / 2), bucket: { group: grp.label, n: grp.rest }, group: grp.label }); a += step; }
    const a1 = a;
    const mid = (a0 + a1) / 2, lp = pt(mid, R + 70);
    const r2 = R + 40, p0 = pt(a0 + 0.02, r2), p1 = pt(a1 - 0.02, r2);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    arcs.push({ label: `${grp.label} ${grp.items.length}`, x: lp.x, y: lp.y, a0, a1, path: `M ${p0.x} ${p0.y} A ${r2} ${r2} 0 ${large} 1 ${p1.x} ${p1.y}` });
    a += gapA;
  }
  return { nodes, arcs };
});
const trunc = (t: string, n = 22) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
function click(rn: RingNode) {
  if (rn.bucket) { const s = new Set(expanded.value); s.add(rn.bucket.group); expanded.value = s; return; }
  const nb = rn.nb!; const cols = g.columns.value;
  const next = cols[g.segments.value.length];
  if (next && !next.via && next.items.some((it) => it.node.id === nb.other.id)) g.select(next.index, nb.other.id);
  else g.across(nb.edge.type, nb.other.id, nb.dir);
}
const anchor = (ang: number) => { const c = Math.cos(ang); return c > 0.25 ? 'start' : c < -0.25 ? 'end' : 'middle'; };
</script>

<template>
  <div class="flex h-full min-w-0 flex-1">
    <Column v-if="!sel && g.columns.value[0]" :col="g.columns.value[0]" :width="300" @select="(id) => g.select(0, id)" />
    <div v-if="!sel" class="grid flex-1 place-items-center text-[12px] text-muted-foreground">Pick a node to centre the ring.</div>
    <div v-else class="relative min-w-0 flex-1 overflow-hidden">
      <svg :viewBox="`0 0 ${W} ${H}`" class="h-full w-full" role="img" :aria-label="`Neighbours of ${sel.title}`">
        <g>
          <path v-for="arc in layout.arcs" :key="'p' + arc.label" :d="arc.path" fill="none" stroke="currentColor" class="text-border" stroke-width="2" />
          <text v-for="arc in layout.arcs" :key="'t' + arc.label" :x="arc.x" :y="arc.y" :text-anchor="anchor((arc.a0 + arc.a1) / 2)" class="fill-muted-foreground font-mono" font-size="11">{{ arc.label }}</text>
        </g>
        <line v-for="(rn, i) in layout.nodes" :key="'l' + i" :x1="cx" :y1="cy" :x2="rn.x" :y2="rn.y" stroke="currentColor" class="text-border"
          :stroke-dasharray="rn.nb?.edge.status === 'draft' || rn.nb?.edge.trace === 'suspect' ? '4 3' : undefined" />
        <g v-for="(rn, i) in layout.nodes" :key="'n' + i" class="cursor-pointer" @click="click(rn)">
          <title>{{ rn.bucket ? `${rn.bucket.n} more · ${rn.group}` : `${kindLabel(rn.nb!.other.kind)} · ${rn.nb!.other.title}` }}</title>
          <circle :cx="rn.x" :cy="rn.y" r="15" :style="{ fill: 'var(--card)', stroke: rn.bucket ? 'var(--muted-foreground)' : hueOf(rn.nb!.other.kind) }"
            :class="g.highlightIds.value.includes(rn.nb?.other.id ?? '') ? 'stroke-[3]' : ''"
            :stroke-dasharray="rn.bucket || rn.nb?.other.status === 'draft' ? '3 2' : undefined" stroke-width="1.5" />
          <text :x="rn.x" :y="rn.y + 4" text-anchor="middle" font-size="12">{{ rn.bucket ? `+${rn.bucket.n}` : kindIcon(rn.nb!.other.kind) }}</text>
          <text v-if="rn.nb" :x="rn.x + Math.cos(rn.a) * 22" :y="rn.y + Math.sin(rn.a) * 22 + 4" :text-anchor="anchor(rn.a)" font-size="11" class="fill-foreground">{{ trunc(rn.nb.other.title) }}</text>
        </g>
        <g>
          <circle :cx="cx" :cy="cy" r="44" style="fill: var(--card)" stroke="currentColor" class="text-foreground" stroke-width="1.5" />
          <text :x="cx" :y="cy - 6" text-anchor="middle" font-size="18">{{ kindIcon(sel.kind) }}</text>
          <text :x="cx" :y="cy + 14" text-anchor="middle" font-size="11" class="fill-foreground font-medium">{{ trunc(sel.title, 16) }}</text>
          <text :x="cx" :y="cy + 62" text-anchor="middle" font-size="10" class="fill-muted-foreground">{{ kindLabel(sel.kind).toLowerCase() }}</text>
        </g>
      </svg>
      <div class="absolute bottom-2 left-3 text-[11px] text-muted-foreground">{{ layout.nodes.length }} on the ring · click re-centres · Backspace goes back</div>
    </div>
  </div>
</template>
