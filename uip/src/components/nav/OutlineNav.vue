<script setup lang="ts">
// nav=outline: the whole perspective as an indented tree from every step-0 root. Expand/collapse;
// cycles cut with the ancestor set and rendered as "↻ title".
import { computed, ref, watch } from 'vue';
import { useGraph } from '@/store/graph';
import { flags } from '@/flags';
import { kindIcon, hueOf, kindLabel, phrase } from '@/ontology';
import { stepItems, rawItems, gapSlots, openCount, type GapSlot as Gap } from '@/store/traverse';
import type { Node } from '@/types';
import GapSlot from './GapSlot.vue';

const g = useGraph();
const expanded = ref(new Set<string>());
watch(() => g.segments.value.map((s) => s.id).join('/'), () => {
  const ids = g.segments.value.map((s) => s.id);
  const s = new Set(expanded.value);
  for (let i = 1; i <= ids.length; i++) s.add(ids.slice(0, i).join('/'));
  expanded.value = s;
}, { immediate: true });

interface Row { key: string; path: string[]; depth: number; node: Node; si: number; cycle: boolean; verb: string; via?: string; open: number; hasKids: boolean; gaps: Gap[] }
interface Child { node: Node; path: string[]; si: number; verb: string; via?: string }
function children(node: Node, si: number, path: string[]): Child[] {
  const p = g.persp.value, ix = g.ix.value;
  if (!p || g.chainless.value || si < 0) return rawItems(ix, node.id).slice(0, 60).map((it) => ({ node: it.node, path: [...path, it.node.id], si: -1, verb: it.group ?? '' }));
  if (si + 1 >= p.steps.length) return [];
  const step = p.steps[si + 1];
  const items = stepItems(ix, step, node);
  if (step.waypoint && flags.waypoints === 'collapse' && si + 2 < p.steps.length) {
    return items.flatMap((w) => stepItems(ix, p.steps[si + 2], w.node).map((it) => ({ node: it.node, path: [...path, w.node.id, it.node.id], si: si + 2, verb: '⋯', via: w.node.title })));
  }
  return items.map((it) => ({ node: it.node, path: [...path, it.node.id], si: si + 1, verb: it.edge ? phrase(it.edge.type, it.dir ?? 'out') : '' }));
}
const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  const root = g.columns.value[0]; if (!root) return out;
  const p = g.persp.value;
  const walk = (c: Child, depth: number, anc: Set<string>) => {
    const key = c.path.join('/');
    const cycle = anc.has(c.node.id);
    const kids = cycle ? [] : children(c.node, c.si, c.path);
    const isOpen = expanded.value.has(key);
    const gaps = isOpen && p && !g.chainless.value && c.si >= 0 && c.si + 1 < p.steps.length && flags.gaps !== 'off' ? gapSlots(g.ix.value, p.steps[c.si + 1], c.node) : [];
    out.push({ key, path: c.path, depth, node: c.node, si: c.si, cycle, verb: c.verb, via: c.via, open: openCount(g.ix.value, c.node), hasKids: kids.length > 0, gaps });
    if (cycle || !isOpen || out.length > 1500) return;
    const next = new Set(anc); next.add(c.node.id);
    for (const k of kids) walk(k, depth + 1, next);
  };
  for (const it of root.items) walk({ node: it.node, path: [it.node.id], si: root.stepIndex, verb: '' }, 0, new Set());
  return out;
});
function toggle(r: Row) { const s = new Set(expanded.value); s.has(r.key) ? s.delete(r.key) : s.add(r.key); expanded.value = s; }
const selKey = computed(() => g.segments.value.map((s) => s.id).join('/'));
function open(r: Row) { if (r.cycle) return; g.go(g.view.value.persp, r.path); if (!expanded.value.has(r.key)) toggle(r); }
function expandAll() { const s = new Set(expanded.value); for (const r of rows.value) if (r.hasKids) s.add(r.key); expanded.value = s; }
</script>

<template>
  <div class="scroll-thin h-full min-w-0 flex-1 overflow-y-auto px-4 py-3">
    <div class="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
      <span class="uppercase tracking-wide">outline · {{ g.persp.value?.label ?? 'raw' }}</span><span>{{ rows.length }} rows</span>
      <button class="rounded border px-1.5 hover:bg-accent" @click="expandAll">expand level</button>
      <button class="rounded border px-1.5 hover:bg-accent" @click="expanded = new Set()">collapse all</button>
    </div>
    <div class="space-y-px">
      <template v-for="r in rows" :key="r.key">
        <div
          class="space-rule flex items-center gap-1.5 rounded-[5px] py-[3px] pr-2 transition-colors"
          :class="[r.key === selKey ? 'bg-accent font-medium' : 'hover:bg-accent/60', r.cycle ? 'text-muted-foreground' : '', g.highlightIds.value.includes(r.node.id) ? 'hl' : '', r.node.status === 'draft' ? 'draft-rule' : '']"
          :style="{ paddingLeft: `${10 + r.depth * 18}px`, '--hue': hueOf(r.node.kind) }"
          :data-node="r.node.id"
        >
          <button class="w-4 shrink-0 text-[10px] text-muted-foreground" :class="r.hasKids ? '' : 'invisible'" @click="toggle(r)">{{ expanded.has(r.key) ? '▾' : '▸' }}</button>
          <span v-if="r.verb" class="shrink-0 font-mono text-[10px] text-muted-foreground">{{ r.verb }}</span>
          <span class="text-[12px]">{{ r.cycle ? '↻' : kindIcon(r.node.kind) }}</span>
          <button class="truncate text-left" @click="open(r)">{{ r.node.title }}</button>
          <span v-if="r.via" class="truncate text-[11px] text-muted-foreground">via {{ r.via }}</span>
          <span class="ml-auto shrink-0 text-[10px] text-muted-foreground">{{ kindLabel(r.node.kind).toLowerCase() }}</span>
          <span v-if="r.open" class="shrink-0 text-[11px] text-gap">⚠{{ r.open }}</span>
        </div>
        <div v-for="s in r.gaps" :key="r.key + s.question" :style="{ paddingLeft: `${28 + (r.depth + 1) * 18}px` }" class="py-px pr-2"><GapSlot :slot="s" /></div>
      </template>
    </div>
  </div>
</template>
