<script setup lang="ts">
import { Flag, Download, RotateCcw } from 'lucide-vue-next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { FLAGS, flags, type FlagId } from '@/flags';
import { exportCorrections } from '@/s1/corrections';
import { computed } from 'vue';

const ids = Object.keys(FLAGS) as FlagId[];
const changed = computed(() => ids.filter((k) => flags[k] !== FLAGS[k][0]).length);
const HELP: Record<FlagId, string> = {
  nav: 'traversal layout', waypoints: 'waypoint steps', persp: 'how columns are chosen', edgeGroup: 'node pane grouping',
  gaps: 'gap slots', s1: 'what a confident turn does', chat: 'chat placement', agents: 'agent entries', thread: 'thread scope',
  proposal: 'changeset review', picker: 'project picker', store: 'project data source',
  checks: 'when clef checks run', verdictStyle: 'how verdicts show', repairMode: 'how a repair lands', checkModel: 'which model checks',
};
function set(k: FlagId, v: string) { (flags as Record<string, string>)[k] = v; }
function reset() { for (const k of ids) set(k, FLAGS[k][0]); }
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-muted-foreground" title="Feature flags">
        <Flag class="size-3.5" /><span v-if="changed" class="text-[11px] tabular-nums">{{ changed }}</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-[420px] p-0">
      <div class="flex items-center justify-between border-b px-3 py-2">
        <div class="text-xs font-medium">Feature flags</div>
        <button class="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" @click="reset"><RotateCcw class="size-3" />defaults</button>
      </div>
      <div class="max-h-[70vh] space-y-1.5 overflow-auto px-3 py-2">
        <div v-for="k in ids" :key="k" class="grid grid-cols-[92px_1fr] items-center gap-2">
          <div class="leading-tight">
            <div class="font-mono text-[11px]">{{ k }}</div>
            <div class="text-[10px] text-muted-foreground">{{ HELP[k] }}</div>
          </div>
          <div class="flex flex-wrap gap-0.5 rounded-md bg-muted p-0.5">
            <button
              v-for="(v, i) in FLAGS[k]" :key="v"
              class="rounded px-1.5 py-0.5 text-[11px] transition-colors"
              :class="flags[k] === v ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              :data-flag="`${k}:${v}`"
              @click="set(k, v)"
            >{{ v }}<span v-if="i === 0" class="ml-0.5 opacity-40">·</span></button>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between border-t px-3 py-2">
        <span class="text-[10px] text-muted-foreground">saved locally · ?ff= in the URL overrides</span>
        <Button variant="outline" size="xs" @click="exportCorrections()"><Download />Export corrections (JSON)</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
