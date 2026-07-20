<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { KIND_MAP, SPACES, PARTS, nodeHue, type Part } from '../../lib/schema';
import { state, getNode, removeNode, edgesOf, undo } from '../../lib/store';
import { toast } from '../../lib/toast';
import { narrativeFor, type Sentence } from '../../lib/narrative';
import { lintGraph } from '../../lib/lint';
import { openOntology } from '../../lib/graphMode';
import { buildHash } from '../../lib/router';
import NodeForm from './NodeForm.vue';
import RelationshipEditor from './RelationshipEditor.vue';

const props = defineProps<{ view: string }>();

const tab = ref<'narrative' | 'details'>('narrative');

const node = computed(() => getNode(state.selectedId));
const def = computed(() => (node.value ? KIND_MAP[node.value.kind] : undefined));
const hue = computed(() => (node.value ? nodeHue(node.value) : '#6f6f7e'));
const space = computed(() => (def.value ? SPACES[def.value.space] : undefined));

const nodeFindings = computed(() =>
  node.value ? lintGraph(state.graph).filter((f) => f.nodeId === node.value!.id) : [],
);

function toOntology() {
  if (!node.value) return;
  openOntology(node.value.kind);
  location.hash = buildHash('graph', null);
}

// which parts the narrative covers: the current one, or all three on the graph
const parts = computed<Part[]>(() =>
  props.view === 'graph' ? PARTS.map((p) => p.id) : [props.view as Part],
);
const groups = computed(() => narrativeFor(parts.value));

function relevant(s: Sentence): boolean {
  return !!state.selectedId && s.nodeIds.includes(state.selectedId);
}
function hueOf(id: string): string {
  const n = getNode(id);
  return n ? nodeHue(n) : 'inherit';
}
function pick(id: string) {
  state.selectedId = id;
}

// bring the first relevant sentence into view when the selection changes
watch(
  () => state.selectedId,
  async (id) => {
    if (!id || tab.value !== 'narrative') return;
    await nextTick();
    document.querySelector('[data-relevant="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },
);

function close() {
  state.selectedId = null;
}
function del() {
  if (!node.value) return;
  const { outgoing, incoming } = edgesOf(node.value.id);
  const links = outgoing.length + incoming.length;
  const title = node.value.title || 'Untitled';
  removeNode(node.value.id);
  toast(`Deleted “${title}”${links ? ` (+${links} link${links > 1 ? 's' : ''})` : ''}`, {
    action: { label: 'Undo', handler: undo },
  });
}
</script>

<template>
  <aside class="flex h-full w-[360px] shrink-0 flex-col border-l hairline glass-strong">
    <!-- tabs -->
    <div class="flex shrink-0 border-b hairline">
      <button
        class="kicker flex-1 border-b-2 px-4 py-3 transition-colors"
        :class="tab === 'narrative' ? 'border-accent text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-200'"
        @click="tab = 'narrative'"
      >
        Narrative
      </button>
      <button
        class="kicker flex-1 border-b-2 px-4 py-3 transition-colors"
        :class="tab === 'details' ? 'border-accent text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-200'"
        @click="tab = 'details'"
      >
        Details
      </button>
    </div>

    <!-- ── Narrative ── -->
    <div v-if="tab === 'narrative'" class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <template v-for="g in groups" :key="g.part">
        <div class="kicker mb-4 mt-2 text-ink-400 first:mt-0">{{ g.label }}</div>
        <div class="mb-8 space-y-3">
          <p
            v-for="s in g.sentences"
            :key="s.id"
            :data-relevant="relevant(s) ? 'true' : 'false'"
            class="border-l-2 pl-3 font-serif text-[0.88rem] leading-relaxed transition-all duration-200"
            :class="
              !state.selectedId
                ? 'border-transparent text-ink-200'
                : relevant(s)
                  ? 'border-accent text-ink-100'
                  : 'border-transparent text-ink-200 opacity-30'
            "
          >
            <template v-for="(seg, i) in s.segments" :key="i">
              <button
                v-if="seg.nodeId"
                class="inline cursor-pointer border-b border-dotted border-current text-left font-semibold hover:opacity-80"
                :style="{ color: hueOf(seg.nodeId) }"
                @click="pick(seg.nodeId)"
              >{{ seg.text }}</button>
              <span v-else>{{ seg.text }}</span>
            </template>
          </p>
          <p v-if="!g.sentences.length" class="text-xs text-ink-400">Nothing here yet — add nodes to grow the story.</p>
        </div>
      </template>
    </div>

    <!-- ── Details ── -->
    <template v-else>
      <template v-if="node">
        <header class="relative shrink-0 overflow-hidden border-b hairline px-5 py-4">
          <div class="absolute inset-0 opacity-60" :style="{ background: `radial-gradient(120% 100% at 0% 0%, ${space?.glow}, transparent 70%)` }" />
          <div class="relative flex items-start justify-between gap-3">
            <div class="min-w-0">
              <button
                class="chip cursor-pointer transition hover:opacity-80"
                :style="{ color: hue }"
                title="View this kind in the ontology"
                @click="toOntology"
              >{{ def?.icon }} {{ def?.label }}</button>
              <span
                v-if="nodeFindings.length"
                class="chip ml-1.5 !border-amber-400/40 text-amber-400/90"
                :title="nodeFindings.map((f) => f.message + (f.suggestion ? ` — ${f.suggestion}` : '')).join('\n')"
              >⚠ {{ nodeFindings.length }}</span>
              <h2 class="display mt-2 truncate text-xl text-ink-100">{{ node.title || 'Untitled' }}</h2>
              <code class="mt-1 block truncate font-mono text-[0.68rem] text-ink-400">{{ node.id }}</code>
            </div>
            <button class="btn btn-ghost shrink-0 !px-2" @click="close" title="Close">✕</button>
          </div>
        </header>

        <div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <h3 class="label mb-3">Details</h3>
            <NodeForm :node="node" />
          </section>

          <section>
            <h3 class="label mb-3">Relationships</h3>
            <RelationshipEditor :node="node" />
          </section>

          <section v-if="node.sourceRefs && node.sourceRefs.length">
            <h3 class="label mb-2">Sources</h3>
            <ul class="space-y-1">
              <li v-for="(s, i) in node.sourceRefs" :key="i" class="bg-white/[0.03] px-2 py-1 font-mono text-[0.68rem] text-ink-300">
                {{ s.excerpt }}
              </li>
            </ul>
          </section>
        </div>

        <footer class="shrink-0 border-t hairline px-5 py-3">
          <button class="btn btn-danger w-full justify-center" @click="del">🗑 Delete node</button>
        </footer>
      </template>

      <template v-else>
        <div class="grid flex-1 place-items-center px-8 text-center text-ink-400">
          <div>
            <div class="mb-3 text-3xl opacity-40">⬡</div>
            <p class="text-sm">Select a node to inspect and edit it.</p>
          </div>
        </div>
      </template>
    </template>
  </aside>
</template>
