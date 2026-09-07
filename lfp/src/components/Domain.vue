<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { LEVELS, NO_LEVEL_4, kindById, edgeTypeById, said } from '../kernel';
import { state, nodeById, edgesOf } from '../store';
import Prov from './Prov.vue';

const level = ref<1 | 2 | 3>(1);
const selectedModule = ref<string | null>(null);

const nodesOfKind = (k: string) => state.graph.nodes.filter((n) => n.kind === k);
const edgesOfType = (t: string) => state.graph.edges.filter((e) => e.type === t);
const title = (id: string) => nodeById(id)?.title ?? id;

const select = (id: string) => { state.selectedId = state.selectedId === id ? null : id; };
const goLevel = (l: 1 | 2 | 3) => { level.value = l; if (l === 3 && !selectedModule.value) selectedModule.value = modules.value[0]?.id ?? null; };

// ── Level 1: context ────────────────────────────────────────────────────────
const systems = computed(() => nodesOfKind('system'));
const audiences = computed(() => nodesOfKind('audience'));
const externals = computed(() => nodesOfKind('external'));
const usesFrom = (id: string) => edgesOfType('uses').filter((e) => e.src === id);

function openSystem(id: string) { select(id); goLevel(2); }

// ── Level 2: modules ─────────────────────────────────────────────────────────
const modules = computed(() => nodesOfKind('module'));
const infraOf = (moduleId: string) => edgesOfType('contains').filter((e) => e.src === moduleId && nodeById(e.dst)?.kind === 'infra').map((e) => nodeById(e.dst)!);
const countOf = (moduleId: string, kind: string, type: 'contains' | 'exposes') =>
  edgesOfType(type).filter((e) => e.src === moduleId && nodeById(e.dst)?.kind === kind).length;
const moduleIds = computed(() => new Set(modules.value.map((m) => m.id)));
const interModuleEdges = computed(() =>
  state.graph.edges.filter((e) => (e.type === 'uses' || e.type === 'triggers') && moduleIds.value.has(e.src) && moduleIds.value.has(e.dst)),
);
const moduleToExternalEdges = computed(() =>
  state.graph.edges.filter((e) => e.type === 'uses' && moduleIds.value.has(e.src) && nodeById(e.dst)?.kind === 'external'),
);

function openModule(id: string) { selectedModule.value = id; select(id); goLevel(3); }

// ── Level 3: inside a module ─────────────────────────────────────────────────
watch(modules, (m) => { if (!selectedModule.value && m.length) selectedModule.value = m[0].id; }, { immediate: true });

const things = computed(() => selectedModule.value ? edgesOfType('contains').filter((e) => e.src === selectedModule.value && nodeById(e.dst)?.kind === 'thing').map((e) => nodeById(e.dst)!) : []);
const rules = computed(() => selectedModule.value ? edgesOfType('contains').filter((e) => e.src === selectedModule.value && nodeById(e.dst)?.kind === 'rule').map((e) => nodeById(e.dst)!) : []);
const events = computed(() => selectedModule.value ? edgesOfType('contains').filter((e) => e.src === selectedModule.value && nodeById(e.dst)?.kind === 'event').map((e) => nodeById(e.dst)!) : []);
const emitterOf = (eventId: string) => edgesOfType('emits').filter((e) => e.dst === eventId).map((e) => title(e.src));
const interfaces = computed(() => selectedModule.value ? edgesOfType('exposes').filter((e) => e.src === selectedModule.value && nodeById(e.dst)?.kind === 'interface').map((e) => nodeById(e.dst)!) : []);
const tests = computed(() => selectedModule.value ? edgesOfType('contains').filter((e) => e.src === selectedModule.value && nodeById(e.dst)?.kind === 'test').map((e) => nodeById(e.dst)!) : []);

const governsOf = (ruleId: string) => edgesOfType('governs').filter((e) => e.src === ruleId).map((e) => e.dst);
const termFor = (thingId: string) => edgesOfType('defines').find((e) => e.dst === thingId);

const selectedThingOrRule = computed(() => {
  const n = state.selectedId ? nodeById(state.selectedId) : undefined;
  return n && (n.kind === 'thing' || n.kind === 'rule') ? n : undefined;
});
function dimRule(ruleId: string) {
  const sel = selectedThingOrRule.value;
  if (!sel || sel.kind !== 'thing') return false;
  return !governsOf(ruleId).includes(sel.id);
}
function dimThing(thingId: string) {
  const sel = selectedThingOrRule.value;
  if (!sel || sel.kind !== 'rule') return false;
  return !governsOf(sel.id).includes(thingId);
}

// ── breadcrumb ────────────────────────────────────────────────────────────
const breadcrumb = computed(() => {
  const parts = [systems.value[0]?.title ?? 'System'];
  if (level.value >= 2 && selectedModule.value) parts.push(title(selectedModule.value));
  if (level.value === 3) {
    const n = state.selectedId ? nodeById(state.selectedId) : undefined;
    if (n && n.id !== selectedModule.value && ['thing', 'rule', 'interface', 'test'].includes(n.kind)) parts.push(n.title);
  }
  return parts;
});

// ── details pane ─────────────────────────────────────────────────────────
const detail = computed(() => (state.selectedId ? nodeById(state.selectedId) : undefined));
const detailKind = computed(() => (detail.value ? kindById[detail.value.kind] : undefined));
const detailOut = computed(() => (state.selectedId ? edgesOf(state.selectedId).filter((e) => e.src === state.selectedId) : []));
const detailIn = computed(() => (state.selectedId ? edgesOf(state.selectedId).filter((e) => e.dst === state.selectedId) : []));
</script>

<template>
  <div class="domain">
    <header class="domain-head">
      <div class="breadcrumb">
        <template v-for="(p, i) in breadcrumb" :key="i"><span v-if="i" class="sep">›</span><span>{{ p }}</span></template>
      </div>
      <div class="levels">
        <button v-for="l in LEVELS" :key="l.level" class="level-tab" :class="{ active: level === l.level }" @click="goLevel(l.level)">
          <b>{{ l.level }}. {{ l.label }}</b>
          <span class="small">{{ l.blurb }}</span>
          <Prov :source="l.source" />
        </button>
      </div>
      <p class="small no-l4">No level 4 for now <Prov :source="NO_LEVEL_4" /></p>
    </header>

    <!-- Level 1: Context -->
    <section v-if="level === 1" class="l1">
      <div class="col audiences">
        <h3>Audience</h3>
        <div v-for="a in audiences" :key="a.id" class="person-card" :class="{ selected: state.selectedId === a.id }" @click="select(a.id)">
          <div class="title">👤 {{ a.title }}</div>
          <p class="small" v-if="a.description">{{ a.description }}</p>
          <ul class="uses-list"><li v-for="e in usesFrom(a.id)" :key="e.id">→ uses {{ title(e.dst) }}</li></ul>
        </div>
      </div>
      <div class="col systems">
        <div v-for="s in systems" :key="s.id" class="bubble" :class="{ selected: state.selectedId === s.id }" @click="openSystem(s.id)">
          <div class="title">🫧 {{ s.title }}</div>
          <p class="small" v-if="s.description">{{ s.description }}</p>
          <ul class="uses-list"><li v-for="e in usesFrom(s.id)" :key="e.id">→ uses {{ title(e.dst) }}</li></ul>
          <span class="small hint">click to see modules</span>
        </div>
      </div>
      <div class="col externals">
        <h3>External systems</h3>
        <div v-for="ex in externals" :key="ex.id" class="dash-card" :class="{ selected: state.selectedId === ex.id }" @click="select(ex.id)">
          <div class="title">🛰️ {{ ex.title }}</div>
          <ul class="uses-list" v-if="usesFrom(ex.id).length"><li v-for="e in usesFrom(ex.id)" :key="e.id">→ uses {{ title(e.dst) }}</li></ul>
        </div>
      </div>
    </section>

    <!-- Level 2: Modules -->
    <section v-else-if="level === 2" class="l2">
      <div class="system-container">
        <div class="system-label">{{ systems[0]?.title ?? 'System' }}</div>
        <div class="modules-grid">
          <div v-for="m in modules" :key="m.id" class="module-card" :class="{ selected: state.selectedId === m.id }" @click="openModule(m.id)">
            <div class="title">📦 {{ m.title }}</div>
            <p class="small" v-if="m.description">{{ m.description }}</p>
            <div class="chips" v-if="infraOf(m.id).length">
              <span class="tag" v-for="i in infraOf(m.id)" :key="i.id">🧱 {{ i.title }}</span>
            </div>
            <div class="counts small">
              {{ countOf(m.id, 'thing', 'contains') }} things · {{ countOf(m.id, 'rule', 'contains') }} rules · {{ countOf(m.id, 'interface', 'exposes') }} interfaces
            </div>
          </div>
        </div>
      </div>
      <h3>Inter-module</h3>
      <ul class="edge-rows">
        <li v-for="e in interModuleEdges" :key="e.id">{{ title(e.src) }} —{{ edgeTypeById[e.type]?.label ?? e.type }}→ {{ title(e.dst) }}</li>
        <li v-for="e in moduleToExternalEdges" :key="e.id">{{ title(e.src) }} —{{ edgeTypeById[e.type]?.label ?? e.type }}→ {{ title(e.dst) }}</li>
        <li v-if="!interModuleEdges.length && !moduleToExternalEdges.length" class="small">No module-to-module or module-to-external edges yet.</li>
      </ul>
      <p class="small note">Flows and journeys run across modules; shown as an overlay later (S31, S32) <Prov :source="said(31, 32)" /></p>
    </section>

    <!-- Level 3: Inside a module -->
    <section v-else class="l3">
      <div class="module-chips">
        <button v-for="m in modules" :key="m.id" class="mod-chip" :class="{ active: selectedModule === m.id }" @click="selectedModule = m.id">{{ m.title }}</button>
      </div>
      <div class="l3-grid">
        <div class="col">
          <h3>Things</h3>
          <button v-for="t in things" :key="t.id" class="item-card" :class="[{ selected: state.selectedId === t.id, dim: dimThing(t.id) }]" @click="select(t.id)">
            <div class="title">🔷 {{ t.title }}</div>
            <p class="small" v-if="t.description">{{ t.description }}</p>
            <span class="tag" v-if="termFor(t.id)">📖 {{ title(termFor(t.id)!.src) }}</span>
            <a v-if="t.props?.codeRef" :href="t.props.codeRef" target="_blank" rel="noopener" @click.stop>code ↗</a>
            <Prov :source="t.source" />
          </button>
          <p v-if="!things.length" class="empty">No things in this module.</p>
        </div>
        <div class="col">
          <h3>Rules</h3>
          <button v-for="r in rules" :key="r.id" class="item-card" :class="[{ selected: state.selectedId === r.id, dim: dimRule(r.id) }]" @click="select(r.id)">
            <div class="title">⚖️ {{ r.title }}</div>
            <p class="small" v-if="r.props?.tests">tests: {{ r.props.tests }}</p>
            <a v-if="r.props?.codeRef" :href="r.props.codeRef" target="_blank" rel="noopener" @click.stop>code ↗</a>
            <Prov :source="r.source" />
          </button>
          <p v-if="!rules.length" class="empty">No rules in this module.</p>
        </div>
        <div class="col">
          <h3>Events <span class="small">(S74)</span></h3>
          <p v-if="!events.length" class="small">no events recorded for this module</p>
          <button v-for="ev in events" :key="ev.id" class="item-card" :class="[{ selected: state.selectedId === ev.id }]" @click="select(ev.id)">
            <div class="title">⚡ {{ ev.title }}</div>
            <p class="small" v-if="emitterOf(ev.id).length">emitted by {{ emitterOf(ev.id).join(', ') }}</p>
            <a v-if="ev.props?.codeRef" :href="ev.props.codeRef" target="_blank" rel="noopener" @click.stop>code ↗</a>
            <Prov :source="ev.source" />
          </button>
        </div>
        <div class="col">
          <h3>Interface</h3>
          <button v-for="i in interfaces" :key="i.id" class="item-card" :class="{ selected: state.selectedId === i.id }" @click="select(i.id)">
            <div class="title">🔌 {{ i.title }}</div>
            <p class="small" v-if="i.props?.style">{{ i.props.style }}</p>
            <a v-if="i.props?.codeRef" :href="i.props.codeRef" target="_blank" rel="noopener" @click.stop>code ↗</a>
            <Prov :source="i.source" />
          </button>
          <p v-if="!interfaces.length" class="empty">No interface exposed.</p>
        </div>
      </div>
      <div class="tests-footer small">
        <h3>Tests</h3>
        <template v-if="tests.length"><span v-for="t in tests" :key="t.id">{{ t.title }}</span></template>
        <span v-else>no tests yet — fed back from reality (S67) <Prov :source="said(67)" /></span>
      </div>
    </section>

    <aside class="detail" v-if="detail">
      <button class="close" @click="state.selectedId = null">×</button>
      <div class="kind-line">{{ detailKind?.icon }} {{ detailKind?.label }}</div>
      <h2>{{ detail.title }}</h2>
      <p class="small" v-if="detail.description">{{ detail.description }}</p>
      <a v-if="detail.props?.codeRef" :href="detail.props.codeRef" target="_blank" rel="noopener">code ↗</a>
      <h3>Provenance</h3>
      <Prov :source="detail.source" full />
      <h3>Edges out ({{ detailOut.length }})</h3>
      <ul><li v-for="e in detailOut" :key="e.id"><em>{{ edgeTypeById[e.type]?.label ?? e.type }}</em> → {{ title(e.dst) }}</li></ul>
      <h3>Edges in ({{ detailIn.length }})</h3>
      <ul><li v-for="e in detailIn" :key="e.id">{{ title(e.src) }} <em>{{ edgeTypeById[e.type]?.label ?? e.type }}</em> →</li></ul>
    </aside>
  </div>
</template>

<style scoped>
.domain { display: flex; flex-direction: column; gap: .8rem; }
.domain-head { display: flex; flex-direction: column; gap: .5rem; }
.breadcrumb { font-size: .85rem; color: var(--muted); }
.breadcrumb .sep { margin: 0 .4rem; }
.levels { display: flex; gap: .5rem; }
.level-tab { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: .2rem; text-align: left; padding: .5rem .7rem; }
.level-tab.active { outline: 2px solid var(--ink); background: var(--bg); }
.no-l4 { margin: 0; }

.l1 { display: grid; grid-template-columns: 1fr 1.3fr 1fr; gap: 1rem; align-items: start; }
.l1 .col h3 { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; margin-bottom: .4rem; }
.person-card, .bubble, .dash-card, .module-card, .item-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: .6rem .7rem; margin-bottom: .6rem; cursor: pointer; }
.person-card { border-radius: 10px 10px 4px 10px; }
.bubble { border-radius: 999px / 30%; border-width: 2px; text-align: center; padding: 1.2rem 1rem; }
.dash-card { border-style: dashed; }
.person-card.selected, .bubble.selected, .dash-card.selected, .module-card.selected, .item-card.selected { outline: 2px solid var(--ink); }
.title { font-weight: 600; font-size: .92rem; }
.uses-list { list-style: none; margin: .3rem 0 0; padding: 0; font-size: .78rem; color: var(--muted); }
.hint { display: block; margin-top: .3rem; }

.system-container { border: 2px solid var(--line); border-radius: 10px; padding: 1rem; position: relative; margin-top: .8rem; }
.system-label { position: absolute; top: -.7rem; left: .8rem; background: var(--bg); padding: 0 .5rem; font-weight: 600; font-size: .8rem; }
.modules-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: .7rem; }
.chips { display: flex; flex-wrap: wrap; gap: .25rem; margin: .3rem 0; }
.counts { margin-top: .3rem; }
.edge-rows { font-size: .85rem; padding-left: 1rem; }
.note { margin-top: .3rem; }

.module-chips { display: flex; gap: .4rem; flex-wrap: wrap; }
.mod-chip { border-radius: 999px; }
.mod-chip.active { background: var(--ink); color: #fff; }
.l3-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: .8rem; margin-top: .6rem; }
.item-card { width: 100%; text-align: left; display: block; }
.item-card.dim { opacity: .35; }
.item-card a { display: inline-block; margin-top: .2rem; font-size: .8rem; }
.empty { font-size: .8rem; color: var(--muted); font-style: italic; }
.tests-footer { border-top: 1px solid var(--line); padding-top: .5rem; display: flex; gap: .6rem; align-items: center; }
.tests-footer h3 { color: var(--muted); font-size: .75rem; text-transform: uppercase; margin: 0; }

.detail { position: fixed; right: 1rem; top: 4rem; bottom: 1rem; width: 400px; overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 1rem; box-shadow: 0 8px 30px rgba(0,0,0,.08); z-index: 4; }
.detail .close { position: absolute; right: .6rem; top: .5rem; border: none; font-size: 1.1rem; }
.detail h3 { margin-top: 1rem; color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
.detail ul { padding-left: 1rem; margin: .2rem 0; font-size: .85rem; }
</style>
