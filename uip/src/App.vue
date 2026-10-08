<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { flags } from './flags';
import { chatCollapsed, paletteOpen } from './store/ui';
import TopBar from './components/shell/TopBar.vue';
import ChatSidebar from './chat/ChatSidebar.vue';
import ChatPalette from './chat/ChatPalette.vue';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { theme } from './store/ui';

const route = useRoute();
const inProject = computed(() => !!route.params.project);
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-full flex-col overflow-hidden">
      <TopBar v-if="inProject" />
      <div class="flex min-h-0 flex-1">
        <main class="min-w-0 flex-1 overflow-hidden">
          <RouterView />
        </main>
        <div
          v-if="inProject && flags.chat === 'sidebar'"
          class="hidden shrink-0 border-l bg-card transition-[width] duration-200 md:block"
          :style="{ width: chatCollapsed ? '44px' : '380px' }"
        >
          <ChatSidebar :collapsed="chatCollapsed" @update:collapsed="(v: boolean) => (chatCollapsed = v)" class="h-full" />
        </div>
      </div>
      <ChatPalette v-if="inProject && flags.chat === 'palette'" :open="paletteOpen" @update:open="(v: boolean) => (paletteOpen = v)" />
    </div>
    <Toaster :theme="theme" position="bottom-left" rich-colors close-button />
  </TooltipProvider>
</template>
