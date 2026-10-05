<script setup lang="ts">
import { computed } from 'vue';
import type { Changeset, Effect } from '../types';
import { useGraphApi } from '../chat/graphApi';
import { useTimeline } from './timeline';

const props = defineProps<{ changeset: Changeset; effect: Effect; compact?: boolean; readonly?: boolean }>();
const g = useGraphApi();
const tl = useTimeline();

const title = (id?: string) => {
  if (!id) return '?';
  const local = props.changeset.effects.find((e) => e.node?.id === id)?.node;
  return local?.title ?? g.byId(id)?.title ?? id;
};
const sym = computed(() => ({ 'add-node': '+', 'add-edge': '+', 'update-node': '~', 'remove-edge': '−', 'remove-node': '−' })[props.effect.op]);
const what = computed(() => {
  const e = props.effect;
  if (e.op === 'add-node' || e.op === 'remove-node') return { tag: e.node?.kind ?? 'node', text: e.node?.title ?? title(e.node?.id) };
  if (e.op === 'update-node') {
    const changed = Object.entries(e.node?.props ?? {}).map(([k, v]) => `${k} → ${v}`).join(', ');
    return { tag: '~', text: `${title(e.node?.id)}${changed ? ` · ${changed}` : e.node?.status ? ` → ${e.node.status}` : ''}` };
  }
  return { tag: e.edge?.type ?? 'edge', text: `${title(e.edge?.src)} → ${title(e.edge?.dst)}` };
});
const rejected = computed(() => props.effect.verdict === 'rejected');
const editable = computed(() => !props.readonly && (props.changeset.status === 'open'));
function toggle() {
  if (!editable.value) return;
  tl.setVerdict(props.changeset.id, props.effect.id, rejected.value ? 'pending' : 'rejected');
}
function setReason(ev: Event) { tl.setVerdict(props.changeset.id, props.effect.id, 'rejected', (ev.target as HTMLInputElement).value); }
const ids = computed(() => [props.effect.node?.id, props.effect.edge?.src, props.effect.edge?.dst].filter((x): x is string => !!x && !!g.byId(x)));
</script>

<template>
  <div class="group text-xs" @mouseenter="ids.length && g.dispatch({ verb: 'highlight', ids })" @mouseleave="g.dispatch({ verb: 'highlight', ids: [] })">
    <div class="flex items-start gap-1.5 py-0.5">
      <button type="button" class="w-4 shrink-0 font-semibold" :class="rejected ? 'text-destructive' : 'text-draft'"
              :disabled="!editable" :title="editable ? (rejected ? 'Accept this effect' : 'Reject this effect') : ''" @click="toggle">
        {{ rejected ? '✗' : '✓' }}
      </button>
      <span class="w-3 shrink-0 font-mono text-muted-foreground">{{ sym }}</span>
      <span class="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">{{ what.tag }}</span>
      <span class="min-w-0 flex-1" :class="[rejected && 'line-through opacity-60', compact && 'truncate']">{{ what.text }}</span>
    </div>
    <div v-if="rejected" class="ml-[38px] pb-1">
      <input v-if="editable" class="w-full rounded border border-border bg-background px-1.5 py-0.5 text-xs" placeholder="reason (sent to the agent)"
             :value="effect.reason ?? ''" @input="setReason" />
      <span v-else-if="effect.reason" class="text-muted-foreground">reason: {{ effect.reason }}</span>
    </div>
  </div>
</template>
