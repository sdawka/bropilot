<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next';
import { theme, toggleTheme } from '@/store/ui';
</script>
<template>
  <button class="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Toggle theme" @click="toggleTheme">
    <Moon v-if="theme === 'light'" class="size-3.5" /><Sun v-else class="size-3.5" />
  </button>
</template>
