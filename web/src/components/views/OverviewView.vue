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
    <header class="animate-fade-up border-b hairline pb-10">
      <div class="kicker text-accent">🧠 Knowledge graph</div>
      <h1 class="display mt-4 text-6xl text-balance">
        {{ name?.title || 'Untitled system' }}
      </h1>
      <p class="mt-5 max-w-2xl text-base leading-relaxed text-ink-300 text-balance">
        {{ purpose?.description || purpose?.title || 'Describe the purpose of this system in the Foundations tab to see it here.' }}
      </p>
    </header>

    <!-- stat strip -->
    <div class="mt-0 grid grid-cols-2 border-b hairline sm:grid-cols-4">
      <div class="border-r hairline px-4 py-5">
        <div class="font-mono text-3xl font-semibold">{{ counts.nodes }}</div>
        <div class="label mt-1">Nodes</div>
      </div>
      <div class="px-4 py-5 sm:border-r hairline">
        <div class="font-mono text-3xl font-semibold text-accent">{{ counts.edges }}</div>
        <div class="label mt-1">Relationships</div>
      </div>
      <div
        v-for="(sp, i) in [SPACES.solution, SPACES.problem]"
        :key="sp.id"
        class="px-4 py-5"
        :class="i === 0 ? 'border-r hairline' : ''"
      >
        <div class="font-mono text-3xl font-semibold" :style="{ color: sp.hue }">{{ spaceCount(sp.id) }}</div>
        <div class="label mt-1">{{ sp.label }} nodes</div>
      </div>
    </div>

    <!-- part cards -->
    <div class="mt-10 grid gap-4 md:grid-cols-3">
      <button
        v-for="(p, i) in PARTS"
        :key="p.id"
        class="group animate-fade-up relative overflow-hidden border hairline bg-ink-900 p-5 text-left transition-colors hover:border-white/35"
        :style="{ animationDelay: `${i * 60}ms` }"
        @click="emit('navigate', p.id)"
      >
        <div class="mb-4 flex items-start justify-between">
          <span class="kicker text-ink-400">{{ String(i + 1).padStart(2, '0') }}</span>
          <span class="font-mono text-3xl font-semibold text-ink-100/90">{{ partCount(p.id) }}</span>
        </div>
        <h3 class="display text-2xl">{{ p.label }}</h3>
        <p class="kicker mt-2 text-accent">{{ p.tagline }}</p>
        <p class="mt-3 line-clamp-3 text-xs leading-relaxed text-ink-300">{{ p.description }}</p>
        <span class="mt-4 inline-block text-xs text-ink-400 transition group-hover:text-accent">Open →</span>
      </button>
    </div>

    <!-- graph CTA -->
    <button
      class="mt-4 flex w-full items-center justify-between border hairline bg-ink-900 px-5 py-4 text-left transition-colors hover:border-white/35"
      @click="emit('navigate', 'graph')"
    >
      <div>
        <h3 class="display text-xl">Explore the graph →</h3>
        <p class="mt-1 text-xs text-ink-300">See every node and relationship as one interactive map.</p>
      </div>
      <span class="text-2xl">🕸️</span>
    </button>
  </div>
</template>
