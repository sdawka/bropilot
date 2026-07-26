<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { draft, hydrateWorkshop } from '../../lib/workshopDraft';
import EventStorm from '../workshop/EventStorm.vue';
import InterviewDeck from '../workshop/InterviewDeck.vue';

type Exercise = 'hub' | 'storm' | 'interview' | 'extract' | 'gap';
const exercise = ref<Exercise>('hub');

onMounted(hydrateWorkshop);

const cards = computed(() => [
  { id: 'storm' as Exercise, icon: '🗂️', title: 'Event storming', blurb: 'Map actors, commands, aggregates, events and hotspots on a sticky board.', resume: draft.stickies.length > 0 },
  { id: 'interview' as Exercise, icon: '🎤', title: 'Guided interview', blurb: 'Answer structured questions to grow Foundations, Domain and Implementation.', resume: Object.keys(draft.deckAnswers).length > 0 },
  { id: 'extract' as Exercise, icon: '📄', title: 'Document extraction', blurb: 'Paste a PRD, README or notes and extract a graph via any LLM.', resume: draft.docText.trim().length > 0 },
  { id: 'gap' as Exercise, icon: '🩹', title: 'Gap-fix sprint', blurb: 'Work through lint findings and suggestions one card at a time.', resume: false },
]);

function open(id: Exercise) {
  exercise.value = id;
}
function toHub() {
  exercise.value = 'hub';
}
</script>

<template>
  <div class="workshop-view mx-auto max-w-5xl px-8 py-8">
    <template v-if="exercise === 'hub'">
      <header class="mb-10 border-b hairline pb-8">
        <div class="kicker text-accent">🛠️ Workshop</div>
        <h1 class="display mt-3 text-5xl">Enrich the graph</h1>
        <p class="mt-4 max-w-2xl text-sm leading-relaxed text-ink-300">
          Four structured exercises that turn scattered knowledge into reviewed graph changes. Every change goes through a merge review before it touches your graph.
        </p>
      </header>
      <div class="grid gap-4 sm:grid-cols-2">
        <button
          v-for="c in cards"
          :key="c.id"
          class="workshop-card group relative rounded-xl border hairline bg-ink-900 p-5 text-left transition hover:border-white/20"
          :data-exercise="c.id"
          @click="open(c.id)"
        >
          <span v-if="c.resume" class="absolute right-3 top-3 rounded-full bg-accent/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-accent">Resume</span>
          <div class="text-2xl">{{ c.icon }}</div>
          <h2 class="mt-3 text-base font-semibold text-ink-100">{{ c.title }}</h2>
          <p class="mt-1.5 text-xs leading-relaxed text-ink-300">{{ c.blurb }}</p>
        </button>
      </div>
    </template>

    <template v-else>
      <button class="btn btn-ghost mb-4 text-xs" @click="toHub">← Back to workshop</button>
      <!-- Remaining exercise components mounted here in Tasks 7–8:
           <DocExtract v-else-if="exercise==='extract'" />
           <GapSprint v-else-if="exercise==='gap'" /> -->
      <EventStorm v-if="exercise === 'storm'" />
      <InterviewDeck v-else-if="exercise === 'interview'" />
      <div v-else class="rounded-xl border border-dashed border-white/10 p-8 text-sm text-ink-400" data-exercise-placeholder>
        {{ exercise }} exercise — implemented in a later task.
      </div>
    </template>
  </div>
</template>
