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
import { KIND_MAP, nodeHue, type GraphNode, type GraphEdge } from '../../lib/schema';

const props = defineProps<{ nodes: GraphNode[]; edges: GraphEdge[]; selectedId: string | null }>();
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

function degrees(): Map<string, number> {
  const d = new Map<string, number>();
  for (const e of props.edges) {
    d.set(e.srcId, (d.get(e.srcId) ?? 0) + 1);
    d.set(e.dstId, (d.get(e.dstId) ?? 0) + 1);
  }
  return d;
}

function build() {
  const deg = degrees();
  const prev = nodeIndex;
  nodeIndex = new Map();
  simNodes = props.nodes.map((node) => {
    const existing = prev.get(node.id);
    const sn: SimNode = existing ?? {
      id: node.id,
      node,
      x: size.w / 2 + (Math.cos(prev.size + simNodes.length) * 40 + (nodeIndex.size % 7) * 12),
      y: size.h / 2 + (Math.sin(prev.size + simNodes.length) * 40),
      deg: 0,
    };
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
      return { id: e.id, type: e.type, source, target } as SimLink;
    })
    .filter((x): x is SimLink => x !== null);

  if (!sim) {
    sim = forceSimulation<SimNode, SimLink>()
      .force('charge', forceManyBody().strength(-340))
      .force('center', forceCenter(size.w / 2, size.h / 2).strength(0.06))
      .force('x', forceX(size.w / 2).strength(0.04))
      .force('y', forceY(size.h / 2).strength(0.05))
      .force('collide', forceCollide<SimNode>().radius((d) => radius(d) + 14))
      .on('tick', () => {
        frame.value++;
      });
  }
  sim.nodes(simNodes);
  sim.force(
    'link',
    forceLink<SimNode, SimLink>(simLinks)
      .id((d) => d.id)
      .distance((l) => 90 + (l.source.deg + l.target.deg) * 6)
      .strength(0.5),
  );
  sim.alpha(0.9).restart();
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
  const pad = 80;
  const gw = maxX - minX + pad * 2;
  const gh = maxY - minY + pad * 2;
  const k = Math.max(0.3, Math.min(1.6, Math.min(size.w / gw, size.h / gh)));
  view.k = k;
  view.x = size.w / 2 - ((minX + maxX) / 2) * k;
  view.y = size.h / 2 - ((minY + maxY) / 2) * k;
}

defineExpose({ fit, reheat: () => sim?.alpha(0.7).restart() });

onMounted(() => {
  ro = new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    size.w = r.width;
    size.h = r.height;
  });
  ro.observe(wrap.value!);
  size.w = wrap.value!.clientWidth || 800;
  size.h = wrap.value!.clientHeight || 600;
  build();
  setTimeout(fit, 600);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  sim?.stop();
});

watch(
  () => [props.nodes.map((n) => n.id).join(','), props.edges.map((e) => e.id).join(',')].join('|'),
  () => build(),
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
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="rgba(180,190,215,0.5)" />
        </marker>
        <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#9aa6ff" />
        </marker>
      </defs>

      <g :transform="`translate(${view.x},${view.y}) scale(${view.k})`">
        <!-- edges -->
        <g stroke-linecap="round">
          <line
            v-for="l in links"
            :key="l.id"
            :x1="l.x1"
            :y1="l.y1"
            :x2="l.x2"
            :y2="l.y2"
            :stroke="l.connectsSel || l.active ? '#9aa6ff' : 'rgba(150,162,200,0.22)'"
            :stroke-width="l.connectsSel || l.active ? 1.8 : 1"
            :marker-end="l.connectsSel || l.active ? 'url(#arrow-active)' : 'url(#arrow)'"
            :style="{ transition: 'stroke 0.2s' }"
          />
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
