<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ModelObject, ModelRelation } from '@bropilot/contracts';
import { buildFocusMap, pageMapPeers, searchMapObjects, type MapLink, type MapPeer } from '../map-model';

const props = defineProps<{ focus: ModelObject; objects: ModelObject[]; relations: ModelRelation[]; search?: string }>();
const emit = defineEmits<{ select: [objectId: string] }>();

const stage = ref<HTMLElement>();
const focusButton = ref<HTMLButtonElement>();
const bounds = ref({ width: 960, height: 620 });
const page = ref(0);
const pageSize = 8;
const nodeElements = new Map<string, HTMLElement>();
const nodeSizes = ref<Record<string, { width: number; height: number }>>({});
let observer: ResizeObserver | undefined;

const map = computed(() => buildFocusMap(props.focus, props.objects, props.relations));
const search = computed(() => props.search?.trim() ?? '');
const searchPeers = computed<MapPeer[]>(() => {
  if (!search.value) return map.value.peers;
  const linked = new Map(map.value.peers.map(peer => [peer.object.id, peer]));
  return searchMapObjects(props.objects, search.value)
    .filter(object => object.id !== props.focus.id)
    .map(object => linked.get(object.id) ?? { object, links: [] });
});
const focusMatches = computed(() => !!search.value && searchMapObjects([props.focus], search.value).length > 0);
const pageCount = computed(() => Math.max(1, Math.ceil(searchPeers.value.length / pageSize)));
const peers = computed(() => pageMapPeers(searchPeers.value, Math.min(page.value, pageCount.value - 1), pageSize));
const mobile = computed(() => bounds.value.width < 680);
const focusHeight = computed(() => nodeSizes.value[props.focus.id]?.height ?? 100);
const rows = computed(() => Array.from({ length: Math.ceil(peers.value.length / 2) }, (_, index) => Math.max(100, ...peers.value.slice(index * 2, index * 2 + 2).map(peer => nodeSizes.value[peer.object.id]?.height ?? 120))));
const stageHeight = computed(() => mobile.value ? Math.max(300, focusHeight.value + 80 + rows.value.reduce((sum, height) => sum + height + 32, 0)) : 620);
const centre = computed(() => ({ x: bounds.value.width / 2, y: mobile.value ? 20 + focusHeight.value / 2 : stageHeight.value / 2 }));
const positions = computed(() => peers.value.map((peer, index) => {
  if (mobile.value) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const above = rows.value.slice(0, row).reduce((sum, height) => sum + height + 32, 0);
    return { peer, x: bounds.value.width * (column ? 0.75 : 0.25), y: focusHeight.value + 84 + above + rows.value[row] / 2 };
  }
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(peers.value.length, 1);
  const radiusX = (bounds.value.width - 176) / 2 - 16;
  const height = Math.max(120, ...peers.value.map(item => nodeSizes.value[item.object.id]?.height ?? 120));
  const radiusY = (stageHeight.value - height) / 2 - 20;
  return { peer, x: centre.value.x + Math.cos(angle) * radiusX, y: centre.value.y + Math.sin(angle) * radiusY };
}));

function markedSource(link: MapLink) { return ['assumption', 'hypothesis', 'proposal'].includes(link.source.kind); }
function connectorOffset(index: number, total: number) { return (index - (total - 1) / 2) * 5; }
function relationLabel(link: MapLink) {
  const direction = link.direction === 'outbound' ? '→' : '←';
  const source = link.source.kind !== 'declared' ? ` · ${link.source.kind}` : '';
  return `${direction} ${link.kind.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}${source}`;
}
function peerLabel(peer: MapPeer) {
  const links = peer.links.map(link => {
    const from = link.direction === 'outbound' ? props.focus.title : peer.object.title;
    const to = link.direction === 'outbound' ? peer.object.title : props.focus.title;
    const source = link.source.kind !== 'declared' ? ` (${link.source.kind})` : '';
    return `${from} ${link.kind.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${to}${source}`;
  });
  return `${peer.object.kind}: ${peer.object.title}. ${links.join('. ')}`;
}
function connectorPath(point: { x: number; y: number; peer: MapPeer }, index: number, total: number) {
  const dx = point.x - centre.value.x;
  const dy = point.y - centre.value.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = connectorOffset(index, total);
  const px = -dy / length * offset;
  const py = dx / length * offset;
  const focusSize = nodeSizes.value[props.focus.id] ?? { width: 220, height: 100 };
  const peerSize = nodeSizes.value[point.peer.object.id] ?? { width: 176, height: 120 };
  const border = (size: { width: number; height: number }) => Math.min(Math.abs(dx) > .01 ? (size.width / 2 + 5) / Math.abs(dx) : Infinity, Math.abs(dy) > .01 ? (size.height / 2 + 5) / Math.abs(dy) : Infinity);
  const start = Math.min(.45, border(focusSize));
  const end = Math.min(.45, border(peerSize));
  return `M ${centre.value.x + dx * start + px} ${centre.value.y + dy * start + py} L ${point.x - dx * end + px} ${point.y - dy * end + py}`;
}
function registerNode(objectId: string, element: unknown) {
  const previous = nodeElements.get(objectId);
  if (previous === element) return;
  if (previous) observer?.unobserve(previous);
  if (element instanceof HTMLElement) { nodeElements.set(objectId, element); observer?.observe(element); }
  else nodeElements.delete(objectId);
}
function select(objectId: string) { emit('select', objectId); }
function measure() {
  const rect = stage.value?.getBoundingClientRect();
  if (rect && rect.width) bounds.value = { width: Math.round(rect.width), height: Math.round(rect.height) };
  const sizes = Object.fromEntries([...nodeElements].map(([id, element]) => [id, { width: element.offsetWidth, height: element.offsetHeight }]));
  if (focusButton.value) sizes[props.focus.id] = { width: focusButton.value.offsetWidth, height: focusButton.value.offsetHeight };
  nodeSizes.value = sizes;
}

watch([() => props.focus.id, search, () => props.objects], () => { page.value = 0; });
watch(() => props.focus.id, () => void nextTick(() => focusButton.value?.focus({ preventScroll: true })));
watch([peers, mobile], () => void nextTick(measure));
watch(pageCount, count => { if (page.value >= count) page.value = count - 1; });
onMounted(async () => {
  await nextTick();
  measure();
  observer = new ResizeObserver(measure);
  if (stage.value) observer.observe(stage.value);
  for (const element of nodeElements.values()) observer.observe(element);
  if (focusButton.value) observer.observe(focusButton.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <section class="world-map" role="region" aria-label="Visual World map">
    <header class="map-intro">
      <p v-if="search" class="map-status">Search results for “{{ search }}”</p>
      <p v-else class="map-status">{{ searchPeers.length }} connected object{{ searchPeers.length === 1 ? '' : 's' }} · select a node to recenter</p>
    </header>

    <div ref="stage" class="map-stage" :class="{ mobile }" :style="{ minHeight: `${stageHeight}px` }">
      <svg class="connectors" :viewBox="`0 0 ${bounds.width} ${stageHeight}`" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id="map-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" /></marker>
        </defs>
        <template v-for="point in positions" :key="point.peer.object.id">
          <path v-for="(link, index) in point.peer.links" :key="`${point.peer.object.id}-${link.kind}-${index}`" :d="connectorPath(point, index, point.peer.links.length)"
            :class="{ dashed: markedSource(link), containment: link.kind === 'contains' }"
            :marker-end="link.direction === 'outbound' ? 'url(#map-arrow)' : undefined"
            :marker-start="link.direction === 'inbound' ? 'url(#map-arrow)' : undefined" />
        </template>
      </svg>

      <button ref="focusButton" class="focus-node" type="button" :style="{ top: `${centre.y}px` }" :aria-label="`Focus: ${focus.title}`" @click="select(focus.id)">
        <span class="node-kind">{{ focus.kind }}</span>
        <span class="node-title">{{ focus.title }}</span>
      </button>

      <button v-for="point in positions" :key="point.peer.object.id" class="peer-node" :ref="element => registerNode(point.peer.object.id, element)" type="button"
        :style="{ left: `${(point.x / bounds.width) * 100}%`, top: `${point.y}px` }"
        :aria-label="peerLabel(point.peer)" @click="select(point.peer.object.id)">
        <span class="node-kind">{{ point.peer.object.kind }}</span>
        <span class="node-title">{{ point.peer.object.title }}</span>
        <span v-if="point.peer.links.length" class="links">
          <span v-for="(link, index) in point.peer.links" :key="`${link.kind}-${index}`" class="link-label" :class="{ marked: markedSource(link) }">{{ relationLabel(link) }}</span>
        </span>
        <span v-else class="link-label search-result">search result</span>
      </button>

      <p v-if="!peers.length" class="empty" :style="{ top: `${centre.y + focusHeight / 2 + 24}px` }">{{ search ? (focusMatches ? 'The focused object matches this search.' : 'No objects match this search.') : 'No direct children or incident relations yet.' }}</p>
    </div>

    <nav v-if="pageCount > 1" class="pagination" aria-label="Map pages">
      <button type="button" :disabled="page === 0" @click="page--">Previous</button>
      <span>Page {{ page + 1 }} of {{ pageCount }}</span>
      <button type="button" :disabled="page + 1 === pageCount" @click="page++">Next</button>
    </nav>
  </section>
</template>

<style scoped>
.world-map { color: var(--ink); }
.map-intro { display: flex; align-items: baseline; justify-content: center; gap: 1rem; margin: 0 auto 1rem; max-width: 1120px; }
.map-status, .node-kind, .link-label, .pagination { font-size: .8rem; }
.map-status { margin: 0; color: var(--muted); }
.map-stage { position: relative; width: 100%; max-width: 1120px; margin: auto; background: var(--paper); }
.connectors { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.connectors path { fill: none; stroke: var(--line); stroke-width: 1.4; vector-effect: non-scaling-stroke; }
.connectors path.containment { stroke: var(--jade); }
.connectors path.dashed { stroke-dasharray: 5 4; }
.connectors marker path { fill: var(--line); stroke: none; }
.focus-node, .peer-node { position: absolute; transform: translate(-50%, -50%); font: inherit; text-align: center; color: var(--ink); background: var(--paper); border: 1px solid var(--line); border-radius: 14px; cursor: pointer; }
.focus-node { left: 50%; width: 220px; padding: 1.15rem 1.25rem; border-color: var(--jade); background: var(--wash); }
.peer-node { width: 176px; padding: .8rem .9rem; }
.focus-node:hover, .peer-node:hover { border-color: var(--jade); background: var(--wash); }
.focus-node:focus-visible, .peer-node:focus-visible, .pagination button:focus-visible { outline: 3px solid color-mix(in srgb, var(--jade), white 40%); outline-offset: 3px; }
.node-kind { display: block; margin-bottom: .28rem; color: var(--muted); }
.node-title { display: block; font-size: .98rem; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; }
.links { display: flex; flex-wrap: wrap; justify-content: center; gap: .25rem .45rem; margin-top: .55rem; }
.link-label { color: var(--muted); line-height: 1.25; overflow-wrap: anywhere; }
.link-label.marked { color: var(--jade); text-decoration: underline dashed; text-underline-offset: 3px; }
.search-result { display: block; margin-top: .55rem; color: var(--jade); }
.empty { position: absolute; width: 100%; padding: 0 12px; margin: 0; color: var(--muted); text-align: center; }
.pagination { display: flex; align-items: center; justify-content: center; gap: .8rem; margin-top: .75rem; color: var(--muted); }
.pagination button { padding: .28rem .55rem; color: var(--muted); font: inherit; background: transparent; border: 0; cursor: pointer; }
.pagination button:not(:disabled):hover { color: var(--jade); }
.pagination button:disabled { cursor: default; opacity: .45; }
@media (max-width: 679px) {
  .map-intro { align-items: flex-start; flex-direction: column; gap: .3rem; }
  .map-stage { border-radius: 15px; }
  .focus-node { width: min(270px, calc(100vw - 3rem)); }
  .peer-node { width: calc(50% - 16px); }
}
@media (prefers-reduced-motion: reduce) { .focus-node, .peer-node { transition: none; } }
</style>
