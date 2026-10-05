<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronDown } from 'lucide-vue-next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjects } from '@/store/projects';
import { useGraph } from '@/store/graph';
const projects = useProjects();
const g = useGraph();
const router = useRouter();
onMounted(() => projects.load());
</script>
<template>
  <DropdownMenu>
    <DropdownMenuTrigger class="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-accent">
      <span class="grid size-5 place-items-center rounded-full border text-[10px] font-semibold">◎</span>
      <span class="text-[12px] text-muted-foreground">uip</span>
      <ChevronDown class="size-3 text-muted-foreground" />
      <span class="text-[13px] font-semibold">{{ g.project.value?.name ?? g.view.value.project }}</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-64">
      <DropdownMenuLabel class="text-[11px] text-muted-foreground">Projects</DropdownMenuLabel>
      <DropdownMenuItem v-for="p in projects.list" :key="p.id" class="flex-col items-start gap-0" @select="router.push(`/p/${p.id}`)">
        <span class="text-[12px] font-medium">{{ p.name }} <span v-if="p.id === g.view.value.project" class="text-muted-foreground">· current</span></span>
        <span class="line-clamp-1 text-[11px] text-muted-foreground">{{ p.purpose }}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="router.push(`/p/${g.view.value.project}`)">Project home (atlas)</DropdownMenuItem>
      <DropdownMenuItem @select="router.push('/')">All projects…</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
