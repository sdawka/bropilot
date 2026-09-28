<script setup lang="ts">
import { computed, ref } from 'vue';
import { state, nodeById, edgesOf } from '../store';
import { useScreen } from '../screen';
import Prov from './Prov.vue';

defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();

const q = ref('');

const terms = computed(() =>
  state.graph.nodes
    .filter((n) => n.kind === 'term')
    .filter((n) => {
      const s = q.value.trim().toLowerCase();
      if (!s) return true;
      return n.title.toLowerCase().includes(s) || (n.description ?? '').toLowerCase().includes(s);
    })
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title)),
);

const definesOf = (id: string) => edgesOf(id).filter((e) => e.src === id && e.type === 'defines').map((e) => nodeById(e.dst)?.title ?? e.dst);
const isLit = (id: string) => state.highlight.nodes.includes(id);

useScreen(() => terms.value.map((t) => ({ id: t.id, kind: 'term', title: t.title })));
</script>

<template>
  <aside class="glossary" v-if="open">
    <div class="head">
      <h2>Glossary</h2>
      <button class="close" @click="$emit('close')">×</button>
    </div>
    <p class="small note">Read-only — edit terms through the Talk panel.</p>

    <input class="search" v-model="q" placeholder="Search terms…" />

    <ul class="terms">
      <li v-for="t in terms" :key="t.id" class="term" :data-node-id="t.id" :class="{ lit: isLit(t.id) }">
        <div class="row head-row">
          <b class="title">{{ t.title }}</b>
          <Prov :source="t.source" />
        </div>
        <p class="small" v-if="t.description">{{ t.description }}</p>
        <p class="small defines" v-if="definesOf(t.id).length">defines: {{ definesOf(t.id).join(', ') }}</p>
      </li>
      <li v-if="!terms.length" class="empty small">No terms match.</li>
    </ul>
  </aside>
</template>

<style scoped>
.glossary { position: fixed; right: 1rem; top: 4rem; bottom: 1rem; border-radius: 10px; width: 400px; overflow-y: auto; background: var(--panel); border-left: 1px solid var(--line); box-shadow: -8px 0 30px rgba(0, 0, 0, .1); z-index: 20; padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
.head { display: flex; justify-content: space-between; align-items: center; }
.head h2 { margin: 0; }
.close { border: none; font-size: 1.2rem; background: none; padding: 0 .3rem; }
.note { margin: 0; }
.search { width: 100%; }
input { font: inherit; padding: .35rem .5rem; border: 1px solid var(--line); border-radius: 6px; }
.terms { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
.term { border: 1px solid var(--line); border-radius: 8px; padding: .6rem; display: flex; flex-direction: column; gap: .3rem; }
.term.lit { outline: 2px solid var(--kernel); }
.row { display: flex; gap: .4rem; align-items: center; }
.head-row { justify-content: space-between; }
.title { font-size: .95rem; }
.defines { color: var(--muted); }
.empty { text-align: center; padding: 1rem 0; }
</style>
