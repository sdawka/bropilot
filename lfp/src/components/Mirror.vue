<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { publish, subscribe, relayHost, type BusMessage } from '../bus';
import type { Context, UserTurn } from '../director';

// NOTE: bus.ts's `publish(m: Omit<BusMessage, 'from'>)` collapses to the keys shared
// across all BusMessage variants (Omit is not distributive over unions), so TS rejects
// any variant-specific field here. This affects every publish() caller (also seen in
// directors/index.ts). Cast at the call site rather than touch bus.ts.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
const rawPublish = (m: DistributiveOmit<BusMessage, 'from'>) => publish(m as unknown as BusMessage);

const ctx = ref<Context | null>(null);
const text = ref('');
let unsub: (() => void) | null = null;

const transport = computed(() => relayHost() || 'same machine');

function send(turn: UserTurn) {
  rawPublish({ kind: 'user', turn });
}

function sendText() {
  const t = text.value.trim();
  if (!t) return;
  send({ text: t });
  text.value = '';
}

function choose(option: string, forAsk: string) {
  send({ choice: option, forAsk });
}

function control(c: 'next' | 'back' | 'stop' | 'approve' | 'discard') {
  send({ control: c });
}

function pickTopic(id: string) {
  send({ topic: id });
}

onMounted(() => {
  rawPublish({ kind: 'hello', role: 'mirror' });
  unsub = subscribe((m) => {
    if (m.kind === 'context') ctx.value = m.ctx;
  });
});
onUnmounted(() => { unsub?.(); });
</script>

<template>
  <div class="mirror">
    <div class="wrap">
      <template v-if="!ctx">
        <div class="card waiting">
          <p>waiting for the main screen…</p>
          <p class="transport">via {{ transport }}</p>
        </div>
      </template>
      <template v-else>
        <Transition name="fade" mode="out-in">
          <div class="card" :key="ctx.ask?.id ?? ctx.say?.id ?? 'idle'">
            <template v-if="ctx.ask">
              <p class="line">{{ ctx.ask.text }}</p>
              <div class="options" v-if="ctx.ask.options?.length">
                <button v-for="o in ctx.ask.options" :key="o" class="primary" @click="choose(o, ctx.ask!.id)">{{ o }}</button>
              </div>
            </template>
            <template v-else-if="ctx.say">
              <p class="line">{{ ctx.say.text }}</p>
            </template>
            <template v-else>
              <p class="line prompt">Ask me about what's on your screen, or pick a tour.</p>
            </template>
          </div>
        </Transition>

        <p class="caption" v-if="ctx.pointing.length">pointing at: {{ ctx.pointing.join(' · ') }}</p>
        <p class="caption dim">on screen: {{ ctx.view }}</p>

        <div class="tour" v-if="ctx.tour">
          <div class="dots">
            <span v-for="i in ctx.tour.n" :key="i" class="dot" :class="{ filled: i - 1 === ctx.tour.i }" />
          </div>
          <div class="tour-controls">
            <button @click="control('back')">Back</button>
            <button @click="control('next')">Next</button>
            <button @click="control('stop')">Stop</button>
          </div>
        </div>

        <div class="staged" v-if="ctx.staged">
          <p class="small">{{ ctx.staged.count }} change{{ ctx.staged.count === 1 ? '' : 's' }} staged — {{ ctx.staged.note }}</p>
          <div class="row">
            <button class="primary" @click="control('approve')">Approve</button>
            <button @click="control('discard')">Discard</button>
          </div>
        </div>

        <div class="chips" v-if="ctx.topics.length">
          <button v-for="t in ctx.topics" :key="t.id" class="chip" @click="pickTopic(t.id)">{{ t.label }}</button>
        </div>
      </template>

      <div class="composer">
        <input v-model="text" placeholder="Say something…" @keyup.enter="sendText" />
        <button class="primary" @click="sendText">Send</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mirror { min-height: 100vh; background: #14130f; color: #f2efe6; display: flex; justify-content: center; padding: 1.2rem; }
.wrap { width: 100%; max-width: 560px; display: flex; flex-direction: column; gap: .8rem; }
.card { background: #201f19; border: 1px solid #38362c; border-radius: 14px; padding: 1.4rem; min-height: 6rem; display: flex; flex-direction: column; justify-content: center; gap: .8rem; }
.card.waiting { align-items: center; text-align: center; color: #a8a394; }
.transport { font-size: .8rem; color: #7d7a6c; }
.line { font-size: 1.4rem; line-height: 1.4; margin: 0; }
.line.prompt { color: #a8a394; font-size: 1.1rem; }
.options { display: flex; flex-wrap: wrap; gap: .5rem; }
.options button.primary { background: #f2efe6; color: #14130f; border-color: #f2efe6; }
.caption { font-size: .85rem; color: #b8b3a2; margin: 0; }
.caption.dim { color: #6f6b5d; font-size: .75rem; }

.tour { display: flex; flex-direction: column; gap: .5rem; align-items: center; }
.dots { display: flex; gap: .4rem; }
.dot { width: .5rem; height: .5rem; border-radius: 50%; background: #4a4738; }
.dot.filled { background: #f2efe6; }
.tour-controls { display: flex; gap: .5rem; }
.tour-controls button { background: #201f19; color: #f2efe6; border: 1px solid #45422f; }

.staged { background: #2a2114; border: 1px solid #4a3a1f; border-radius: 10px; padding: .7rem .9rem; display: flex; flex-direction: column; gap: .5rem; }
.staged .small { margin: 0; color: #d8c9a0; }
.row { display: flex; gap: .5rem; }
.row button.primary { background: #f2efe6; color: #14130f; border-color: #f2efe6; }
.row button { background: #201f19; color: #f2efe6; border: 1px solid #45422f; }

.chips { display: flex; flex-wrap: wrap; gap: .5rem; }
.chip { background: #201f19; color: #f2efe6; border: 1px solid #45422f; border-radius: 999px; padding: .3rem .8rem; font-size: .82rem; }

.composer { display: flex; gap: .5rem; margin-top: .4rem; }
.composer input { flex: 1; background: #201f19; color: #f2efe6; border: 1px solid #45422f; border-radius: 8px; padding: .5rem .7rem; font: inherit; }
.composer button.primary { background: #f2efe6; color: #14130f; border-color: #f2efe6; }

.fade-enter-active, .fade-leave-active { transition: opacity .25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
