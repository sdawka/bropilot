<script setup lang="ts">
import { ref } from 'vue';
import { draft, resetDoc } from '../../lib/workshopDraft';
import { buildPrompt, parseReply } from '../../lib/bridge';
import { diffAgainstGraph, type Changeset } from '../../lib/changeset';
import { state } from '../../lib/store';
import { toast } from '../../lib/toast';
import MergeReview from './MergeReview.vue';

const replyText = ref('');
const parseError = ref('');
const review = ref<Changeset | null>(null);

async function copyPrompt() {
  if (!draft.docText.trim()) return;
  const prompt = buildPrompt({ exercise: 'extract', docText: draft.docText, graph: state.graph });
  try {
    await navigator.clipboard.writeText(prompt);
    toast('✓ Extraction prompt copied — paste into any LLM, then paste the reply below');
  } catch {
    /* ignore */
  }
}

function ingest() {
  const res = parseReply(replyText.value);
  if ('error' in res) {
    parseError.value = res.error;
    review.value = null;
    return;
  }
  parseError.value = '';
  const cs = diffAgainstGraph(state.graph, res.raw);
  cs.warnings.unshift(...res.warnings);
  review.value = cs;
}

function onApplied() {
  review.value = null;
  replyText.value = '';
  resetDoc();
}
</script>

<template>
  <div class="doc-extract">
    <h2 class="display mb-4 text-2xl">Document extraction</h2>

    <label class="label mb-2 block">Paste a document (PRD, README, notes)</label>
    <textarea v-model="draft.docText" rows="8" class="field resize-none text-sm" data-testid="doc-input" placeholder="Paste anything describing the system…" />
    <button class="btn btn-primary mt-2" :disabled="!draft.docText.trim()" data-testid="doc-copy" @click="copyPrompt">⧉ Copy extraction prompt</button>

    <label class="label mb-2 mt-6 block">Paste the LLM reply</label>
    <textarea v-model="replyText" rows="8" class="field resize-none font-mono text-[0.7rem]" data-testid="doc-reply" placeholder='{ "nodes": [...], "edges": [...] }' />
    <p v-if="parseError" class="mt-2 text-xs text-rose-400" data-testid="doc-error">⚠ {{ parseError }}</p>
    <button class="btn mt-2" :disabled="!replyText.trim()" data-testid="doc-review" @click="ingest">Review changes →</button>

    <MergeReview v-if="review" :changeset="review" @close="review = null" @applied="onApplied" />
  </div>
</template>
