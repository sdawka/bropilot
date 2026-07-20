<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
} from 'd3-force';
import { KIND_MAP, SPACES, EDGE_TYPE_LABELS, nodeHue, nodeSpace, type GraphNode, type GraphEdge, type Space } from '../../lib/schema';
import { getPos, setPositions, flushPositions, clearLayout } from '../../lib/layout';

const props = defineProps<{ nodes: GraphNode[]; edges: GraphEdge[]; selectedId: string | null; dash?: Record<string, string> }>();
const emit = defineEmits<{ (e: 'select', id: string | null): void }>();

interface SimNode {
  id: string;
  node: GraphNode;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  deg: number;
}
interface SimLink {
  id: string;
  type: string;
  label?: string;
  source: SimNode;
  target: SimNode;
}

const wrap = ref<HTMLDivElement | null>(null);
const size = reactive({ w: 800, h: 600 });
const view = reactive({ k: 1, x: 0, y: 0 });
const frame = ref(0);
const hoverId = ref<string | null>(null);

let sim: Simulation<SimNode, SimLink> | null = null;
let simNodes: SimNode[] = [];
let simLinks: SimLink[] = [];
let nodeIndex = new Map<string, SimNode>();
let ro: ResizeObserver | null = null;

// ── space columns — the semantic narrative reads left → right ──
const SPACE_COL: Record<Space, number> = { basics: 0, problem: 1, solution: 2, crosscutting: 3 };

function colX(space: Space): number {
  return size.w * (0.125 + 0.25 * SPACE_COL[space]);
}

function degrees(): Map<string, number> {
  const d = new Map<string, number>();
  for (const e of props.edges) {
    d.set(e.srcId, (d.get(e.srcId) ?? 0) + 1);
    d.set(e.dstId, (d.get(e.dstId) ?? 0) + 1);
  }
  return d;
}

function savePositions(flush = false) {
  setPositions(simNodes.map((n) => [n.id, { x: n.x, y: n.y }] as [string, { x: number; y: number }]));
  if (flush) flushPositions();
}

function build() {
  const deg = degrees();
  const prev = nodeIndex;
  nodeIndex = new Map();
  let fresh = 0; // nodes with neither a live sim position nor a stored one
  let restored = 0;
  simNodes = props.nodes.map((node) => {
    const existing = prev.get(node.id);
    let sn: SimNode;
    if (existing) {
      sn = existing;
    } else {
      const stored = getPos(node.id);
      if (stored) restored++;
      else fresh++;
      sn = {
        id: node.id,
        node,
        // seed fresh nodes inside their space column so the layout converges structured
        x: stored?.x ?? colX(nodeSpace(node)) + Math.cos(prev.size + simNodes.length) * 30,
        y: stored?.y ?? size.h / 2 + Math.sin(prev.size + simNodes.length) * 120,
        deg: 0,
      };
    }
    sn.node = node;
    sn.deg = deg.get(node.id) ?? 0;
    nodeIndex.set(node.id, sn);
    return sn;
  });

  simLinks = props.edges
    .map((e) => {
      const source = nodeIndex.get(e.srcId);
      const target = nodeIndex.get(e.dstId);
      if (!source || !target) return null;
      return { id: e.id, type: e.type, label: e.label, source, target } as SimLink;
    })
    .filter((x): x is SimLink => x !== null);

  if (!sim) {
    sim = forceSimulation<SimNode, SimLink>()
      .force('charge', forceManyBody().strength(-340))
      .force('center', forceCenter(size.w / 2, size.h / 2).strength(0.06))
      // pull each node toward its space column instead of one global centre
      .force('x', forceX<SimNode>((d) => colX(nodeSpace(d.node))).strength(0.14))
      .force('y', forceY(size.h / 2).strength(0.05))
      .force('collide', forceCollide<SimNode>().radius((d) => radius(d) + 14))
      .on('tick', () => {
        frame.value++;
        if (frame.value % 15 === 0) savePositions();
      })
      .on('end', () => savePositions(true));
  }
  sim.nodes(simNodes);
  sim.force(
    'link',
    forceLink<SimNode, SimLink>(simLinks)
      .id((d) => d.id)
      .distance((l) => 90 + (l.source.deg + l.target.deg) * 6)
      .strength(0.5),
  );
  // Alpha policy: a fully positioned layout (live or restored) must not move
  // at all — even alpha 0.05 decays over ~170 ticks and drifts a settled
  // layout. A handful of new nodes settle gently; only a layout with no
  // positions at all gets the full-energy run.
  const alpha = fresh === 0 ? 0 : prev.size + restored === 0 ? 0.9 : 0.3;
  if (alpha > 0) sim.alpha(alpha).restart();
  else sim.stop(); // drag still reheats via alphaTarget on pointerdown
  frame.value++;
  return alpha;
}

function radius(d: SimNode) {
  return 9 + Math.min(d.deg, 8) * 1.7;
}

// ── derived render data (re-computed each frame) ──
const links = computed(() => {
  frame.value; // dependency
  return simLinks.map((l) => ({
    id: l.id,
    type: l.type,
    x1: l.source.x,
    y1: l.source.y,
    x2: l.target.x,
    y2: l.target.y,
    active: isActive(l.source.id) || isActive(l.target.id),
    connectsSel:
      props.selectedId != null && (l.source.id === props.selectedId || l.target.id === props.selectedId),
    mx: (l.source.x + l.target.x) / 2,
    my: (l.source.y + l.target.y) / 2,
    text: (EDGE_TYPE_LABELS[l.type] ?? l.type) + (l.label ? ` · ${l.label}` : ''),
  }));
});

const dots = computed(() => {
  frame.value;
  return simNodes.map((d) => ({
    id: d.id,
    x: d.x,
    y: d.y,
    r: radius(d),
    title: d.node.title,
    icon: KIND_MAP[d.node.kind]?.icon ?? '•',
    hue: nodeHue(d.node),
    selected: d.id === props.selectedId,
    active: isActive(d.id),
    dim: dimmed(d.id),
  }));
});

// column headers + separators track the node bounds, panning/zooming with the graph
const columns = computed(() => {
  frame.value;
  if (!simNodes.length) return { labels: [], seps: [] };
  let minY = Infinity, maxY = -Infinity;
  for (const n of simNodes) {
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  const top = minY - 64;
  const labels = (Object.keys(SPACE_COL) as Space[]).map((s) => ({
    id: s,
    label: SPACES[s].label,
    hue: SPACES[s].hue,
    x: colX(s),
    y: top,
  }));
  const seps = [1, 2, 3].map((i) => ({
    id: i,
    x: size.w * 0.25 * i,
    y1: top - 14,
    y2: maxY + 56,
  }));
  return { labels, seps };
});

function neighbours(id: string): Set<string> {
  const s = new Set<string>([id]);
  for (const l of simLinks) {
    if (l.source.id === id) s.add(l.target.id);
    if (l.target.id === id) s.add(l.source.id);
  }
  return s;
}
function isActive(id: string) {
  const focus = hoverId.value ?? props.selectedId;
  if (!focus) return false;
  return neighbours(focus).has(id);
}
function dimmed(id: string) {
  const focus = hoverId.value ?? props.selectedId;
  if (!focus) return false;
  return !neighbours(focus).has(id);
}

// ── drag ──
let dragging: SimNode | null = null;

function toSim(clientX: number, clientY: number) {
  const rect = wrap.value!.getBoundingClientRect();
  return {
    x: (clientX - rect.left - view.x) / view.k,
    y: (clientY - rect.top - view.y) / view.k,
  };
}

function onNodeDown(d: { id: string }, ev: PointerEvent) {
  ev.stopPropagation();
  const sn = nodeIndex.get(d.id);
  if (!sn) return;
  dragging = sn;
  emit('select', d.id);
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  sim?.alphaTarget(0.3).restart();
}

// ── background pan ──
let panning = false;
let panStart = { x: 0, y: 0, vx: 0, vy: 0 };

function onBgDown(ev: PointerEvent) {
  panning = true;
  panStart = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y };
  (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
  emit('select', null);
}

function onMove(ev: PointerEvent) {
  if (dragging) {
    const p = toSim(ev.clientX, ev.clientY);
    dragging.fx = p.x;
    dragging.fy = p.y;
    frame.value++;
  } else if (panning) {
    view.x = panStart.vx + (ev.clientX - panStart.x);
    view.y = panStart.vy + (ev.clientY - panStart.y);
  }
}
function onUp() {
  if (dragging) {
    dragging.fx = null;
    dragging.fy = null;
    dragging = null;
    sim?.alphaTarget(0);
    savePositions(true);
  }
  panning = false;
}

function onWheel(ev: WheelEvent) {
  ev.preventDefault();
  const rect = wrap.value!.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
  const k = Math.max(0.3, Math.min(2.6, view.k * factor));
  // zoom toward cursor
  view.x = mx - ((mx - view.x) * k) / view.k;
  view.y = my - ((my - view.y) * k) / view.k;
  view.k = k;
}

function fit() {
  if (!simNodes.length) {
    view.k = 1;
    view.x = 0;
    view.y = 0;
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of simNodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  minY -= 76; // reserve room for the column headers above the topmost node
  const pad = 80;
  const gw = maxX - minX + pad * 2;
  const gh = maxY - minY + pad * 2;
  const k = Math.max(0.3, Math.min(1.6, Math.min(size.w / gw, size.h / gh)));
  view.k = k;
  view.x = size.w / 2 - ((minX + maxX) / 2) * k;
  view.y = size.h / 2 - ((minY + maxY) / 2) * k;
  // keep the column headers clear of the fixed title overlay (top-left HTML)
  const labelScreenY = (minY + 12) * k + view.y; // header baseline ≈ minY-64 pre-reserve
  if (labelScreenY < 96) view.y += 96 - labelScreenY;
}

/** Forget stored positions and run a fresh full-energy layout. */
function relayout() {
  clearLayout();
  for (const n of simNodes) {
    n.fx = null;
    n.fy = null;
  }
  sim?.alpha(0.9).restart();
}

defineExpose({ fit, relayout });

onMounted(() => {
  ro = new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    size.w = r.width;
    size.h = r.height;
  });
  ro.observe(wrap.value!);
  size.w = wrap.value!.clientWidth || 800;
  size.h = wrap.value!.clientHeight || 600;
  const alpha = build();
  // Settled (restored) layouts can frame themselves immediately; fresh
  // layouts need a beat for the forces to spread the nodes out.
  if (alpha === 0) fit();
  else setTimeout(fit, 600);
});

onBeforeUnmount(() => {
  // ForceGraph unmounts on every view switch — persist before dying.
  savePositions(true);
  ro?.disconnect();
  sim?.stop();
});

watch(
  () => [props.nodes.map((n) => n.id).join(','), props.edges.map((e) => e.id).join(',')].join('|'),
  () => build(),
);

// Undo/import can replace every node object without changing ids — build()
// won't run, leaving SimNode.node pointing at detached objects. Remap on any
// new props.nodes array identity. No sim restart: positions are untouched.
watch(
  () => props.nodes,
  (nodes) => {
    for (const node of nodes) {
      const sn = nodeIndex.get(node.id);
      if (sn) sn.node = node;
    }
    frame.value++;
  },
);
</script>

<template>
  <div
    ref="wrap"
    class="relative h-full w-full touch-none overflow-hidden"
    @pointerdown="onBgDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointerleave="onUp"
    @wheel="onWheel"
  >
    <svg :width="size.w" :height="size.h" class="block select-none">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(190,195,215,0.55)" />
        </marker>
        <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#78a9ff" />
        </marker>
      </defs>

      <g :transform="`translate(${view.x},${view.y}) scale(${view.k})`">
        <!-- space column grid — editorial rules + headers -->
        <g class="pointer-events-none">
          <line
            v-for="sep in columns.seps"
            :key="`sep-${sep.id}`"
            :x1="sep.x"
            :y1="sep.y1"
            :x2="sep.x"
            :y2="sep.y2"
            stroke="rgba(255,255,255,0.07)"
            stroke-dasharray="1 7"
          />
          <text
            v-for="s in columns.labels"
            :key="s.id"
            :x="s.x"
            :y="s.y"
            text-anchor="middle"
            font-size="12"
            :fill="s.hue"
            opacity="0.75"
            class="font-mono font-semibold uppercase"
            style="letter-spacing: 0.24em"
          >{{ s.label }}</text>
        </g>

        <!-- edges -->
        <g stroke-linecap="round">
          <line
            v-for="l in links"
            :key="l.id"
            :x1="l.x1"
            :y1="l.y1"
            :x2="l.x2"
            :y2="l.y2"
            :stroke="l.connectsSel || l.active ? '#78a9ff' : 'rgba(190,195,215,0.26)'"
            :stroke-width="l.connectsSel || l.active ? 2.2 : 1.2"
            :stroke-dasharray="props.dash?.[l.id] || undefined"
            :marker-end="l.connectsSel || l.active ? 'url(#arrow-active)' : 'url(#arrow)'"
            :style="{ transition: 'stroke 0.2s' }"
          />
        </g>

        <!-- edge-type labels — spotlighted edges only, to avoid clutter -->
        <g class="pointer-events-none">
          <template v-for="l in links" :key="`lbl-${l.id}`">
            <text
              v-if="l.connectsSel || l.active"
              :x="l.mx"
              :y="l.my - 5"
              text-anchor="middle"
              :font-size="8.5"
              fill="#78a9ff"
              class="font-mono font-semibold uppercase"
              :style="{ letterSpacing: '0.14em', paintOrder: 'stroke', stroke: 'rgba(10,10,12,0.92)', strokeWidth: '3.5px' }"
            >{{ l.text }}</text>
          </template>
        </g>

        <!-- nodes -->
        <g>
          <g
            v-for="d in dots"
            :key="d.id"
            :transform="`translate(${d.x},${d.y})`"
            class="cursor-pointer"
            :style="{ opacity: d.dim ? 0.28 : 1, transition: 'opacity 0.2s' }"
            @pointerdown="onNodeDown(d, $event)"
            @pointerenter="hoverId = d.id"
            @pointerleave="hoverId = null"
          >
            <circle v-if="d.selected" :r="d.r + 7" :fill="d.hue" opacity="0.18" />
            <circle
              :r="d.r"
              :fill="d.hue"
              :stroke="d.selected ? '#fff' : 'rgba(7,8,13,0.9)'"
              :stroke-width="d.selected ? 2 : 1.5"
              :style="{ filter: d.selected || d.active ? `drop-shadow(0 0 8px ${d.hue})` : 'none' }"
            />
            <text
              :y="d.r + 13"
              text-anchor="middle"
              class="pointer-events-none font-medium"
              :font-size="11"
              :fill="d.dim ? 'rgba(139,151,176,0.6)' : '#cdd5e8'"
              :style="{ paintOrder: 'stroke', stroke: 'rgba(7,8,13,0.85)', strokeWidth: '3px' }"
            >{{ d.title.length > 22 ? d.title.slice(0, 21) + '…' : d.title }}</text>
          </g>
        </g>
      </g>
    </svg>

    <div v-if="!dots.length" class="absolute inset-0 grid place-items-center text-center text-ink-400">
      <div>
        <div class="mb-2 text-3xl opacity-40">⬡</div>
        <p class="text-sm">No nodes match. Add some in the part views.</p>
      </div>
    </div>
  </div>
</template>
