<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { REPRESENTATION_SPACES, KINDS, kindById, edgeTypeById } from '../kernel';
import { state, dogfood, edgesOf, nodeById } from '../store';
import Prov from './Prov.vue';
import Inspector from './Inspector.vue';

const byKind = computed(() => {
  const m: Record<string, typeof state.graph.nodes> = {};
  for (const n of state.graph.nodes) (m[n.kind] ??= []).push(n);
  return m;
});
const kindsIn = (space: string) => KINDS.filter((k) => k.space === space);
const select = (id: string) => (state.selectedId = state.selectedId === id ? null : id);

// ── connections across columns (S83) ──
const spaceOf = (id: string) => kindById[nodeById(id)?.kind ?? '']?.space;
const crossLinks = (id: string) => edgesOf(id)
  .map((e) => { const otherId = e.src === id ? e.dst : e.src; return { e, otherId, out: e.src === id }; })
  .filter((x) => nodeById(x.otherId) && spaceOf(x.otherId) !== spaceOf(id) && spaceOf(x.otherId) !== 'basics');
const neighbours = computed(() => new Set(state.selectedId ? crossLinks(state.selectedId).map((x) => x.otherId) : []));
// a highlighted edge's endpoints (director "point" cues) count as lit too
const edgeById = (id: string) => state.graph.edges.find((e) => e.id === id);
const isHighlightEndpoint = (id: string) => state.highlight.edges.some((eid) => { const e = edgeById(eid); return !!e && (e.src === id || e.dst === id); });
const cardClass = (id: string) => {
  const lit = neighbours.value.has(id) || state.highlight.nodes.includes(id) || isHighlightEndpoint(id);
  const hasFocus = !!state.selectedId || !!state.highlight.nodes.length || !!state.highlight.edges.length;
  return { selected: state.selectedId === id, lit, dim: hasFocus && state.selectedId !== id && !lit };
};
const linkLabel = (x: { e: { type: string }; out: boolean }) => (x.out ? '' : '← ') + (edgeTypeById[x.e.type]?.label ?? x.e.type) + (x.out ? ' →' : '');

// lines from the selected card to its neighbours, plus any director-highlighted edges, drawn over the board
const wrap = ref<HTMLElement | null>(null);
const lines = ref<{ x1: number; y1: number; x2: number; y2: number; label: string }[]>([]);
function drawLines() {
  lines.value = [];
  const host = wrap.value; if (!host) return;
  const hr = host.getBoundingClientRect();
  const rect = (id: string) => { const el = host.querySelector(`[data-node-id="${id}"]`); return el ? el.getBoundingClientRect() : null; };
  const pushLine = (aId: string, bId: string, label: string) => {
    const a = rect(aId); const b = rect(bId); if (!a || !b) return;
    const leftToRight = b.left > a.left;
    lines.value.push({
      x1: (leftToRight ? a.right : a.left) - hr.left, y1: a.top + a.height / 2 - hr.top,
      x2: (leftToRight ? b.left : b.right) - hr.left, y2: b.top + b.height / 2 - hr.top,
      label,
    });
  };
  const sel = state.selectedId;
  if (sel) for (const x of crossLinks(sel)) pushLine(sel, x.otherId, edgeTypeById[x.e.type]?.label ?? x.e.type);
  for (const eid of state.highlight.edges) {
    const e = edgeById(eid); if (!e) continue;
    pushLine(e.src, e.dst, edgeTypeById[e.type]?.label ?? e.type);
  }
}
watch(() => state.selectedId, () => nextTick(drawLines));
watch(() => state.highlight, () => nextTick(drawLines), { deep: true });
watch(() => state.highlight.focus, (id) => {
  if (!id) return;
  nextTick(() => {
    const el = wrap.value?.querySelector(`[data-node-id="${id}"]`);
    (el as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
});
onMounted(() => { window.addEventListener('resize', drawLines); window.addEventListener('scroll', drawLines, true); });
onUnmounted(() => { window.removeEventListener('resize', drawLines); window.removeEventListener('scroll', drawLines, true); });

// basics header + collapsible details
const showBasics = ref(false);
const basicsKinds = computed(() => kindsIn('basics'));
const nameNode = computed(() => byKind.value['name']?.[0]);
const purposeNode = computed(() => byKind.value['purpose']?.[0]);

// columns: problem, hypothesis, solution, functions (basics excluded — shown as header above)
const columns = computed(() => REPRESENTATION_SPACES.filter((sp) => sp.id !== 'basics'));

// for the solution column, kinds with a `level` (C4 domain kinds) collapse into one summary block
const domainKinds = computed(() => kindsIn('solution').filter((k) => k.level));
const nonDomainKinds = (space: string) => kindsIn(space).filter((k) => !k.level);
const domainCounts = computed(() => domainKinds.value.map((k) => ({ kind: k, count: byKind.value[k.id]?.length ?? 0 })));
</script>

<template>
  <div class="board-wrap overview">
    <div class="dogfood" :class="{ ok: dogfood.ok }">
      <b>Dogfood check</b>
      <span>{{ state.graph.nodes.length }} nodes · {{ state.graph.edges.length }} edges</span>
      <span v-if="dogfood.ok">· no unknown kinds, no dangling edges, no unknown edge types</span>
      <span v-else>· unknown kinds: {{ dogfood.unknownKinds.join(', ') || 0 }} · dangling: {{ dogfood.dangling.join(', ') || 0 }} · unknown edge types: {{ dogfood.unknownEdgeTypes.join(', ') || 0 }}</span>
      <span v-if="dogfood.orphans.length" class="warn">· orphans: {{ dogfood.orphans.join(', ') }}</span>
    </div>

    <header class="project-header">
      <div class="titles">
        <h1>{{ nameNode?.title ?? 'Untitled' }}</h1>
        <p class="subtitle" v-if="purposeNode">{{ purposeNode.title }}</p>
      </div>
      <button class="small" @click="showBasics = !showBasics">{{ showBasics ? 'Hide' : 'Show' }} basics</button>
    </header>

    <section v-if="showBasics" class="basics-panel">
      <div v-for="k in basicsKinds" :key="k.id" class="kind-group">
        <h3>
          <span>{{ k.icon }} {{ k.plural }}</span>
          <span class="tags"><span class="tag" :class="k.kernel ? 'kernel' : 'ext'">{{ k.kernel ? 'kernel' : 'template' }}</span><Prov :source="k.source" /></span>
        </h3>
        <p v-if="!byKind[k.id]?.length" class="empty">{{ k.blurb }}</p>
        <button v-for="n in byKind[k.id]" :key="n.id" class="card" :class="[n.status, { selected: state.selectedId === n.id }]" @click="select(n.id)">
          <span class="title">{{ n.title }}</span>
          <span class="meta"><span class="status">{{ n.status }}</span><Prov :source="n.source" /></span>
        </button>
      </div>
    </section>

    <div class="board-host" ref="wrap">
    <svg class="links" v-if="lines.length"><g v-for="(l, i) in lines" :key="i"><line :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" /><text :x="(l.x1 + l.x2) / 2" :y="(l.y1 + l.y2) / 2 - 4">{{ l.label }}</text></g></svg>
    <div class="board overview-board">
      <section v-for="sp in columns" :key="sp.id" class="col" :style="{ '--hue': sp.hue }">
        <header>
          <h2>{{ sp.label }} <small v-if="sp.settled" class="settled">settled</small></h2>
          <p>{{ sp.blurb }}</p>
          <Prov :source="sp.source" />
        </header>
        <div v-for="k in nonDomainKinds(sp.id)" :key="k.id" class="kind-group">
          <h3>
            <span>{{ k.icon }} {{ k.plural }}</span>
            <span class="tags"><span class="tag" :class="k.kernel ? 'kernel' : 'ext'">{{ k.kernel ? 'kernel' : 'template' }}</span><Prov :source="k.source" /></span>
          </h3>
          <p v-if="!byKind[k.id]?.length" class="empty">{{ k.blurb }}</p>
          <button v-for="n in byKind[k.id]" :key="n.id" class="card" :data-node-id="n.id" :class="[n.status, cardClass(n.id)]" @click="select(n.id)">
            <span class="title">{{ n.title }}</span>
            <span class="chips" v-if="crossLinks(n.id).length">
              <span v-for="x in crossLinks(n.id).slice(0, 4)" :key="x.e.id" class="chip" :title="nodeById(x.otherId)?.title" @click.stop="select(x.otherId)">{{ linkLabel(x) }} {{ nodeById(x.otherId)?.title }}</span>
              <span v-if="crossLinks(n.id).length > 4" class="chip more">+{{ crossLinks(n.id).length - 4 }}</span>
            </span>
            <span class="meta"><span class="status">{{ n.status }}</span><Prov :source="n.source" /></span>
          </button>
        </div>

        <div v-if="sp.id === 'solution'" class="kind-group domain-summary">
          <h3><span>🗺️ Domain</span></h3>
          <div class="domain-counts">
            <span v-for="dc in domainCounts" :key="dc.kind.id" class="domain-count">{{ dc.kind.icon }} {{ dc.kind.label }} <b>{{ dc.count }}</b></span>
          </div>
          <p class="small">see Domain page</p>
        </div>
      </section>
    </div>

    </div>

    <Inspector v-if="state.selectedId" :id="state.selectedId" @close="state.selectedId = null" />
  </div>
</template>

<style scoped>
.overview-board { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.board-host { position: relative; }
.links { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3; overflow: visible; }
.links line { stroke: var(--ink); stroke-width: 1.5; stroke-opacity: .7; }
.links text { font-size: 10px; fill: var(--muted); text-anchor: middle; paint-order: stroke; stroke: var(--panel); stroke-width: 3px; }
.card.dim { opacity: .3; }
.card.lit { outline: 2px solid var(--hue); }
.chips { display: flex; flex-wrap: wrap; gap: .2rem; }
.chip { font-size: .66rem; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 .35rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.chip:hover { color: var(--ink); border-color: var(--ink); }
.chip.more { border-style: dashed; }
.project-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; }
.project-header h1 { font-size: 1.3rem; margin-bottom: .1rem; }
.project-header .subtitle { color: var(--muted); font-size: .9rem; margin: 0; }
.basics-panel { display: grid; grid-template-columns: repeat(3, minmax(200px, 1fr)); gap: .8rem; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: .7rem; margin-bottom: .8rem; }
.domain-summary { border-top: 1px dashed var(--line); padding-top: .5rem; margin-top: 1rem; }
.domain-counts { display: flex; flex-wrap: wrap; gap: .4rem .8rem; font-size: .78rem; }
.domain-count { color: var(--muted); }
.domain-count b { color: var(--ink); }
</style>
