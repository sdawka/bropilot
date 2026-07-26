<script setup lang="ts">
import { ref, computed } from 'vue';
import Modal from '../ui/Modal.vue';
import { KIND_MAP, PARTS, EDGE_TYPE_LABELS } from '../../lib/schema';
import { applyChangeset, type Changeset } from '../../lib/changeset';

const props = defineProps<{ changeset: Changeset }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'applied', summary: { addedNodes: number; updatedNodes: number; addedEdges: number; skippedEdges: number }): void;
}>();

// every item checked by default
const selected = ref<Set<string>>(
  new Set([...props.changeset.nodes.map((n) => n.id), ...props.changeset.edges.map((e) => e.id)]),
);
function toggle(id: string) {
  const next = new Set(selected.value);
  next.has(id) ? next.delete(id) : next.add(id);
  selected.value = next;
}

// nodes grouped by part; unknown kinds fall into an "Other" bucket
const groups = computed(() => {
  const out: { key: string; label: string; nodes: typeof props.changeset.nodes }[] = [];
  for (const p of PARTS) {
    const nodes = props.changeset.nodes.filter((n) => KIND_MAP[n.kind]?.part === p.id);
    if (nodes.length) out.push({ key: p.id, label: p.label, nodes });
  }
  const other = props.changeset.nodes.filter((n) => !KIND_MAP[n.kind]);
  if (other.length) out.push({ key: 'other', label: 'Unknown kinds', nodes: other });
  return out;
});

const applyCount = computed(() => selected.value.size);

function label(id: string) {
  return props.changeset.nodes.find((n) => n.id === id)?.title ?? id;
}
function edgeText(e: (typeof props.changeset.edges)[number]) {
  return `${label(e.srcId)} · ${EDGE_TYPE_LABELS[e.type] ?? e.type} → ${label(e.dstId)}`;
}

function apply() {
  const summary = applyChangeset(props.changeset, selected.value);
  emit('applied', summary);
}
</script>

<template>
  <Modal title="Review changes" @close="emit('close')">
    <div class="merge-review space-y-4">
      <div
        v-if="changeset.warnings.length"
        class="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300/90"
      >
        <div class="mb-1 font-semibold">⚠ {{ changeset.warnings.length }} warning(s) — you can still apply</div>
        <ul class="list-disc space-y-0.5 pl-4">
          <li v-for="(w, i) in changeset.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <p v-if="!changeset.nodes.length && !changeset.edges.length" class="text-sm text-ink-400">
        Nothing to review — no new nodes or edges were found.
      </p>

      <section v-for="g in groups" :key="g.key">
        <h3 class="label mb-2">{{ g.label }}</h3>
        <ul class="space-y-1">
          <li v-for="n in g.nodes" :key="n.id">
            <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white/[0.04]">
              <input type="checkbox" :checked="selected.has(n.id)" @change="toggle(n.id)" />
              <span class="font-mono text-[0.6rem] uppercase tracking-wide" :class="n.op === 'add' ? 'text-emerald-400/80' : 'text-sky-400/80'">
                {{ n.op }}
              </span>
              <span>{{ KIND_MAP[n.kind]?.icon ?? '•' }} {{ n.title }}</span>
              <span class="ml-auto text-[0.6rem] text-ink-400">{{ n.kind }}</span>
            </label>
          </li>
        </ul>
      </section>

      <section v-if="changeset.edges.length">
        <h3 class="label mb-2">Edges</h3>
        <ul class="space-y-1">
          <li v-for="e in changeset.edges" :key="e.id">
            <label class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-white/[0.04]">
              <input type="checkbox" :checked="selected.has(e.id)" @change="toggle(e.id)" />
              <span class="truncate">{{ edgeText(e) }}</span>
            </label>
          </li>
        </ul>
      </section>

      <div class="flex justify-end gap-2 border-t hairline pt-3">
        <button class="btn" @click="emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="!applyCount" @click="apply">Apply {{ applyCount }} change{{ applyCount === 1 ? '' : 's' }}</button>
      </div>
    </div>
  </Modal>
</template>
