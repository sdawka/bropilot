<script setup lang="ts">
import { computed, ref } from 'vue';
import { REPRESENTATION_SPACES, KINDS } from '../kernel';
import { state, dogfood } from '../store';
import Prov from './Prov.vue';
import Inspector from './Inspector.vue';

const byKind = computed(() => {
  const m: Record<string, typeof state.graph.nodes> = {};
  for (const n of state.graph.nodes) (m[n.kind] ??= []).push(n);
  return m;
});
const kindsIn = (space: string) => KINDS.filter((k) => k.space === space);
const select = (id: string) => (state.selectedId = state.selectedId === id ? null : id);

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
          <button v-for="n in byKind[k.id]" :key="n.id" class="card" :class="[n.status, { selected: state.selectedId === n.id }]" @click="select(n.id)">
            <span class="title">{{ n.title }}</span>
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

    <Inspector v-if="state.selectedId" :id="state.selectedId" @close="state.selectedId = null" />
  </div>
</template>

<style scoped>
.overview-board { grid-template-columns: repeat(4, minmax(220px, 1fr)); }
.project-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: .8rem; }
.project-header h1 { font-size: 1.3rem; margin-bottom: .1rem; }
.project-header .subtitle { color: var(--muted); font-size: .9rem; margin: 0; }
.basics-panel { display: grid; grid-template-columns: repeat(3, minmax(200px, 1fr)); gap: .8rem; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: .7rem; margin-bottom: .8rem; }
.domain-summary { border-top: 1px dashed var(--line); padding-top: .5rem; margin-top: 1rem; }
.domain-counts { display: flex; flex-wrap: wrap; gap: .4rem .8rem; font-size: .78rem; }
.domain-count { color: var(--muted); }
.domain-count b { color: var(--ink); }
</style>
