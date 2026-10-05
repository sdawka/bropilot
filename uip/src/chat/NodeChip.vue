<script setup lang="ts">
// Every noun the chat cites. Hover highlights the node in the traversal view; click focuses it
// (the crumb is tagged `via chat` by WP1's focus handler).
import { computed } from 'vue';
import { ontology } from '../s1/ontologyData';
import { useGraphApi } from './graphApi';

const props = defineProps<{ id: string; showKind?: boolean; label?: string }>();
const g = useGraphApi();
const node = computed(() => g.byId(props.id));
const kind = computed(() => ontology.KINDS.find((k) => k.id === node.value?.kind));
const hue = computed(() => {
  const s = ontology.SPACES.find((x) => x.id === kind.value?.space);
  return s ? `var(--space-${s.id})` : undefined;
});
</script>
<template>
  <button type="button"
          class="inline-flex max-w-full items-center gap-1 rounded border border-border bg-background px-1 py-px align-baseline text-[0.85em] leading-tight hover:bg-accent"
          :class="node?.status === 'draft' && 'border-l-2 border-l-draft'"
          :style="hue ? { '--hue': hue } : undefined"
          :title="node ? `${node.title} · ${kind?.label ?? node.kind}` : id"
          @mouseenter="g.dispatch({ verb: 'highlight', ids: [id] })" @mouseleave="g.dispatch({ verb: 'highlight', ids: [] })"
          @focus="g.dispatch({ verb: 'highlight', ids: [id] })" @blur="g.dispatch({ verb: 'highlight', ids: [] })"
          @click.stop="g.dispatch({ verb: 'focus', id })">
    <span class="shrink-0 text-[0.9em]">{{ kind?.icon ?? '•' }}</span>
    <span class="truncate">{{ label ?? node?.title ?? id }}</span>
    <span v-if="showKind && kind" class="shrink-0 text-muted-foreground">· {{ kind.label }}</span>
  </button>
</template>
