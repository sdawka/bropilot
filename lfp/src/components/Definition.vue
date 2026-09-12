<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { QUESTIONS, kindById, SPACES, KINDS } from '../kernel';
import {
  state, isUnlocked, committedAnswerFor, nextQuestion, answer, commit, discardStaged, undo, nodeById,
  followUpsOf, addFollowUp, answerFollowUp, removeFollowUp,
  type FollowUp,
} from '../store';
import Prov from './Prov.vue';

// ── selection: either a template question id or a follow-up id ──────────────
const activeId = ref<string | null>(null);
const text = ref('');

type ActiveNode = { kind: 'question'; question: (typeof QUESTIONS)[number] } | { kind: 'followup'; followup: FollowUp };

const active = computed<ActiveNode | null>(() => {
  const id = activeId.value ?? nextQuestion.value?.id ?? null;
  if (!id) return null;
  const q = QUESTIONS.find((q) => q.id === id);
  if (q) return { kind: 'question', question: q };
  const f = state.followups.find((f) => f.id === id);
  if (f) return { kind: 'followup', followup: f };
  return null;
});
watch(active, () => (text.value = ''));

const accepted = ref(new Set<string>());
watch(() => state.staged, (cs) => { accepted.value = new Set(cs?.effects.map((e) => e.id) ?? []); }, { immediate: true });
const toggle = (id: string) => { const s = new Set(accepted.value); s.has(id) ? s.delete(id) : s.add(id); accepted.value = s; };

const submit = () => {
  if (!active.value || !text.value.trim()) return;
  if (active.value.kind === 'question') answer(active.value.question.id, text.value);
  else answerFollowUp(active.value.followup.id, text.value);
};
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

// ── tree ──────────────────────────────────────────────────────────────────
const expanded = ref(new Set<string>());
const isExpanded = (id: string) => expanded.value.has(id);
const toggleExpand = (id: string) => {
  const s = new Set(expanded.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expanded.value = s;
};
const expandAncestors = (id: string) => {
  const s = new Set(expanded.value);
  let cur: string | null = id;
  const followup = () => state.followups.find((f) => f.id === cur);
  while (cur) {
    const f = followup();
    if (!f) break;
    s.add(f.parentId);
    cur = f.parentId;
  }
  expanded.value = s;
};

const selectNode = (id: string) => {
  activeId.value = id;
  expandAncestors(id);
  expanded.value.add(id); // selecting a node also opens it, so its answers and "+ sub-question / + thread" are reachable
};

// director points at a question/follow-up id via state.definitionQuestion
watch(() => state.definitionQuestion, (id) => { if (id) selectNode(id); });

// director "point" cues: a question or follow-up row may also be lit by node id
const isLit = (id: string) => state.highlight.nodes.includes(id);

const questionsBySpace = computed(() => {
  const m: Record<string, typeof QUESTIONS> = {};
  for (const q of QUESTIONS) (m[q.space] ??= []).push(q);
  return m;
});
const spacesInPath = computed(() => SPACES.filter((s) => questionsBySpace.value[s.id]?.length));

const answersFor = (questionId: string) => state.answers.filter((a) => a.questionId === questionId);
const countChildren = (id: string) => followUpsOf(id).length;

/** Flatten the visible (expanded) descendants of a node into a depth-tagged list, so we can
 *  render arbitrarily deep sub-question/thread trees without a separate recursive component. */
function visibleDescendants(parentId: string, depth = 1): { followup: FollowUp; depth: number }[] {
  const rows: { followup: FollowUp; depth: number }[] = [];
  for (const f of followUpsOf(parentId)) {
    rows.push({ followup: f, depth });
    if (isExpanded(f.id)) rows.push(...visibleDescendants(f.id, depth + 1));
  }
  return rows;
}

const newSub = (parentId: string) => {
  const p = window.prompt('Sub-question text?');
  if (p && p.trim()) { addFollowUp(parentId, p.trim(), 'sub'); expandAncestors(parentId); expanded.value = new Set([...expanded.value, parentId]); }
};
const newThread = (parentId: string) => {
  const p = window.prompt('Follow-up (thread) text?');
  if (p && p.trim()) { addFollowUp(parentId, p.trim(), 'thread'); expanded.value = new Set([...expanded.value, parentId]); }
};
const remove = (id: string) => {
  if (window.confirm('Remove this follow-up and any of its children?')) {
    removeFollowUp(id);
    if (activeId.value === id) activeId.value = null;
  }
};

// ── right pane helpers for a follow-up ───────────────────────────────────────
const breadcrumb = (f: FollowUp): string => {
  const parts: string[] = [];
  let cur: FollowUp | undefined = f;
  while (cur) {
    parts.unshift(`${cur.kind}: ${cur.prompt}`);
    const parentQ = QUESTIONS.find((q) => q.id === cur!.parentId);
    if (parentQ) { parts.unshift(parentQ.prompt); cur = undefined; break; }
    cur = state.followups.find((x) => x.id === cur!.parentId);
  }
  return parts.join(' › ');
};
const kindOptions = KINDS.map((k) => ({ id: k.id, label: k.label }));
</script>

<template>
  <div class="path definition">
    <section class="questions tree-main">
      <h2>Definition</h2>
      <p class="small note">Roots are the template and don't change. Sub-questions and threads are this project's. AI organises them later (S52, S53, S54).</p>

      <div v-for="sp in spacesInPath" :key="sp.id" class="space-group" :style="{ '--hue': sp.hue }">
        <h3 class="space-heading">{{ sp.label }}</h3>
        <div v-for="q in questionsBySpace[sp.id]" :key="q.id" class="tree-node">
          <button
            class="q"
            :class="[stateOf(q.id), { active: active?.kind === 'question' && active.question.id === q.id, lit: isLit(q.id) }]"
            :disabled="stateOf(q.id) === 'locked'"
            :style="{ '--hue': hue(q.space) }"
            @click="selectNode(q.id)"
          >
            <span class="chevron" @click.stop="toggleExpand(q.id)">{{ isExpanded(q.id) ? '▾' : '▸' }}</span>
            <span class="dot"></span>
            <span class="q-text">{{ q.prompt }}</span>
            <span class="tag">template</span>
            <span class="count" v-if="countChildren(q.id)">{{ countChildren(q.id) }}</span>
            <span class="q-state">{{ stateOf(q.id) }}</span>
          </button>

          <div v-if="isExpanded(q.id)" class="children">
            <div v-for="a in answersFor(q.id)" :key="a.id" class="answer-entry">{{ a.content }} <span class="small">— {{ new Date(a.at).toLocaleTimeString() }}</span></div>
            <div class="child-actions">
              <button class="small" @click="newSub(q.id)">+ sub-question</button>
              <button class="small" @click="newThread(q.id)">+ thread</button>
            </div>
            <div v-for="row in visibleDescendants(q.id)" :key="row.followup.id" class="followup-row" :style="{ marginLeft: (row.depth - 1) * 1.1 + 'rem' }">
              <button
                class="q followup"
                :class="[row.followup.kind, { active: active?.kind === 'followup' && active.followup.id === row.followup.id, lit: isLit(row.followup.id) }]"
                @click="selectNode(row.followup.id)"
              >
                <span class="chevron" @click.stop="toggleExpand(row.followup.id)">{{ isExpanded(row.followup.id) ? '▾' : '▸' }}</span>
                <span class="dot"></span>
                <span class="thread-icon" v-if="row.followup.kind === 'thread'">💬</span>
                <span class="q-text">{{ row.followup.prompt }}</span>
                <span class="tag" :class="row.followup.kind">{{ row.followup.kind }}</span>
                <span class="count" v-if="countChildren(row.followup.id)">{{ countChildren(row.followup.id) }}</span>
              </button>
              <button class="remove-btn small" title="Remove" @click="remove(row.followup.id)">×</button>

              <div v-if="isExpanded(row.followup.id)" class="children" :style="{ marginLeft: (row.depth - 1) * 1.1 + 'rem' }">
                <div v-for="a in answersFor(row.followup.id)" :key="a.id" class="answer-entry">{{ a.content }} <span class="small">— {{ new Date(a.at).toLocaleTimeString() }}</span></div>
                <div class="child-actions">
                  <button class="small" @click="newSub(row.followup.id)">+ sub-question</button>
                  <button class="small" @click="newThread(row.followup.id)">+ thread</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <aside class="answer side">
      <template v-if="active?.kind === 'question'">
        <div class="kind-line" :style="{ '--hue': hue(active.question.space) }">{{ active.question.space }} · produces <b>{{ kindById[active.question.produces].label }}</b> · <Prov :source="active.question.source" /></div>
        <h2>{{ active.question.prompt }}</h2>
        <p class="small">{{ active.question.help }}<span v-if="committedAnswerFor(active.question.id)"> Already answered; answering again stages new nodes (re-answer, Q3).</span></p>
        <textarea v-model="text" rows="4" :placeholder="kindById[active.question.produces].singular ? 'One line' : 'One per line'"></textarea>
        <div class="row"><button class="primary" @click="submit" :disabled="!text.trim() || !!state.staged">Stage effects</button><span class="small" v-if="state.staged">Review the changeset first.</span></div>
      </template>

      <template v-else-if="active?.kind === 'followup'">
        <div class="kind-line breadcrumb">{{ breadcrumb(active.followup) }}</div>
        <h2>{{ active.followup.prompt }} <span class="tag" :class="active.followup.kind">{{ active.followup.kind }}</span></h2>
        <p class="small">
          Produces
          <select v-model="active.followup.produces">
            <option v-for="k in kindOptions" :key="k.id" :value="k.id">{{ k.label }}</option>
          </select>
        </p>
        <textarea v-model="text" rows="4" placeholder="One per line"></textarea>
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
    </aside>
  </div>
</template>

<style scoped>
.space-group { margin-top: 1rem; border-left: 3px solid var(--hue); padding-left: .5rem; }
.space-group:first-child { margin-top: .4rem; }
.space-heading { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: .2rem; }
.tree-node { margin-bottom: .15rem; }
.chevron { width: 1rem; flex: none; text-align: center; color: var(--muted); font-size: .75rem; cursor: pointer; }
.chevron.spacer { cursor: default; }
.q .tag { margin-left: .2rem; }
.count { font-size: .68rem; color: var(--muted); background: var(--bg); border-radius: 999px; padding: 0 .35rem; }
.children { margin-left: 1.3rem; border-left: 1px dashed var(--line); padding-left: .5rem; margin-top: .1rem; margin-bottom: .3rem; }
.answer-entry { font-size: .78rem; color: var(--muted); padding: .15rem 0; }
.child-actions { display: flex; gap: .4rem; margin: .25rem 0; }
.child-actions button { font-size: .72rem; padding: .15rem .4rem; }
.note { margin-bottom: .6rem; }
.breadcrumb { font-size: .76rem; }
.followup-row { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; margin-top: .3rem; }
.followup-row .q.followup { flex: 1 1 calc(100% - 2rem); min-width: 0; }
.followup-row .children { flex-basis: 100%; }
.q.followup.thread { border-left-style: dotted; }
.thread-icon { font-size: .75rem; }
.tag.sub { color: var(--kernel); border-color: var(--kernel); }
.tag.thread { color: var(--inferred); border-color: var(--inferred); border-style: dotted; }
.remove-btn { flex: none; padding: .1rem .4rem; line-height: 1; color: var(--muted); }
.remove-btn:hover { color: var(--inferred); border-color: var(--inferred); }
.q.lit { outline: 2px solid var(--kernel); }
.path.definition { grid-template-columns: minmax(0, 1fr) 380px; } /* tree first and wide; inputs on the side (S84) */
.answer.side { position: sticky; top: 4rem; align-self: start; max-height: calc(100vh - 5rem); overflow: auto; }
.answer.side textarea { min-height: 5rem; }
.tree-main .q .q-text { font-size: .92rem; }
</style>
