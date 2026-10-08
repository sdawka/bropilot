<script setup lang="ts">
import { computed } from 'vue';
import { Pin, PinOff, Loader2 } from 'lucide-vue-next';
import type { Column } from '@/store/graph';
import { useGraph } from '@/store/graph';
import { kindLabel, edgeLabel } from '@/ontology';
import CheckBadge from '@/components/checks/CheckBadge.vue';

const props = defineProps<{ col: Column }>();
const g = useGraph();
const parent = computed(() => (props.col.parentId ? g.byId(props.col.parentId) : null));
const verb = computed(() => props.col.edges.map((e) => (e.dir === 'out' ? `─${edgeLabel(e.edge)}→` : `←${edgeLabel(e.edge)}─`)).filter((v, i, a) => a.indexOf(v) === i).join(' '));
const kinds = computed(() => {
  const ks = props.col.kinds.length ? props.col.kinds : [...new Set(props.col.items.map((i) => i.node.kind))];
  return ks.map((k) => kindLabel(k)).join('·');
});
const title = computed(() => {
  const c = props.col;
  if (c.kind === 'root' && !c.kinds.length) return 'All nodes';
  return kinds.value || '—';
});
const dots = (c: number) => (c >= 0.75 ? '●●●' : c >= 0.5 ? '●●○' : '●○○');
const stepName = computed(() => {
  const p = g.persp.value; const c = props.col;
  if (!p || c.stepIndex < 0) return null;
  return `${p.label} ${c.stepIndex + 1}/${p.steps.length}`;
});
function togglePin() {
  const d = props.col.derived; const par = parent.value;
  if (!d?.hop || !par) return;
  d.pinned ? g.unpinHop(par.kind) : g.pinHop(par.kind, d.hop);
}
</script>

<template>
  <div class="sticky top-0 z-10 border-b bg-background/95 px-3 pb-1.5 pt-2 backdrop-blur" :class="col.derived && !col.derived.pinned ? 'border-dashed' : ''">
    <div class="flex items-baseline gap-1.5">
      <span v-if="verb" class="font-mono text-[11px] text-muted-foreground" :class="col.derived && !col.derived.pinned ? 'underline decoration-dotted underline-offset-2' : ''">{{ verb }}</span>
      <span class="truncate text-[13px] font-semibold tracking-tight">{{ title }}</span>
      <span class="text-[12px] tabular-nums text-muted-foreground">{{ col.items.length }}</span>
      <span class="flex-1" />
      <CheckBadge :col="col" />
      <template v-if="col.derived">
        <Loader2 v-if="col.derived.pending" class="size-3 animate-spin text-muted-foreground" />
        <span v-else-if="col.derived.confidence != null" class="text-[10px] tracking-[-1px] text-muted-foreground" :title="`System One picked this hop · ${(col.derived.confidence * 100).toFixed(0)}%${col.derived.fake ? ' · offline' : ''}`">{{ dots(col.derived.confidence) }}</span>
        <button v-if="col.derived.hop" class="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" :title="col.derived.pinned ? 'Unpin this hop' : 'Pin this hop'" @click="togglePin">
          <PinOff v-if="col.derived.pinned" class="size-3" /><Pin v-else class="size-3" />
        </button>
      </template>
    </div>
    <div class="mt-0.5 flex gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      <span v-if="col.kind === 'floating'" class="text-gap">not on this chain</span>
      <span v-else-if="col.kind === 'across'">across</span>
      <span v-else-if="col.kind === 'raw'">all neighbours</span>
      <span v-else-if="col.kind === 'derived'">{{ col.derived?.pinned ? 'pinned hop' : 'System One hop' }}</span>
      <span v-else-if="stepName">{{ stepName }}<template v-if="col.waypoint"> · waypoint</template></span>
      <span v-if="parent" class="truncate normal-case tracking-normal">of {{ parent.title }}</span>
    </div>
  </div>
</template>
