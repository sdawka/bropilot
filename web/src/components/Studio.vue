<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { PARTS, type Part } from '../lib/schema';
import {
  state,
  counts,
  hydrate,
  exportGraph,
  importGraph,
  resetToSample,
  clearGraph,
} from '../lib/store';
import OverviewView from './views/OverviewView.vue';
import PartView from './views/PartView.vue';
import GraphView from './views/GraphView.vue';
import Inspector from './form/Inspector.vue';
import Modal from './ui/Modal.vue';

type View = 'overview' | Part | 'graph';

const view = ref<View>('overview');
const ready = ref(false);

const showExport = ref(false);
const showImport = ref(false);
const importText = ref('');
const importError = ref('');
const copied = ref(false);

const nav = computed(() => [
  { id: 'overview' as View, label: 'Overview', icon: '🏠', count: null as number | null },
  ...PARTS.map((p) => ({ id: p.id as View, label: p.label, icon: p.icon, count: counts.value[p.id] })),
  { id: 'graph' as View, label: 'Graph', icon: '🕸️', count: null },
]);

const showInspector = computed(() => view.value !== 'overview');

function go(v: View) {
  view.value = v;
}
function navigateFromOverview(target: Part | 'graph') {
  view.value = target;
}

// ── export ──
const exported = computed(() => exportGraph());
async function copyExport() {
  try {
    await navigator.clipboard.writeText(exported.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    /* ignore */
  }
}
function downloadExport() {
  const blob = new Blob([exported.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bropilot-graph.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ── import ──
function onFile(ev: Event) {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    importText.value = String(reader.result ?? '');
  };
  reader.readAsText(file);
}
function doImport() {
  const res = importGraph(importText.value);
  if (res.ok) {
    showImport.value = false;
    importText.value = '';
    importError.value = '';
    view.value = 'overview';
  } else {
    importError.value = res.error ?? 'Invalid graph';
  }
}

function doReset() {
  if (confirm('Replace the current graph with the demo sample? This cannot be undone.')) resetToSample();
}
function doClear() {
  if (confirm('Delete every node and edge? This cannot be undone.')) {
    clearGraph();
    view.value = 'overview';
  }
}

onMounted(() => {
  hydrate();
  ready.value = true;
});
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden">
    <!-- ── Sidebar ── -->
    <aside class="flex w-60 shrink-0 flex-col border-r hairline glass-strong">
      <div class="flex items-center gap-2.5 px-5 py-5">
        <span class="grid h-9 w-9 place-items-center rounded-xl text-lg" style="background: linear-gradient(135deg, #7c8cff, #38bdf8)">🧠</span>
        <div>
          <div class="text-sm font-bold leading-tight">Bropilot</div>
          <div class="text-[0.68rem] leading-tight text-ink-400">Studio</div>
        </div>
      </div>

      <nav class="flex-1 space-y-1 px-3">
        <button
          v-for="item in nav"
          :key="item.id"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition"
          :class="view === item.id ? 'bg-white/[0.07] text-ink-100 font-medium' : 'text-ink-300 hover:bg-white/[0.04] hover:text-ink-100'"
          @click="go(item.id)"
        >
          <span class="relative">
            <span
              v-if="view === item.id"
              class="absolute -left-3 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full"
              style="background: var(--color-accent)"
            />
            {{ item.icon }}
          </span>
          <span>{{ item.label }}</span>
          <span v-if="item.count != null" class="ml-auto text-xs text-ink-400">{{ item.count }}</span>
        </button>
      </nav>

      <div class="space-y-1.5 border-t hairline px-3 py-3">
        <div class="px-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-wider text-ink-400">
          {{ counts.nodes }} nodes · {{ counts.edges }} edges
        </div>
        <button class="btn w-full justify-start" @click="showImport = true">⬆ Import JSON</button>
        <button class="btn w-full justify-start" @click="showExport = true">⬇ Export JSON</button>
        <div class="flex gap-1.5">
          <button class="btn btn-ghost flex-1 justify-center text-xs" @click="doReset" title="Load the demo sample">Sample</button>
          <button class="btn btn-ghost btn-danger flex-1 justify-center text-xs" @click="doClear" title="Clear everything">Clear</button>
        </div>
      </div>
    </aside>

    <!-- ── Main ── -->
    <main
      class="min-w-0 flex-1"
      :class="view === 'graph' ? 'overflow-hidden' : 'overflow-y-auto'"
    >
      <template v-if="ready">
        <OverviewView v-if="view === 'overview'" @navigate="navigateFromOverview" />
        <GraphView v-else-if="view === 'graph'" />
        <PartView v-else :key="view" :part="view" />
      </template>
    </main>

    <!-- ── Inspector ── -->
    <Inspector v-if="ready && showInspector" />

    <!-- ── Export modal ── -->
    <Modal v-if="showExport" title="Export graph" @close="showExport = false">
      <p class="mb-3 text-xs text-ink-300">Bropilot JSON — paste into <code class="text-accent">/bropilot-generate</code> to scaffold code.</p>
      <textarea readonly :value="exported" rows="12" class="field resize-none font-mono text-[0.7rem]" />
      <div class="mt-3 flex gap-2">
        <button class="btn btn-primary" @click="copyExport">{{ copied ? '✓ Copied' : 'Copy' }}</button>
        <button class="btn" @click="downloadExport">Download .json</button>
      </div>
    </Modal>

    <!-- ── Import modal ── -->
    <Modal v-if="showImport" title="Import graph" @close="showImport = false">
      <p class="mb-3 text-xs text-ink-300">Paste a Bropilot JSON graph, or load a file. This replaces the current graph.</p>
      <textarea v-model="importText" rows="10" class="field resize-none font-mono text-[0.7rem]" placeholder='{ "nodes": [...], "edges": [...] }' />
      <p v-if="importError" class="mt-2 text-xs text-rose-400">⚠ {{ importError }}</p>
      <div class="mt-3 flex items-center gap-2">
        <button class="btn btn-primary" :disabled="!importText.trim()" @click="doImport">Load graph</button>
        <label class="btn cursor-pointer">
          Choose file…
          <input type="file" accept="application/json,.json" class="hidden" @change="onFile" />
        </label>
      </div>
    </Modal>
  </div>
</template>
