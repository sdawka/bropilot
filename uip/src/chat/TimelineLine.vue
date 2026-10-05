<script setup lang="ts">
// One timeline entry as a single line, or broken out (open changeset, red test) as a card.
import { computed } from 'vue';
import type { TimelineEntry } from '../types';
import { useGraphApi } from './graphApi';
import Avatar from './Avatar.vue';
import NodeChip from './NodeChip.vue';
import ChangesetCard from '../agents/ChangesetCard.vue';

const props = defineProps<{ entry: TimelineEntry; full?: boolean }>();
const g = useGraphApi();
const e = computed(() => props.entry);
const verifies = computed(() => (e.value.type === 'test' ? g.neighbours(e.value.testId).filter((x) => x.edge.type === 'verifies' && x.dir === 'out').map((x) => x.other.id) : []));
const time = computed(() => { const d = new Date(e.value.at); return isNaN(+d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); });
</script>

<template>
  <div v-if="full && e.type === 'changeset'" class="space-y-1">
    <ChangesetCard :changeset="e.changeset" />
  </div>
  <div v-else-if="full && e.type === 'test' && !e.ok" class="rounded-md border border-destructive/40 bg-card p-2 text-xs">
    <div class="flex items-center gap-1.5"><Avatar :author="e.author" /><span class="font-medium">{{ e.author.name }}</span>
      <span class="text-destructive">✗ test failed</span><span class="ml-auto text-muted-foreground">{{ time }}</span></div>
    <div class="mt-1"><NodeChip :id="e.testId" :label="e.title" /></div>
    <div v-if="verifies.length" class="mt-1 text-muted-foreground">verifies <NodeChip v-for="id in verifies" :key="id" :id="id" /></div>
  </div>
  <div v-else class="flex min-w-0 items-start gap-1.5 text-xs" :title="time">
    <Avatar :author="e.author" class="mt-px" />
    <span class="shrink-0 font-medium">{{ e.author.name }}</span>
    <span class="min-w-0 flex-1 text-muted-foreground">
      <template v-if="e.type === 'commit'">{{ e.summary }} <span class="text-foreground/70">{{ e.effects.join(' · ') }}</span></template>
      <template v-else-if="e.type === 'test'"><span :class="e.ok ? 'text-draft' : 'text-destructive'">{{ e.ok ? '✓' : '✗' }}</span> <NodeChip :id="e.testId" :label="e.title" /></template>
      <template v-else-if="e.type === 'task'">task <NodeChip :id="e.taskId" /> → {{ e.status }}</template>
      <template v-else-if="e.type === 'changeset'">changeset #{{ e.changeset.number }} “{{ e.changeset.title }}” · {{ e.changeset.effects.length }} effects
        <span class="rounded bg-muted px-1" :class="e.changeset.status === 'open' && 'bg-gap/15 text-gap'">{{ e.changeset.status === 'open' ? '⚑ needs you' : e.changeset.status }}</span></template>
      <template v-else-if="e.type === 'message'">{{ e.text }}
        <template v-if="e.author.kind === 's1' && e.nodeRefs?.length"> <NodeChip v-for="id in e.nodeRefs.slice(0, 3)" :key="id" :id="id" /></template></template>
    </span>
  </div>
</template>
