<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { publish, subscribe, type BusMessage } from '../bus';
import type { Context, UserTurn } from '../director';
import TalkPanel from './TalkPanel.vue';

// NOTE: bus.ts's `publish(m: Omit<BusMessage, 'from'>)` collapses to the keys shared
// across all BusMessage variants (Omit is not distributive over unions), so TS rejects
// any variant-specific field here. This affects every publish() caller (also seen in
// directors/index.ts). Cast at the call site rather than touch bus.ts.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
const rawPublish = (m: DistributiveOmit<BusMessage, 'from'>) => publish(m as unknown as BusMessage);

const ctx = ref<Context | null>(null);
let unsub: (() => void) | null = null;

onMounted(() => {
  rawPublish({ kind: 'hello', role: 'mirror' });
  unsub = subscribe((m) => {
    if (m.kind === 'context') ctx.value = m.ctx;
  });
});
onUnmounted(() => { unsub?.(); });

function send(turn: UserTurn) { rawPublish({ kind: 'user', turn }); }
</script>

<template>
  <div class="mirror">
    <TalkPanel bare :ctx="ctx" :send="send" />
  </div>
</template>

<style scoped>
.mirror { min-height: 100vh; background: #14130f; color: #f2efe6; display: flex; justify-content: center; padding: 1.2rem; }
</style>
