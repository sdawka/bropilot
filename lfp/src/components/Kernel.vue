<script setup lang="ts">
import { ref, computed } from 'vue';
import { SPACES, KINDS, EDGE_TYPES, QUESTIONS, INVARIANTS, LIFECYCLE_STAGES, LIFECYCLE_SOURCE, STATEMENTS, OPEN_QUESTIONS, type Provenance } from '../kernel';
import Prov from './Prov.vue';
import { unanchored, BRIEFS } from '../brief';
import { AI_FUNCTIONS } from '../ai/registry';
import { state, rateCall } from '../store';
const missingAnchors = unanchored();

const onlyInferred = ref(false);
const keep = (s: Provenance) => !onlyInferred.value || s.kind === 'inferred';
const spaces = computed(() => SPACES.filter((o) => keep(o.source)));
const kinds = computed(() => KINDS.filter((o) => keep(o.source)));
const edges = computed(() => EDGE_TYPES.filter((o) => keep(o.source)));
const questions = computed(() => QUESTIONS.filter((o) => keep(o.source)));
const invariants = computed(() => INVARIANTS.filter((o) => keep(o.source)));
const aiFunctions = computed(() => AI_FUNCTIONS.filter((o) => keep(o.source)));
const counts = computed(() => {
  const all = [...SPACES, ...KINDS, ...EDGE_TYPES, ...QUESTIONS, ...INVARIANTS, ...AI_FUNCTIONS].map((x) => x.source);
  return { said: all.filter((s) => s.kind === 'said').length, inferred: all.filter((s) => s.kind === 'inferred').length };
});

// ── AI calls (Reference: 1-C) ──
const calls = computed(() => [...state.aiCalls].sort((a, b) => b.at - a.at));
const fnById = Object.fromEntries(AI_FUNCTIONS.map((f) => [f.id, f]));
const truncate = (s: string, n = 120) => (s.length > n ? s.slice(0, n) + '…' : s);
const efficacy = computed(() => {
  const rows: { fn: string; version: string; count: number; ratings: Record<string, number> }[] = [];
  for (const c of state.aiCalls) {
    let row = rows.find((r) => r.fn === c.fn && r.version === c.version);
    if (!row) { row = { fn: c.fn, version: c.version, count: 0, ratings: {} }; rows.push(row); }
    row.count++;
    if (c.rating) row.ratings[c.rating.value] = (row.ratings[c.rating.value] ?? 0) + 1;
  }
  return rows.sort((a, b) => a.fn.localeCompare(b.fn) || a.version.localeCompare(b.version));
});
async function copyCalls() {
  try { await navigator.clipboard.writeText(JSON.stringify(state.aiCalls, null, 2)); } catch { /* clipboard unavailable */ }
}
</script>

<template>
  <div class="kernel">
    <div class="toolbar">
      <label><input type="checkbox" v-model="onlyInferred" /> show only <b>inferred</b> items (to challenge)</label>
      <span class="small">{{ counts.said }} said · {{ counts.inferred }} inferred</span>
    </div>

    <h2>Layers &amp; spaces</h2>
    <table>
      <thead><tr><th>Space</th><th>Layer</th><th>Order</th><th>Settled</th><th>Meaning</th><th>Source</th></tr></thead>
      <tbody><tr v-for="s in spaces" :key="s.id"><td><span class="swatch" :style="{ background: s.hue }"></span> <b>{{ s.label }}</b></td><td>{{ s.layer }}</td><td>{{ s.order }}</td><td>{{ s.settled ? 'yes' : 'no' }}</td><td>{{ s.blurb }}</td><td><Prov :source="s.source" /></td></tr></tbody>
    </table>

    <h2>Kinds <span class="small">kernel = immutable, template = extensible</span></h2>
    <table>
      <thead><tr><th>Kind</th><th>Space</th><th>Scope</th><th>Fields</th><th>Meaning</th><th>Source</th></tr></thead>
      <tbody><tr v-for="k in kinds" :key="k.id"><td>{{ k.icon }} <b>{{ k.label }}</b><span v-if="k.singular" class="small"> (singular)</span></td><td>{{ k.space }}</td><td><span class="tag" :class="k.kernel ? 'kernel' : 'ext'">{{ k.kernel ? 'kernel' : 'template' }}</span></td><td class="mono">{{ k.fields?.map((f) => f.key).join(', ') || '—' }}</td><td>{{ k.blurb }}</td><td><Prov :source="k.source" /></td></tr></tbody>
    </table>

    <h2>Edge types</h2>
    <table>
      <thead><tr><th>Type</th><th>Category</th><th>Scope</th><th>Meaning</th><th>Source</th></tr></thead>
      <tbody><tr v-for="e in edges" :key="e.id"><td><b>{{ e.label }}</b></td><td>{{ e.category }}</td><td><span class="tag" :class="e.kernel ? 'kernel' : 'ext'">{{ e.kernel ? 'kernel' : 'template' }}</span></td><td>{{ e.hint }}</td><td><Prov :source="e.source" /></td></tr></tbody>
    </table>

    <h2>Questions (the path)</h2>
    <table>
      <thead><tr><th>Question</th><th>Space</th><th>Produces</th><th>Unlocks after</th><th>Source</th></tr></thead>
      <tbody><tr v-for="q in questions" :key="q.id"><td><b>{{ q.prompt }}</b><br /><span class="small">{{ q.help }}</span></td><td>{{ q.space }}</td><td class="mono">{{ q.produces }}</td><td class="mono">{{ q.unlocksAfter.join(', ') || '—' }}</td><td><Prov :source="q.source" /></td></tr></tbody>
    </table>

    <h2>Invariants</h2>
    <table>
      <tbody><tr v-for="i in invariants" :key="i.id"><td class="mono">{{ i.id }}</td><td>{{ i.text }}</td><td><Prov :source="i.source" /></td></tr></tbody>
    </table>

    <h2>AI functions <span class="small">metadata from the registry — no model calls yet</span></h2>
    <table data-testid="ref-ai-functions">
      <thead><tr><th>Function</th><th>Version</th><th>Purpose</th><th>Context needs</th><th>Feedback</th><th>Prompt</th><th>Source</th></tr></thead>
      <tbody>
        <tr v-for="f in aiFunctions" :key="f.id">
          <td class="mono">{{ f.id }}</td>
          <td class="mono">{{ f.version }}</td>
          <td>{{ f.purpose }}</td>
          <td class="mono">{{ f.context.needs.join(', ') }}</td>
          <td><span v-for="opt in f.feedback" :key="opt.value" class="tag">{{ opt.label }}</span></td>
          <td><details><summary>prompt</summary><pre class="mono prompt">{{ f.prompt || '—' }}</pre><p class="small">{{ f.output }}</p></details></td>
          <td><Prov :source="f.source" /></td>
        </tr>
      </tbody>
    </table>

    <h2>AI calls <span class="small">{{ calls.length }} recorded</span></h2>
    <div class="toolbar"><button @click="copyCalls">Copy calls JSON</button></div>
    <table data-testid="ref-ai-calls">
      <thead><tr><th>At</th><th>Fn</th><th>Version</th><th>Runtime</th><th>Context digest</th><th>Input</th><th>Output</th><th>Rating</th></tr></thead>
      <tbody>
        <tr v-for="c in calls" :key="c.id">
          <td class="mono small">{{ new Date(c.at).toLocaleString() }}</td>
          <td class="mono">{{ c.fn }}</td>
          <td class="mono">{{ c.version }}</td>
          <td class="mono">{{ c.runtime }}</td>
          <td>{{ c.contextDigest }}</td>
          <td :title="c.input">{{ truncate(c.input) }}</td>
          <td :title="c.output">{{ truncate(c.output) }}</td>
          <td>
            <span v-if="c.rating" class="tag">{{ c.rating.value }}</span>
            <span v-else class="ratebar">
              <button v-for="opt in fnById[c.fn]?.feedback ?? []" :key="opt.value" class="small" @click="rateCall(c.id, opt.value)">{{ opt.label }}</button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <h2>Efficacy <span class="small">calls and ratings per function/version</span></h2>
    <table data-testid="ref-ai-efficacy">
      <thead><tr><th>Fn</th><th>Version</th><th>Calls</th><th>Ratings</th></tr></thead>
      <tbody>
        <tr v-for="r in efficacy" :key="r.fn + r.version">
          <td class="mono">{{ r.fn }}</td>
          <td class="mono">{{ r.version }}</td>
          <td>{{ r.count }}</td>
          <td><span v-for="(n, v) in r.ratings" :key="v" class="tag">{{ v }}: {{ n }}</span><span v-if="!Object.keys(r.ratings).length" class="small">—</span></td>
        </tr>
      </tbody>
    </table>

    <h2>Open questions <span class="small">(resolved ones keep their decision)</span></h2>
    <table><tbody><tr v-for="o in OPEN_QUESTIONS" :key="o.id"><td class="mono">{{ o.id }}</td><td><span :class="{ resolved: o.resolved }">{{ o.text }}</span><div v-if="o.resolved" class="decision">✔ {{ o.resolved.text }} <Prov :source="o.resolved.source" /></div></td><td><Prov :source="o.source" /></td></tr></tbody></table>

    <h2>Lifecycle stages</h2>
    <p v-if="keep(LIFECYCLE_SOURCE)"><span v-for="s in LIFECYCLE_STAGES" :key="s" class="tag stage">{{ s }}</span> <Prov :source="LIFECYCLE_SOURCE" /></p>

    <h2>Statement bank <span class="small">{{ BRIEFS.length }} briefs on record · <span :class="missingAnchors.length ? 'warn' : ''">{{ missingAnchors.length ? `anchors missing for S${missingAnchors.join(', S')}` : 'every statement anchors to a sentence in a brief' }}</span></span></h2>
    <ol class="statements"><li v-for="(t, n) in STATEMENTS" :key="n" :value="n">{{ t }}</li></ol>
  </div>
</template>

<style scoped>
.resolved { color: var(--muted); text-decoration: line-through; }
.decision { margin-top: .25rem; color: var(--said); }
.prompt { white-space: pre-wrap; max-width: 32rem; }
.ratebar button { margin-right: .25rem; }
</style>
