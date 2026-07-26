<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { DECKS, answersToRaw, type Deck, type Answer } from '../../lib/decks';
import { diffAgainstGraph, type Changeset } from '../../lib/changeset';
import { buildPrompt } from '../../lib/bridge';
import { state, nodesByKind } from '../../lib/store';
import { draft, resetDeck } from '../../lib/workshopDraft';
import { toast } from '../../lib/toast';
import MergeReview from './MergeReview.vue';

interface DeckProgress {
  qIndex: number;
  answers: Answer[];
}

const deck = ref<Deck | null>(null);
const qIndex = ref(0);
const answers = ref<Answer[]>([]); // accumulates across the whole deck run
const draftTitle = ref('');
const draftLinks = ref<Record<string, string>>({}); // followup edgeType|targetKind → chosen target

const question = computed(() => (deck.value ? deck.value.questions[qIndex.value] : null));
const progress = computed(() =>
  deck.value ? `${qIndex.value + 1} of ${deck.value.questions.length}` : '',
);

function savedProgress(deckId: string): DeckProgress | undefined {
  return draft.deckAnswers[deckId] as DeckProgress | undefined;
}
function hasResume(d: Deck): boolean {
  return (savedProgress(d.id)?.answers.length ?? 0) > 0;
}

function start(d: Deck) {
  deck.value = d;
  const saved = savedProgress(d.id);
  qIndex.value = saved?.qIndex ?? 0;
  answers.value = saved ? [...saved.answers] : [];
  resetDraftInputs();
}
function resetDraftInputs() {
  draftTitle.value = '';
  draftLinks.value = {};
}
function toDecks() {
  deck.value = null; // progress stays in the shared draft — resume picks it back up
}

// Persist deck progress into the shared workshop draft (autosaved by its own
// watch) so the hub's resume badge and a page reload both see it. A deck with
// no answers left at question 1 is cleared, not stored as an empty entry.
watch(
  [qIndex, answers],
  () => {
    if (!deck.value) return;
    if (answers.value.length === 0 && qIndex.value === 0) {
      resetDeck(deck.value.id);
    } else {
      draft.deckAnswers = { ...draft.deckAnswers, [deck.value.id]: { qIndex: qIndex.value, answers: answers.value } };
    }
  },
  { deep: true },
);

// targets for a follow-up = existing graph nodes of that kind + earlier answers of that kind
function targetOptions(targetKind: string): string[] {
  const fromGraph = nodesByKind(targetKind).map((n) => n.title);
  const fromAnswers = answers.value.filter((a) => a.kind === targetKind).map((a) => a.title);
  return [...new Set([...fromAnswers, ...fromGraph])].filter(Boolean);
}

function addAnswer() {
  const q = question.value;
  if (!q || !draftTitle.value.trim()) return;
  const links = (q.followups ?? [])
    .map((f) => ({ type: f.edgeType, target: draftLinks.value[`${f.edgeType}|${f.targetKind}`] ?? '' }))
    .filter((l) => l.target);
  answers.value = [...answers.value, { kind: q.kind, title: draftTitle.value.trim(), links }];
  resetDraftInputs();
}

const answersForCurrent = computed(() => {
  const q = question.value;
  return q ? answers.value.filter((a) => a.kind === q.kind) : [];
});

function next() {
  if (draftTitle.value.trim()) addAnswer();
  if (deck.value && qIndex.value < deck.value.questions.length - 1) qIndex.value++;
  else finish();
  resetDraftInputs();
}
function back() {
  if (qIndex.value > 0) qIndex.value--;
  resetDraftInputs();
}

const review = ref<Changeset | null>(null);
function finish() {
  review.value = diffAgainstGraph(state.graph, answersToRaw(answers.value));
}
function onApplied() {
  review.value = null;
  if (deck.value) resetDeck(deck.value.id);
  deck.value = null;
}

async function llmInterview() {
  if (!deck.value) return;
  const prompt = buildPrompt({
    exercise: 'interview',
    graph: state.graph,
    questions: deck.value.questions.map((q) => q.prompt),
  });
  try {
    await navigator.clipboard.writeText(prompt);
    toast('✨ Interview prompt copied — run it in any LLM, then use Document extraction to paste the reply');
  } catch {
    /* clipboard unavailable — user can still copy manually elsewhere */
  }
}
</script>

<template>
  <div class="interview-deck">
    <template v-if="!deck">
      <h2 class="display mb-4 text-2xl">Guided interview</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <button
          v-for="d in DECKS"
          :key="d.id"
          class="relative rounded-xl border hairline bg-ink-900 p-4 text-left transition hover:border-white/20"
          :data-deck="d.id"
          @click="start(d)"
        >
          <span v-if="hasResume(d)" class="absolute right-3 top-3 rounded-full bg-accent/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-accent">Resume</span>
          <h3 class="text-base font-semibold text-ink-100">{{ d.label }}</h3>
          <p class="mt-1 text-xs text-ink-400">{{ d.questions.length }} questions</p>
        </button>
      </div>
    </template>

    <template v-else-if="question">
      <div class="mb-3 flex items-center gap-3">
        <button class="btn btn-ghost text-xs" @click="toDecks">← Decks</button>
        <span class="kicker text-ink-400">{{ deck.label }} · {{ progress }}</span>
        <button class="btn btn-ghost ml-auto text-xs" data-testid="deck-llm" @click="llmInterview">✨ Have an LLM interview me</button>
      </div>
      <div class="h-1 w-full overflow-hidden rounded bg-white/10">
        <div class="h-full bg-accent transition-all" :style="{ width: `${((qIndex + 1) / deck.questions.length) * 100}%` }" />
      </div>

      <div class="mt-6">
        <h3 class="text-lg font-semibold text-ink-100">{{ question.prompt }}</h3>

        <div class="mt-3 space-y-2">
          <input
            v-model="draftTitle"
            class="field"
            placeholder="Type an answer…"
            data-testid="deck-answer"
            @keydown.enter.prevent="addAnswer"
          />
          <div v-for="f in question.followups ?? []" :key="f.edgeType + f.targetKind">
            <label class="mb-1 block text-xs text-ink-400">{{ f.prompt }}</label>
            <select v-model="draftLinks[`${f.edgeType}|${f.targetKind}`]" class="field !py-1.5 text-xs" :data-testid="`deck-followup-${f.edgeType}`">
              <option value="">— none —</option>
              <option v-for="t in targetOptions(f.targetKind)" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <button class="btn" data-testid="deck-add" @click="addAnswer">+ Add answer</button>
        </div>

        <ul v-if="answersForCurrent.length" class="mt-4 space-y-1 text-xs text-ink-300">
          <li v-for="(a, i) in answersForCurrent" :key="i">• {{ a.title }}<span v-if="a.links.length" class="text-ink-500"> ({{ a.links.length }} link)</span></li>
        </ul>
      </div>

      <div class="mt-6 flex gap-2">
        <button class="btn" :disabled="qIndex === 0" @click="back">← Back</button>
        <button class="btn" @click="next">Skip</button>
        <button class="btn btn-primary ml-auto" data-testid="deck-next" @click="next">
          {{ qIndex === deck.questions.length - 1 ? 'Finish → review' : 'Next →' }}
        </button>
      </div>
    </template>

    <MergeReview v-if="review" :changeset="review" @close="review = null" @applied="onApplied" />
  </div>
</template>
