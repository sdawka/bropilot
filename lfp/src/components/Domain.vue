<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { LEVELS, NO_LEVEL_4, SPACES, KINDS, kindById, edgeTypeById, said } from '../kernel';
const spaceCount = (sid: string) => state.graph.nodes.filter((n) => kindById[n.kind]?.space === sid).length;
const spaceKinds = (sid: string) => KINDS.filter((k) => k.space === sid).map((k) => k.icon + ' ' + k.plural);
const resultOf = (testId: string) => { const r = edgesOfType('reports').find((e) => e.dst === testId); return r ? nodeById(r.src) : undefined; };
const testStats = computed(() => { const st = { pass: 0, fail: 0, missing: 0 }; for (const t of nodesOfKind('test')) { const k = (resultOf(t.id)?.props?.status ?? 'missing') as keyof typeof st; st[k]++; } return st; });
const goOverview = () => { window.location.hash = 'overview'; };
const repSpaces = SPACES.filter((s) => s.layer === 'representation' && s.id !== 'basics');
const realSpaces = SPACES.filter((s) => s.layer === 'reality');
import { state, nodeById, edgesOf, type ScreenItem } from '../store';
import { useScreen } from '../screen';
import Prov from './Prov.vue';
import Deployment from './arch/Deployment.vue';
import Cell from './arch/Cell.vue';
import { cellLayout } from './arch/layout';

const level = ref<0 | 1 | 2 | 3>(0);
const selectedModule = ref<string | null>(null);

const nodesOfKind = (k: string) => state.graph.nodes.filter((n) => n.kind === k);
const edgesOfType = (t: string) => state.graph.edges.filter((e) => e.type === t);
const title = (id: string) => nodeById(id)?.title ?? id;

const select = (id: string) => { state.selectedId = state.selectedId === id ? null : id; };
const goLevel = (l: 0 | 1 | 2 | 3) => { level.value = l; if (l === 3 && !selectedModule.value) selectedModule.value = modules.value[0]?.id ?? null; state.domainLevel = l; };

// director points in via state.domainLevel/domainModule; local clicks write back so the context stays truthful
watch(() => state.domainLevel, (l) => { if (l !== level.value) level.value = l; });
watch(() => state.domainModule, (m) => { if (m && m !== selectedModule.value) selectedModule.value = m; });
watch(selectedModule, (m) => { if (m !== state.domainModule) state.domainModule = m; });

// ── director "point" cues: lit cards/chips ──────────────────────────────────
const edgeById = (id: string) => state.graph.edges.find((e) => e.id === id);
const isLit = (id: string) => state.highlight.nodes.includes(id) || state.highlight.edges.some((eid) => { const e = edgeById(eid); return !!e && (e.src === id || e.dst === id); });
const pointedAtEdges = computed(() => state.highlight.edges.map((eid) => edgeById(eid)).filter((e): e is NonNullable<typeof e> => !!e));

// ── Level 1: deployment ───────────────────────────────────────────────────────
const systems = computed(() => nodesOfKind('system'));
const audiences = computed(() => nodesOfKind('audience'));
const infras = computed(() => nodesOfKind('infra'));
const externals = computed(() => nodesOfKind('external'));

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

// ── Level 3: inside a module (Cell diagram) ──────────────────────────────────
watch(modules, (m) => { if (!selectedModule.value && m.length) selectedModule.value = m[0].id; }, { immediate: true });

// mirrors what Cell.vue renders for this module, for screen reporting (describe-screen etc.)
const cellItems = computed(() => selectedModule.value ? cellLayout(state.graph, selectedModule.value) : undefined);

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

// report what's rendered on screen, per level
useScreen((): ScreenItem[] => {
  if (level.value === 0) {
    return [...repSpaces, ...realSpaces].map((s) => ({ id: s.id, kind: 'space', title: s.label }));
  }
  if (level.value === 1) {
    return [...systems.value, ...audiences.value, ...infras.value, ...externals.value].map((n) => ({ id: n.id, kind: n.kind, title: n.title }));
  }
  if (level.value === 2) {
    return modules.value.map((n) => ({ id: n.id, kind: n.kind, title: n.title }));
  }
  const mod = selectedModule.value ? nodeById(selectedModule.value) : undefined;
  const items: ScreenItem[] = mod ? [{ id: mod.id, kind: mod.kind, title: mod.title }] : [];
  const c = cellItems.value;
  if (c) for (const n of [...c.interfaces, ...c.rules, ...c.things, ...c.events]) items.push({ id: n.id, kind: n.kind, title: n.title });
  return items;
});
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
    <section v-if="level === 0" class="l0">
      <div class="layer rep">
        <h3>Representation <Prov :source="said(23, 79)" /></h3>
        <div class="spaces">
          <button v-for="s in repSpaces" :key="s.id" class="space-card" :data-node-id="s.id" :style="{ '--hue': s.hue }" @click="s.id === 'solution' ? goLevel(1) : goOverview()">
            <b>{{ s.label }}</b> <span class="small">{{ spaceCount(s.id) }} nodes</span>
            <p class="small">{{ s.blurb }}</p>
            <p class="small kinds">{{ spaceKinds(s.id).slice(0, 6).join(' · ') }}</p>
            <span class="small go">{{ s.id === 'solution' ? 'open the C4 levels →' : 'see Overview →' }}</span>
          </button>
        </div>
      </div>
      <div class="between">
        <div class="arrow">solution ⟶ planned changes <span class="small">what the representation says should change</span></div>
        <div class="arrow">rules ⟶ tests ⟶ test results <span class="small">one test per condition; reality reports pass / fail (S89–S91)</span></div>
        <div class="arrow back">bets ⟵ effects <span class="small">measurements confirm or deny the bets</span></div>
        <div class="small">tests: <b>{{ testStats.pass }}</b> pass · <b>{{ testStats.fail }}</b> fail · <b>{{ testStats.missing }}</b> missing → {{ testStats.fail + testStats.missing ? 'planned changes needed' : 'no changes needed' }} (S91)</div>
      </div>
      <div class="layer real">
        <h3>Reality <span class="tag stub">stub</span> <Prov :source="said(24, 80, 81)" /></h3>
        <div class="spaces">
          <div v-for="s in realSpaces" :key="s.id" class="space-card" :data-node-id="s.id" :style="{ '--hue': s.hue }">
            <b>{{ s.label }}</b> <span class="small">{{ spaceCount(s.id) }} nodes</span>
            <p class="small">{{ s.blurb }}</p>
            <p class="small kinds">{{ spaceKinds(s.id).join(' · ') || 'kinds to be defined' }}</p>
          </div>
        </div>
        <p class="small">Temporal: what runs now → what is planned → what it produced. Shape only; built later (S40).</p>
      </div>
    </section>

    <section v-else-if="level === 1" class="l1">
      <Deployment />
    </section>

    <!-- Level 2: Modules -->
    <section v-else-if="level === 2" class="l2">
      <div class="system-container">
        <div class="system-label">{{ systems[0]?.title ?? 'System' }}</div>
        <div class="modules-grid">
          <div v-for="m in modules" :key="m.id" class="module-card" :data-node-id="m.id" :class="{ selected: state.selectedId === m.id, lit: isLit(m.id) }" @click="openModule(m.id)">
            <div class="title">📦 {{ m.title }}</div>
            <p class="small" v-if="m.description">{{ m.description }}</p>
            <div class="chips" v-if="infraOf(m.id).length">
              <span class="tag" :class="{ lit: isLit(i.id) }" v-for="i in infraOf(m.id)" :key="i.id">🧱 {{ i.title }}</span>
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
      <Cell v-if="selectedModule" :module-id="selectedModule" />
    </section>

    <aside class="detail" v-if="detail">
      <button class="close" @click="state.selectedId = null">×</button>
      <div class="kind-line">{{ detailKind?.icon }} {{ detailKind?.label }}</div>
      <h2>{{ detail.title }}</h2>
      <p class="small" v-if="detail.description">{{ detail.description }}</p>
      <a v-if="detail.props?.codeRef" :href="detail.props.codeRef" target="_blank" rel="noopener">code ↗</a>
      <h3>Provenance</h3>
      <Prov :source="detail.source" full />
      <template v-if="level === 3 && pointedAtEdges.length">
        <h3>Pointed at</h3>
        <ul><li v-for="e in pointedAtEdges" :key="e.id">{{ title(e.src) }} —{{ edgeTypeById[e.type]?.label ?? e.type }}→ {{ title(e.dst) }}</li></ul>
      </template>
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

.l1 { display: block; }
.person-card, .bubble, .dash-card, .module-card, .item-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: .6rem .7rem; margin-bottom: .6rem; cursor: pointer; }
.person-card { border-radius: 10px 10px 4px 10px; }
.bubble { border-radius: 999px / 30%; border-width: 2px; text-align: center; padding: 1.2rem 1rem; }
.dash-card { border-style: dashed; }
.person-card.selected, .bubble.selected, .dash-card.selected, .module-card.selected, .item-card.selected { outline: 2px solid var(--ink); }
.person-card.lit, .bubble.lit, .dash-card.lit, .module-card.lit, .item-card.lit, .test-chip.lit, .chips .tag.lit { outline: 2px solid var(--kernel); }
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
.tests-footer { border-top: 1px solid var(--line); padding-top: .5rem; display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; }
.test-chip { display: inline-flex; gap: .35rem; align-items: baseline; font-size: .8rem; text-align: left; }
.test-chip.missing { border-style: dashed; }
.test-chip.fail { border-color: var(--inferred); }
.test-chip.selected { outline: 2px solid var(--ink); }
.test-chip .ladder { font-size: .65rem; color: var(--kernel); border: 1px solid var(--kernel); border-radius: 4px; padding: 0 .3rem; }
.tests-footer h3 { color: var(--muted); font-size: .75rem; text-transform: uppercase; margin: 0; }

.detail { position: fixed; right: 1rem; top: 4rem; bottom: 1rem; width: 400px; overflow: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 1rem; box-shadow: 0 8px 30px rgba(0,0,0,.08); z-index: 4; }
.detail .close { position: absolute; right: .6rem; top: .5rem; border: none; font-size: 1.1rem; }
.detail h3 { margin-top: 1rem; color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
.detail ul { padding-left: 1rem; margin: .2rem 0; font-size: .85rem; }
.l0 { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: start; }
.layer { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: .8rem; }
.layer.real { border-style: dashed; }
.spaces { display: grid; gap: .6rem; margin-top: .5rem; }
.space-card { text-align: left; display: block; width: 100%; border-left: 4px solid var(--hue); padding: .6rem .7rem; }
.space-card .kinds { color: var(--muted); }
.space-card .go { display: block; margin-top: .3rem; color: var(--kernel); }
.between { display: flex; flex-direction: column; gap: 1rem; justify-content: center; align-self: center; text-align: center; }
.arrow { font-weight: 600; } .arrow .small { display: block; font-weight: 400; }
</style>
