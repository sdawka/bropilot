<script setup lang="ts">
import { PanelRight, PanelRightClose, Command } from 'lucide-vue-next';
import { flags } from '@/flags';
import { chatCollapsed, paletteOpen } from '@/store/ui';
function toggle() { if (flags.chat === 'palette') paletteOpen.value = !paletteOpen.value; else chatCollapsed.value = !chatCollapsed.value; }
</script>
<template>
  <button class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" :title="flags.chat === 'palette' ? 'Open palette (⌘K)' : 'Toggle chat'" @click="toggle">
    <Command v-if="flags.chat === 'palette'" class="size-3.5" />
    <PanelRight v-else-if="chatCollapsed" class="size-3.5" />
    <PanelRightClose v-else class="size-3.5" />
  </button>
</template>
