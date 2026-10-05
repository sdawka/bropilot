<script setup lang="ts">
// Navigate reply: target chip + the trail with edge verbs + "show as filter".
import { computed } from 'vue';
import type { TurnResolution } from '../types';
import { useGraphApi } from './graphApi';
import NodeChip from './NodeChip.vue';

const props = defineProps<{ resolution: TurnResolution; moved?: boolean; preview?: boolean }>();
const emit = defineEmits<{ go: [] }>();
const g = useGraphApi();
const path = computed(() => props.resolution.target?.path ?? []);
const verbs = computed(() => path.value.slice(1).map((id, i) => {
  const prev = path.value[i];
  const hit = g.neighbours(prev).find((x) => x.other.id === id);
  return hit ? (hit.dir === 'out' ? `─${hit.edge.type}→` : `←${hit.edge.type}─`) : '›';
}));
const target = computed(() => path.value.at(-1));
</script>
<template>
  <div class="rounded-md border border-border bg-card p-2 text-sm">
    <template v-if="target">
      <div class="flex items-center gap-1.5">
        <span class="text-muted-foreground">↳</span><NodeChip :id="target" show-kind />
        <span v-if="moved" class="ml-auto text-[11px] text-muted-foreground">moved</span>
        <span v-else-if="preview" class="ml-auto text-[11px] text-muted-foreground">preview · Enter to go</span>
        <button v-else type="button" class="ml-auto rounded border border-border px-1.5 text-xs hover:bg-accent" @click="emit('go')">go</button>
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <span>Trail ({{ resolution.target!.persp }}):</span>
        <template v-for="(id, i) in path" :key="id + i">
          <span v-if="i" class="font-mono">{{ verbs[i - 1] }}</span>
          <NodeChip :id="id" />
        </template>
      </div>
      <button type="button" class="mt-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline" @click="g.dispatch({ verb: 'filter', ids: path })">show as filter</button>
    </template>
    <template v-else-if="resolution.nodeSet?.length">
      <div class="text-xs">{{ resolution.nodeSet.length }} matches <span v-if="moved" class="text-muted-foreground">· filtered</span></div>
      <div class="mt-1 flex flex-wrap gap-1"><NodeChip v-for="id in resolution.nodeSet.slice(0, 7)" :key="id" :id="id" /></div>
      <button v-if="!moved" type="button" class="mt-1 text-[11px] text-muted-foreground hover:underline" @click="g.dispatch({ verb: 'filter', ids: resolution.nodeSet! })">show as filter</button>
    </template>
  </div>
</template>
