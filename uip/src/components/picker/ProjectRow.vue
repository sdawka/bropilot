<script setup lang="ts">
import type { ProjectSummary } from '@/types';
import Fingerprint from './Fingerprint.vue';
import { relTime } from './relTime';
import AuditScore from '@/components/checks/AuditScore.vue';
defineProps<{ project: ProjectSummary; selected: boolean }>();
const emit = defineEmits<{ select: []; open: [home: boolean] }>();
</script>
<template>
  <div
    role="option" :aria-selected="selected" :data-project="project.id"
    class="grid cursor-default grid-cols-[14px_1fr_auto] items-center gap-x-2 rounded-md px-2 py-2"
    :class="selected ? 'bg-accent' : 'hover:bg-accent/50'"
    @click="emit('select')" @dblclick="emit('open', false)"
  >
    <span class="text-[11px] text-muted-foreground">{{ selected ? '▸' : '' }}</span>
    <span class="flex min-w-0 items-center gap-3">
      <span class="w-[92px] truncate text-[13px] font-semibold">{{ project.name }}</span>
      <Fingerprint :project="project" />
      <span class="ml-2 text-[12px] tabular-nums text-muted-foreground">{{ project.nodeCount }}·{{ project.edgeCount }}</span>
      <AuditScore :project="project.id" />
    </span>
    <span class="flex items-center gap-3 text-[12px] tabular-nums">
      <span :class="project.openCount ? 'text-gap' : 'text-muted-foreground'">{{ project.openCount }} open</span>
      <span class="w-7 text-right text-muted-foreground">{{ relTime(project.updatedAt) }}</span>
    </span>
    <span />
    <span class="col-span-2 truncate text-[12px] text-muted-foreground">{{ project.purpose }}</span>
  </div>
</template>
