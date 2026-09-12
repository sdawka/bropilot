<script setup lang="ts">
import { ref, computed } from 'vue';
import { state, nodeById } from '../store';
import { relayHost } from '../bus';
import { handleUser, topics, startTopic } from '../directors';

defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();

const text = ref('');
const transport = computed(() => relayHost() || 'same machine');
const pointing = computed(() =>
  [...(state.highlight.focus ? [state.highlight.focus] : []), ...state.highlight.nodes]
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((id) => nodeById(id)?.title ?? id),
);

function choose(option: string, forAsk: string) {
  handleUser({ choice: option, forAsk });
}
function control(c: 'next' | 'back' | 'stop' | 'approve' | 'discard') {
  handleUser({ control: c });
}
function pickTopic(id: string) {
  startTopic(id);
}
function sendText() {
  const t = text.value.trim();
  if (!t) return;
  handleUser({ text: t });
  text.value = '';
}
</script>

<template>
  <aside class="agent-sidebar" v-if="open">
    <div class="head">
      <h2>🪞 Agent</h2>
      <span class="small transport">{{ transport }}</span>
      <button class="close" @click="$emit('close')">×</button>
    </div>

    <div class="ask card" v-if="state.ask">
      <p>{{ state.ask.text }}</p>
      <div class="options" v-if="state.ask.options?.length">
        <button v-for="o in state.ask.options" :key="o" class="primary" @click="choose(o, state.ask!.id)">{{ o }}</button>
      </div>
    </div>
    <div class="say card" v-else-if="state.say">
      <p>{{ state.say.text }}</p>
    </div>

    <p class="small pointing" v-if="pointing.length">pointing at: {{ pointing.join(', ') }}</p>

    <div class="tour" v-if="state.tour">
      <span class="small">step {{ state.tour.i + 1 }} / {{ state.tour.steps.length }}</span>
      <div class="row">
        <button @click="control('back')">Back</button>
        <button @click="control('next')">Next</button>
        <button @click="control('stop')">Stop</button>
      </div>
    </div>

    <div class="staged" v-if="state.staged">
      <p class="small">{{ state.staged.effects.length }} change{{ state.staged.effects.length === 1 ? '' : 's' }} staged — {{ state.staged.warnings[0] ?? '' }}</p>
      <div class="row">
        <button class="primary" @click="control('approve')">Approve</button>
        <button @click="control('discard')">Discard</button>
      </div>
    </div>

    <div class="chips">
      <button v-for="t in topics()" :key="t.id" class="tag chip" @click="pickTopic(t.id)">{{ t.label }}</button>
    </div>

    <div class="transcript">
      <p v-for="(m, i) in state.transcript" :key="i" class="msg" :class="m.who">
        <span class="who small">{{ m.who === 'agent' ? '🪞' : 'you' }}</span>
        <span>{{ m.text }}</span>
      </p>
      <p v-if="!state.transcript.length" class="small empty">No conversation yet.</p>
    </div>

    <div class="composer">
      <input v-model="text" placeholder="Say something…" @keyup.enter="sendText" />
      <button class="primary" @click="sendText">Send</button>
    </div>
  </aside>
</template>

<style scoped>
.agent-sidebar { position: fixed; right: 1rem; top: 4rem; bottom: 1rem; width: 400px; z-index: 3; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 30px rgba(0, 0, 0, .08); padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
.head { display: flex; align-items: center; gap: .5rem; }
.head h2 { margin: 0; flex: 1; }
.transport { white-space: nowrap; }
.close { border: none; font-size: 1.1rem; background: none; padding: 0 .3rem; }

.card { border: 1px solid var(--line); border-radius: 8px; padding: .6rem .8rem; }
.card p { margin: 0; }
.ask { background: #eef0fb; border-color: var(--kernel); }
.say { background: var(--bg); }
.options { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }

.pointing { margin: 0; }

.tour { display: flex; flex-direction: column; gap: .35rem; }
.row { display: flex; gap: .4rem; }

.staged { background: #fbeee4; border-radius: 8px; padding: .5rem .7rem; display: flex; flex-direction: column; gap: .4rem; }
.staged p { margin: 0; }

.chips { display: flex; flex-wrap: wrap; gap: .35rem; }
.chip { cursor: pointer; }

.transcript { flex: 1; min-height: 4rem; overflow-y: auto; display: flex; flex-direction: column; gap: .4rem; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: .5rem 0; }
.msg { margin: 0; display: flex; gap: .4rem; align-items: baseline; }
.msg.agent { color: var(--ink); }
.msg.user { color: var(--muted); justify-content: flex-end; text-align: right; flex-direction: row-reverse; }
.who { width: 1.4rem; flex: none; }
.empty { text-align: center; margin: auto; }

.composer { display: flex; gap: .4rem; }
.composer input { flex: 1; font: inherit; padding: .35rem .5rem; border: 1px solid var(--line); border-radius: 6px; }
</style>
