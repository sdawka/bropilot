<script setup lang="ts">
import { ref, computed } from 'vue';
import { lintGraph, type Finding } from '../../lib/lint';
import { suggestFor, type Suggestion } from '../../lib/suggest';
import { state, getNode, updateNode, addEdge, undo } from '../../lib/store';
import { KIND_MAP, EDGE_TYPE_LABELS } from '../../lib/schema';
import { buildHash } from '../../lib/router';
import { toast } from '../../lib/toast';

type Card =
  | { key: string; type: 'finding'; nodeId?: string; message: string; suggestion?: string }
  | { key: string; type: 'suggestion'; nodeId: string; s: Suggestion };

const skipped = ref<Set<string>>(new Set());
const cursor = ref(0);

const queue = computed<Card[]>(() => {
  const cards: Card[] = [];
  const findings = lintGraph(state.graph);
  findings.forEach((f: Finding, i) => {
    const key = `f-${f.nodeId ?? 'x'}-${f.edgeId ?? i}-${f.message.slice(0, 24)}`;
    cards.push({ key, type: 'finding', nodeId: f.nodeId, message: f.message, suggestion: f.suggestion });
  });
  for (const n of state.graph.nodes) {
    for (const s of suggestFor(state.graph, n.id)) {
      cards.push({ key: `s-${n.id}-${s.dir}-${s.type}-${s.otherKind}`, type: 'suggestion', nodeId: n.id, s });
    }
  }
  // dedupe by key + drop skipped
  const seen = new Set<string>();
  return cards.filter((c) => !skipped.value.has(c.key) && (seen.has(c.key) ? false : (seen.add(c.key), true)));
});

const current = computed(() => queue.value[Math.min(cursor.value, queue.value.length - 1)] ?? null);
const position = computed(() => (queue.value.length ? `${Math.min(cursor.value + 1, queue.value.length)} of ${queue.value.length}` : '0 of 0'));

function title(id?: string) {
  return id ? getNode(id)?.title ?? id : '';
}

// ── inline fixes ──
const descDraft = ref('');
function needsDescription(c: Card): boolean {
  return c.type === 'finding' && !!c.nodeId && !getNode(c.nodeId)?.description;
}
function saveDescription(nodeId: string) {
  if (!descDraft.value.trim()) return;
  updateNode(nodeId, { description: descDraft.value.trim() });
  toast(`Saved description for “${title(nodeId)}”`, { action: { label: 'Undo', handler: undo } });
  descDraft.value = '';
}
function addSuggestedEdge(s: Suggestion, candidateId: string) {
  const added = s.dir === 'out' ? addEdge(s.nodeId, candidateId, s.type) : addEdge(candidateId, s.nodeId, s.type);
  if (added) toast(`Linked “${candidateTitle(candidateId)}”`, { action: { label: 'Undo', handler: undo } });
}
function candidateTitle(id: string) {
  return getNode(id)?.title ?? id;
}

function skip() {
  if (current.value) skipped.value = new Set([...skipped.value, current.value.key]);
  cursor.value = 0; // queue recomputes; stay at the front
}
function jumpToNode(nodeId: string) {
  // Only navigate via location.hash — Studio's hashchange listener sets both
  // the view and state.selectedId together. Setting state.selectedId here too
  // would race Studio's [view, selectedId] watcher against the hashchange
  // event and clobber the hash back to the workshop view.
  const part = KIND_MAP[getNode(nodeId)?.kind ?? '']?.part;
  if (part) location.hash = buildHash(part, nodeId);
}
</script>

<template>
  <div class="gap-sprint">
    <div class="mb-4 flex items-center gap-3">
      <h2 class="display text-2xl">Gap-fix sprint</h2>
      <span class="kicker ml-auto text-ink-400" data-testid="gap-progress">{{ position }}</span>
    </div>

    <div v-if="current" class="rounded-xl border hairline bg-ink-900 p-5" data-testid="gap-card">
      <!-- finding card -->
      <template v-if="current.type === 'finding'">
        <p class="text-sm text-ink-100">{{ current.message }}</p>
        <p v-if="current.suggestion" class="mt-1 text-xs text-ink-400">{{ current.suggestion }}</p>
        <div v-if="needsDescription(current)" class="mt-3">
          <textarea v-model="descDraft" rows="3" class="field resize-none text-sm" placeholder="Write the missing description…" data-testid="gap-desc" />
          <button class="btn btn-primary mt-2" data-testid="gap-save-desc" @click="saveDescription(current.nodeId!)">Save description</button>
        </div>
        <button v-if="current.nodeId" class="btn mt-3" data-testid="gap-jump" @click="jumpToNode(current.nodeId)">Jump to node →</button>
      </template>

      <!-- suggestion card -->
      <template v-else>
        <p class="text-sm text-ink-100">
          <span class="font-semibold">{{ title(current.nodeId) }}</span> — {{ current.s.reason }}
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="cand in current.s.candidates"
            :key="cand"
            class="btn"
            data-testid="gap-add-edge"
            @click="addSuggestedEdge(current.s, cand)"
          >
            <span class="font-mono text-[0.62rem] uppercase text-accent">{{ EDGE_TYPE_LABELS[current.s.type] ?? current.s.type }}</span>
            <span class="ml-1">{{ current.s.dir === 'out' ? '→' : '←' }} {{ candidateTitle(cand) }}</span>
          </button>
          <span v-if="!current.s.candidates.length" class="text-xs text-ink-400">No candidate nodes of that kind yet.</span>
        </div>
      </template>

      <div class="mt-5 flex gap-2 border-t hairline pt-3">
        <button class="btn" data-testid="gap-skip" @click="skip">Skip</button>
      </div>
    </div>

    <div v-else class="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-ink-400" data-testid="gap-empty">
      🎉 Nothing left in the queue — the graph looks healthy.
    </div>
  </div>
</template>
