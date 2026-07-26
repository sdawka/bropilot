<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { PARTS, KIND_MAP, type Part, type GraphNode } from '../lib/schema';
import {
  state,
  counts,
  hydrate,
  exportGraph,
  importGraph,
  resetToSample,
  clearGraph,
  undo,
  redo,
  canUndo,
  canRedo,
  savedAt,
} from '../lib/store';
import OverviewView from './views/OverviewView.vue';
import PartView from './views/PartView.vue';
import GraphView from './views/GraphView.vue';
import WorkshopView from './views/WorkshopView.vue';
import { parseHash, buildHash, type View } from '../lib/router';
import Inspector from './form/Inspector.vue';
import Modal from './ui/Modal.vue';
import ConfirmModal from './ui/ConfirmModal.vue';
import SearchPalette from './ui/SearchPalette.vue';
import Toaster from './ui/Toaster.vue';
import { toast } from '../lib/toast';

const view = ref<View>('overview');
const ready = ref(false);

const showExport = ref(false);
const showImport = ref(false);
const importText = ref('');
const importError = ref('');

const nav = computed(() => [
  { id: 'overview' as View, label: 'Overview', icon: '🏠', count: null as number | null },
  ...PARTS.map((p) => ({ id: p.id as View, label: p.label, icon: p.icon, count: counts.value[p.id] })),
  { id: 'workshop' as View, label: 'Workshop', icon: '🛠️', count: null },
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
    toast('✓ Copied to clipboard');
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
    toast(`Imported ${counts.value.nodes} nodes, ${counts.value.edges} edges`, {
      action: { label: 'Undo', handler: undo },
    });
  } else {
    importError.value = res.error ?? 'Invalid graph';
  }
}

// ── destructive-action confirms ──
const confirmState = ref<null | {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
}>(null);

function doReset() {
  confirmState.value = {
    title: 'Load sample',
    message: 'Replace the current graph with the demo sample?',
    confirmLabel: 'Replace',
    danger: false,
    onConfirm: resetToSample,
  };
}
function doClear() {
  confirmState.value = {
    title: 'Clear graph',
    message: 'Delete every node and edge?',
    confirmLabel: 'Delete all',
    danger: true,
    onConfirm: () => {
      clearGraph();
      view.value = 'overview';
    },
  };
}
function runConfirm() {
  confirmState.value?.onConfirm();
  confirmState.value = null;
}

// ── saved indicator — debounced off the per-keystroke autosave ──
const showSaved = ref(false);
let savedShowTimer: ReturnType<typeof setTimeout> | null = null;
let savedHideTimer: ReturnType<typeof setTimeout> | null = null;
watch(savedAt, () => {
  if (savedShowTimer) clearTimeout(savedShowTimer);
  if (savedHideTimer) clearTimeout(savedHideTimer);
  showSaved.value = false;
  savedShowTimer = setTimeout(() => {
    showSaved.value = true;
    savedHideTimer = setTimeout(() => (showSaved.value = false), 1500);
  }, 800);
});

// ── hash routing — #/{view}/{nodeId?} ──
function applyHash() {
  const { view: v, nodeId } = parseHash(location.hash);
  view.value = v;
  state.selectedId = nodeId && state.graph.nodes.some((n) => n.id === nodeId) ? nodeId : null;
}

// Push on view change (Back steps between views), replace on selection-only
// change (clicking through nodes must not spam history). The equality check
// is the echo guard for hashchange → state → hash round-trips.
watch([view, () => state.selectedId], ([v, sel], [prevV]) => {
  const target = buildHash(v, sel);
  if (location.hash === target) return;
  if (v !== prevV) history.pushState(null, '', target);
  else history.replaceState(null, '', target);
});

// ── search palette ──
const showSearch = ref(false);

function onSearchPick(node: GraphNode) {
  state.selectedId = node.id;
  // stay on the graph (spotlight reacts to selection); otherwise jump to the node's part
  if (view.value !== 'graph') {
    const part = KIND_MAP[node.kind]?.part;
    if (part) view.value = part;
  }
  showSearch.value = false;
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el.isContentEditable
  );
}

// ── keyboard shortcuts ──
function onKeydown(ev: KeyboardEvent) {
  const mod = ev.metaKey || ev.ctrlKey;
  if (mod && ev.key.toLowerCase() === 'k') {
    ev.preventDefault();
    showSearch.value = !showSearch.value;
  } else if (ev.key === '/' && !mod && !showSearch.value && !isEditable(ev.target)) {
    ev.preventDefault();
    showSearch.value = true;
  } else if (mod && ev.key.toLowerCase() === 'z') {
    // preventDefault even inside inputs — v-model syncs the store per keystroke,
    // so native input undo would desync store history.
    ev.preventDefault();
    if (ev.shiftKey) redo();
    else undo();
  } else if (mod && ev.key.toLowerCase() === 'y') {
    ev.preventDefault();
    redo();
  }
}

onMounted(() => {
  hydrate();
  applyHash(); // after hydrate — stale-node-id validation needs the graph
  const canonical = buildHash(view.value, state.selectedId);
  if (location.hash !== canonical) history.replaceState(null, '', canonical);
  ready.value = true;
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', applyHash);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('hashchange', applyHash);
});
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden">
    <!-- ── Sidebar ── -->
    <aside class="flex w-60 shrink-0 flex-col border-r hairline glass-strong">
      <div class="flex items-center gap-2.5 border-b hairline px-5 py-5">
        <span class="grid h-9 w-9 place-items-center bg-accent text-lg">🧠</span>
        <div>
          <div class="display text-base leading-tight">Bropilot</div>
          <div class="kicker leading-tight text-ink-400">Studio</div>
        </div>
      </div>

      <div class="px-3 pb-2">
        <button
          class="btn w-full justify-start text-ink-300"
          title="Search nodes (⌘K or /)"
          @click="showSearch = true"
        >
          🔍 Search
          <kbd class="ml-auto rounded bg-white/5 px-1.5 py-0.5 font-mono text-[0.62rem] text-ink-400">⌘K</kbd>
        </button>
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
        <div class="flex items-center px-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-wider text-ink-400">
          <span>{{ counts.nodes }} nodes · {{ counts.edges }} edges</span>
          <Transition
            enter-active-class="transition duration-200"
            enter-from-class="opacity-0"
            leave-active-class="transition duration-300"
            leave-to-class="opacity-0"
          >
            <span v-if="showSaved" class="ml-2 normal-case tracking-normal text-emerald-400/80">✓ Saved</span>
          </Transition>
          <span class="ml-auto flex gap-0.5 normal-case tracking-normal">
            <button
              class="btn btn-ghost px-1.5 py-0.5 text-xs disabled:cursor-default disabled:opacity-30"
              :disabled="!canUndo"
              title="Undo (⌘Z)"
              @click="undo()"
            >↩</button>
            <button
              class="btn btn-ghost px-1.5 py-0.5 text-xs disabled:cursor-default disabled:opacity-30"
              :disabled="!canRedo"
              title="Redo (⇧⌘Z)"
              @click="redo()"
            >↪</button>
          </span>
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
        <WorkshopView v-else-if="view === 'workshop'" />
        <PartView v-else :key="view" :part="view" />
      </template>
    </main>

    <!-- ── Inspector ── -->
    <Inspector v-if="ready && showInspector" :view="view" />

    <!-- ── Export modal ── -->
    <Modal v-if="showExport" title="Export graph" @close="showExport = false">
      <p class="mb-3 text-xs text-ink-300">Bropilot JSON — paste into <code class="text-accent">/bropilot-generate</code> to scaffold code.</p>
      <textarea readonly :value="exported" rows="12" class="field resize-none font-mono text-[0.7rem]" />
      <div class="mt-3 flex gap-2">
        <button class="btn btn-primary" @click="copyExport">Copy</button>
        <button class="btn" @click="downloadExport">Download .json</button>
      </div>
    </Modal>

    <!-- ── Import modal ── -->
    <Modal v-if="showImport" title="Import graph" @close="showImport = false">
      <p class="mb-3 text-xs text-ink-300">Paste a Bropilot JSON graph, or load a file. This replaces the current graph (undoable).</p>
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

    <!-- ── Confirm modal ── -->
    <ConfirmModal
      v-if="confirmState"
      :title="confirmState.title"
      :message="confirmState.message"
      :confirm-label="confirmState.confirmLabel"
      :danger="confirmState.danger"
      @confirm="runConfirm"
      @close="confirmState = null"
    />

    <!-- ── Search palette ── -->
    <SearchPalette v-if="showSearch" @pick="onSearchPick" @close="showSearch = false" />

    <Toaster />
  </div>
</template>
