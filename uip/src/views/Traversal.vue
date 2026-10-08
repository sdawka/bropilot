<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Search, X } from 'lucide-vue-next';
import { useGraph } from '@/store/graph';
import { flags } from '@/flags';
import { perspMenuOpen, paletteOpen } from '@/store/ui';
import { PERSP_IDS } from '@/perspectives';
import { stepItems } from '@/store/traverse';
import Trail from '@/components/nav/Trail.vue';
import ColumnsNav from '@/components/nav/ColumnsNav.vue';
import FocusNav from '@/components/nav/FocusNav.vue';
import CanvasNav from '@/components/nav/CanvasNav.vue';
import OutlineNav from '@/components/nav/OutlineNav.vue';
import NodePane from '@/components/node/NodePane.vue';

const g = useGraph();
const route = useRoute();
const router = useRouter();
const active = ref(0);
const focusNav = ref<InstanceType<typeof FocusNav> | null>(null);
const filterEl = ref<HTMLInputElement | null>(null);
const filtering = ref(false);
const q = computed({
  get: () => (route.query.q as string) ?? '',
  set: (v: string) => router.replace({ query: { ...route.query, q: v || undefined } }),
});
watch(() => g.segments.value.length, (n) => { active.value = Math.min(Math.max(n - 1, 0), g.columns.value.length - 1); }, { immediate: true });
const showPane = computed(() => !!g.selection.value && (flags.nav === 'columns' || flags.nav === 'canvas' || flags.nav === 'outline'));
const previewNode = computed(() => (g.previewId.value ? g.byId(g.previewId.value) : null));
const ghostStats = computed(() => {
  const cs = g.ghost.value; if (!cs) return null;
  const v = (s: string) => cs.effects.filter((e) => e.verdict === s).length;
  return { n: cs.effects.length, acc: v('accepted'), rej: v('rejected') };
});

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
function colAt(i: number) { return g.columns.value[i]; }
function moveRow(d: number) {
  const col = colAt(active.value); if (!col || !col.items.length) return;
  const i = col.items.findIndex((it) => it.node.id === col.selectedId);
  const j = i < 0 ? (d > 0 ? 0 : col.items.length - 1) : Math.min(Math.max(i + d, 0), col.items.length - 1);
  g.select(col.index, col.items[j].node.id);
  requestAnimationFrame(() => document.querySelector(`[data-col="${col.index}"] [data-node="${CSS.escape(col.items[j].node.id)}"]`)?.scrollIntoView({ block: 'nearest' }));
}
function right(skipWaypoint = false) {
  let nextIdx = active.value + 1;
  let col = colAt(nextIdx);
  if (!col || !colAt(active.value)?.selectedId) return;
  if (col.selectedId) { active.value = nextIdx; return; }
  if (!col.items.length) return;
  if (skipWaypoint && col.waypoint && flags.waypoints === 'collapse') {
    // ⌥→ over a collapsed waypoint: take the first waypoint row that leads somewhere
    const p = g.persp.value;
    const after = p && col.stepIndex + 1 < p.steps.length ? p.steps[col.stepIndex + 1] : null;
    const hit = col.items.map((w) => ({ w, kids: after ? stepItems(g.ix.value, after, w.node) : [] })).find((x) => x.kids.length) ?? { w: col.items[0], kids: [] };
    const segs = [...g.segments.value.slice(0, nextIdx), { id: hit.w.node.id }, ...(hit.kids[0] ? [{ id: hit.kids[0].node.id }] : [])];
    g.go(g.view.value.persp, segs);
    active.value = nextIdx + (hit.kids[0] ? 1 : 0); return;
  }
  g.select(nextIdx, col.items[0].node.id);
  active.value = nextIdx;
}
function left() {
  if (active.value <= 0) return;
  g.popTo(active.value);
  active.value = active.value - 1;
}
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && flags.chat === 'palette') { e.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
  if (isTyping(e) || e.metaKey || e.ctrlKey) return;
  const focus = flags.nav === 'focus' || flags.nav === 'twin';
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); if (!focus) moveRow(1); break;
    case 'ArrowUp': e.preventDefault(); if (!focus) moveRow(-1); break;
    case 'ArrowRight':
      e.preventDefault();
      if (e.altKey) right(true); else if (focus) focusNav.value?.flip(1); else right();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (e.altKey) g.up(); else if (focus) focusNav.value?.flip(-1); else left();
      break;
    case 'Enter':
      e.preventDefault();
      if (g.previewId.value) g.confirmPreview(); else if (focus) focusNav.value?.enterFirst(); else right();
      break;
    case 'Backspace': e.preventDefault(); g.up(); break;
    case 'Escape': if (g.previewId.value || g.filterIds.value || g.highlightIds.value.length) g.dispatch({ verb: 'clear' }); else if (q.value) q.value = ''; break;
    case 'l': case 'L': e.preventDefault(); perspMenuOpen.value = true; break;
    case '/': e.preventDefault(); filtering.value = true; requestAnimationFrame(() => filterEl.value?.focus()); break;
    default:
      if (perspMenuOpen.value && /^[1-6]$/.test(e.key)) { perspMenuOpen.value = false; g.switchPersp(PERSP_IDS[+e.key - 1]); }
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex h-9 shrink-0 items-center gap-3 border-b px-3">
      <Trail class="min-w-0 flex-1" />
      <div v-if="g.filterIds.value" class="flex items-center gap-1 rounded-full border bg-accent px-2 py-0.5 text-[11px]">
        filtered by chat · {{ g.filterIds.value.length }}<button @click="g.dispatch({ verb: 'filter', ids: [] })"><X class="size-3" /></button>
      </div>
      <div class="flex items-center gap-1 rounded-md border px-1.5" :class="filtering || q ? '' : 'border-transparent'">
        <Search class="size-3 text-muted-foreground" />
        <input ref="filterEl" v-model="q" placeholder="/ filter column" class="w-28 bg-transparent py-0.5 text-[12px] outline-none placeholder:text-muted-foreground/70" @keydown.escape="q = ''; filterEl?.blur()" @blur="filtering = false" />
      </div>
      <span class="font-mono text-[10px] text-muted-foreground">{{ flags.nav }}<template v-if="flags.persp !== 'curated'"> · {{ flags.persp }}</template></span>
    </div>
    <div v-if="previewNode" class="flex shrink-0 items-center gap-2 border-b border-dashed border-draft/60 bg-draft/5 px-3 py-1 text-[12px]">
      <span class="text-draft">◆ System One suggests</span><b>{{ previewNode.title }}</b>
      <button class="rounded border px-1.5 text-[11px] hover:bg-accent" @click="g.confirmPreview()">Enter · go</button>
      <button class="text-[11px] text-muted-foreground hover:text-foreground" @click="g.dispatch({ verb: 'clear' })">Esc · dismiss</button>
    </div>
    <div v-if="g.ghost.value && ghostStats" class="flex shrink-0 items-center gap-2 border-b border-dashed border-draft/60 bg-draft/5 px-3 py-1 text-[12px]">
      <span class="text-draft">⎇ reviewing #{{ g.ghost.value.number }}</span><span class="truncate">{{ g.ghost.value.title }}</span>
      <span class="text-muted-foreground">{{ ghostStats.acc }} ✓ · {{ ghostStats.rej }} ✗ · {{ ghostStats.n - ghostStats.acc - ghostStats.rej }} pending — dashed rows are proposed, use ✓/✗ pins</span>
      <button class="ml-auto text-[11px] text-muted-foreground hover:text-foreground" @click="g.ghost.value = null">stop ghosting</button>
    </div>

    <div v-if="!g.ready.value" class="grid flex-1 place-items-center text-[12px] text-muted-foreground">Loading {{ route.params.project }}…</div>
    <div v-else class="flex min-h-0 flex-1">
      <ColumnsNav v-if="flags.nav === 'columns'" v-model:active="active" class="cols" />
      <FocusNav v-else-if="flags.nav === 'focus' || flags.nav === 'twin'" ref="focusNav" :twin="flags.nav === 'twin'" />
      <CanvasNav v-else-if="flags.nav === 'canvas'" />
      <OutlineNav v-else />
      <aside v-if="showPane && g.selection.value" class="node-pane w-[380px] shrink-0 border-l bg-card">
        <NodePane :node="g.selection.value" />
      </aside>
    </div>
  </div>
</template>
