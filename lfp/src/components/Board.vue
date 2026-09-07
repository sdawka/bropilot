<script setup lang="ts">
import { computed } from 'vue';
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
</script>

<template>
  <div class="board-wrap">
    <div class="dogfood" :class="{ ok: dogfood.ok }">
      <b>Dogfood check</b>
      <span>{{ state.graph.nodes.length }} nodes · {{ state.graph.edges.length }} edges</span>
      <span v-if="dogfood.ok">· no unknown kinds, no dangling edges, no unknown edge types</span>
      <span v-else>· unknown kinds: {{ dogfood.unknownKinds.join(', ') || 0 }} · dangling: {{ dogfood.dangling.join(', ') || 0 }} · unknown edge types: {{ dogfood.unknownEdgeTypes.join(', ') || 0 }}</span>
      <span v-if="dogfood.orphans.length" class="warn">· orphans: {{ dogfood.orphans.join(', ') }}</span>
    </div>
    <div class="board">
      <section v-for="sp in REPRESENTATION_SPACES" :key="sp.id" class="col" :style="{ '--hue': sp.hue }">
        <header>
          <h2>{{ sp.label }} <small v-if="sp.settled" class="settled">settled</small></h2>
          <p>{{ sp.blurb }}</p>
          <Prov :source="sp.source" />
        </header>
        <div v-for="k in kindsIn(sp.id)" :key="k.id" class="kind-group">
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
    </div>
    <Inspector v-if="state.selectedId" :id="state.selectedId" @close="state.selectedId = null" />
  </div>
</template>
