<script setup lang="ts">
// read as: navigate › Agent ▾ › Reviewer ▾ ●●●. Each segment is a dropdown of the other options in
// probability order; picking one re-resolves the levels below from held answers (0 requests).
import { computed, ref } from 'vue';
import type { Decision, TurnResolution } from '../types';
import type { RepairKey } from '../s1/resolve';
import Dots from './Dots.vue';

const props = defineProps<{ resolution: TurnResolution; repaired?: string }>();
const emit = defineEmits<{ repair: [key: RepairKey, value: string, label: string] }>();
const open = ref<RepairKey | null>(null);

const d = (k: RepairKey) => props.resolution.decisions.find((x) => x.key === k);
const segments = computed(() => {
  const out: Decision[] = [];
  for (const k of ['intent', 'kind', 'node'] as RepairKey[]) { const x = d(k); if (x) out.push(x); }
  return out;
});
const persp = computed(() => d('persp'));
const space = computed(() => d('space'));
const short = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
function pick(key: RepairKey, value: string, label: string) { open.value = null; emit('repair', key, value, label); }
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] text-muted-foreground">
    <span class="text-primary">◆</span><span>read as:</span>
    <template v-for="(s, i) in segments" :key="s.key">
      <span v-if="i" aria-hidden="true">›</span>
      <span class="relative">
        <button type="button" class="rounded px-1 hover:bg-accent hover:text-foreground" :class="s.value === 'none' && 'italic'"
                :title="`${s.key} · ${s.confidence.toFixed(2)}`" @click="open = open === s.key ? null : s.key">
          {{ s.key === 'node' && resolution.usesContext ? '◉ ' : '' }}{{ short(s.value === 'none' ? '?' : s.label) }} ▾
        </button>
        <div v-if="open === s.key" class="absolute left-0 top-full z-50 mt-0.5 max-h-64 w-56 overflow-auto rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md">
          <div v-if="!s.alternatives.length && !(s.key === 'kind' && space)" class="px-1.5 py-1 text-muted-foreground">no other options were scored</div>
          <button v-for="o in s.alternatives" :key="o.value" type="button" class="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-accent" @click="pick(s.key, o.value, o.label)">
            <span class="truncate">{{ o.label }}</span><span class="ml-auto tabular-nums text-muted-foreground">{{ o.confidence.toFixed(2) }}</span>
          </button>
          <template v-if="s.key === 'kind' && space && space.alternatives.length">
            <div class="mt-1 border-t border-border px-1.5 pt-1 text-[10px] uppercase text-muted-foreground">other space</div>
            <button v-for="o in space.alternatives" :key="o.value" type="button" class="flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-accent" @click="pick('space', o.value, o.label)">
              <span class="truncate">{{ o.label }}</span><span class="ml-auto tabular-nums text-muted-foreground">{{ o.confidence.toFixed(2) }}</span>
            </button>
          </template>
        </div>
      </span>
    </template>
    <span v-if="persp && persp.value !== 'keep'" class="relative">
      <button type="button" class="rounded px-1 hover:bg-accent hover:text-foreground" @click="open = open === 'persp' ? null : 'persp'">in {{ persp.label }} ▾</button>
      <div v-if="open === 'persp'" class="absolute left-0 top-full z-50 mt-0.5 w-44 rounded-md border border-border bg-popover p-1 text-xs text-popover-foreground shadow-md">
        <button v-for="o in persp.alternatives" :key="o.value" type="button" class="flex w-full rounded px-1.5 py-0.5 text-left hover:bg-accent" @click="pick('persp', o.value, o.label)">{{ o.label }}</button>
      </div>
    </span>
    <Dots :band="resolution.band" :confidence="resolution.confidence" class="ml-1" />
    <span v-if="resolution.fake" class="rounded bg-muted px-1 text-[10px]" title="System One unreachable: fake answers">offline</span>
    <span v-if="repaired" class="text-foreground/80">noted, using <em>{{ repaired }}</em> (0 calls)</span>
  </div>
</template>
