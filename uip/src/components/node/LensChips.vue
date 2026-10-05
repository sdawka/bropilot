<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Node } from '@/types';
import { useGraph, type LensChip } from '@/store/graph';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import ViaPicker from './ViaPicker.vue';
import { viaToken } from '@/store/traverse';

const props = defineProps<{ node: Node }>();
const g = useGraph();
const chips = computed(() => g.lensChips(props.node.id));
const openFor = ref<string | null>(null);
function go(c: LensChip, path?: string[]) {
  openFor.value = null;
  const p = path ?? c.paths[0];
  if (c.bridge) { g.go(c.persp, [...p, viaToken({ edge: c.bridge.edge, dir: c.bridge.dir }), props.node.id]); return; }
  if (path && path.length > 1) g.rememberVia(c.persp, props.node.id, path[path.length - 2]);
  g.go(c.persp, p);
}
</script>
<template>
  <div class="flex flex-wrap gap-1">
    <template v-for="c in chips" :key="c.persp">
      <Popover v-if="c.paths.length > 1 && !c.bridge" :open="openFor === c.persp" @update:open="(o: boolean) => (openFor = o ? c.persp : null)">
        <PopoverTrigger as-child>
          <button class="rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent">⇄ {{ c.label }} <span class="text-muted-foreground">via {{ c.paths.length }} paths ▾</span></button>
        </PopoverTrigger>
        <PopoverContent class="w-auto p-1.5" align="start"><ViaPicker :paths="c.paths" @pick="(p) => go(c, p)" /></PopoverContent>
      </Popover>
      <button v-else class="max-w-[260px] truncate rounded-full border px-2 py-0.5 text-[11px] hover:bg-accent" @click="go(c)">
        ⇄ {{ c.label }} <span v-if="c.via" class="text-muted-foreground">via {{ c.via }}</span>
      </button>
    </template>
    <span v-if="!chips.length" class="text-[11px] text-muted-foreground">Only on this perspective.</span>
  </div>
</template>
