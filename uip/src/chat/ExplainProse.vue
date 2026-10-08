<script setup lang="ts">
import type { Part } from './engine';
import NodeChip from './NodeChip.vue';
defineProps<{ parts: Part[] }>();
</script>
<template>
  <p class="text-sm leading-relaxed"><template v-for="(p, i) in parts" :key="i"><NodeChip v-if="typeof p !== 'string'" :id="p.id" /><span v-else>{{ p }}</span></template></p>
</template>
