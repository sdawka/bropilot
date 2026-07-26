<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue';
import { nanoid } from 'nanoid';
import { draft, resetStorm, type Sticky, type StormCol } from '../../lib/workshopDraft';
import { diffAgainstGraph, type Changeset, type RawGraph } from '../../lib/changeset';
import { buildPrompt, parseReply } from '../../lib/bridge';
import { edgeForPair, buildRawFromStickies } from '../../lib/stormMapping';
import { state } from '../../lib/store';
import { toast } from '../../lib/toast';
import MergeReview from './MergeReview.vue';

const COLS: { id: StormCol; label: string; kind: string; hue: string }[] = [
  { id: 'actor', label: 'Actors', kind: 'persona', hue: '#f5d76e' },
  { id: 'command', label: 'Commands', kind: 'behaviour', hue: '#5b9bd5' },
  { id: 'aggregate', label: 'Aggregates', kind: 'entity', hue: '#c9a66b' },
  { id: 'event', label: 'Events', kind: 'event', hue: '#e08a4a' },
  { id: 'hotspot', label: 'Hotspots', kind: 'hypothesis', hue: '#d46a9f' },
];

const stickies = computed(() => draft.stickies);
function inCol(col: StormCol) {
  return stickies.value.filter((s) => s.col === col);
}

// ── CRUD ──
function addSticky(col: StormCol) {
  draft.stickies.push({ id: `stk-${nanoid(6)}`, col, title: '', links: [] });
}
function removeSticky(id: string) {
  draft.stickies = draft.stickies.filter((s) => s.id !== id);
  for (const s of draft.stickies) s.links = s.links.filter((l) => l.toId !== id);
}
function byId(id: string) {
  return draft.stickies.find((s) => s.id === id);
}

// ── hand-rolled drag (pointer events, like ForceGraph) ──
const dragId = ref<string | null>(null);
const dragPos = ref({ x: 0, y: 0 });
let dropTarget: { type: 'sticky'; id: string } | { type: 'col'; col: StormCol } | null = null;

function onStickyDown(id: string, ev: PointerEvent) {
  ev.stopPropagation();
  dragId.value = id;
  dragPos.value = { x: ev.clientX, y: ev.clientY };
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
function onMove(ev: PointerEvent) {
  if (!dragId.value) return;
  dragPos.value = { x: ev.clientX, y: ev.clientY };
  const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-sticky-id],[data-col-id]') as HTMLElement | null;
  if (!el) dropTarget = null;
  else if (el.dataset.stickyId && el.dataset.stickyId !== dragId.value) dropTarget = { type: 'sticky', id: el.dataset.stickyId };
  else if (el.dataset.colId) dropTarget = { type: 'col', col: el.dataset.colId as StormCol };
  else dropTarget = null;
}
function onUp() {
  const src = dragId.value ? byId(dragId.value) : null;
  if (src && dropTarget) {
    if (dropTarget.type === 'sticky') {
      const dst = byId(dropTarget.id);
      if (dst && edgeForPair(src.col, dst.col) && !src.links.some((l) => l.toId === dst.id)) {
        src.links.push({ toId: dst.id });
        toast(`Linked ${src.col} → ${dst.col}`);
      } else if (dst && !edgeForPair(src.col, dst.col)) {
        toast(`No legal pairing for ${src.col} → ${dst.col}`);
      }
    } else if (dropTarget.type === 'col' && dropTarget.col !== src.col) {
      src.col = dropTarget.col;
    }
  }
  dragId.value = null;
  dropTarget = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
}
// A drag left in progress when this view unmounts (e.g. navigating back to
// the hub mid-drag) must not leave window listeners alive over stale state.
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  dragId.value = null;
  dropTarget = null;
});

// ── convert ──
const review = ref<Changeset | null>(null);
function buildRaw(): RawGraph {
  return buildRawFromStickies(draft.stickies);
}
function convert() {
  review.value = diffAgainstGraph(state.graph, buildRaw());
}
function onApplied() {
  review.value = null;
  resetStorm();
}

// ── optional LLM refine ──
async function refine() {
  const raw = buildRaw();
  const summary = raw.nodes.map((n: { kind: string; title: string }) => `${n.kind}: ${n.title}`).join('\n');
  const prompt = buildPrompt({ exercise: 'storm', docText: summary, graph: state.graph });
  try {
    await navigator.clipboard.writeText(prompt);
    toast('✨ Storm prompt copied — paste into any LLM, then paste the reply below');
  } catch {
    /* clipboard unavailable — user can still copy from the deck manually elsewhere */
  }
}
const replyText = ref('');
const replyError = ref('');
function ingestReply() {
  const res = parseReply(replyText.value);
  if ('error' in res) {
    replyError.value = res.error;
    return;
  }
  replyError.value = '';
  const cs = diffAgainstGraph(state.graph, res.raw);
  cs.warnings.unshift(...res.warnings);
  review.value = cs;
}
</script>

<template>
  <div class="event-storm">
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <h2 class="display text-2xl">Event storming</h2>
      <div class="ml-auto flex gap-2">
        <button class="btn" data-testid="storm-refine" @click="refine">✨ Refine with an LLM</button>
        <button class="btn btn-primary" data-testid="storm-convert" @click="convert">Convert to graph →</button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
      <div v-for="c in COLS" :key="c.id" class="rounded-xl border hairline bg-ink-900 p-2" :data-col-id="c.id">
        <div class="mb-2 flex items-center justify-between px-1">
          <span class="kicker" :style="{ color: c.hue }">{{ c.label }}</span>
          <button class="btn btn-ghost !px-1.5 !py-0.5 text-xs" :data-testid="`storm-add-${c.id}`" @click="addSticky(c.id)">+</button>
        </div>
        <div class="space-y-2">
          <div
            v-for="s in inCol(c.id)"
            :key="s.id"
            class="group rounded-lg border p-2 text-xs"
            :class="dragId === s.id ? 'opacity-50' : ''"
            :style="{ background: c.hue + '22', borderColor: c.hue + '55' }"
            :data-sticky-id="s.id"
            @pointerdown="onStickyDown(s.id, $event)"
          >
            <input
              v-model="s.title"
              class="w-full bg-transparent font-medium text-ink-100 outline-none"
              placeholder="Title…"
              @pointerdown.stop
            />
            <input
              v-model="s.note"
              class="mt-1 w-full bg-transparent text-[0.68rem] text-ink-300 outline-none"
              placeholder="note…"
              @pointerdown.stop
            />
            <div v-if="s.links.length" class="mt-1 text-[0.6rem] text-ink-400">→ {{ s.links.length }} link(s)</div>
            <button class="mt-1 text-[0.6rem] text-ink-400 opacity-0 group-hover:opacity-100" @click.stop="removeSticky(s.id)">remove</button>
          </div>
        </div>
      </div>
    </div>

    <details class="mt-5 rounded-lg border hairline p-3 text-xs">
      <summary class="cursor-pointer text-ink-300">Paste an LLM reply (optional)</summary>
      <textarea v-model="replyText" rows="5" class="field mt-2 resize-none font-mono text-[0.68rem]" placeholder='{ "nodes": [...], "edges": [...] }' />
      <p v-if="replyError" class="mt-1 text-rose-400">⚠ {{ replyError }}</p>
      <button class="btn mt-2" :disabled="!replyText.trim()" @click="ingestReply">Review reply →</button>
    </details>

    <MergeReview v-if="review" :changeset="review" @close="review = null" @applied="onApplied" />
  </div>
</template>
