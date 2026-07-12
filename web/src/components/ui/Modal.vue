<script setup lang="ts">
defineProps<{ title: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="animate-fade-up w-full max-w-lg overflow-hidden rounded-2xl glass-strong shadow-2xl">
      <header class="flex items-center justify-between border-b hairline px-5 py-3.5">
        <h2 class="text-base font-semibold">{{ title }}</h2>
        <button class="btn btn-ghost !px-2" @click="emit('close')">✕</button>
      </header>
      <div class="px-5 py-5">
        <slot />
      </div>
    </div>
  </div>
</template>
