<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Changeset } from '../types';
import { flags } from '../flags';
import { useTimeline } from './timeline';
import EffectRow from './EffectRow.vue';
import ReviewChecklist from './ReviewChecklist.vue';
import type { CheckResult } from '../checks/types';
import { checksApi } from '../checks/applyRepair';
import { refsOf } from './timeline';

const props = defineProps<{ changeset: Changeset }>();
const tl = useTimeline();
const onCanvas = ref(false);
const err = ref<string | null>(null);

const cs = computed(() => props.changeset);
const kept = computed(() => cs.value.effects.filter((e) => e.verdict !== 'rejected').length);
const open = computed(() => cs.value.status === 'open');
const statusLabel = computed(() => ({ open: 'needs you', accepted: 'accepted · draft', partial: 'partly accepted · draft',
  rejected: 'discarded', 'sent-back': 'sent back', committed: 'committed' })[cs.value.status]);

// clef line (CHECKS-SPEC §3.5): checks of what this changeset touches, run on graph + its effects
const checks = checksApi();
const clef = ref<{ solid: number; weak: number; broken: number; unknown: number; results: CheckResult[] } | null>(null);
const clefPending = ref(false);
let clefSeq = 0;
const clefKey = computed(() => (open.value ? cs.value.effects.map((e) => `${e.id}:${e.verdict}`).join(',') : ''));
watch([clefKey, () => flags.checks], async ([key]) => {
  if (!key || flags.checks === 'off') { clefPending.value = false; return; }
  const seq = ++clefSeq; clefPending.value = true;
  try { const r = await checks.previewChangeset(cs.value); if (seq === clefSeq) clef.value = r; }
  catch { if (seq === clefSeq) clef.value = null; }
  finally { if (seq === clefSeq) clefPending.value = false; }
}, { immediate: true });
/** checks: off → only what is already cached for the touched nodes; hidden when nothing is. */
const cachedClef = computed(() => {
  if (flags.checks !== 'off') return null;
  const ids = new Set(refsOf(cs.value));
  const rs = Object.values(checks.results.value ?? {}).filter((r) => r.subjects.some((x) => ids.has(x)));
  if (!rs.length) return null;
  const n = (v: string) => rs.filter((r) => r.verdict === v).length;
  return { solid: n('solid'), weak: n('weak'), broken: n('broken'), unknown: n('unknown'), results: rs };
});
const clefShown = computed(() => cachedClef.value ?? clef.value);
const brokenTitle = computed(() => (clefShown.value?.broken
  ? `clef found broken links:\n${clefShown.value.results.filter((r) => r.verdict === 'broken').map((r) => `• ${r.evidence}`).join('\n')}`
  : undefined));

function review() { onCanvas.value = true; tl.ghost(cs.value.id); }
function closeCanvas() { onCanvas.value = false; tl.clearGhost(cs.value.id); }
function accept() { err.value = null; onCanvas.value = false; tl.accept(cs.value.id); }
function sendBack() { err.value = tl.sendBack(cs.value.id); if (!err.value) onCanvas.value = false; }
function discard() { onCanvas.value = false; tl.discard(cs.value.id); }
</script>

<template>
  <div class="rounded-md border border-border bg-card p-2 text-sm text-card-foreground" :class="cs.status === 'committed' && 'opacity-80'">
    <div class="flex items-center gap-1.5 text-xs">
      <span class="inline-block size-3.5 shrink-0" :class="cs.author.kind === 'agent' ? 'rounded-[2px] bg-primary/70' : cs.author.kind === 's1' ? 'rotate-45 scale-75 bg-primary/70' : 'rounded-full bg-primary/70'" />
      <span class="font-medium">{{ cs.author.name }}</span>
      <span class="text-muted-foreground">· changeset #{{ cs.number }}</span>
      <span class="ml-auto whitespace-nowrap text-muted-foreground" :title="cs.checks.messages.join('\n')">checks ✓ {{ cs.checks.ok }} <span :class="cs.checks.warn ? 'text-gap' : ''">⚠{{ cs.checks.warn }}</span></span>
    </div>
    <div class="mt-1 font-medium leading-snug">“{{ cs.title }}”</div>
    <div class="text-xs text-muted-foreground">{{ cs.blast }}</div>
    <ul v-if="cs.checks.messages.length" class="mt-0.5 text-[11px] text-gap">
      <li v-for="m in cs.checks.messages" :key="m">⚠ {{ m }}</li>
    </ul>
    <div v-if="(clefPending && !cachedClef) || clefShown" class="mt-0.5 text-[11px] tabular-nums" data-clef-line
         :class="clefShown?.broken ? 'text-destructive' : 'text-muted-foreground'" :title="brokenTitle">
      <template v-if="clefPending && !cachedClef">clef: checking…</template>
      <template v-else-if="clefShown">clef: {{ clefShown.solid }} solid · {{ clefShown.weak }} weak · {{ clefShown.broken }} broken<template v-if="clefShown.unknown"> · {{ clefShown.unknown }} unclear</template></template>
    </div>

    <ReviewChecklist v-if="onCanvas && open" class="mt-1.5" :changeset="cs" @close="closeCanvas" />
    <div v-else class="mt-1.5 rounded border border-border px-1.5 py-1">
      <EffectRow v-for="e in cs.effects" :key="e.id" :changeset="cs" :effect="e" />
    </div>

    <div v-if="err" class="mt-1 text-xs text-destructive">{{ err }}</div>
    <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <template v-if="open">
        <button v-if="flags.proposal === 'canvas' && !onCanvas" type="button" class="rounded border border-border px-2 py-1 hover:bg-accent" @click="review">Review on canvas</button>
        <button type="button" class="rounded bg-primary px-2 py-1 text-primary-foreground hover:opacity-90" :disabled="!kept" :title="brokenTitle" @click="accept">Accept {{ kept }} of {{ cs.effects.length }}</button>
        <button type="button" class="rounded border border-border px-2 py-1 hover:bg-accent" @click="sendBack">Send back</button>
        <button type="button" class="rounded px-2 py-1 text-muted-foreground hover:bg-accent" @click="discard">Discard</button>
      </template>
      <template v-else>
        <span class="rounded bg-muted px-1.5 py-0.5 text-muted-foreground" :class="(cs.status === 'accepted' || cs.status === 'partial') && 'bg-draft/15 text-draft'">{{ statusLabel }}</span>
        <button v-if="cs.status === 'accepted' || cs.status === 'partial'" type="button" class="rounded bg-primary px-2 py-1 text-primary-foreground hover:opacity-90" @click="tl.commit(cs.id)">Commit</button>
      </template>
    </div>
  </div>
</template>
