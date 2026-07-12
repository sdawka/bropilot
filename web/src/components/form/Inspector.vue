<script setup lang="ts">
import { computed } from 'vue';
import { KIND_MAP, SPACES, nodeHue } from '../../lib/schema';
import { state, getNode, removeNode } from '../../lib/store';
import NodeForm from './NodeForm.vue';
import RelationshipEditor from './RelationshipEditor.vue';

const node = computed(() => getNode(state.selectedId));
const def = computed(() => (node.value ? KIND_MAP[node.value.kind] : undefined));
const hue = computed(() => (node.value ? nodeHue(node.value) : '#5b667e'));
const space = computed(() => (def.value ? SPACES[def.value.space] : undefined));

function close() {
  state.selectedId = null;
}
function del() {
  if (node.value) removeNode(node.value.id);
}
</script>

<template>
  <aside
    class="flex h-full w-[360px] shrink-0 flex-col border-l hairline glass-strong"
    :class="node ? '' : 'items-center justify-center'"
  >
    <template v-if="node">
      <!-- header -->
      <header class="relative shrink-0 overflow-hidden border-b hairline px-5 py-4">
        <div class="absolute inset-0 opacity-60" :style="{ background: `radial-gradient(120% 100% at 0% 0%, ${space?.glow}, transparent 70%)` }" />
        <div class="relative flex items-start justify-between gap-3">
          <div class="min-w-0">
            <span class="chip" :style="{ color: hue }">{{ def?.icon }} {{ def?.label }}</span>
            <h2 class="mt-2 truncate text-lg font-semibold text-ink-100">{{ node.title || 'Untitled' }}</h2>
            <code class="mt-1 block truncate font-mono text-[0.68rem] text-ink-400">{{ node.id }}</code>
          </div>
          <button class="btn btn-ghost shrink-0 !px-2" @click="close" title="Close">✕</button>
        </div>
      </header>

      <!-- body -->
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
            <li v-for="(s, i) in node.sourceRefs" :key="i" class="rounded bg-white/[0.03] px-2 py-1 font-mono text-[0.68rem] text-ink-300">
              {{ s.excerpt }}
            </li>
          </ul>
        </section>
      </div>

      <!-- footer -->
      <footer class="shrink-0 border-t hairline px-5 py-3">
        <button class="btn btn-danger w-full justify-center" @click="del">🗑 Delete node</button>
      </footer>
    </template>

    <template v-else>
      <div class="px-8 text-center text-ink-400">
        <div class="mb-3 text-3xl opacity-40">⬡</div>
        <p class="text-sm">Select a node to inspect and edit it.</p>
      </div>
    </template>
  </aside>
</template>
