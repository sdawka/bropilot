<script setup lang="ts">
// A gap clicked anywhere opens this, prefilled from the kind's `needs[].ask`. The answer stages a
// changeset (one node per line + the needs edge), which waits for Accept like any proposal.
import { ref } from 'vue';
import type { ChatMsg } from './store';
import { useChat } from './store';
import { useTimeline } from '../agents/timeline';
import NodeChip from './NodeChip.vue';
import ChangesetCard from '../agents/ChangesetCard.vue';
const props = defineProps<{ msg: ChatMsg }>();
const chat = useChat();
const tl = useTimeline();
const answer = ref('');
</script>
<template>
  <div class="rounded-md border border-dashed border-gap/70 bg-card p-2 text-sm">
    <div class="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span class="text-gap">┄</span> gap · {{ msg.gap!.kind }}<template v-if="msg.gap!.parentId"> for <NodeChip :id="msg.gap!.parentId" /></template>
    </div>
    <div class="mt-1">{{ msg.gap!.question }}</div>
    <template v-if="!msg.answered">
      <textarea v-model="answer" rows="2" class="mt-1 w-full resize-none rounded border border-border bg-background px-1.5 py-1 text-xs" placeholder="one per line"
                @keydown.enter.exact.prevent="chat.answerStub(props.msg, answer)" />
      <div class="mt-1 flex gap-1.5 text-xs">
        <button type="button" class="rounded bg-primary px-2 py-0.5 text-primary-foreground disabled:opacity-50" :disabled="!answer.trim()" @click="chat.answerStub(props.msg, answer)">answer</button>
        <button type="button" class="rounded px-2 py-0.5 text-muted-foreground hover:bg-accent" @click="props.msg.answered = true">skip</button>
      </div>
    </template>
    <ChangesetCard v-else-if="msg.changesetId && tl.byId(msg.changesetId)" class="mt-1.5" :changeset="tl.byId(msg.changesetId)!" />
    <div v-else class="mt-1 text-xs text-muted-foreground">skipped</div>
  </div>
</template>
