<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { PARTS, KIND_MAP, nodeHue, type GraphNode } from '../../lib/schema';
import { state } from '../../lib/store';

const emit = defineEmits<{ (e: 'pick', node: GraphNode): void; (e: 'close'): void }>();

const query = ref('');
const hi = ref(0);
const input = ref<HTMLInputElement | null>(null);

interface Group {
  part: string;
  label: string;
  nodes: GraphNode[];
}

const groups = computed<Group[]>(() => {
  const q = query.value.trim().toLowerCase();
  const matches = q
    ? state.graph.nodes.filter((n) => {
        const kind = KIND_MAP[n.kind]?.label ?? n.kind;
        return (
          n.title.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          kind.toLowerCase().includes(q)
        );
      })
    : state.graph.nodes;
  const capped = matches.slice(0, 50);
  return PARTS.map((p) => ({
    part: p.id,
    label: p.label,
    nodes: capped.filter((n) => KIND_MAP[n.kind]?.part === p.id),
  })).filter((g) => g.nodes.length);
});

// flat list for keyboard navigation across group boundaries
const flat = computed(() => groups.value.flatMap((g) => g.nodes));

watch(flat, () => {
  if (hi.value >= flat.value.length) hi.value = Math.max(0, flat.value.length - 1);
});

function flatIndex(node: GraphNode) {
  return flat.value.indexOf(node);
}

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    hi.value = Math.min(hi.value + 1, flat.value.length - 1);
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    hi.value = Math.max(hi.value - 1, 0);
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const node = flat.value[hi.value];
    if (node) emit('pick', node);
  } else if (ev.key === 'Escape') {
    ev.preventDefault();
    emit('close');
  }
}

onMounted(() => input.value?.focus());
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex justify-center bg-black/60 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="animate-fade-up mt-[15vh] h-fit w-full max-w-lg overflow-hidden rounded-2xl glass-strong shadow-2xl">
      <input
        ref="input"
        v-model="query"
        class="w-full border-b hairline bg-transparent px-5 py-3.5 text-sm text-ink-100 outline-none placeholder:text-ink-400"
        placeholder="Search nodes by title, description or kind…"
        @keydown="onKey"
      />
      <div class="max-h-[50vh] overflow-y-auto p-2">
        <template v-for="g in groups" :key="g.part">
          <div class="label px-3 pb-1 pt-2">{{ g.label }}</div>
          <button
            v-for="n in g.nodes"
            :key="n.id"
            class="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm transition"
            :class="flatIndex(n) === hi ? 'bg-white/[0.08] text-ink-100' : 'text-ink-300 hover:bg-white/[0.05]'"
            @click="emit('pick', n)"
            @pointerenter="hi = flatIndex(n)"
          >
            <span>{{ KIND_MAP[n.kind]?.icon }}</span>
            <span class="truncate">{{ n.title || 'Untitled' }}</span>
            <span class="ml-auto shrink-0 text-[0.68rem] text-ink-400">{{ KIND_MAP[n.kind]?.label }}</span>
            <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: nodeHue(n) }" />
          </button>
        </template>
        <p v-if="!flat.length" class="px-3 py-6 text-center text-sm text-ink-400">No matching nodes.</p>
      </div>
    </div>
  </div>
</template>
