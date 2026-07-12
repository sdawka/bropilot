<script setup lang="ts">
import { computed } from 'vue';
import { PARTS, kindsForPart, SPACES, type Part, type KindDef } from '../../lib/schema';
import { state, nodesByKind, addNode } from '../../lib/store';
import NodeCard from '../form/NodeCard.vue';

const props = defineProps<{ part: Part }>();

const partDef = computed(() => PARTS.find((p) => p.id === props.part)!);
const kinds = computed(() => kindsForPart(props.part));

function nodes(kind: string) {
  return nodesByKind(kind);
}
function canAdd(k: KindDef) {
  return !(k.singular && nodes(k.kind).length >= 1);
}
function add(k: KindDef) {
  addNode(k.kind);
}
function select(id: string) {
  state.selectedId = id;
}
</script>

<template>
  <div class="mx-auto max-w-5xl px-8 py-8">
    <!-- part hero -->
    <header class="mb-8 animate-fade-up">
      <div class="flex items-center gap-2 text-sm font-medium text-accent">
        <span class="text-lg">{{ partDef.icon }}</span>
        <span>{{ partDef.tagline }}</span>
      </div>
      <h1 class="mt-1 text-3xl font-bold tracking-tight">{{ partDef.label }}</h1>
      <p class="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300 text-balance">{{ partDef.description }}</p>
    </header>

    <!-- sections per kind -->
    <div class="space-y-9">
      <section v-for="k in kinds" :key="k.kind" class="animate-fade-up">
        <div class="mb-3 flex items-center gap-3">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-ink-100">
            <span>{{ k.icon }}</span>
            <span>{{ k.plural }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold"
              :style="{ color: SPACES[k.space].hue, background: SPACES[k.space].glow }"
              >{{ nodes(k.kind).length }}</span
            >
          </h2>
          <span class="hidden text-xs text-ink-400 sm:inline">{{ k.blurb }}</span>
          <button
            v-if="canAdd(k)"
            class="btn btn-ghost ml-auto !py-1 text-xs text-accent"
            @click="add(k)"
          >
            + Add
          </button>
        </div>

        <div v-if="nodes(k.kind).length" class="grid gap-2.5 sm:grid-cols-2">
          <NodeCard
            v-for="n in nodes(k.kind)"
            :key="n.id"
            :node="n"
            @select="select(n.id)"
          />
        </div>
        <button
          v-else
          class="w-full rounded-xl border border-dashed border-white/10 px-4 py-4 text-left text-xs text-ink-400 transition hover:border-white/20 hover:text-ink-300"
          @click="add(k)"
        >
          + Add the first {{ k.label.toLowerCase() }}
        </button>
      </section>
    </div>
  </div>
</template>
