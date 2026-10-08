<script setup lang="ts">
import type { ChatMsg } from './store';
import { useChat } from './store';
import Avatar from './Avatar.vue';
import ContextBar from './ContextBar.vue';
defineProps<{ msg: ChatMsg }>();
const chat = useChat();
</script>
<template>
  <div class="space-y-0.5">
    <div class="flex min-w-0 items-center gap-1.5">
      <Avatar :author="msg.author" /><span class="text-xs font-medium">{{ msg.author.name }}</span>
      <ContextBar v-if="msg.frozen" class="min-w-0" :ctx="msg.frozen" frozen @restore="chat.restore(msg.frozen!)" />
    </div>
    <div class="whitespace-pre-wrap pl-5 text-sm">{{ msg.text }}</div>
  </div>
</template>
