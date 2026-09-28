<script setup lang="ts">
import { ref, computed } from 'vue';
import { state, nodeById } from '../store';
import { applyCue } from '../director';
import { useScreen } from '../screen';
import Prov from './Prov.vue';

type Scope = 'core' | 'stub' | 'later';

const flows = computed(() => state.graph.nodes.filter((n) => n.kind === 'flow'));
const scope = ref<Scope | 'all'>('all');
const activeId = ref<string | null>(null);
const active = computed(() => flows.value.find((f) => f.id === activeId.value) ?? null);
const steps = computed(() => (active.value?.props?.steps ?? '').split('\n').filter(Boolean));
const usesOf = (id: string) => state.graph.edges.filter((e) => e.type === 'uses' && e.src === id);
const touchedNodes = computed(() => (active.value ? usesOf(active.value.id).map((e) => nodeById(e.dst)).filter((n): n is NonNullable<typeof n> => !!n) : []));

const groups = computed(() => {
  const m: Record<string, typeof flows.value> = {};
  for (const f of flows.value) {
    const fscope = (f.props?.scope ?? 'core') as Scope;
    if (scope.value === 'all' || fscope === scope.value) (m[f.props?.group ?? '—'] ??= []).push(f);
  }
  return m;
});
const highlighted = (id: string) => state.highlight.nodes.includes(id);

function select(id: string) {
  activeId.value = id;
  const f = nodeById(id); if (!f) return;
  const targets = usesOf(id).map((e) => e.dst);
  const edgeIds = usesOf(id).map((e) => e.id);
  applyCue({ t: 'point', nodes: [id, ...targets], edges: edgeIds, focus: id });
}
function clear() {
  activeId.value = null;
  applyCue({ t: 'clear' });
}

useScreen(() => [
  ...Object.values(groups.value).flat().map((f) => ({ id: f.id, kind: 'flow', title: f.title })),
  ...touchedNodes.value.map((n) => ({ id: n.id, kind: n.kind, title: n.title })),
]);
</script>

<template>
  <div class="flows">
    <aside>
      <div class="toolbar">
        <label v-for="s in ['all', 'core', 'stub', 'later']" :key="s"><input type="radio" :value="s" v-model="scope" /> {{ s }}</label>
      </div>
      <div v-for="(fs, g) in groups" :key="g" class="flow-group">
        <h3>{{ g }}</h3>
        <button
          v-for="f in fs" :key="f.id" class="flow" :data-node-id="f.id"
          :class="[f.props?.scope, { active: activeId === f.id, lit: highlighted(f.id) }]"
          @click="select(f.id)"
        >
          <code>{{ f.id }}</code> {{ f.title }} <span class="tag" :class="f.props?.scope">{{ f.props?.scope }}</span>
        </button>
      </div>
      <button v-if="activeId" class="clear" @click="clear">Clear</button>
    </aside>
    <main>
      <template v-if="active">
        <h2><code>{{ active.id }}</code> {{ active.title }} <span class="tag" :class="active.props?.scope">{{ active.props?.scope }}</span></h2>
        <ol class="steps"><li v-for="s in steps" :key="s">{{ s }}</li></ol>
        <Prov :source="active.source" full />
        <h3>Touched nodes</h3>
        <div class="objects">
          <span v-for="n in touchedNodes" :key="n.id" class="obj lit" :data-node-id="n.id" :title="n.kind">{{ n.title }}</span>
        </div>
      </template>
      <p v-else class="small">Pick a flow. The nodes it uses light up below, and everywhere else in the app dims.</p>
    </main>
  </div>
</template>
