<script setup lang="ts">
// chat=palette: ⌘K centred input. A navigate turn that moves the view closes the palette; ask,
// explain and propose expand a floating thread anchored under the top bar.
import { onBeforeUnmount, onMounted, ref, nextTick, watch } from 'vue';
import { useChatBoot } from './boot';
import ChatThread from './ChatThread.vue';
import Composer from './Composer.vue';

const props = defineProps<{ open?: boolean }>();
const emit = defineEmits<{ 'update:open': [v: boolean] }>();
const open = ref(false);
const thread = ref(false);
const since = ref('');
const composer = ref<InstanceType<typeof Composer> | null>(null);
const { chat } = useChatBoot(() => { show(); thread.value = true; }, () => show());

function show() {
  if (!open.value) { since.value = new Date().toISOString(); thread.value = false; }
  open.value = true;
  nextTick(() => composer.value?.focus());
}
function close() { open.value = false; thread.value = false; }
// the top bar's ChatToggle drives `open`; ⌘K and Esc drive it from here
watch(() => props.open, (v) => { if (v && !open.value) show(); else if (!v && open.value) close(); });
watch(open, (v) => { if (v !== props.open) emit('update:open', v); });
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open.value ? close() : show(); }
  else if (e.key === 'Escape' && open.value) close();
}
function onSent(id?: string) {
  const m = chat.msgs.find((x) => x.id === id);
  if (m?.resolution?.intent === 'navigate' && m.moved) { close(); return; }
  thread.value = true;
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40 bg-black/10" @click="close" />
    <div v-if="open" class="fixed left-1/2 top-14 z-50 flex max-h-[70vh] w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
      <ChatThread v-if="thread" :only-since="since" hide-timeline class="max-h-[50vh]" />
      <div class="border-t border-border p-2" :class="!thread && 'border-t-0'">
        <Composer ref="composer" autofocus placeholder="⌘K · jump, ask, or propose…" @sent="onSent" />
      </div>
      <div class="flex justify-between px-3 pb-1.5 text-[10px] text-muted-foreground"><span>Enter send · Esc close</span><span>thread · {{ chat.threadId }}</span></div>
    </div>
  </Teleport>
</template>
