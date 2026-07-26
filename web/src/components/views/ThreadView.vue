<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { threadFor, type Thread } from '../../lib/thread';
import { state } from '../../lib/store';
import { KIND_MAP, EDGE_TYPE_LABELS, nodeHue, PARTS } from '../../lib/schema';

// Layout geometry (deterministic — no forces, no drag).
const COL_W = 260;
const COL_X0 = 60;
const CARD_W = 190;
const CARD_H = 46;
const ROW_H = 66;
const TOP = 88;

// The thread stays rooted on `anchorId`; selecting a card only moves the
// spotlight. "Anchor here" re-roots. First selection seeds the anchor.
const anchorId = ref<string | null>(state.selectedId);
watch(
  () => state.selectedId,
  (id) => {
    if (id && !anchorId.value) anchorId.value = id;
  },
);

const thread = computed<Thread>(() => threadFor(state.graph, anchorId.value ?? ''));

const PART_LABEL: Record<string, string> = Object.fromEntries(PARTS.map((p) => [p.id, p.label]));

// id -> card geometry, for edge endpoints and card rendering.
interface Placed {
  id: string;
  title: string;
  icon: string;
  hue: string;
  col: number;
  cx: number; // card left
  cy: number; // card top
  centerY: number;
}
const placed = computed(() => {
  const map = new Map<string, Placed>();
  thread.value.columns.forEach((column, col) => {
    const cx = COL_X0 + col * COL_W;
    for (const tn of column.nodes) {
      const cy = TOP + tn.row * ROW_H;
      const def = KIND_MAP[tn.node.kind];
      map.set(tn.node.id, {
        id: tn.node.id,
        title: tn.node.title,
        icon: def?.icon ?? '•',
        hue: nodeHue(tn.node),
        col,
        cx,
        cy,
        centerY: cy + CARD_H / 2,
      });
    }
  });
  return map;
});

const cards = computed(() => [...placed.value.values()]);

const maxRows = computed(() =>
  Math.max(1, ...thread.value.columns.map((c) => c.nodes.length)),
);
const svgWidth = COL_X0 + 3 * COL_W;
const svgHeight = computed(() => TOP + maxRows.value * ROW_H + 40);

const columnHeaders = computed(() =>
  thread.value.columns.map((c, col) => ({
    part: c.part,
    label: PART_LABEL[c.part] ?? c.part,
    x: COL_X0 + col * COL_W + CARD_W / 2,
  })),
);

// Spotlight = selected node + its thread neighbours.
const spotlight = computed(() => {
  const set = new Set<string>();
  const sel = state.selectedId;
  if (sel && placed.value.has(sel)) {
    set.add(sel);
    for (const e of thread.value.edges) {
      if (e.srcId === sel) set.add(e.dstId);
      if (e.dstId === sel) set.add(e.srcId);
    }
  }
  return set;
});

interface EdgePath {
  id: string;
  d: string;
  labelX: number;
  labelY: number;
  text: string;
  active: boolean;
}
const edgePaths = computed<EdgePath[]>(() => {
  const out: EdgePath[] = [];
  for (const e of thread.value.edges) {
    const s = placed.value.get(e.srcId);
    const t = placed.value.get(e.dstId);
    if (!s || !t) continue;
    const active = spotlight.value.has(e.srcId) && spotlight.value.has(e.dstId);
    const text = EDGE_TYPE_LABELS[e.type] ?? e.type;
    if (s.col === t.col) {
      // same-column: short arc bulging to the right of the column
      const x = s.cx + CARD_W;
      const y1 = s.centerY;
      const y2 = t.centerY;
      const bulge = x + 46;
      out.push({
        id: e.id,
        d: `M ${x} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x} ${y2}`,
        labelX: bulge,
        labelY: (y1 + y2) / 2,
        text,
        active,
      });
    } else {
      // cross-column: horizontal bezier from right edge to left edge
      const [a, b] = s.col < t.col ? [s, t] : [t, s];
      const x1 = a.cx + CARD_W;
      const y1 = a.centerY;
      const x2 = b.cx;
      const y2 = b.centerY;
      const mx = (x1 + x2) / 2;
      out.push({
        id: e.id,
        d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
        labelX: mx,
        labelY: (y1 + y2) / 2 - 5,
        text,
        active,
      });
    }
  }
  return out;
});

function selectCard(id: string) {
  state.selectedId = id;
}
function anchorHere() {
  if (state.selectedId) anchorId.value = state.selectedId;
}
</script>

<template>
  <div class="thread-view relative h-full w-full overflow-auto">
    <!-- empty state -->
    <div
      v-if="!anchorId || cards.length === 0"
      class="absolute inset-0 grid place-items-center text-center text-ink-400"
    >
      <div>
        <div class="mb-2 text-3xl opacity-40">🧵</div>
        <p class="text-sm">Select a node to trace its thread.</p>
      </div>
    </div>

    <template v-else>
      <div class="pointer-events-none absolute left-5 top-4 z-10">
        <h1 class="display text-2xl">Thread</h1>
        <p v-if="thread.capped" class="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-amber-300/80">
          Showing the first 60 connected nodes
        </p>
      </div>

      <svg :width="svgWidth" :height="svgHeight" class="block select-none">
        <defs>
          <marker id="thread-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="rgba(190,195,215,0.55)" />
          </marker>
          <marker id="thread-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#78a9ff" />
          </marker>
        </defs>

        <!-- column headers -->
        <text
          v-for="h in columnHeaders"
          :key="h.part"
          :x="h.x"
          :y="52"
          text-anchor="middle"
          font-size="12"
          fill="#8b97b0"
          class="font-mono font-semibold uppercase"
          style="letter-spacing: 0.24em"
        >{{ h.label }}</text>

        <!-- edges -->
        <g fill="none" stroke-linecap="round">
          <path
            v-for="e in edgePaths"
            :key="e.id"
            :d="e.d"
            :stroke="e.active ? '#78a9ff' : 'rgba(190,195,215,0.24)'"
            :stroke-width="e.active ? 2.2 : 1.2"
            :marker-end="e.active ? 'url(#thread-arrow-active)' : 'url(#thread-arrow)'"
          />
        </g>
        <g class="pointer-events-none">
          <text
            v-for="e in edgePaths"
            v-show="e.active"
            :key="`lbl-${e.id}`"
            :x="e.labelX"
            :y="e.labelY"
            text-anchor="middle"
            font-size="8.5"
            fill="#78a9ff"
            class="font-mono font-semibold uppercase"
            :style="{ letterSpacing: '0.14em', paintOrder: 'stroke', stroke: 'rgba(10,10,12,0.92)', strokeWidth: '3.5px' }"
          >{{ e.text }}</text>
        </g>

        <!-- cards -->
        <g
          v-for="c in cards"
          :key="c.id"
          class="thread-card cursor-pointer"
          :data-node-id="c.id"
          :data-anchor="c.id === anchorId ? 'true' : 'false'"
          @click="selectCard(c.id)"
        >
          <rect
            :x="c.cx"
            :y="c.cy"
            :width="CARD_W"
            :height="CARD_H"
            rx="8"
            fill="rgba(16,18,27,0.92)"
            :stroke="c.hue"
            :stroke-width="c.id === state.selectedId ? 2.4 : 1.4"
            :opacity="spotlight.size && !spotlight.has(c.id) ? 0.45 : 1"
          />
          <circle v-if="c.id === anchorId" :cx="c.cx + 13" :cy="c.centerY" r="9" fill="none" :stroke="c.hue" stroke-width="2" />
          <text :x="c.cx + 13" :y="c.centerY + 5" text-anchor="middle" font-size="14">{{ c.icon }}</text>
          <text
            :x="c.cx + 30"
            :y="c.centerY + 4"
            font-size="12"
            fill="#cdd5e8"
            class="pointer-events-none font-medium"
          >{{ c.title.length > 20 ? c.title.slice(0, 19) + '…' : c.title }}</text>
        </g>
      </svg>

      <!-- re-anchor affordance -->
      <button
        v-if="state.selectedId && state.selectedId !== anchorId && placed.has(state.selectedId)"
        class="btn glass absolute bottom-5 right-5 z-10"
        @click="anchorHere"
      >⚓ Anchor here</button>
    </template>
  </div>
</template>
