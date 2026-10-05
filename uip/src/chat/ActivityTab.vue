<script setup lang="ts">
// agents=tab: the agent timeline lives here instead of interleaved in the thread.
import { computed } from 'vue';
import { useTimeline } from '../agents/timeline';
import { useChat } from './store';
import AgentFold from './AgentFold.vue';
const tl = useTimeline();
const chat = useChat();
const entries = computed(() => tl.entries);
</script>
<template>
  <div class="space-y-2 p-3">
    <div v-if="tl.loading" class="text-xs text-muted-foreground">loading activity…</div>
    <div v-else-if="!entries.length" class="text-xs text-muted-foreground">No agent activity yet.</div>
    <AgentFold :entries="entries" :selected="chat.selection?.id" />
  </div>
</template>
