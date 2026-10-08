<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useGraph } from '@/store/graph';
import { flags } from '@/flags';
import Column from './Column.vue';
import WaypointStrip from './WaypointStrip.vue';

const props = defineProps<{ active: number }>();
const emit = defineEmits<{ 'update:active': [n: number] }>();
const g = useGraph();
const scroller = ref<HTMLElement | null>(null);
function pick(col: number, id: string) { emit('update:active', col); g.select(col, id); }
watch(() => g.columns.value.length, async () => {
  await nextTick();
  const el = scroller.value; if (el) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
});
</script>
<template>
  <div ref="scroller" class="scroll-thin flex h-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
    <template v-for="col in g.columns.value" :key="`${col.index}:${col.parentId ?? 'root'}`">
      <WaypointStrip v-if="col.waypoint && flags.waypoints === 'collapse'" :col="col" @select="(id) => pick(col.index, id)" />
      <Column v-else :col="col" :active="col.index === props.active" @select="(id) => pick(col.index, id)" />
    </template>
    <div class="flex min-w-8 flex-1 items-start p-6 text-[12px] text-muted-foreground/80">
      <span v-if="g.columns.value.length <= 2 && !g.columns.value[g.columns.value.length - 1].selectedId && g.columns.value[g.columns.value.length - 1].items.length">
        ← pick a row · ↑↓ rows · → open · Backspace up · L perspective · / filter
      </span>
    </div>
  </div>
</template>
