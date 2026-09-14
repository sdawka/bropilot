<script setup lang="ts">
import { ref, computed } from 'vue';
import { state, rateCall } from '../store';
import type { Context, UserTurn } from '../director';
import { aiFunctionById } from '../ai/registry';

const props = defineProps<{ ctx: Context | null; send: (t: UserTurn) => void; bare?: boolean }>();

const text = ref('');

/** The AI call that produced the current utterance (say/ask), if any (S128–S131). */
const utteranceCall = computed(() => {
  if (props.bare || !props.ctx) return null;
  const id = props.ctx.say?.id ?? props.ctx.ask?.id;
  if (!id) return null;
  return state.aiCalls.find((c) => c.cueIds.includes(id)) ?? null;
});
/** The AI call that staged the current changeset, if any. */
const stagedCall = computed(() => {
  if (props.bare || !props.ctx?.staged) return null;
  const ids = props.ctx.staged.ids;
  if (!ids.length) return null;
  return state.aiCalls.find((c) => ids.some((id) => c.cueIds.includes(id))) ?? null;
});
const metaFor = (fn: string) => aiFunctionById[fn];
function rate(callId: string, value: string) { rateCall(callId, value); }

function sendText() {
  const t = text.value.trim();
  if (!t) return;
  props.send({ text: t });
  text.value = '';
}
function choose(option: string, forAsk: string) { props.send({ choice: option, forAsk }); }
function pickTopic(id: string) { props.send({ topic: id }); }
function control(c: 'next' | 'back' | 'stop' | 'approve' | 'discard') { props.send({ control: c }); }
function undo() { props.send({ control: 'undo' }); }
function close() { state.panelOpen = false; }
</script>

<template>
  <aside class="agent-sidebar" :class="{ bare }" data-testid="talk-panel" v-if="bare || state.panelOpen">
    <div class="head">
      <h2>🪞 Talk</h2>
      <button class="close" v-if="!bare" @click="close">×</button>
    </div>

    <template v-if="!ctx">
      <p class="small empty">waiting for the main screen…</p>
    </template>

    <template v-else>
      <div class="ask card" data-testid="talk-utterance" v-if="ctx.ask">
        <p>{{ ctx.ask.text }}</p>
        <div class="options" v-if="ctx.ask.options?.length">
          <button v-for="o in ctx.ask.options" :key="o" class="primary" @click="choose(o, ctx.ask!.id)">{{ o }}</button>
        </div>
      </div>
      <div class="say card" data-testid="talk-utterance" v-else-if="ctx.say">
        <p>{{ ctx.say.text }}</p>
      </div>

      <div class="feedback" data-testid="talk-feedback" v-if="utteranceCall">
        <p class="small tracking" data-testid="talk-tracking">{{ utteranceCall.fn }} · {{ utteranceCall.version }} · {{ utteranceCall.runtime }}</p>
        <p class="small" v-if="utteranceCall.rating">{{ metaFor(utteranceCall.fn)?.feedback.find((f) => f.value === utteranceCall!.rating!.value)?.label ?? utteranceCall.rating.value }}</p>
        <div class="row" v-else>
          <button v-for="f in metaFor(utteranceCall.fn)?.feedback ?? []" :key="f.value" :data-testid="`talk-feedback-${f.value}`" @click="rate(utteranceCall!.id, f.value)">{{ f.label }}</button>
        </div>
      </div>

      <p class="small pointing" v-if="ctx.pointing.length">pointing at: {{ ctx.pointing.join(', ') }}</p>

      <div class="now" data-testid="talk-now">
        <template v-if="ctx.staged">
          <p class="small">{{ ctx.staged.count }} change{{ ctx.staged.count === 1 ? '' : 's' }} staged — {{ ctx.staged.note }}</p>
          <ul class="effects"><li v-for="(e, i) in ctx.staged.effects" :key="i" class="small">{{ e }}</li></ul>
          <div class="feedback" data-testid="talk-feedback" v-if="stagedCall">
            <p class="small tracking" data-testid="talk-tracking">{{ stagedCall.fn }} · {{ stagedCall.version }} · {{ stagedCall.runtime }}</p>
            <p class="small" v-if="stagedCall.rating">{{ metaFor(stagedCall.fn)?.feedback.find((f) => f.value === stagedCall!.rating!.value)?.label ?? stagedCall.rating.value }}</p>
            <div class="row" v-else>
              <button v-for="f in metaFor(stagedCall.fn)?.feedback ?? []" :key="f.value" :data-testid="`talk-feedback-${f.value}`" @click="rate(stagedCall!.id, f.value)">{{ f.label }}</button>
            </div>
          </div>
          <div class="row">
            <button class="primary" data-testid="talk-approve" @click="control('approve')">Approve</button>
            <button data-testid="talk-discard" @click="control('discard')">Discard</button>
          </div>
        </template>
        <template v-else-if="ctx.next">
          <p class="small">{{ ctx.next.prompt }} — type your answer below</p>
        </template>
        <template v-else-if="ctx.gaps.length">
          <p class="small">{{ ctx.gaps[0] }}</p>
        </template>
        <button class="undo" data-testid="talk-undo" @click="undo">Undo</button>
      </div>

      <div class="tour" v-if="ctx.tour">
        <span class="small">step {{ ctx.tour.i + 1 }} / {{ ctx.tour.n }}</span>
        <div class="row">
          <button @click="control('back')">Back</button>
          <button @click="control('next')">Next</button>
          <button @click="control('stop')">Stop</button>
        </div>
      </div>

      <div class="transcript" v-if="!bare">
        <p v-for="(m, i) in state.transcript" :key="i" class="msg" :class="m.who">
          <span class="who small">{{ m.who === 'agent' ? '🪞' : 'you' }}</span>
          <span>{{ m.text }}</span>
        </p>
        <p v-if="!state.transcript.length" class="small empty">No conversation yet.</p>
      </div>

      <div class="chips" v-if="ctx.topics.length">
        <button v-for="t in ctx.topics" :key="t.id" class="tag chip" @click="pickTopic(t.id)">{{ t.label }}</button>
      </div>
    </template>

    <div class="composer">
      <input data-testid="talk-input" v-model="text" placeholder="Say something…" @keyup.enter="sendText" />
      <button class="primary" data-testid="talk-send" @click="sendText">Send</button>
    </div>
  </aside>
</template>

<style scoped>
.agent-sidebar { position: fixed; right: 1rem; top: 4rem; bottom: 1rem; width: 400px; z-index: 3; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 30px rgba(0, 0, 0, .08); padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
.agent-sidebar.bare { position: static; inset: auto; width: 100%; max-width: 560px; height: auto; background: none; border: none; box-shadow: none; padding: 0; margin: 0 auto; }
.head { display: flex; align-items: center; gap: .5rem; }
.head h2 { margin: 0; flex: 1; }
.close { border: none; font-size: 1.1rem; background: none; padding: 0 .3rem; }

.card { border: 1px solid var(--line); border-radius: 8px; padding: .6rem .8rem; }
.card p { margin: 0; }
.ask { background: #eef0fb; border-color: var(--kernel); }
.say { background: var(--bg); }
.options { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }

.pointing { margin: 0; }

.feedback { display: flex; flex-direction: column; gap: .3rem; }
.feedback .tracking { color: var(--muted); }
.feedback .row { flex-wrap: wrap; }

.now { display: flex; flex-direction: column; gap: .4rem; background: #fbeee4; border-radius: 8px; padding: .5rem .7rem; }
.now p { margin: 0; }
.effects { margin: 0; padding-left: 1.1rem; }
.undo { align-self: flex-start; }

.tour { display: flex; flex-direction: column; gap: .35rem; }
.row { display: flex; gap: .4rem; }

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
