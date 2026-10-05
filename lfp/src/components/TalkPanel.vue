<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { state, rateCall, nodeById, persist, rankOpen } from '../store';
import { kindById } from '../kernel';
import type { Effect } from '../types';
import { gapSummary } from '../ai/functions/find-gaps';
import { applyCue, type Context, type UserTurn } from '../director';
import type { OpenItem } from '../types';
import { aiFunctionById } from '../ai/registry';

const props = defineProps<{ ctx: Context | null; send: (t: UserTurn) => void; bare?: boolean }>();

const text = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const answering = ref<string | null>(null); // OpenItem id the next free-text turn should answer

const nowEl = ref<HTMLElement | null>(null);
const transcriptEl = ref<HTMLElement | null>(null);

const tierLabel: Record<OpenItem['tier'], string> = { 1: 'Blocking', 2: 'Next question', 3: 'Gap', 4: 'Open thread' };

function pointAt(nodeId: string) { applyCue({ t: 'point', nodes: [nodeId], focus: nodeId }); }

/** Non-singular kinds take several items per answer, separated by " / " (store.ts::splitItems). */
const placeholder = computed(() => {
  if (!answering.value) return 'Say something…';
  const item = props.ctx?.next?.id === answering.value ? props.ctx.next : rankOpen().find((i) => i.id === answering.value);
  const kind = item ? kindById[item.produces] : undefined;
  return kind && !kind.singular ? 'Answer… (separate items with " / ")' : 'Answer…';
});

// ── staged effects, readable (2026-09-28: edges showed as a bare "add-edge") ──
/** One effect as a line; node titles resolve from the graph or from add-node effects in the same changeset. */
function describeEffect(e: Effect, all: Effect[]): string {
  const title = (id: string) => nodeById(id)?.title
    ?? all.flatMap((x) => (x.op === 'add-node' && x.node.id === id ? [x.node.title] : []))[0]
    ?? id;
  if (e.op === 'add-node') return `add ${kindById[e.node.kind]?.label ?? e.node.kind} "${e.node.title}"`;
  if (e.op === 'update-node') return `update ${title(e.nodeId)} → "${e.patch.title ?? e.patch.description ?? ''}"`;
  if (e.op === 'remove-node') return `remove ${title(e.nodeId)}`;
  if (e.op === 'add-edge') {
    const edge = (e.edge ?? e) as unknown as { src: string; dst: string; type: string }; // tolerate a flat agent-staged edge
    return `${title(edge.src)} —${edge.type}→ ${title(edge.dst)}`;
  }
  return (e as Effect).op;
}
/** The staged list: from the live changeset when this window has it, else the context's strings (Mirror). */
const effectLines = computed<string[]>(() => {
  const st = props.ctx?.staged;
  if (!st) return [];
  const live = state.staged?.effects;
  if (live && live.length === st.ids.length && live.every((e, i) => e.id === st.ids[i])) return live.map((e) => describeEffect(e, live));
  return st.effects;
});
const BARE_OPS = /^\s*(add-edge|add-node|update-node|remove-node)(\s*[|,;+]\s*(add-edge|add-node|update-node|remove-node))*\s*\.?\s*$/;
/** A note that is only op names ("add-edge | add-edge") says nothing: show the effects instead. */
const stagedNote = computed(() => {
  const note = props.ctx?.staged?.note ?? '';
  return BARE_OPS.test(note) ? '' : note; // the list below already says it
});
// the transcript's "Staged N changes: <note>" line gets the same repair once the changeset lands
watch(() => props.ctx?.staged?.ids.join(','), () => {
  const st = props.ctx?.staged;
  if (!st || props.bare) return;
  const last = [...state.transcript].reverse().find((m) => m.who === 'agent' && m.text.startsWith('Staged '));
  if (!last) return;
  const m = last.text.match(/^(Staged (\d+) changes?: )(.*)$/s);
  if (m && Number(m[2]) === st.count && BARE_OPS.test(m[3])) last.text = m[1] + effectLines.value.join('; ');
});

// ── progress chip (Q answered/total · gaps · skipped) ──
const progress = computed(() => (props.bare ? null : gapSummary()));
function revealNow() {
  const el = nowEl.value; if (!el) return;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// ── transcript autoscroll: only when the reader is already near the bottom ──
watch(() => [state.transcript.length, state.transcript.at(-1)?.text], () => {
  const el = transcriptEl.value; if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  if (nearBottom) nextTick(() => { el.scrollTop = el.scrollHeight; });
});

/** Options stack one per line when any is long (2026-09-28: long options crowded the strip). */
const stackOptions = (opts?: string[]) => !!opts?.some((o) => o.length > 28);

function answerIt(item: OpenItem) {
  answering.value = item.id;
  nextTick(() => inputEl.value?.focus());
}
function skip(item: OpenItem) {
  const f = state.followups.find((f) => f.id === item.id);
  if (f) { f.deferred = true; persist(); }
}

// ── suspect strip: resolve a node title back to an id, then revalidate it ───
function revalidateByTitle(title: string) {
  const n = state.graph.nodes.find((n) => n.title === title);
  if (n) applyCue({ t: 'revalidate', nodeId: n.id });
}

// ── outcome tracking (S128-131): what the user did with the staged changeset's AI call ──
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}
const editedOriginals = ref(new Map<number, string>()); // idx -> description text before the user's edit
const editingIdx = ref<number | null>(null);
const editText = ref('');
function startEdit(i: number, current: string) {
  if (props.bare) return;
  if (!editedOriginals.value.has(i)) editedOriginals.value.set(i, current);
  editingIdx.value = i; editText.value = current;
}
function finishEdit(i: number) {
  const eff = state.staged?.effects[i];
  editingIdx.value = null;
  const val = editText.value.trim();
  if (!eff || !val) return;
  if (eff.op === 'add-node') eff.node.title = val;
  else if (eff.op === 'update-node') eff.patch.title = val;
}
watch(() => props.ctx?.staged?.ids.join(','), () => { editedOriginals.value = new Map(); });

function recordOutcome(outcome: 'approved' | 'discarded') {
  const call = stagedCall.value ? state.aiCalls.find((c) => c.id === stagedCall.value!.id) : null;
  if (!call) return;
  const all = state.staged?.effects ?? [];
  const describe = (e: Effect) => describeEffect(e, all);
  const changed = [...editedOriginals.value.entries()].filter(([i, before]) => state.staged && describe(state.staged.effects[i]) !== before);
  if (outcome === 'approved' && changed.length) {
    const dist = Math.max(...changed.map(([i, before]) => {
      const after = describe(state.staged!.effects[i]);
      return Math.round((levenshtein(before, after) / Math.max(before.length, after.length, 1)) * 100);
    }));
    call.outcome = { state: 'edited', editDistance: dist, at: Date.now() };
  } else {
    call.outcome = { state: outcome, editDistance: 0, at: Date.now() };
  }
  persist();
}
function approveStaged() { recordOutcome('approved'); control('approve'); nextTick(revealNow); }
/** Approve, then bring the next Now item up (and open "Answer it" for a template question). */
const advancing = ref(false);
function approveAndNext() { advancing.value = true; approveStaged(); setTimeout(() => { advancing.value = false; }, 3000); }
watch(() => [props.ctx?.staged?.ids.join(',') ?? '', props.ctx?.next?.id ?? ''], () => {
  if (!advancing.value || props.ctx?.staged) return;
  advancing.value = false;
  nextTick(() => {
    revealNow();
    const next = props.ctx?.next;
    if (next && next.source === 'template' && !next.options?.length) answerIt(next);
  });
});
function discardChangeset() { recordOutcome('discarded'); control('discard'); }

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
// Placed after stagedCall's declaration: watch() reads its source synchronously during setup.
watch(() => stagedCall.value?.id ?? null, (id, prevId) => {
  if (prevId && id !== prevId) {
    const prev = state.aiCalls.find((c) => c.id === prevId);
    if (prev && !prev.outcome) { prev.outcome = { state: 'ignored', at: Date.now() }; persist(); }
  }
});
const metaFor = (fn: string) => aiFunctionById[fn];
function rate(callId: string, value: string) { rateCall(callId, value); }

function sendText() {
  const t = text.value.trim();
  if (!t) return;
  props.send(answering.value ? { text: t, forItem: answering.value } : { text: t });
  text.value = '';
  answering.value = null;
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
      <button v-if="progress" class="progress" data-testid="talk-progress" title="Template questions answered · open gap groups · skipped groups — click to show the Now strip" @click="revealNow">
        Q {{ progress.questionsAnswered }}/{{ progress.questionsTotal }} · {{ progress.groups }} gap{{ progress.groups === 1 ? '' : 's' }}<template v-if="progress.skipped"> · {{ progress.skipped }} skipped</template><template v-if="progress.followups"> · {{ progress.followups }} follow-up{{ progress.followups === 1 ? '' : 's' }}</template>
      </button>
      <button class="close" v-if="!bare" @click="close">×</button>
    </div>

    <template v-if="!ctx">
      <p class="small empty">waiting for the main screen…</p>
    </template>

    <template v-else>
      <div class="ask card" data-testid="talk-utterance" v-if="ctx.ask">
        <p>{{ ctx.ask.text }}</p>
        <div class="options" :class="{ stack: stackOptions(ctx.ask.options) }" v-if="ctx.ask.options?.length">
          <button v-for="o in ctx.ask.options" :key="o" class="primary" @click="choose(o, ctx.ask!.id)">{{ o }}</button>
        </div>
      </div>
      <div class="say card" data-testid="talk-utterance" v-else-if="ctx.say">
        <p>{{ ctx.say.text }}</p>
      </div>

      <div class="feedback" data-testid="talk-feedback" v-if="utteranceCall">
        <span class="small tracking" data-testid="talk-tracking">{{ utteranceCall.fn }} · {{ utteranceCall.version }} · {{ utteranceCall.runtime }}</span>
        <span class="small rated" v-if="utteranceCall.rating">· {{ metaFor(utteranceCall.fn)?.feedback.find((f) => f.value === utteranceCall!.rating!.value)?.label ?? utteranceCall.rating.value }}</span>
        <span class="rate" v-else>
          <span class="small">rate:</span>
          <button v-for="f in metaFor(utteranceCall.fn)?.feedback ?? []" :key="f.value" class="link" :data-testid="`talk-feedback-${f.value}`" @click="rate(utteranceCall!.id, f.value)">{{ f.label }}</button>
        </span>
      </div>

      <p class="small pointing" v-if="ctx.pointing.length">pointing at: {{ ctx.pointing.join(', ') }}</p>

      <div class="suspect card" data-testid="talk-suspect" v-if="ctx.suspect.edges > 0">
        <p class="small">{{ ctx.suspect.edges }} suspect link{{ ctx.suspect.edges === 1 ? '' : 's' }} after an edit</p>
        <div class="suspect-row" v-for="title in ctx.suspect.nodes" :key="title">
          <span class="small">{{ title }}</span>
          <button v-if="!bare" data-testid="talk-revalidate" @click="revalidateByTitle(title)">Revalidate</button>
        </div>
      </div>

      <div class="now" ref="nowEl" data-testid="talk-now">
        <template v-if="ctx.staged">
          <p class="small" data-testid="talk-staged-note">{{ ctx.staged.count }} change{{ ctx.staged.count === 1 ? '' : 's' }} staged<template v-if="stagedNote"> — {{ stagedNote }}</template></p>
          <ul class="effects" data-testid="talk-staged-effects">
            <li v-for="(e, i) in effectLines" :key="i" class="small">
              <input v-if="editingIdx === i" v-model="editText" class="effect-edit" @keyup.enter="finishEdit(i)" @blur="finishEdit(i)" />
              <span v-else @dblclick="startEdit(i, e)">{{ e }}</span>
            </li>
          </ul>
          <div class="feedback" data-testid="talk-feedback" v-if="stagedCall">
            <span class="small tracking" data-testid="talk-tracking">{{ stagedCall.fn }} · {{ stagedCall.version }} · {{ stagedCall.runtime }}</span>
            <span class="small rated" v-if="stagedCall.rating">· {{ metaFor(stagedCall.fn)?.feedback.find((f) => f.value === stagedCall!.rating!.value)?.label ?? stagedCall.rating.value }}</span>
            <span class="rate" v-else>
              <span class="small">rate:</span>
              <button v-for="f in metaFor(stagedCall.fn)?.feedback ?? []" :key="f.value" class="link" :data-testid="`talk-feedback-${f.value}`" @click="rate(stagedCall!.id, f.value)">{{ f.label }}</button>
            </span>
          </div>
          <div class="row">
            <button class="primary" data-testid="talk-approve" @click="approveStaged">Approve</button>
            <button v-if="!bare" class="primary" data-testid="talk-approve-next" @click="approveAndNext">Approve &amp; next</button>
            <button data-testid="talk-discard" @click="discardChangeset">Discard</button>
          </div>
        </template>
        <template v-else-if="ctx.next">
          <div class="talk-next" data-testid="talk-next">
            <div class="row">
              <span class="tag" data-testid="talk-next-tier">{{ tierLabel[ctx.next.tier] }}</span>
              <span class="tag source">{{ ctx.next.source }}</span>
              <span class="tag" data-testid="talk-next-covers" v-if="ctx.next.covers">answers {{ ctx.next.covers }} gaps</span>
            </div>
            <p class="small">{{ ctx.next.prompt }}</p>
            <div class="chips" v-if="ctx.next.subjects.length">
              <button v-for="sid in ctx.next.subjects" :key="sid" class="tag chip" :data-node-id="sid" @click="pointAt(sid)">{{ nodeById(sid)?.title ?? sid }}</button>
            </div>
            <div class="row options" :class="{ stack: stackOptions(ctx.next.options) }" v-if="ctx.next.options?.length">
              <button v-for="o in ctx.next.options" :key="o" data-testid="talk-next-option" @click="props.send({ choice: o, forAsk: ctx.next!.id })">{{ o }}</button>
              <button v-if="ctx.next.source !== 'template'" class="ghost" data-testid="talk-next-skip" @click="skip(ctx.next)">Skip</button>
            </div>
            <div class="row" v-else-if="!bare">
              <button class="primary" data-testid="talk-answer-it" @click="answerIt(ctx.next)">Answer it</button>
              <button @click="skip(ctx.next)">Skip</button>
              <button v-if="ctx.next.covers" data-testid="talk-consolidate" @click="props.send({ text: 'consolidate' })">Ask as one question</button>
            </div>
          </div>
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

      <div class="transcript" ref="transcriptEl" data-testid="talk-transcript" v-if="!bare">
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
      <input ref="inputEl" data-testid="talk-input" v-model="text" :placeholder="placeholder" @keyup.enter="sendText" />
      <button class="primary" data-testid="talk-send" @click="sendText">Send</button>
    </div>
  </aside>
</template>

<style scoped>
.agent-sidebar { position: fixed; right: 1rem; top: 4rem; bottom: 1rem; width: var(--side-w); z-index: 3; overflow-y: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 30px rgba(0, 0, 0, .08); padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
.agent-sidebar.bare { position: static; inset: auto; width: 100%; max-width: 560px; height: auto; background: none; border: none; box-shadow: none; padding: 0; margin: 0 auto; }
.head { display: flex; align-items: center; gap: .5rem; }
.head h2 { margin: 0; flex: 1; }
.progress { font-size: .72rem; color: var(--muted); border-radius: 999px; padding: .1rem .55rem; white-space: nowrap; }
.progress:hover { color: var(--ink); border-color: var(--ink); }
.close { border: none; font-size: 1.1rem; background: none; padding: 0 .3rem; }

.card { border: 1px solid var(--line); border-radius: 8px; padding: .6rem .8rem; }
.card p { margin: 0; }
.ask { background: #eef0fb; border-color: var(--kernel); }
.say { background: var(--bg); }
.options { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .5rem; }
.options.stack { flex-direction: column; align-items: stretch; }
.options.stack button { text-align: left; white-space: normal; }
.talk-next .options { margin-top: 0; }

.pointing { margin: 0; }

.feedback { display: flex; flex-wrap: wrap; align-items: baseline; gap: .15rem .4rem; }
.feedback .tracking { color: var(--muted); }
.feedback .rate { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: .1rem .35rem; }
button.link { border: none; background: none; padding: 0; font-size: .75rem; color: var(--muted); text-decoration: underline dotted; }
button.link:hover { color: var(--ink); }

.now.flash { animation: flash .9s ease; }
@keyframes flash { 0% { box-shadow: 0 0 0 3px var(--inferred); } 100% { box-shadow: 0 0 0 0 transparent; } }
.now { display: flex; flex-direction: column; gap: .4rem; background: #fbeee4; border-radius: 8px; padding: .5rem .7rem; }
.now p { margin: 0; }
.effects { margin: 0; padding-left: 1.1rem; }
.effects li span { cursor: text; }
.effect-edit { font: inherit; width: 100%; padding: 0 .2rem; border: 1px solid var(--line); border-radius: 4px; }
.undo { align-self: flex-start; }

.talk-next { display: flex; flex-direction: column; gap: .4rem; }
.talk-next .tag.source { text-transform: capitalize; }
.suspect { background: #fdf3f3; border-color: #e0a0a0; display: flex; flex-direction: column; gap: .3rem; }
.suspect-row { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }

.tour { display: flex; flex-direction: column; gap: .35rem; }
.row { display: flex; flex-wrap: wrap; gap: .4rem; }

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
@media (max-width: 640px) {
  .agent-sidebar:not(.bare) { z-index: 6; left: .5rem; right: .5rem; width: auto; top: .5rem; bottom: .5rem; padding: .7rem; }
}
</style>
