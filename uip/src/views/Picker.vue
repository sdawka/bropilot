<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Search, Loader2 } from 'lucide-vue-next';
import { useProjects } from '@/store/projects';
import { flags } from '@/flags';
import type { Band, ProjectSummary } from '@/types';
import { pickProject } from '@/s1/projectPick';
import FlagsPopover from '@/components/shell/FlagsPopover.vue';
import ThemeToggle from '@/components/shell/ThemeToggle.vue';
import ProjectRow from '@/components/picker/ProjectRow.vue';
import ProjectPreview from '@/components/picker/ProjectPreview.vue';
import Fingerprint from '@/components/picker/Fingerprint.vue';
import { relTime } from '@/components/picker/relTime';

const projects = useProjects();
const router = useRouter();
const q = ref('');
const sel = ref(0);
const input = ref<HTMLInputElement | null>(null);
onMounted(async () => { await projects.load(true); input.value?.focus(); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const rows = computed(() => {
  const t = q.value.toLowerCase().trim();
  const list = flags.picker === 'ask' ? projects.list : projects.list.filter((p) => !t || `${p.name} ${p.purpose} ${p.summary}`.toLowerCase().includes(t));
  return list;
});
watch(rows, () => { sel.value = Math.min(sel.value, Math.max(rows.value.length - 1, 0)); });
const current = computed<ProjectSummary | undefined>(() => (flags.picker === 'ask' && asked.value?.id ? projects.byId(asked.value.id) : rows.value[sel.value]));

function open(p: ProjectSummary | undefined, home = false) {
  if (!p) return;
  const lf = p.lastFocus;
  if (!home && lf) router.push({ path: `/p/${p.id}/${lf.persp}${lf.path.length ? '/' + lf.path.map(encodeURIComponent).join('/') : ''}` });
  else router.push(`/p/${p.id}`);
}

// picker=ask: one System One project-pick
const asked = ref<{ id: string | null; confidence: number; band: Band; fake: boolean } | null>(null);
const asking = ref(false);
async function ask() {
  if (!q.value.trim()) return;
  asking.value = true;
  try { asked.value = await pickProject(q.value, projects.list); } finally { asking.value = false; }
}
const dots = (c: number) => (c >= 0.75 ? '●●●' : c >= 0.5 ? '●●○' : '●○○');

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); sel.value = Math.min(sel.value + 1, rows.value.length - 1); asked.value = null; }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel.value = Math.max(sel.value - 1, 0); asked.value = null; }
  else if (e.key === 'Enter') {
    e.preventDefault();
    if (flags.picker === 'ask' && !asked.value) { void ask(); return; }
    open(current.value, e.shiftKey);
  } else if (e.key === 'Escape') { q.value = ''; asked.value = null; }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex h-11 shrink-0 items-center gap-3 border-b bg-card px-4">
      <span class="grid size-5 place-items-center rounded-full border text-[10px] font-semibold">◎</span>
      <span class="text-[13px] font-semibold">uip</span>
      <span class="text-[12px] text-muted-foreground">projects</span>
      <div v-if="flags.picker !== 'ask'" class="ml-6 flex max-w-[420px] flex-1 items-center gap-2 rounded-md border bg-background px-2">
        <Search class="size-3.5 text-muted-foreground" />
        <input ref="input" v-model="q" placeholder="filter projects…" class="w-full bg-transparent py-1 text-[13px] outline-none" />
      </div>
      <div class="flex-1" />
      <FlagsPopover /><ThemeToggle />
    </header>
    <div v-if="projects.error" class="border-b bg-gap/10 px-4 py-1 text-[12px] text-gap">{{ projects.error }}</div>

    <!-- fingerprint: shape bars + preview -->
    <div v-if="flags.picker === 'fingerprint'" class="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div class="scroll-thin overflow-y-auto border-r p-3" role="listbox">
        <ProjectRow v-for="(p, i) in rows" :key="p.id" :project="p" :selected="i === sel" @select="sel = i" @open="(h) => open(p, h)" />
        <div class="mt-1 flex gap-[2px] pl-[146px] font-mono text-[8px] leading-none text-muted-foreground">
          <template v-for="(l, i) in ['B', 'P', 'H', 'S', 'C', 'Pl', 'E']" :key="l"><span v-if="i === 4" class="mx-[2px] w-px" /><span class="w-[5px] text-center">{{ l }}</span></template>
        </div>
        <div v-if="!rows.length && !projects.loading" class="p-4 text-[12px] text-muted-foreground">No project matches “{{ q }}”.</div>
      </div>
      <div class="scroll-thin overflow-y-auto p-6"><ProjectPreview v-if="current" :project="current" /></div>
    </div>

    <!-- readme: repo cards -->
    <div v-else-if="flags.picker === 'readme'" class="scroll-thin min-h-0 flex-1 overflow-y-auto p-6">
      <div class="mx-auto grid max-w-[1080px] grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        <button
          v-for="(p, i) in rows" :key="p.id" :data-project="p.id"
          class="flex flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50" :class="i === sel ? 'ring-1 ring-foreground/30' : ''"
          @click="open(p)" @mouseenter="sel = i"
        >
          <div class="flex items-baseline gap-2"><span class="text-[15px] font-semibold">{{ p.name }}</span><span class="ml-auto text-[11px] text-muted-foreground">{{ relTime(p.updatedAt) }} ago</span></div>
          <div class="text-[13px]">{{ p.purpose }}</div>
          <div class="line-clamp-3 text-[12px] text-muted-foreground">{{ p.summary }}</div>
          <div class="mt-auto flex gap-3 pt-1 text-[11px] tabular-nums text-muted-foreground">
            <span>{{ p.nodeCount }} nodes</span><span>{{ p.edgeCount }} edges</span><span :class="p.openCount ? 'text-gap' : ''">{{ p.openCount }} open</span>
          </div>
        </button>
      </div>
    </div>

    <!-- ask: one big prompt, System One project-pick -->
    <div v-else class="flex min-h-0 flex-1 flex-col items-center px-6 pt-[14vh]">
      <div class="w-full max-w-[640px]">
        <div class="mb-2 text-[12px] text-muted-foreground">Which project? Describe it in your words.</div>
        <div class="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-sm">
          <Search class="size-4 text-muted-foreground" />
          <input ref="input" v-model="q" autofocus placeholder="the invoicing one… / coastal monitoring… / the one that describes itself" class="w-full bg-transparent text-[15px] outline-none" @input="asked = null" />
          <Loader2 v-if="asking" class="size-4 animate-spin text-muted-foreground" />
        </div>
        <div v-if="asked" class="fade-in mt-3 rounded-lg border bg-card p-3">
          <template v-if="current">
            <div class="flex items-center gap-3">
              <span class="text-[11px] tracking-[-1px] text-muted-foreground" :title="`${Math.round(asked.confidence * 100)}%`">{{ dots(asked.confidence) }}</span>
              <span class="text-[14px] font-semibold">{{ current.name }}</span><Fingerprint :project="current" />
              <span class="truncate text-[12px] text-muted-foreground">{{ current.purpose }}</span>
              <span v-if="asked.fake" class="ml-auto rounded border px-1 text-[10px] text-muted-foreground">offline</span>
            </div>
            <div class="mt-2 text-[12px] text-muted-foreground"><kbd class="rounded border px-1 font-mono text-[10px]">⏎</kbd> open · <kbd class="rounded border px-1 font-mono text-[10px]">⇧⏎</kbd> home<template v-if="asked.band !== 'act'"> · not sure, pick below</template></div>
          </template>
          <div v-else class="text-[12px] text-muted-foreground">No project matched. Pick one:</div>
          <div v-if="!current || asked.band !== 'act'" class="mt-2 flex flex-wrap gap-1.5">
            <button v-for="p in projects.list" :key="p.id" class="rounded-md border px-2 py-0.5 text-[12px] hover:bg-accent" @click="open(p)">{{ p.name }}</button>
          </div>
        </div>
        <div v-else class="mt-3 flex flex-wrap gap-1.5 text-[12px] text-muted-foreground">
          <span>or:</span><button v-for="p in projects.list" :key="p.id" class="rounded-md border px-2 py-0.5 hover:bg-accent hover:text-foreground" @click="open(p)">{{ p.name }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
