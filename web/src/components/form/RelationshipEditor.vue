<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { EDGE_TYPES, SUGGESTED_EDGE_TYPES, edgeTypesByCategory, KIND_MAP, nodeHue, triplesFrom, tripleFor, type GraphNode } from '../../lib/schema';
import { state, edgesOf, addEdge, removeEdge, updateEdge, getNode } from '../../lib/store';

const props = defineProps<{ node: GraphNode }>();

// ── suggested-first type ordering (hints only — everything stays allowed) ──
const suggested = computed(() => SUGGESTED_EDGE_TYPES[props.node.kind] ?? []);
const suggestedDefs = computed(() =>
  suggested.value.map((s) => EDGE_TYPES.find((t) => t.type === s)!).filter(Boolean),
);
const grouped = edgeTypesByCategory();

const newType = ref(suggested.value[0] ?? 'uses');
watch(
  () => props.node.kind,
  () => {
    newType.value = suggested.value[0] ?? 'uses';
  },
);

const links = computed(() => edgesOf(props.node.id));

// ── one-click suggestions from the ontology (advisory — never exhaustive) ──
const chips = computed(() => {
  const existing = new Set(links.value.outgoing.map((e) => `${e.type}|${e.dstId}`));
  const out: { type: string; target: GraphNode; strength: string }[] = [];
  for (const t of triplesFrom(props.node.kind)) {
    for (const n of state.graph.nodes) {
      if (n.kind !== t.dst || n.id === props.node.id) continue;
      if (existing.has(`${t.type}|${n.id}`)) continue;
      out.push({ type: t.type, target: n, strength: t.strength });
    }
    if (out.length >= 6) break;
  }
  return out.slice(0, 6);
});

function addChip(c: { type: string; target: GraphNode }) {
  addEdge(props.node.id, c.target.id, c.type);
}

function fitsOntology(n: GraphNode): boolean {
  return !!tripleFor(props.node.kind, newType.value, n.kind);
}

// ── inline label editing ──
const editingId = ref<string | null>(null);

// ── target combobox ──
const query = ref('');
const hi = ref(0);
const focused = ref(false);

const targets = computed(() =>
  state.graph.nodes
    .filter((n) => n.id !== props.node.id)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title)),
);

const results = computed(() => {
  const q = query.value.trim().toLowerCase();
  const pool = q ? targets.value.filter((n) => n.title.toLowerCase().includes(q)) : targets.value;
  return pool
    .slice()
    .sort((a, b) => Number(fitsOntology(b)) - Number(fitsOntology(a)) || a.title.localeCompare(b.title))
    .slice(0, 20);
});

function pick(id: string) {
  addEdge(props.node.id, id, newType.value);
  query.value = '';
  hi.value = 0;
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    hi.value = Math.min(hi.value + 1, results.value.length - 1);
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    hi.value = Math.max(hi.value - 1, 0);
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const target = results.value[hi.value];
    if (target) pick(target.id);
  } else if (ev.key === 'Escape') {
    query.value = '';
    (ev.target as HTMLElement).blur();
  }
}

watch(results, () => {
  if (hi.value >= results.value.length) hi.value = Math.max(0, results.value.length - 1);
});

function label(id: string) {
  const n = getNode(id);
  return n ? n.title : id;
}
function dot(id: string) {
  const n = getNode(id);
  return n ? nodeHue(n) : '#5b667e';
}
function icon(id: string) {
  const n = getNode(id);
  return n ? KIND_MAP[n.kind]?.icon : '•';
}
</script>

<template>
  <div class="space-y-3">
    <!-- existing edges -->
    <ul v-if="links.outgoing.length || links.incoming.length" class="space-y-1.5">
      <li
        v-for="e in links.outgoing"
        :key="e.id"
        class="border hairline bg-ink-950"
        :style="{ borderLeftWidth: '3px', borderLeftColor: dot(e.dstId) }"
      >
        <div class="group flex items-center gap-2 px-2.5 py-1.5 text-xs">
          <select
            :value="e.type"
            class="shrink-0 cursor-pointer appearance-none border-0 bg-white/5 px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-accent outline-none"
            title="Change relationship type"
            @change="updateEdge(e.id, { type: ($event.target as HTMLSelectElement).value })"
          >
            <optgroup v-for="g in grouped" :key="g.category.id" :label="g.category.label">
              <option v-for="t in g.types" :key="t.type" :value="t.type" :title="t.hint">{{ t.label }} →</option>
            </optgroup>
          </select>
          <span class="truncate text-ink-200">{{ icon(e.dstId) }} {{ label(e.dstId) }}</span>
          <span v-if="e.label && editingId !== e.id" class="truncate text-[0.66rem] italic text-ink-400">“{{ e.label }}”</span>
          <span class="ml-auto flex shrink-0 opacity-0 group-hover:opacity-100">
            <button class="btn-ghost btn !px-1.5 !py-0.5" title="Edit label" @click="editingId = editingId === e.id ? null : e.id">✎</button>
            <button class="btn-ghost btn !px-1.5 !py-0.5" title="Remove" @click="removeEdge(e.id)">✕</button>
          </span>
        </div>
        <div v-if="editingId === e.id" class="px-2.5 pb-2">
          <input
            :value="e.label ?? ''"
            class="field !py-1 text-xs"
            placeholder="Optional label…"
            @input="updateEdge(e.id, { label: ($event.target as HTMLInputElement).value || undefined })"
            @keydown.enter="editingId = null"
            @keydown.escape="editingId = null"
          />
        </div>
      </li>
      <li
        v-for="e in links.incoming"
        :key="e.id"
        class="border hairline bg-ink-950"
        :style="{ borderLeftWidth: '3px', borderLeftColor: dot(e.srcId) }"
      >
        <div class="group flex items-center gap-2 px-2.5 py-1.5 text-xs">
          <span class="truncate text-ink-200">{{ icon(e.srcId) }} {{ label(e.srcId) }}</span>
          <select
            :value="e.type"
            class="shrink-0 cursor-pointer appearance-none border-0 bg-white/5 px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-ink-300 outline-none"
            title="Change relationship type"
            @change="updateEdge(e.id, { type: ($event.target as HTMLSelectElement).value })"
          >
            <optgroup v-for="g in grouped" :key="g.category.id" :label="g.category.label">
              <option v-for="t in g.types" :key="t.type" :value="t.type" :title="t.hint">→ {{ t.label }}</option>
            </optgroup>
          </select>
          <span v-if="e.label && editingId !== e.id" class="truncate text-[0.66rem] italic text-ink-400">“{{ e.label }}”</span>
          <span class="ml-auto flex shrink-0 opacity-0 group-hover:opacity-100">
            <button class="btn-ghost btn !px-1.5 !py-0.5" title="Edit label" @click="editingId = editingId === e.id ? null : e.id">✎</button>
            <button class="btn-ghost btn !px-1.5 !py-0.5" title="Remove" @click="removeEdge(e.id)">✕</button>
          </span>
        </div>
        <div v-if="editingId === e.id" class="px-2.5 pb-2">
          <input
            :value="e.label ?? ''"
            class="field !py-1 text-xs"
            placeholder="Optional label…"
            @input="updateEdge(e.id, { label: ($event.target as HTMLInputElement).value || undefined })"
            @keydown.enter="editingId = null"
            @keydown.escape="editingId = null"
          />
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-ink-400">No relationships yet.</p>

    <!-- ontology suggestions -->
    <div v-if="chips.length" class="flex flex-wrap gap-1.5">
      <button
        v-for="c in chips"
        :key="`${c.type}-${c.target.id}`"
        class="btn btn-ghost !px-2 !py-1 text-[0.68rem]"
        :title="`Suggested by the ontology (${c.strength})`"
        @click="addChip(c)"
      >
        <span class="font-mono uppercase tracking-[0.08em] text-accent">{{ c.type }}</span>
        <span class="ml-1 truncate">→ {{ KIND_MAP[c.target.kind]?.icon }} {{ c.target.title }}</span>
      </button>
    </div>

    <!-- add edge -->
    <div class="rounded-lg border border-dashed border-white/10 p-2.5">
      <div class="mb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-ink-400">Add relationship</div>
      <div class="flex flex-col gap-2">
        <select v-model="newType" class="field !py-1.5 text-xs" :title="EDGE_TYPES.find((e) => e.type === newType)?.hint">
          <optgroup v-if="suggestedDefs.length" label="Suggested">
            <option v-for="t in suggestedDefs" :key="t.type" :value="t.type">this {{ t.label }} …</option>
          </optgroup>
          <optgroup v-for="g in grouped" :key="g.category.id" :label="g.category.label">
            <option v-for="t in g.types" :key="t.type" :value="t.type" :title="t.hint">this {{ t.label }} …</option>
          </optgroup>
        </select>

        <!-- searchable target picker — results stay in-flow (Inspector scrolls) -->
        <input
          v-model="query"
          class="field !py-1.5 text-xs"
          placeholder="Search for a target node…"
          @focus="focused = true"
          @blur="focused = false"
          @keydown="onKey"
        />
        <ul
          v-if="(focused || query) && results.length"
          class="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-white/8 bg-white/[0.02] p-1"
        >
          <li v-for="(n, i) in results" :key="n.id">
            <button
              class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition"
              :class="i === hi ? 'bg-white/[0.08] text-ink-100' : 'text-ink-300 hover:bg-white/[0.05]'"
              @pointerdown.prevent
              @click="pick(n.id)"
              @pointerenter="hi = i"
            >
              <span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{ background: nodeHue(n) }" />
              <span class="truncate">{{ KIND_MAP[n.kind]?.icon }} {{ n.title }}</span>
              <span class="ml-auto shrink-0 text-[0.64rem] text-ink-400">{{ KIND_MAP[n.kind]?.label }}</span>
              <span v-if="fitsOntology(n)" class="shrink-0 text-[0.6rem] text-emerald-400/70">· fits ontology</span>
            </button>
          </li>
        </ul>
        <p v-else-if="query && !results.length" class="px-1 text-[0.68rem] text-ink-400">No matching nodes.</p>
      </div>
    </div>
  </div>
</template>
