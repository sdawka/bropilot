<script setup lang="ts">
import Modal from './Modal.vue';

withDefaults(
  defineProps<{
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
  }>(),
  { confirmLabel: 'Confirm', danger: false },
);
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'close'): void }>();
</script>

<template>
  <Modal :title="title" @close="emit('close')">
    <p class="text-sm text-ink-300">{{ message }}</p>
    <div class="mt-5 flex justify-end gap-2">
      <button class="btn" @click="emit('close')">Cancel</button>
      <button
        class="btn"
        :class="danger ? 'btn-danger-solid' : 'btn-primary'"
        @click="emit('confirm')"
      >{{ confirmLabel }}</button>
    </div>
  </Modal>
</template>
