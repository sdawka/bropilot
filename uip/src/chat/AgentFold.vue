<script setup lang="ts">
// Fold rule (SPEC §4): one line per agent per burst. Break out only changesets awaiting you, red
// tests, and entries that mention the selected node.
import { computed, ref } from 'vue';
import type { TimelineEntry } from '../types';
import TimelineLine from './TimelineLine.vue';
import Avatar from './Avatar.vue';

const props = defineProps<{ entries: TimelineEntry[]; selected?: string | null }>();
const expanded = ref(new Set<string>());

const breaksOut = (e: TimelineEntry) =>
  (e.type === 'changeset' && e.changeset.status === 'open') || (e.type === 'test' && !e.ok) ||
  (!!props.selected && !!e.nodeRefs?.includes(props.selected));
type Item = { kind: 'one'; e: TimelineEntry; full: boolean } | { kind: 'burst'; key: string; es: TimelineEntry[] };
const items = computed<Item[]>(() => {
  const out: Item[] = [];
  for (const e of props.entries) {
    if (breaksOut(e)) { out.push({ kind: 'one', e, full: true }); continue; }
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'burst' && prev.es[0].author.id === e.author.id) prev.es.push(e);
    else if (prev && prev.kind === 'one' && !prev.full && prev.e.author.id === e.author.id && e.author.kind === 'agent') out[out.length - 1] = { kind: 'burst', key: prev.e.id, es: [prev.e, e] };
    else out.push({ kind: 'one', e, full: false });
  }
  return out;
});
function summary(es: TimelineEntry[]): string {
  const commits = es.filter((e) => e.type === 'commit');
  const fx = commits.reduce((a, e) => a + (e.type === 'commit' ? e.effects.length : 0), 0);
  const tests = es.filter((e) => e.type === 'test');
  const parts = [commits.length && `committed ${commits.length} changes · ${fx} effects`, tests.length && `ran ${tests.length} tests`,
    es.length - commits.length - tests.length > 0 && `${es.length - commits.length - tests.length} updates`].filter(Boolean);
  return parts.join(' · ');
}
function toggle(k: string) { const s = new Set(expanded.value); s.has(k) ? s.delete(k) : s.add(k); expanded.value = s; }
</script>
<template>
  <div class="space-y-1.5">
    <template v-for="it in items" :key="it.kind === 'one' ? it.e.id : it.key">
      <TimelineLine v-if="it.kind === 'one'" :entry="it.e" :full="it.full" />
      <div v-else>
        <button type="button" class="flex w-full min-w-0 items-center gap-1.5 text-left text-xs hover:bg-accent/50" @click="toggle(it.key)">
          <Avatar :author="it.es[0].author" /><span class="font-medium">{{ it.es[0].author.name }}</span>
          <span class="truncate text-muted-foreground">{{ summary(it.es) }}</span>
          <span class="ml-auto text-muted-foreground">{{ expanded.has(it.key) ? '▾' : '▸' }}</span>
        </button>
        <div v-if="expanded.has(it.key)" class="ml-5 mt-1 space-y-1 border-l border-border pl-2">
          <TimelineLine v-for="e in it.es" :key="e.id" :entry="e" />
        </div>
      </div>
    </template>
  </div>
</template>
