<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { ProjectSummary } from '@/types';
import { useProjects } from '@/store/projects';
import { GIndex, thinnestLink, type HopStat } from '@/store/traverse';
import { kindLabel, edgeLabel } from '@/ontology';
import { perspLabel } from '@/perspectives';
import { parseSegments } from '@/store/traverse';
import AtlasThumb from './AtlasThumb.vue';

const props = defineProps<{ project: ProjectSummary }>();
const projects = useProjects();
const thin = ref<HopStat | null>(null);
const ix = ref<GIndex | null>(null);
watch(() => props.project.id, async (id) => {
  thin.value = null; ix.value = null;
  try { const g = await projects.graph(id); if (id !== props.project.id) return; ix.value = new GIndex(g); thin.value = thinnestLink(ix.value); } catch {}
}, { immediate: true });
const resume = computed(() => {
  const lf = props.project.lastFocus; if (!lf) return null;
  const segs = parseSegments(lf.path);
  const last = segs[segs.length - 1];
  const n = last && ix.value?.get(last.id);
  return [perspLabel(lf.persp), n ? `${kindLabel(n.kind).toLowerCase()} ${n.title}` : null].filter(Boolean).join(' › ');
});
const thinText = computed(() => {
  const t = thin.value; if (!t) return '';
  return `${kindLabel(t.hop.from).toLowerCase()} → ${t.kinds.filter((k) => k !== t.hop.from).map((k) => kindLabel(k).toLowerCase()).join('·')} thin (${t.linked} of ${t.parents}, ${edgeLabel(t.hop.edge)})`;
});
</script>
<template>
  <div class="fade-in space-y-3" :key="project.id">
    <div>
      <h2 class="text-[17px] font-semibold tracking-tight">{{ project.name }}</h2>
      <p class="text-[13px] text-foreground/80">{{ project.purpose }}</p>
    </div>
    <p class="text-[12px] leading-relaxed text-muted-foreground">{{ project.summary }}</p>
    <AtlasThumb :project="project" />
    <div v-if="thinText" class="text-[12px]"><span class="text-gap">open:</span> {{ thinText }}</div>
    <div class="text-[12px] text-muted-foreground">{{ project.openCount }} open items · {{ project.nodeCount }} nodes · {{ project.edgeCount }} edges</div>
    <div class="flex flex-wrap gap-3 border-t pt-3 text-[12px]">
      <span><kbd class="rounded border px-1 font-mono text-[10px]">⏎</kbd> {{ resume ? `Resume › ${resume}` : 'Open' }}</span>
      <span class="text-muted-foreground"><kbd class="rounded border px-1 font-mono text-[10px]">⇧⏎</kbd> home</span>
    </div>
  </div>
</template>
