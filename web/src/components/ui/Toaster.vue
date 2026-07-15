<script setup lang="ts">
import { toasts, dismiss } from '../../lib/toast';

function runAction(t: (typeof toasts)[number]) {
  t.action?.handler();
  dismiss(t.id);
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2">
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto flex items-center gap-2 rounded-xl glass-strong border hairline px-4 py-2 text-sm text-ink-100 shadow-lg"
      >
        <span>{{ t.message }}</span>
        <button v-if="t.action" class="btn btn-ghost px-2 py-0.5 text-xs text-accent" @click="runAction(t)">
          {{ t.action.label }}
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
