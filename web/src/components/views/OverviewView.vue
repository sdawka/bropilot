<script setup lang="ts">
import { computed } from 'vue';
import { PARTS, SPACES, KIND_MAP, type Part, type Space } from '../../lib/schema';
import { state, counts, nodesByKind, nodesInPart } from '../../lib/store';

const emit = defineEmits<{ (e: 'navigate', part: Part | 'graph'): void }>();

const name = computed(() => nodesByKind('name')[0]);
const purpose = computed(() => nodesByKind('purpose')[0]);

function spaceCount(sp: Space) {
  return state.graph.nodes.filter((n) => KIND_MAP[n.kind]?.space === sp).length;
}
function partCount(p: Part) {
  return nodesInPart(p).length;
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-8 py-10">
    <!-- hero -->
    <header class="animate-fade-up">
      <span class="chip text-accent" style="color: var(--color-accent)">🧠 Knowledge graph</span>
      <h1 class="mt-3 text-4xl font-bold tracking-tight text-balance">
        {{ name?.title || 'Untitled system' }}
      </h1>
      <p class="mt-3 max-w-2xl text-base leading-relaxed text-ink-300 text-balance">
        {{ purpose?.description || purpose?.title || 'Describe the purpose of this system in the Foundations tab to see it here.' }}
      </p>
    </header>

    <!-- stat strip -->
    <div class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-xl glass px-4 py-3">
        <div class="text-2xl font-bold">{{ counts.nodes }}</div>
        <div class="label mt-0.5">Nodes</div>
      </div>
      <div class="rounded-xl glass px-4 py-3">
        <div class="text-2xl font-bold">{{ counts.edges }}</div>
        <div class="label mt-0.5">Relationships</div>
      </div>
      <div
        v-for="sp in [SPACES.solution, SPACES.problem]"
        :key="sp.id"
        class="rounded-xl glass px-4 py-3"
      >
        <div class="text-2xl font-bold" :style="{ color: sp.hue }">{{ spaceCount(sp.id) }}</div>
        <div class="label mt-0.5">{{ sp.label }} nodes</div>
      </div>
    </div>

    <!-- part cards -->
    <div class="mt-8 grid gap-4 md:grid-cols-3">
      <button
        v-for="(p, i) in PARTS"
        :key="p.id"
        class="group animate-fade-up relative overflow-hidden rounded-2xl glass p-5 text-left transition-all hover:-translate-y-1"
        :style="{ animationDelay: `${i * 60}ms` }"
        @click="emit('navigate', p.id)"
      >
        <div class="mb-3 flex items-center justify-between">
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-xl">{{ p.icon }}</span>
          <span class="text-3xl font-bold text-ink-100/90">{{ partCount(p.id) }}</span>
        </div>
        <h3 class="text-lg font-semibold">{{ p.label }}</h3>
        <p class="mt-1 text-xs font-medium text-accent">{{ p.tagline }}</p>
        <p class="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-300">{{ p.description }}</p>
        <span class="mt-3 inline-block text-xs text-ink-400 transition group-hover:text-accent">Open →</span>
      </button>
    </div>

    <!-- graph CTA -->
    <button
      class="mt-4 flex w-full items-center justify-between rounded-2xl glass px-5 py-4 text-left transition hover:-translate-y-0.5"
      @click="emit('navigate', 'graph')"
    >
      <div>
        <h3 class="text-base font-semibold">Explore the graph →</h3>
        <p class="mt-0.5 text-xs text-ink-300">See every node and relationship as one interactive map.</p>
      </div>
      <span class="text-2xl">🕸️</span>
    </button>
  </div>
</template>
