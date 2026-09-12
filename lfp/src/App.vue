<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import Overview from './components/Overview.vue';
import Definition from './components/Definition.vue';
import Domain from './components/Domain.vue';
import Flows from './components/Flows.vue';
import Kernel from './components/Kernel.vue';
import Glossary from './components/Glossary.vue';
import Mirror from './components/Mirror.vue';
import AgentSidebar from './components/AgentSidebar.vue';
import { state, hydrate, resetToSeed, exportJson } from './store';
import { startDirectorHost } from './directors/index';
import { relayHost, setRelayHost } from './bus';

type View = 'overview' | 'definition' | 'domain' | 'flows' | 'kernel' | 'mirror';
const views: { id: View; label: string; title: string }[] = [
  { id: 'overview', label: 'Overview', title: 'The representation, space by space (was Board; S55)' },
  { id: 'definition', label: 'Definition', title: 'The question tree that grows the representation (was Path; S55)' },
  { id: 'domain', label: 'Domain', title: 'Map, then C4-style levels: context, modules, inside a module (S55, S56, S79)' },
  { id: 'flows', label: 'Flows', title: 'All flows and the kernel objects they touch' },
  { id: 'kernel', label: 'Reference', title: "Bropilot's own kernel as tables, with the said/inferred filter and statement bank" },
];
const legacy: Record<string, View> = { board: 'overview', path: 'definition' };
const hashView = () => location.hash.slice(1).split('?')[0];
const resolve = (h: string): View | null => { const v = legacy[h] ?? h; return v === 'mirror' || views.some((x) => x.id === v) ? (v as View) : null; };
const view = ref<View>(resolve(hashView()) ?? 'overview');
const isMirror = computed(() => view.value === 'mirror');
const go = (v: View) => { view.value = v; location.hash = v; state.selectedId = null; };
onMounted(() => {
  hydrate();
  window.addEventListener('hashchange', () => { const v = resolve(hashView()); if (v && view.value !== v) { view.value = v; state.selectedId = null; } });
  if (!isMirror.value) startDirectorHost();
});

const glossaryOpen = ref(false);
const agentOpen = ref(true);
const copied = ref(false);
const relay = ref(relayHost());
async function copyExport() { await navigator.clipboard.writeText(exportJson()); copied.value = true; setTimeout(() => (copied.value = false), 1500); }
function reset() { if (confirm('Reset to the seed graph.json? Local edits, answers, follow-ups and commits are lost.')) resetToSeed(); }
function openMirror() { window.open(`${location.origin}${location.pathname}#mirror${relay.value ? `?relay=${relay.value}` : ''}`, 'bropilot-mirror', 'width=420,height=800'); }
function configureRelay() {
  const host = prompt('Relay host (LAN IP of this machine, printed by `npm run relay`). Empty = same-machine BroadcastChannel.', relay.value ?? '');
  if (host === null) return; setRelayHost(host.trim()); relay.value = host.trim(); location.reload();
}
const panelOpen = computed(() => !!state.selectedId || glossaryOpen.value || agentOpen.value);
</script>

<template>
  <Mirror v-if="isMirror" />
  <template v-else>
    <header class="top">
      <h1>Bropilot <span class="lfp">lfp</span></h1>
      <nav><button v-for="v in views" :key="v.id" :class="{ active: view === v.id }" :title="v.title" @click="go(v.id)">{{ v.label }}</button></nav>
      <div class="actions">
        <span class="small" v-if="state.staged">1 changeset staged</span>
        <button class="glossary-btn" @click="glossaryOpen = !glossaryOpen" title="Always here (S59)">📖 Glossary</button>
        <button :class="{ active: agentOpen }" @click="agentOpen = !agentOpen" title="The agent sidebar (S110)">🪞 Agent</button>
        <button @click="openMirror" title="Open the magic-mirror screen in a new window (S111–S113)">Mirror ↗</button>
        <button @click="configureRelay" :title="relay ? `Relay: ${relay}` : 'No relay: same-machine BroadcastChannel'">{{ relay ? `📡 ${relay}` : '📡 relay…' }}</button>
        <button @click="copyExport">{{ copied ? 'Copied' : 'Copy graph JSON' }}</button>
        <button @click="reset">Reset to seed</button>
      </div>
    </header>
    <div class="view" :class="{ 'panel-open': panelOpen }" v-if="state.hydrated">
      <Overview v-if="view === 'overview'" />
      <Definition v-else-if="view === 'definition'" />
      <Domain v-else-if="view === 'domain'" />
      <Flows v-else-if="view === 'flows'" />
      <Kernel v-else />
    </div>
    <AgentSidebar :open="agentOpen" @close="agentOpen = false" />
    <Glossary :open="glossaryOpen" @close="glossaryOpen = false" />
  </template>
</template>
