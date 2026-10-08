<script setup lang="ts">
import { computed } from 'vue';
import type { Column } from '@/store/graph';
import { useGraph } from '@/store/graph';
import { flags } from '@/flags';
import ColumnHeader from './ColumnHeader.vue';
import NodeRow from './NodeRow.vue';
import GapSlot from './GapSlot.vue';
import UnlinkedBucket from './UnlinkedBucket.vue';

const props = defineProps<{ col: Column; active?: boolean; width?: number }>();
const emit = defineEmits<{ select: [id: string] }>();
const g = useGraph();
const groups = computed(() => {
  if (!props.col.grouped) return [{ label: '', items: props.col.items }];
  const m = new Map<string, typeof props.col.items>();
  for (const it of props.col.items) { const k = it.group ?? ''; (m.get(k) ?? m.set(k, []).get(k)!).push(it); }
  return [...m].map(([label, items]) => ({ label, items }));
});
const parentKind = computed(() => (props.col.parentId ? g.byId(props.col.parentId)?.kind : undefined));
const mixed = computed(() => new Set(props.col.items.map((i) => i.node.kind)).size > 1 && !props.col.grouped);
</script>

<template>
  <section
    class="col-slide flex h-full shrink-0 flex-col border-r"
    :class="active ? 'bg-card' : 'bg-background'"
    :style="{ width: (width ?? 248) + 'px' }"
    :data-col="col.index"
  >
    <ColumnHeader :col="col" />
    <div class="scroll-thin min-h-0 flex-1 space-y-px overflow-y-auto px-1.5 py-1.5" role="listbox">
      <div v-if="col.derived?.pending" class="px-2 py-3 text-[12px] text-muted-foreground">System One is picking the next hop…</div>
      <template v-for="grp in groups" :key="grp.label">
        <div v-if="grp.label" class="px-2 pb-0.5 pt-2 font-mono text-[10px] text-muted-foreground">{{ grp.label }} <span class="tabular-nums">{{ grp.items.length }}</span></div>
        <NodeRow
          v-for="it in grp.items" :key="(it.edge?.id ?? '') + it.node.id" :item="it"
          :selected="it.node.id === col.selectedId" :show-kind="mixed" @select="emit('select', it.node.id)"
        />
      </template>
      <div v-if="!col.items.length && !col.gaps.length && !col.derived?.pending" class="px-2 py-3 text-[12px] text-muted-foreground">
        {{ g.currentQuery.value ? `No match for “${g.currentQuery.value}”` : 'Nothing linked here yet.' }}
      </div>
      <template v-if="flags.gaps === 'inline'">
        <div v-if="col.gaps.length" class="space-y-1 pt-1.5"><GapSlot v-for="s in col.gaps" :key="s.question" :slot="s" /></div>
        <UnlinkedBucket v-if="col.unlinked.length" class="pt-1.5" :nodes="col.unlinked" :kinds="col.kinds" :parent-kind="parentKind" />
      </template>
    </div>
  </section>
  <aside v-if="flags.gaps === 'lane' && (col.gaps.length || col.unlinked.length)" class="flex h-full w-[160px] shrink-0 flex-col border-r bg-muted/30">
    <div class="border-b px-2 pb-1.5 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">gaps · {{ col.gaps.length + (col.unlinked.length ? 1 : 0) }}</div>
    <div class="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
      <GapSlot v-for="s in col.gaps" :key="s.question" :slot="s" dense />
      <UnlinkedBucket v-if="col.unlinked.length" :nodes="col.unlinked" :kinds="col.kinds" :parent-kind="parentKind" />
    </div>
  </aside>
</template>
