<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import ViaPicker from '@/components/node/ViaPicker.vue';
import { useGraph } from '@/store/graph';
import { PERSP_IDS, perspLabel, perspById, chainText } from '@/perspectives';
import { perspMenuOpen } from '@/store/ui';
import type { PerspId } from '@/types';

const g = useGraph();
const route = useRoute();
const active = computed(() => (route.name === 'traversal' ? g.view.value.persp : null));
const via = ref<{ persp: PerspId; paths: string[][] } | null>(null);

function choose(p: PerspId) {
  perspMenuOpen.value = false;
  if (route.name !== 'traversal') return g.go(p, []);
  if (p === active.value) return;
  const sel = g.selection.value;
  if (sel && p !== 'raw') {
    const paths = g.pathsFor(p, sel.id);
    if (paths.length > 1 && !g.hasVia(p, sel.id)) { via.value = { persp: p, paths }; return; }
  }
  g.switchPersp(p);
}
function pick(path: string[]) { const v = via.value; via.value = null; if (v) g.switchPersp(v.persp, path); }
const tip = (p: PerspId) => (p === 'raw' ? 'No chain: every neighbour, grouped by edge' : chainText(perspById[p]));
</script>

<template>
  <Popover :open="!!via || perspMenuOpen" @update:open="(o: boolean) => { if (!o) { via = null; perspMenuOpen = false; } }">
    <PopoverAnchor as-child>
      <nav class="flex items-center gap-0.5 rounded-md bg-muted/70 p-0.5" aria-label="Perspectives">
        <button
          v-for="(p, i) in PERSP_IDS" :key="p" :title="`${tip(p)}  (${i + 1})`"
          class="relative rounded px-2 py-0.5 text-[12px] transition-colors"
          :class="active === p ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="choose(p)"
        >{{ perspLabel(p) }}<span v-if="active === p" class="absolute -bottom-px left-1/2 size-1 -translate-x-1/2 rounded-full bg-foreground" /></button>
      </nav>
    </PopoverAnchor>
    <PopoverContent align="start" class="w-auto p-1.5">
      <ViaPicker v-if="via" :paths="via.paths" :title="`${perspLabel(via.persp)}: several ways in. Reach it via…`" @pick="pick" />
      <div v-else class="w-[300px]">
        <div class="px-2 pb-1 pt-1 text-[11px] text-muted-foreground">Switch perspective, keep the node</div>
        <button v-for="(p, i) in PERSP_IDS" :key="p" class="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-accent" @click="choose(p)">
          <kbd class="font-mono text-[10px] text-muted-foreground">{{ i + 1 }}</kbd>
          <span class="text-[12px] font-medium">{{ perspLabel(p) }}</span>
          <span class="truncate text-[11px] text-muted-foreground">{{ tip(p) }}</span>
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
