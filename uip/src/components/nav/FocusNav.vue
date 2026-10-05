<script setup lang="ts">
// nav=focus (A): one node, door chips, sideways sibling flipping, lens rail. nav=twin adds a second rail.
import { computed, ref, watch } from 'vue';
import { useGraph } from '@/store/graph';
import { flags } from '@/flags';
import { kind, kindIcon, kindLabel, hueOf, spaceOf, phrase, edgeLabel } from '@/ontology';
import { PERSPECTIVES, perspById, BRIDGE_KINDS } from '@/perspectives';
import { stepItems, type Nb } from '@/store/traverse';
import type { PerspId } from '@/types';
import LensRail from './LensRail.vue';
import NodeRow from './NodeRow.vue';
import GapSlot from './GapSlot.vue';
import NeedsList from '@/components/node/NeedsList.vue';

const props = defineProps<{ twin?: boolean }>();
const g = useGraph();
const sel = computed(() => g.selection.value);
const cols = computed(() => g.columns.value);
const selIdx = computed(() => cols.value.findIndex((c) => c.selectedId === sel.value?.id && c.index === g.segments.value.length - 1));
const myCol = computed(() => (selIdx.value >= 0 ? cols.value[selIdx.value] : cols.value[0]));
const next = computed(() => (selIdx.value >= 0 ? cols.value[selIdx.value + 1] : undefined));
const siblings = computed(() => myCol.value?.items ?? []);
const sibPos = computed(() => siblings.value.findIndex((it) => it.node.id === sel.value?.id));
const collapse = computed(() => flags.waypoints === 'collapse');

interface Door { key: string; label: string; count: number; items: { id: string; title: string; kind: string; viaId?: string }[]; dashed?: boolean; question?: string; gapKind?: string }
const doors = computed<Door[]>(() => {
  const n = next.value, s = sel.value; if (!n || !s) return [];
  const p = g.persp.value;
  // waypoint collapse: doors reach through the waypoint (usecase ⋯capability⋯ flow)
  if (n.waypoint && collapse.value && p && n.stepIndex + 1 < p.steps.length) {
    const step = p.steps[n.stepIndex + 1];
    const items = n.items.flatMap((w) => stepItems(g.ix.value, step, w.node).map((it) => ({ id: it.node.id, title: it.node.title, kind: it.node.kind, viaId: w.node.id })));
    const kinds = [...new Set(items.map((i) => i.kind))];
    return [{ key: 'through', label: `⋯${kindLabel(n.kinds[0]).toLowerCase()}⋯ ${(kinds.length ? kinds : step.kinds).map((k) => kindLabel(k, 2).toLowerCase()).join('·')}`, count: items.length, items, dashed: !items.length }];
  }
  const m = new Map<string, Door>();
  for (const it of n.items) {
    const verb = it.edge ? phrase(it.edge.type, it.dir ?? 'out') : '';
    const key = `${verb} ${kindLabel(it.node.kind)}`;
    const d = m.get(key) ?? m.set(key, { key, label: `${verb} ${kindIcon(it.node.kind)} ${kindLabel(it.node.kind, 2)}`, count: 0, items: [] }).get(key)!;
    d.count++; d.items.push({ id: it.node.id, title: it.node.title, kind: it.node.kind });
  }
  const out = [...m.values()];
  if (flags.gaps !== 'off') for (const gs of n.gaps) out.push({ key: 'gap:' + gs.question, label: `${gs.hop ? phrase(gs.hop.edge, gs.hop.dir) : '+'} ${kindLabel(gs.kind || 'node', 2)}`, count: 0, items: [], dashed: true, question: gs.question, gapKind: gs.kind });
  return out;
});
const otherEdges = computed<Nb[]>(() => {
  const s = sel.value; if (!s) return [];
  const inDoors = new Set((next.value?.items ?? []).map((i) => i.node.id));
  const parent = myCol.value?.parentId;
  return g.neighbours(s.id).filter((nb) => !inDoors.has(nb.other.id) && nb.other.id !== parent);
});
const openDoor = ref<string | null>(null);
const showOther = ref(false);
watch(() => sel.value?.id, () => { openDoor.value = null; showOther.value = false; });
function enterDoor(d: Door) {
  if (d.dashed && d.question) return g.openGap(d.gapKind ?? '', sel.value?.id ?? null, d.question);
  if (d.count === 1) return pickPeer(d.items[0]);
  openDoor.value = openDoor.value === d.key ? null : d.key;
}
function pickPeer(it: { id: string; viaId?: string }) {
  const n = next.value; if (!n) return;
  if (it.viaId) { g.go(g.view.value.persp, [...g.segments.value.slice(0, n.index), { id: it.viaId }, { id: it.id }]); return; }
  g.select(n.index, it.id);
}
function flip(d: number) {
  const list = siblings.value; if (!list.length || !myCol.value) return;
  const i = (sibPos.value + d + list.length) % list.length;
  g.select(myCol.value.index, list[i].node.id);
}
defineExpose({ flip, enterFirst: () => doors.value[0] && enterDoor(doors.value[0]) });

const railStep = computed(() => myCol.value?.stepIndex ?? 0);
function toStep(i: number) {
  const c = cols.value.find((x) => x.stepIndex === i);
  if (c) g.popTo(c.index + 1 <= g.segments.value.length ? c.index + 1 : c.index);
}

// twin: second rail picks the best bridging perspective (first other chain that reaches this node)
const twinChoice = ref<PerspId | null>(null);
const twinPersp = computed(() => {
  const s = sel.value; if (!s) return null;
  const cands = PERSPECTIVES.filter((p) => p.id !== g.view.value.persp && g.pathsFor(p.id, s.id).length);
  const chosen = cands.find((p) => p.id === twinChoice.value) ?? cands[0];
  return chosen ? { p: chosen, cands, path: g.resolvePath(chosen.id, s.id) ?? [] } : null;
});
const twinTitles = computed(() => {
  const t = twinPersp.value; if (!t) return [];
  return t.p.steps.map((_, i) => (t.path[i] ? g.byId(t.path[i])?.title ?? null : null));
});
const twinNext = computed(() => {
  const t = twinPersp.value, s = sel.value; if (!t || !s) return [];
  const si = t.path.length - 1;
  if (si + 1 >= t.p.steps.length) return [];
  return stepItems(g.ix.value, t.p.steps[si + 1], s);
});
function twinGo(path: string[]) { const t = twinPersp.value; if (t) g.go(t.p.id, path); }
</script>

<template>
  <div class="scroll-thin flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="space-y-1.5 border-b px-6 py-2.5">
      <LensRail v-if="g.persp.value" :persp="g.persp.value" :current="railStep" @step="toStep" />
      <template v-if="props.twin && twinPersp">
        <div class="flex items-center gap-2">
          <LensRail :persp="twinPersp.p" :current="twinPersp.path.length - 1" :titles="twinTitles" label="rail" @step="(i: number) => twinGo(twinPersp!.path.slice(0, i + 1))" />
          <select v-model="twinChoice" class="ml-auto rounded border bg-background px-1 py-0.5 text-[11px]">
            <option :value="null">best bridge</option>
            <option v-for="c in twinPersp.cands" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select>
        </div>
      </template>
      <div v-else-if="props.twin && sel" class="text-[11px] text-muted-foreground">No second perspective reaches this node. Twin rails need a bridge kind (screen, interface, thing, test, capability, module).</div>
    </div>

    <div v-if="!sel" class="mx-auto w-full max-w-[640px] px-6 py-6">
      <div class="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">start · {{ myCol?.kinds.map((k) => kindLabel(k, 2)).join(' · ') }}</div>
      <div class="space-y-px"><NodeRow v-for="it in myCol?.items ?? []" :key="it.node.id" :item="it" @select="g.select(0, it.node.id)" /></div>
    </div>

    <div v-else class="mx-auto w-full max-w-[720px] px-6 py-6">
      <div class="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
        <span class="tabular-nums">{{ sibPos + 1 }} / {{ siblings.length }}</span>
        <button class="rounded border px-1.5 hover:bg-accent" title="Previous sibling (←)" @click="flip(-1)">←</button>
        <button class="rounded border px-1.5 hover:bg-accent" title="Next sibling (→)" @click="flip(1)">→</button>
        <span class="truncate">{{ myCol?.kinds.map((k) => kindLabel(k, 2).toLowerCase()).join(' · ') }}<template v-if="myCol?.parentId"> of {{ g.byId(myCol.parentId)?.title }}</template></span>
      </div>
      <div class="fade-in space-rule rounded-lg border bg-card px-5 py-4 shadow-sm" :key="sel.id" :class="sel.status === 'draft' ? 'draft-rule border-dashed' : ''" :style="{ '--hue': hueOf(sel.kind) }">
        <div class="flex items-start gap-2">
          <span class="text-[20px] leading-7">{{ kindIcon(sel.kind) }}</span>
          <div class="min-w-0 flex-1">
            <h2 class="text-[17px] font-semibold leading-7 tracking-tight">{{ sel.title }}</h2>
            <div class="text-[11px] text-muted-foreground">{{ kind(sel.kind).label.toLowerCase() }} · {{ spaceOf(sel.kind).label.toLowerCase() }} · {{ sel.status }}</div>
          </div>
          <span v-if="BRIDGE_KINDS.has(sel.kind)" class="rounded border px-1.5 text-[12px]" title="Perspectives cross here (L to switch)">⇄</span>
        </div>
        <p v-if="sel.description" class="mt-2 line-clamp-4 whitespace-pre-line text-[13px] text-foreground/85">{{ sel.description }}</p>
        <NeedsList class="mt-3" :node="sel" />
      </div>

      <div class="mt-4 flex flex-wrap gap-1.5">
        <button
          v-for="d in doors" :key="d.key"
          class="rounded-md border px-2.5 py-1 text-[12px] transition-colors"
          :class="[d.dashed ? 'border-dashed border-gap/60 text-muted-foreground hover:text-foreground' : 'bg-card font-medium hover:bg-accent', openDoor === d.key ? 'ring-1 ring-foreground/40' : '']"
          @click="enterDoor(d)"
        >{{ d.label }} <span class="tabular-nums" :class="d.dashed ? 'text-gap' : 'text-muted-foreground'">{{ d.count }}</span></button>
        <button v-if="myCol?.parentId" class="rounded-md border px-2.5 py-1 text-[12px] text-muted-foreground hover:bg-accent" @click="g.up()">↩ came from {{ g.byId(myCol.parentId)?.title }}</button>
        <span v-if="!doors.length && !next" class="py-1 text-[12px] text-muted-foreground">End of the {{ g.persp.value?.label ?? '' }} chain.</span>
      </div>
      <div v-for="d in doors.filter((x) => x.key === openDoor)" :key="'open' + d.key" class="fade-in mt-2 rounded-md border bg-card p-1.5">
        <button v-for="it in d.items" :key="it.id + (it.viaId ?? '')" class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-accent" @click="pickPeer(it)">
          <span>{{ kindIcon(it.kind) }}</span><span class="truncate">{{ it.title }}</span>
          <span v-if="it.viaId" class="ml-auto truncate text-[11px] text-muted-foreground">via {{ g.byId(it.viaId)?.title }}</span>
        </button>
      </div>

      <div v-if="props.twin && twinPersp && twinNext.length" class="mt-4">
        <div class="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{{ twinPersp.p.label }} continues</div>
        <div class="flex flex-wrap gap-1">
          <button v-for="it in twinNext" :key="it.node.id" class="rounded-md border border-dashed px-2 py-0.5 text-[12px] hover:bg-accent" @click="twinGo([...twinPersp.path, it.node.id])">
            {{ it.edge ? phrase(it.edge.type, it.dir ?? 'out') : '' }} {{ kindIcon(it.node.kind) }} {{ it.node.title }}
          </button>
        </div>
      </div>

      <div v-if="otherEdges.length" class="mt-4">
        <button class="text-[12px] text-muted-foreground hover:text-foreground" @click="showOther = !showOther">other edges ({{ otherEdges.length }}) {{ showOther ? '▴' : '▾' }}</button>
        <div v-if="showOther" class="mt-1 flex flex-wrap gap-1">
          <button v-for="nb in otherEdges" :key="nb.edge.id" class="rounded border px-2 py-0.5 text-[11px] hover:bg-accent" @click="g.across(nb.edge.type, nb.other.id, nb.dir)">
            <span class="font-mono text-muted-foreground">{{ nb.dir === 'out' ? edgeLabel(nb.edge.type) + ' →' : '← ' + edgeLabel(nb.edge.type) }}</span> {{ kindIcon(nb.other.kind) }} {{ nb.other.title }}
          </button>
        </div>
      </div>
      <div v-if="next && next.gaps.length && flags.gaps === 'lane'" class="mt-4 space-y-1"><GapSlot v-for="s in next.gaps" :key="s.question" :slot="s" /></div>
    </div>
  </div>
</template>
