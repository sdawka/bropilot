<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { QUESTIONS, kindById, SPACES } from '../kernel';
import { state, isUnlocked, committedAnswerFor, nextQuestion, answer, commit, discardStaged, undo, nodeById } from '../store';
import Prov from './Prov.vue';

const activeId = ref<string | null>(null);
const text = ref('');
const active = computed(() => QUESTIONS.find((q) => q.id === (activeId.value ?? nextQuestion.value?.id)) ?? null);
watch(active, () => (text.value = ''));

const accepted = ref(new Set<string>());
watch(() => state.staged, (cs) => { accepted.value = new Set(cs?.effects.map((e) => e.id) ?? []); }, { immediate: true });
const toggle = (id: string) => { const s = new Set(accepted.value); s.has(id) ? s.delete(id) : s.add(id); accepted.value = s; };

const submit = () => { if (active.value && text.value.trim()) answer(active.value.id, text.value); };
const doCommit = () => { const r = commit(accepted.value); lastResult.value = r ? `Committed ${r.applied} effects${r.skipped ? `, ${r.skipped} edges skipped` : ''}.` : ''; };
const lastResult = ref('');
const stateOf = (qid: string) => (committedAnswerFor(qid) ? 'answered' : isUnlocked(qid) ? 'unlocked' : 'locked');
const hue = (space: string) => SPACES.find((s) => s.id === space)?.hue;
const describe = (e: any) => {
  if (e.op === 'add-node') return `add ${kindById[e.node.kind]?.label ?? e.node.kind} “${e.node.title}”`;
  if (e.op === 'update-node') return `update ${nodeById(e.nodeId)?.title ?? e.nodeId} → “${e.patch.title}”`;
  if (e.op === 'remove-node') return `remove ${e.nodeId}`;
  if (e.op === 'add-edge') return `edge ${nodeById(e.edge.src)?.title ?? e.edge.src} —${e.edge.type}→ ${e.edge.dst}`;
  return e.op;
};
</script>

<template>
  <div class="path">
    <aside class="questions">
      <h2>Path</h2>
      <p class="small">Locked questions unlock when everything before them has a committed answer (inv-unlock). Click any unlocked one to jump.</p>
      <button v-for="q in QUESTIONS" :key="q.id" class="q" :class="[stateOf(q.id), { active: active?.id === q.id }]" :disabled="stateOf(q.id) === 'locked'" @click="activeId = q.id" :style="{ '--hue': hue(q.space) }">
        <span class="dot"></span>
        <span class="q-text">{{ q.prompt }}</span>
        <span class="q-state">{{ stateOf(q.id) }}</span>
      </button>
    </aside>

    <main class="answer">
      <template v-if="active">
        <div class="kind-line" :style="{ '--hue': hue(active.space) }">{{ active.space }} · produces <b>{{ kindById[active.produces].label }}</b> · <Prov :source="active.source" /></div>
        <h2>{{ active.prompt }}</h2>
        <p class="small">{{ active.help }}<span v-if="committedAnswerFor(active.id)"> Already answered; answering again stages new nodes (re-answer, Q3).</span></p>
        <textarea v-model="text" rows="6" :placeholder="kindById[active.produces].singular ? 'One line' : 'One per line'"></textarea>
        <div class="row"><button class="primary" @click="submit" :disabled="!text.trim() || !!state.staged">Stage effects</button><span class="small" v-if="state.staged">Review the changeset first.</span></div>
      </template>
      <p v-else class="small">Every kernel question has a committed answer. Add questions in <code>kernel.ts</code> or re-answer one on the left.</p>

      <section v-if="state.staged" class="changeset">
        <h3>Review &amp; commit <span class="small">— {{ accepted.size }} of {{ state.staged.effects.length }} effects accepted</span></h3>
        <ul v-if="state.staged.warnings.length" class="warnings"><li v-for="w in state.staged.warnings" :key="w">{{ w }}</li></ul>
        <label v-for="e in state.staged.effects" :key="e.id" class="effect"><input type="checkbox" :checked="accepted.has(e.id)" @change="toggle(e.id)" /> <code>{{ e.op }}</code> {{ describe(e) }}</label>
        <div class="row">
          <button class="primary" @click="doCommit" :disabled="!accepted.size">Commit {{ accepted.size }}</button>
          <button @click="discardStaged">Discard</button>
        </div>
      </section>

      <section class="history">
        <h3>Commits <span class="small">{{ state.commits.length }}</span> <button v-if="state.commits.length" @click="undo">Undo last</button></h3>
        <p v-if="lastResult" class="small">{{ lastResult }}</p>
        <ol><li v-for="c in [...state.commits].reverse()" :key="c.id"><span class="small">{{ new Date(c.at).toLocaleTimeString() }}</span> · {{ c.effects.length }} effects</li></ol>
      </section>
    </main>
  </div>
</template>
