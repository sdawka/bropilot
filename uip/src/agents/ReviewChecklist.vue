<script setup lang="ts">
// proposal=canvas: the card shrinks to this checklist while the effects are ghosted in the view.
import type { Changeset } from '../types';
import EffectRow from './EffectRow.vue';
defineProps<{ changeset: Changeset }>();
defineEmits<{ close: [] }>();
</script>
<template>
  <div class="rounded border border-dashed border-draft/60 p-1.5">
    <div class="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
      <span>on canvas · {{ changeset.effects.filter((e) => e.verdict !== 'rejected').length }} of {{ changeset.effects.length }} kept</span>
      <button type="button" class="hover:text-foreground" @click="$emit('close')">back to card</button>
    </div>
    <EffectRow v-for="e in changeset.effects" :key="e.id" :changeset="changeset" :effect="e" compact />
  </div>
</template>
