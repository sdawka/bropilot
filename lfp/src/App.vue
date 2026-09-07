<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Overview from './components/Overview.vue';
import Definition from './components/Definition.vue';
import Domain from './components/Domain.vue';
import Flows from './components/Flows.vue';
import Kernel from './components/Kernel.vue';
import Glossary from './components/Glossary.vue';
import { state, hydrate, resetToSeed, exportJson } from './store';

type View = 'overview' | 'definition' | 'domain' | 'flows' | 'kernel';
const views: { id: View; label: string; title: string }[] = [
  { id: 'overview', label: 'Overview', title: 'The representation, space by space (was Board; S55)' },
  { id: 'definition', label: 'Definition', title: 'The question tree that grows the representation (was Path; S55)' },
  { id: 'domain', label: 'Domain', title: 'C4-style levels: context, modules, inside a module (was Kernel; S55, S56)' },
  { id: 'flows', label: 'Flows', title: 'All flows and the kernel objects they touch' },
  { id: 'kernel', label: 'Reference', title: "Bropilot's own kernel as tables, with the said/inferred filter and statement bank" },
];
const legacy: Record<string, View> = { board: 'overview', path: 'definition' };
const initial = location.hash.slice(1);
const view = ref<View>(legacy[initial] ?? (views.some((v) => v.id === initial) ? (initial as View) : 'overview'));
const go = (v: View) => { view.value = v; location.hash = v; state.selectedId = null; };
onMounted(() => { hydrate(); window.addEventListener('hashchange', () => { const h = location.hash.slice(1); const v = legacy[h] ?? h; if (views.some((x) => x.id === v) && view.value !== v) { view.value = v as View; state.selectedId = null; } }); });

const glossaryOpen = ref(false);
const copied = ref(false);
async function copyExport() {
  await navigator.clipboard.writeText(exportJson());
  copied.value = true; setTimeout(() => (copied.value = false), 1500);
}
function reset() { if (confirm('Reset to the seed graph.json? Local edits, answers, follow-ups and commits are lost.')) resetToSeed(); }
</script>

<template>
  <header class="top">
    <h1>Bropilot <span class="lfp">lfp</span></h1>
    <nav><button v-for="v in views" :key="v.id" :class="{ active: view === v.id }" :title="v.title" @click="go(v.id)">{{ v.label }}</button></nav>
    <div class="actions">
      <span class="small" v-if="state.staged">1 changeset staged</span>
      <button class="glossary-btn" @click="glossaryOpen = !glossaryOpen" title="Always here (S59)">📖 Glossary</button>
      <button @click="copyExport">{{ copied ? 'Copied' : 'Copy graph JSON' }}</button>
      <button @click="reset">Reset to seed</button>
    </div>
  </header>
  <div class="view" :class="{ 'panel-open': !!state.selectedId || glossaryOpen }" v-if="state.hydrated" title="">
    <Overview v-if="view === 'overview'" />
    <Definition v-else-if="view === 'definition'" />
    <Domain v-else-if="view === 'domain'" />
    <Flows v-else-if="view === 'flows'" />
    <Kernel v-else />
  </div>
  <Glossary :open="glossaryOpen" @close="glossaryOpen = false" />
</template>
