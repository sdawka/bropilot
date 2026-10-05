<script setup lang="ts">
// Right sidebar, 380px, collapsible to a 44px rail (SPEC §4 states A/B/C).
import { computed, ref } from 'vue';
import { MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-vue-next';
import { flags } from '../flags';
import { useChatBoot } from './boot';
import type { Author } from '../types';
import ChatThread from './ChatThread.vue';
import Composer from './Composer.vue';
import ActivityTab from './ActivityTab.vue';
import Avatar from './Avatar.vue';

// App.vue passes WP1's store/ui `chatCollapsed` as the prop; the chat store shares that same ref.
const props = defineProps<{ collapsed?: boolean }>();
const emit = defineEmits<{ 'update:collapsed': [v: boolean] }>();
const { chat, tl } = useChatBoot(() => setCollapsed(false), () => setCollapsed(false));
const isCollapsed = computed(() => props.collapsed ?? chat.collapsed);
function setCollapsed(v: boolean) { chat.setCollapsed(v); emit('update:collapsed', v); }
const tab = ref<'chat' | 'activity'>('chat');
const needsYou = computed(() => tl.needsYou + chat.openStubs);
const agents = computed<Author[]>(() => {
  const seen = new Map<string, Author>();
  for (const e of tl.entries) if (e.author.kind !== 'human' && !seen.has(e.author.id)) seen.set(e.author.id, e.author);
  return [...seen.values()].slice(0, 6);
});
const title = computed(() => (chat.threadId === 'project' ? 'project' : chat.selection?.title ?? 'node'));
</script>

<template>
  <aside v-if="isCollapsed" class="flex h-full w-[44px] shrink-0 flex-col items-center gap-2 py-2" aria-label="chat (collapsed)">
    <button type="button" class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Open chat" @click="setCollapsed(false)"><PanelRightOpen class="size-4" /></button>
    <Avatar v-for="a in agents" :key="a.id" :author="a" />
    <button v-if="needsYou" type="button" class="rounded bg-gap/15 px-1 text-[11px] font-medium text-gap" :title="`${needsYou} need you`" @click="setCollapsed(false)">⚑{{ needsYou }}</button>
    <button type="button" class="mt-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="Chat" @click="setCollapsed(false)"><MessageSquare class="size-4" /></button>
  </aside>
  <aside v-else class="flex h-full w-[380px] shrink-0 flex-col bg-background" aria-label="chat">
    <header class="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
      <span class="font-medium">chat</span><span class="truncate text-muted-foreground">· {{ title }}</span>
      <span v-if="needsYou" class="ml-auto rounded bg-gap/15 px-1 text-[11px] font-medium text-gap" :title="`${needsYou} need you`">⚑{{ needsYou }}</span>
      <button type="button" class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" :class="!needsYou && 'ml-auto'" title="Collapse" @click="setCollapsed(true)"><PanelRightClose class="size-4" /></button>
    </header>
    <nav v-if="flags.agents === 'tab' || flags.thread === 'node'" class="flex gap-1 border-b border-border px-2 py-1 text-xs">
      <template v-if="flags.thread === 'node'">
        <button type="button" class="rounded px-2 py-0.5" :class="tab === 'chat' && chat.inbox ? 'bg-accent' : 'text-muted-foreground'" @click="tab = 'chat'; chat.inbox = true">Inbox</button>
        <button type="button" class="max-w-[140px] truncate rounded px-2 py-0.5" :class="tab === 'chat' && !chat.inbox ? 'bg-accent' : 'text-muted-foreground'" :disabled="!chat.selection" @click="tab = 'chat'; chat.inbox = false">{{ chat.selection?.title ?? 'no node' }}</button>
      </template>
      <button v-else type="button" class="rounded px-2 py-0.5" :class="tab === 'chat' ? 'bg-accent' : 'text-muted-foreground'" @click="tab = 'chat'">Chat</button>
      <button v-if="flags.agents === 'tab'" type="button" class="rounded px-2 py-0.5" :class="tab === 'activity' ? 'bg-accent' : 'text-muted-foreground'" @click="tab = 'activity'">Activity<span v-if="tl.needsYou" class="ml-1 text-gap">⚑{{ tl.needsYou }}</span></button>
    </nav>
    <ActivityTab v-if="tab === 'activity' && flags.agents === 'tab'" class="min-h-0 flex-1 overflow-y-auto" />
    <ChatThread v-else />
    <div class="border-t border-border p-2"><Composer /></div>
  </aside>
</template>
