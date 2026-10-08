<script setup lang="ts">
import ProjectSwitcher from './ProjectSwitcher.vue';
import PerspectiveTabs from './PerspectiveTabs.vue';
import CoverageChip from './CoverageChip.vue';
import ChangesButton from './ChangesButton.vue';
import FlagsPopover from './FlagsPopover.vue';
import ThemeToggle from './ThemeToggle.vue';
import ChatToggle from './ChatToggle.vue';
</script>
<template>
  <header class="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-3">
    <ProjectSwitcher />
    <span class="h-4 w-px bg-border" />
    <PerspectiveTabs />
    <CoverageChip class="ml-1" />
    <div class="flex-1" />
    <ChangesButton />
    <span class="h-4 w-px bg-border" />
    <FlagsPopover />
    <ThemeToggle />
    <ChatToggle />
  </header>
</template>
