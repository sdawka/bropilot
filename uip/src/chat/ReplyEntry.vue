<script setup lang="ts">
// One System One reply: GuessStrip on top, then the typed payload (jump, results, prose, changeset,
// ask-back), plus offer chips when the band is offer (or act under s1=ask).
import { computed } from 'vue';
import { flags } from '../flags';
import { offerChips } from '../s1/resolve';
import type { ChatMsg } from './store';
import { useChat } from './store';
import { useTimeline } from '../agents/timeline';
import GuessStrip from './GuessStrip.vue';
import JumpCard from './JumpCard.vue';
import ResultList from './ResultList.vue';
import ExplainProse from './ExplainProse.vue';
import NodePicker from './NodePicker.vue';
import ChangesetCard from '../agents/ChangesetCard.vue';
import CheckList from '../components/checks/CheckList.vue';

const props = defineProps<{ msg: ChatMsg }>();
const chat = useChat();
const tl = useTimeline();
const r = computed(() => props.msg.resolution!);
const p = computed(() => props.msg.payload);
const showChips = computed(() => !props.msg.moved && r.value.intent !== 'propose' && p.value?.type !== 'askback'
  && (r.value.band === 'offer' || (r.value.band === 'act' && flags.s1 === 'ask' && r.value.intent === 'navigate')));
const chips = computed(() => offerChips(r.value));
const isLast = computed(() => chat.pendingOffer?.id === props.msg.id);
const cs = computed(() => (props.msg.changesetId ? tl.byId(props.msg.changesetId) : undefined));
</script>

<template>
  <div class="space-y-1.5">
    <GuessStrip :resolution="r" :repaired="msg.repaired" @repair="(k, v, l) => chat.repair(props.msg, k, v, l)" />
    <div v-if="showChips" class="flex flex-wrap items-center gap-1">
      <button v-for="(c, i) in chips" :key="c.value" type="button"
              class="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent" :class="i === 0 && 'border-primary/60'"
              :title="c.confidence.toFixed(2)" @click="chat.choose(props.msg, c.value, c.label)">{{ c.label }}</button>
      <span v-if="isLast && chips.length" class="text-[10px] text-muted-foreground">Enter = first chip</span>
    </div>
    <template v-if="p">
      <JumpCard v-if="p.type === 'jump' && (msg.moved || msg.pendingPreview || !showChips)" :resolution="r" :moved="msg.moved"
                :preview="msg.pendingPreview" @go="chat.move(props.msg)" />
      <ResultList v-else-if="p.type === 'results'" :head="p.head" :rows="p.rows" :gap="p.gap" />
      <ExplainProse v-else-if="p.type === 'explain'" :parts="p.parts" />
      <CheckList v-else-if="p.type === 'checks'" :head="p.head" :result-ids="p.resultIds" :pending="p.pending" />
      <ChangesetCard v-else-if="p.type === 'changeset' && cs" :changeset="cs" />
      <NodePicker v-else-if="p.type === 'askback'" :kind="p.kind" :question="p.question" @pick="(id, l) => chat.choose(props.msg, id, l)" />
      <div v-else-if="p.type === 'none' && p.text" class="text-sm text-muted-foreground">{{ p.text }}</div>
    </template>
  </div>
</template>
