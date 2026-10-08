<script setup lang="ts">
// The thread: (agents=inline, project thread) folded fixture timeline, "you are here", then the
// session's messages interleaved with new timeline entries by time.
import { computed, nextTick, ref, watch } from 'vue';
import type { TimelineEntry } from '../types';
import { flags } from '../flags';
import { useChat, type ChatMsg } from './store';
import { useTimeline } from '../agents/timeline';
import AgentFold from './AgentFold.vue';
import TimelineLine from './TimelineLine.vue';
import HumanEntry from './HumanEntry.vue';
import ReplyEntry from './ReplyEntry.vue';
import QuestionStub from './QuestionStub.vue';

const props = defineProps<{ onlySince?: string; hideTimeline?: boolean }>();
const chat = useChat();
const tl = useTimeline();
const root = ref<HTMLElement | null>(null);

const inlineAgents = computed(() => !props.hideTimeline && flags.agents === 'inline' && chat.threadId === 'project');
const fixture = computed(() => (inlineAgents.value ? tl.entries.slice(0, tl.fixtureCount) : []));
const staged = computed(() => new Set(chat.msgs.map((m) => m.changesetId).filter(Boolean)));
type Row = { t: 'msg'; m: ChatMsg; at: string } | { t: 'tl'; e: TimelineEntry; at: string };
const rows = computed<Row[]>(() => {
  const ms: Row[] = chat.thread.filter((m) => !props.onlySince || m.at >= props.onlySince).map((m) => ({ t: 'msg', m, at: m.at }));
  const later: Row[] = inlineAgents.value
    ? tl.entries.slice(tl.fixtureCount).filter((e) => !(e.type === 'changeset' && staged.value.has(e.changeset.id))).map((e) => ({ t: 'tl', e, at: e.at }))
    : [];
  return [...ms, ...later].sort((a, b) => a.at.localeCompare(b.at));
});
watch(() => rows.value.length, () => nextTick(() => { if (root.value) root.value.scrollTop = root.value.scrollHeight; }));
</script>

<template>
  <div ref="root" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
    <template v-if="fixture.length">
      <AgentFold :entries="fixture" :selected="chat.selection?.id" />
      <div class="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span class="h-px flex-1 bg-border" />you are here<span class="h-px flex-1 bg-border" />
      </div>
    </template>
    <div v-if="!rows.length && !onlySince" class="text-xs text-muted-foreground">
      Try: <em>“what tests this?”</em> · <em>“show me the reviewer agent”</em> · <em>“add an outcome for churn”</em> · <em>“why does talk exist”</em>
    </div>
    <template v-for="row in rows" :key="row.t === 'msg' ? row.m.id : row.e.id">
      <template v-if="row.t === 'msg'">
        <HumanEntry v-if="row.m.kind === 'human'" :msg="row.m" />
        <ReplyEntry v-else-if="row.m.kind === 'reply' && row.m.resolution" :msg="row.m" />
        <QuestionStub v-else-if="row.m.kind === 'stub'" :msg="row.m" />
      </template>
      <TimelineLine v-else :entry="row.e" full />
    </template>
    <div v-if="chat.busy" class="text-xs text-muted-foreground">◆ reading…</div>
  </div>
</template>
