<script setup lang="ts">
import { STATEMENTS, type Provenance } from '../kernel';
const props = defineProps<{ source?: Provenance; full?: boolean }>();
</script>

<template>
  <span v-if="!source" class="prov none" title="No provenance recorded">?</span>
  <span v-else-if="source.kind === 'said'" class="prov said" :title="source.statements.map((s) => `S${s}: ${STATEMENTS[s]}`).join('\n')">
    said <template v-if="full || true">S{{ source.statements.join(' S') }}</template>
  </span>
  <span v-else class="prov inferred" :title="source.reason">inferred</span>
  <div v-if="full && source" class="prov-detail">
    <template v-if="source.kind === 'said'">
      <blockquote v-for="s in source.statements" :key="s"><b>S{{ s }}</b> “{{ STATEMENTS[s] }}”</blockquote>
    </template>
    <p v-else class="reason">Inferred: {{ source.reason }}</p>
  </div>
</template>
