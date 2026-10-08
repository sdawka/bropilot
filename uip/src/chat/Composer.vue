<script setup lang="ts">
// ask, jump, or propose… Enter sends. With an empty input, Enter confirms a preview (s1=preview)
// or picks the first offer chip. `@` mentions a node; the mention becomes the turn's context.
import { computed, nextTick, ref, watch } from 'vue';
import { useChat } from './store';
import { useGraphApi } from './graphApi';
import { ontology } from '../s1/ontologyData';
import { offerChips } from '../s1/resolve';
import ContextBar from './ContextBar.vue';
import NodeChip from './NodeChip.vue';

const props = defineProps<{ autofocus?: boolean; placeholder?: string }>();
const emit = defineEmits<{ sent: [msgId: string | undefined] }>();
const chat = useChat();
const g = useGraphApi();
const text = ref('');
const mention = ref<string | null>(null);
const box = ref<HTMLTextAreaElement | null>(null);
const active = ref(0);

const live = computed(() => {
  const v = g.view.value; const s = chat.selection;
  return { node: s ? { id: s.id, title: s.title, kind: s.kind } : undefined, persp: v.persp, level: chat.level, path: v.path };
});
const query = computed(() => { const m = text.value.match(/@([^\s@]*)$/); return m ? m[1].toLowerCase() : null; });
const matches = computed(() => {
  if (query.value === null) return [];
  const q = query.value;
  return g.graph.value.nodes.filter((n) => !q || n.title.toLowerCase().includes(q)).slice(0, 8);
});
const icon = (kind: string) => ontology.KINDS.find((k) => k.id === kind)?.icon ?? '•';

function pickMention(id: string) {
  const n = g.byId(id); if (!n) return;
  mention.value = id;
  text.value = text.value.replace(/@([^\s@]*)$/, `@${n.title} `);
  active.value = 0;
  nextTick(() => box.value?.focus());
}
async function submit() {
  const t = text.value.trim();
  if (!t) {
    if (chat.pendingPreview) { chat.confirmPreview(); return; }
    const m = chat.pendingOffer;
    if (m?.resolution) { const c = offerChips(m.resolution)[0]; if (c) chat.choose(m, c.value, c.label); }
    return;
  }
  const mid = mention.value;
  text.value = ''; mention.value = null;
  const m = await chat.send(t, { mention: mid });
  emit('sent', m?.id);
}
function onKey(e: KeyboardEvent) {
  if (matches.value.length) {
    if (e.key === 'ArrowDown') { active.value = (active.value + 1) % matches.value.length; e.preventDefault(); return; }
    if (e.key === 'ArrowUp') { active.value = (active.value - 1 + matches.value.length) % matches.value.length; e.preventDefault(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { pickMention(matches.value[active.value].id); e.preventDefault(); return; }
    if (e.key === 'Escape') { text.value = text.value.replace(/@([^\s@]*)$/, '$1'); return; }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
}
// prefill from chat.askAbout (node pane "Ask about this"): the node becomes the turn's context
// (immediate: a collapsed sidebar / closed palette mounts this Composer only after the request)
watch(() => chat.draft.seq, (seq) => {
  if (seq <= chat.draft.used) return;
  chat.draft.used = seq;
  text.value = chat.draft.text; mention.value = chat.draft.mention;
  nextTick(() => { const b = box.value; if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } });
}, { immediate: true });
defineExpose({ focus: () => box.value?.focus() });
</script>

<template>
  <div class="relative rounded-md border border-border bg-background p-1.5 focus-within:ring-1 focus-within:ring-ring">
    <div class="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">looking at</div>
    <ContextBar :ctx="live" :excluded="chat.excluded" @toggle="(k) => (chat.excluded[k] = !chat.excluded[k])"
                @clear="Object.assign(chat.excluded, { node: true, persp: true, level: true })" />
    <div v-if="mention" class="mt-1 text-[11px]">context: <NodeChip :id="mention" show-kind /> <button type="button" class="text-muted-foreground" @click="mention = null">×</button></div>
    <div class="mt-1 flex items-end gap-1">
      <textarea ref="box" v-model="text" rows="1" :autofocus="props.autofocus"
                class="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                :placeholder="placeholder ?? (chat.pendingPreview ? 'Enter to confirm the preview…' : chat.pendingOffer ? 'Enter = first chip, or ask, jump, propose…' : 'ask, jump, or propose… @ to cite')"
                @keydown="onKey" />
      <button type="button" class="rounded px-1.5 text-muted-foreground hover:text-foreground" title="Cite a node" @click="text += (text && !text.endsWith(' ') ? ' @' : '@'); box?.focus()">@</button>
      <button type="button" class="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-50" :disabled="chat.busy" @click="submit">⏎</button>
    </div>
    <ul v-if="matches.length" class="absolute bottom-full left-0 z-50 mb-1 w-full overflow-hidden rounded-md border border-border bg-popover text-sm text-popover-foreground shadow-md">
      <li v-for="(n, i) in matches" :key="n.id">
        <button type="button" class="flex w-full items-center gap-1.5 px-2 py-1 text-left" :class="i === active && 'bg-accent'" @mousedown.prevent="pickMention(n.id)">
          <span>{{ icon(n.kind) }}</span><span class="truncate">{{ n.title }}</span><span class="ml-auto text-xs text-muted-foreground">{{ n.kind }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
