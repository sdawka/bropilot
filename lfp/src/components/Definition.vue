<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { QUESTIONS, kindById, SPACES } from '../kernel';
import { state, isUnlocked, committedAnswerFor, nextQuestion, nodeById, type FollowUp } from '../store';
import { useScreen } from '../screen';
import Prov from './Prov.vue';

// ── selection: either a template question id or a follow-up id ──────────────
const activeId = ref<string | null>(null);

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

const stateOf = (qid: string) => (committedAnswerFor(qid) ? 'answered' : isUnlocked(qid) ? 'unlocked' : 'locked');
const hue = (space: string) => SPACES.find((s) => s.id === space)?.hue;

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
  expanded.value.add(id); // selecting a node also opens it, so its answers are reachable
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

/** Follow-ups raised (not hand-added) directly under a template question, for the always-visible
 * "raised" strip — separate from the expand-gated sub-question/thread tree below it. */
const raisedUnder = (parentId: string) => state.followups.filter((f) => f.parentId === parentId && f.raisedBy);
const nodeTitle = (id: string) => nodeById(id)?.title ?? id;

const answersFor = (questionId: string) => state.answers.filter((a) => a.questionId === questionId);
const followUpsOf = (parentId: string) => state.followups.filter((f) => f.parentId === parentId);
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

// ── screen awareness: report root questions + visible follow-ups (Stage 1-V2) ──
useScreen(() => [
  ...QUESTIONS.map((q) => ({ id: q.id, kind: 'question', title: q.prompt, group: stateOf(q.id) })),
  ...QUESTIONS.filter((q) => isExpanded(q.id)).flatMap((q) => visibleDescendants(q.id)).map((row) => ({ id: row.followup.id, kind: 'followup', title: row.followup.prompt })),
]);

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
</script>

<template>
  <div class="path definition">
    <section class="questions tree-main">
      <h2>Definition</h2>
      <p class="small note">Roots are the template and don't change. Sub-questions and threads are this project's. Read-only here — answer through the Talk panel.</p>

      <div v-for="sp in spacesInPath" :key="sp.id" class="space-group" :style="{ '--hue': sp.hue }">
        <h3 class="space-heading">{{ sp.label }}</h3>
        <div v-for="q in questionsBySpace[sp.id]" :key="q.id" class="tree-node">
          <button
            class="q"
            :data-node-id="q.id"
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

          <div class="raised" v-if="raisedUnder(q.id).length">
            <div
              v-for="f in raisedUnder(q.id)"
              :key="f.id"
              class="raised-row"
              data-testid="def-raised"
              :class="{ deferred: f.deferred }"
              :data-node-id="f.id"
            >
              <span class="tag" :class="f.raisedBy!.kind">{{ f.raisedBy!.kind }}</span>
              <span class="small">{{ f.prompt }}</span>
              <span class="tag chip" v-for="sid in f.subjects ?? []" :key="sid">{{ nodeTitle(sid) }}</span>
            </div>
          </div>

          <div v-if="isExpanded(q.id)" class="children">
            <div v-for="a in answersFor(q.id)" :key="a.id" class="answer-entry">{{ a.content }} <span class="small">— {{ new Date(a.at).toLocaleTimeString() }}</span></div>
            <div v-for="row in visibleDescendants(q.id)" :key="row.followup.id" class="followup-row" :style="{ marginLeft: (row.depth - 1) * 1.1 + 'rem' }">
              <button
                class="q followup"
                :data-node-id="row.followup.id"
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

              <div v-if="isExpanded(row.followup.id)" class="children" :style="{ marginLeft: (row.depth - 1) * 1.1 + 'rem' }">
                <div v-for="a in answersFor(row.followup.id)" :key="a.id" class="answer-entry">{{ a.content }} <span class="small">— {{ new Date(a.at).toLocaleTimeString() }}</span></div>
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
        <p class="small">{{ active.question.help }}</p>
        <p class="small">state: <b>{{ stateOf(active.question.id) }}</b></p>
        <div class="committed-answers" v-if="answersFor(active.question.id).length">
          <h3>Committed answers</h3>
          <div v-for="a in answersFor(active.question.id)" :key="a.id" class="answer-entry">{{ a.content }} <span class="small">— {{ new Date(a.at).toLocaleTimeString() }}</span></div>
        </div>
        <p v-else class="small">No answers yet.</p>
      </template>

      <template v-else-if="active?.kind === 'followup'">
        <div class="kind-line breadcrumb">{{ breadcrumb(active.followup) }}</div>
        <h2>{{ active.followup.prompt }} <span class="tag" :class="active.followup.kind">{{ active.followup.kind }}</span></h2>
        <p class="small">produces <b>{{ kindById[active.followup.produces]?.label ?? active.followup.produces }}</b></p>
        <div class="committed-answers" v-if="answersFor(active.followup.id).length">
          <h3>Committed answers</h3>
          <div v-for="a in answersFor(active.followup.id)" :key="a.id" class="answer-entry">{{ a.content }} <span class="small">— {{ new Date(a.at).toLocaleTimeString() }}</span></div>
        </div>
        <p v-else class="small">No answers yet.</p>
      </template>

      <p v-else class="small">Every kernel question has a committed answer. Add questions in <code>kernel.ts</code>.</p>
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
.note { margin-bottom: .6rem; }
.breadcrumb { font-size: .76rem; }
.followup-row { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; margin-top: .3rem; }
.followup-row .q.followup { flex: 1 1 calc(100% - 2rem); min-width: 0; }
.followup-row .children { flex-basis: 100%; }
.q.followup.thread { border-left-style: dotted; }
.thread-icon { font-size: .75rem; }
.tag.sub { color: var(--kernel); border-color: var(--kernel); }
.tag.thread { color: var(--inferred); border-color: var(--inferred); border-style: dotted; }
.q.lit { outline: 2px solid var(--kernel); }
.raised { display: flex; flex-direction: column; gap: .2rem; margin: .2rem 0 .2rem 1.3rem; }
.raised-row { display: flex; align-items: center; flex-wrap: wrap; gap: .35rem; }
.raised-row.deferred { opacity: .45; }
.raised-row .tag.violation { color: var(--said); border-color: var(--said); }
.raised-row .tag.agent { color: var(--kernel); border-color: var(--kernel); }
.raised-row .tag.contradiction { color: var(--inferred); border-color: var(--inferred); }
.path.definition { grid-template-columns: minmax(0, 1fr) 380px; } /* tree first and wide; inputs on the side (S84) */
.answer.side { position: sticky; top: 4rem; align-self: start; max-height: calc(100vh - 5rem); overflow: auto; }
.tree-main .q .q-text { font-size: .92rem; }
.committed-answers h3 { margin-top: .6rem; }
</style>
