<script setup lang="ts">
import { computed } from 'vue';
import { KIND_MAP, ONTOLOGY, SPACES, nodeHue } from '../../lib/schema';
import { nodesByKind } from '../../lib/store';

const props = defineProps<{ kind: string }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'jump', id: string): void }>();

const def = computed(() => KIND_MAP[props.kind]);
const space = computed(() => (def.value ? SPACES[def.value.space] : undefined));
const instances = computed(() => nodesByKind(props.kind));
const outgoing = computed(() => ONTOLOGY.filter((t) => t.src === props.kind));
const incoming = computed(() => ONTOLOGY.filter((t) => t.dst === props.kind));

function label(kind: string) {
  return KIND_MAP[kind]?.label ?? kind;
}
</script>

<template>
  <div v-if="def" class="absolute bottom-5 right-5 w-80 border hairline glass-strong">
    <header class="flex items-start justify-between gap-2 border-b hairline px-4 py-3">
      <div class="min-w-0">
        <span class="chip" :style="{ color: space?.hue }">{{ def.icon }} {{ def.label }}</span>
        <p class="mt-1.5 text-xs leading-relaxed text-ink-300">{{ def.blurb }}</p>
      </div>
      <button class="btn btn-ghost shrink-0 !px-2" title="Close" @click="emit('close')">✕</button>
    </header>

    <div class="max-h-72 space-y-4 overflow-y-auto px-4 py-3">
      <section v-if="outgoing.length">
        <h4 class="label mb-1.5">Relates to</h4>
        <p v-for="t in outgoing" :key="`${t.type}-${t.dst}`" class="text-xs text-ink-300" :title="t.note">
          <span class="font-mono text-[0.66rem] uppercase tracking-wide text-accent">{{ t.type }}</span>
          → {{ label(t.dst) }}
          <span class="text-[0.62rem] text-ink-400">({{ t.strength }})</span>
        </p>
      </section>
      <section v-if="incoming.length">
        <h4 class="label mb-1.5">Related from</h4>
        <p v-for="t in incoming" :key="`${t.src}-${t.type}`" class="text-xs text-ink-300" :title="t.note">
          {{ label(t.src) }}
          <span class="font-mono text-[0.66rem] uppercase tracking-wide text-ink-400">{{ t.type }}</span> → this
        </p>
      </section>
      <section>
        <h4 class="label mb-1.5">Instances ({{ instances.length }})</h4>
        <p v-if="!instances.length" class="text-xs text-ink-400">None yet.</p>
        <button
          v-for="n in instances"
          :key="n.id"
          class="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-ink-200 transition hover:bg-white/[0.05]"
          @click="emit('jump', n.id)"
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full" :style="{ background: nodeHue(n) }" />
          <span class="truncate">{{ n.title }}</span>
        </button>
      </section>
    </div>
  </div>
</template>
