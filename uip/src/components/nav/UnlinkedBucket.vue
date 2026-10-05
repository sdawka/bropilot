<script setup lang="ts">
import { ref } from 'vue';
import type { Node } from '@/types';
import { useGraph } from '@/store/graph';
import { kindIcon, kindLabel } from '@/ontology';
const props = defineProps<{ nodes: Node[]; kinds: string[]; parentKind?: string }>();
const g = useGraph();
const open = ref(false);
function ask(n: Node) {
  const pk = props.parentKind ? kindLabel(props.parentKind).toLowerCase() : 'parent';
  g.openGap(props.parentKind ?? n.kind, null, `"${n.title}" is unlinked here. Which ${pk} does it belong to?`);
}
</script>
<template>
  <div class="text-[12px]">
    <button class="flex w-full items-center gap-2 rounded px-2.5 py-1 text-left text-muted-foreground hover:text-foreground" @click="open = !open">
      <span class="text-gap">┄</span> Unlinked {{ kinds.map((k) => kindLabel(k, 2).toLowerCase()).join(' · ') }} ({{ nodes.length }})
      <span class="ml-auto text-[10px]">{{ open ? '▾' : '▸' }}</span>
    </button>
    <div v-if="open" class="space-y-px pl-3">
      <button v-for="n in nodes" :key="n.id" class="flex w-full items-center gap-2 rounded px-2 py-0.5 text-left text-muted-foreground hover:bg-accent hover:text-foreground" @click="ask(n)">
        <span class="text-[11px]">{{ kindIcon(n.kind) }}</span><span class="truncate">{{ n.title }}</span>
      </button>
    </div>
  </div>
</template>
