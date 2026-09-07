<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Board from './components/Board.vue';
import Kernel from './components/Kernel.vue';
import Path from './components/Path.vue';
import Flows from './components/Flows.vue';
import { state, hydrate, resetToSeed, exportJson } from './store';

type View = 'board' | 'path' | 'kernel' | 'flows';
const views: { id: View; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'path', label: 'Path' },
  { id: 'kernel', label: 'Kernel' },
  { id: 'flows', label: 'Flows' },
];
const view = ref<View>((location.hash.slice(1) as View) || 'board');
const go = (v: View) => { view.value = v; location.hash = v; };
onMounted(hydrate);

const copied = ref(false);
async function copyExport() {
  await navigator.clipboard.writeText(exportJson());
  copied.value = true; setTimeout(() => (copied.value = false), 1500);
}
function reset() { if (confirm('Reset to the seed graph.json? Local edits and commits are lost.')) resetToSeed(); }
</script>

<template>
  <header class="top">
    <h1>Bropilot <span class="lfp">lfp</span></h1>
    <nav><button v-for="v in views" :key="v.id" :class="{ active: view === v.id }" @click="go(v.id)">{{ v.label }}</button></nav>
    <div class="actions">
      <span class="small" v-if="state.staged">1 changeset staged</span>
      <button @click="copyExport">{{ copied ? 'Copied' : 'Copy graph JSON' }}</button>
      <button @click="reset">Reset to seed</button>
    </div>
  </header>
  <div class="view" v-if="state.hydrated">
    <Board v-if="view === 'board'" />
    <Path v-else-if="view === 'path'" />
    <Kernel v-else-if="view === 'kernel'" />
    <Flows v-else />
  </div>
</template>
