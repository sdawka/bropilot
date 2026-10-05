<script setup lang="ts">
// Ask band: one question with a node picker pre-filtered to the guessed kind.
import { computed, ref } from 'vue';
import { useGraphApi } from './graphApi';
import { ontology } from '../s1/ontologyData';
const props = defineProps<{ kind: string | null; question: string }>();
const emit = defineEmits<{ pick: [id: string, label: string] }>();
const g = useGraphApi();
const q = ref('');
const kindOnly = ref(!!props.kind);
const icon = (k: string) => ontology.KINDS.find((x) => x.id === k)?.icon ?? '•';
const rows = computed(() => g.graph.value.nodes
  .filter((n) => (!kindOnly.value || n.kind === props.kind) && n.title.toLowerCase().includes(q.value.toLowerCase())).slice(0, 8));
</script>
<template>
  <div class="rounded-md border border-border bg-card p-2 text-sm">
    <div class="text-xs">{{ question }}</div>
    <div class="mt-1 flex items-center gap-1">
      <input v-model="q" class="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs" placeholder="filter…"
             @keydown.enter.prevent="rows[0] && emit('pick', rows[0].id, rows[0].title)" />
      <label v-if="kind" class="flex items-center gap-1 text-[11px] text-muted-foreground"><input v-model="kindOnly" type="checkbox" /> {{ kind }} only</label>
    </div>
    <ul class="mt-1">
      <li v-for="n in rows" :key="n.id">
        <button type="button" class="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-accent" @click="emit('pick', n.id, n.title)">
          <span>{{ icon(n.kind) }}</span><span class="truncate">{{ n.title }}</span><span class="ml-auto text-muted-foreground">{{ n.kind }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
