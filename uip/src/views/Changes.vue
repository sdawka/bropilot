<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useGraph } from '@/store/graph';
import ChangesetCard from '@/agents/ChangesetCard.vue';

const g = useGraph();
const route = useRoute();
watch(() => route.params.project as string, (id) => { if (id) void g.ensureProject(id); }, { immediate: true });
const focusId = computed(() => (route.params.changesetId as string) || null);
const open = computed(() => g.openChangesets.value.filter((c) => !focusId.value || c.id === focusId.value));
const closed = computed(() => g.allChangesets().filter((c) => !g.openChangesets.value.includes(c) && (!focusId.value || c.id === focusId.value)));
</script>
<template>
  <div class="scroll-thin h-full overflow-y-auto">
    <div class="mx-auto max-w-[760px] px-8 py-6">
      <div class="mb-4 flex items-baseline gap-2">
        <h1 class="text-[17px] font-semibold tracking-tight">Changes</h1>
        <span class="text-[12px] text-muted-foreground">{{ g.openChangesets.value.length }} open · agents never write directly; every change is a changeset you review</span>
        <RouterLink v-if="focusId" :to="`/p/${route.params.project}/changes`" class="ml-auto text-[12px] text-muted-foreground hover:text-foreground">all changes</RouterLink>
      </div>
      <div v-if="!g.ready.value" class="text-[12px] text-muted-foreground">Loading…</div>
      <div v-else-if="!open.length && !closed.length" class="rounded-md border border-dashed p-6 text-center text-[12px] text-muted-foreground">No changesets for this project.</div>
      <div class="space-y-3">
        <ChangesetCard v-for="c in open" :key="c.id" :changeset="c" />
      </div>
      <template v-if="closed.length">
        <div class="mb-2 mt-6 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Closed</div>
        <div class="space-y-3 opacity-80"><ChangesetCard v-for="c in closed" :key="c.id" :changeset="c" /></div>
      </template>
    </div>
  </div>
</template>
