<script setup lang="ts">
import { ref, computed } from 'vue';
import { SPACES, KINDS, EDGE_TYPES, QUESTIONS, INVARIANTS, LIFECYCLE_STAGES, LIFECYCLE_SOURCE, STATEMENTS, OPEN_QUESTIONS, type Provenance, kindById } from '../kernel';
import Prov from './Prov.vue';
import { unanchored, BRIEFS } from '../brief';
import { AI_FUNCTIONS } from '../ai/registry';
import { state, rateCall, rankOpen } from '../store';
import { checkInvariants } from '../checks';
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

// ── Violations and open items (Reference: 1-C) ──
const violations = computed(() => checkInvariants(state.graph));
const open = computed(() => rankOpen());

// ── Edge shapes table (Reference: 1-C) ──
const edgeShapes = computed(() => {
  const needs = new Map<string, { edge: string; dir: string; min: number; produces?: string }[]>();
  for (const k of KINDS) {
    if (k.needs) {
      for (const n of k.needs) {
        if (!needs.has(k.id)) needs.set(k.id, []);
        needs.get(k.id)!.push(n);
      }
    }
  }
  return { edgeTypes: EDGE_TYPES, needs };
});

// ── AI calls (Reference: 1-C) ──
const calls = computed(() => [...state.aiCalls].sort((a, b) => b.at - a.at));
const fnById = Object.fromEntries(AI_FUNCTIONS.map((f) => [f.id, f]));
const truncate = (s: string, n = 120) => (s.length > n ? s.slice(0, n) + '…' : s);
const totalCostUsd = computed(() => state.aiCalls.reduce((sum, c) => sum + (c.costUsd ?? 0), 0));

// ── Efficacy with outcome metrics (Reference: 1-C) ──
const efficacy = computed(() => {
  const rows: {
    fn: string;
    version: string;
    count: number;
    approved: number;
    edited: number;
    editDistances: number[];
    discarded: number;
    ignored: number;
    ratings: Record<string, number>;
  }[] = [];

  for (const c of state.aiCalls) {
    let row = rows.find((r) => r.fn === c.fn && r.version === c.version);
    if (!row) {
      row = {
        fn: c.fn,
        version: c.version,
        count: 0,
        approved: 0,
        edited: 0,
        editDistances: [],
        discarded: 0,
        ignored: 0,
        ratings: {},
      };
      rows.push(row);
    }
    row.count++;
    if (c.rating) row.ratings[c.rating.value] = (row.ratings[c.rating.value] ?? 0) + 1;

    if (c.outcome) {
      if (c.outcome.state === 'approved') row.approved++;
      else if (c.outcome.state === 'edited') {
        row.edited++;
        if (c.outcome.editDistance !== undefined) row.editDistances.push(c.outcome.editDistance);
      } else if (c.outcome.state === 'discarded') row.discarded++;
      else if (c.outcome.state === 'ignored') row.ignored++;
    }
  }

  return rows.sort((a, b) => a.fn.localeCompare(b.fn) || a.version.localeCompare(b.version));
});

// ── Helper: compute stats for efficacy row ──
function getEfficacyStats(row: any) {
  const approvedPct = row.count > 0 ? Math.round((row.approved / row.count) * 100) : 0;
  const editedPct = row.count > 0 ? Math.round((row.edited / row.count) * 100) : 0;
  const discardedPct = row.count > 0 ? Math.round((row.discarded / row.count) * 100) : 0;
  const ignoredPct = row.count > 0 ? Math.round((row.ignored / row.count) * 100) : 0;
  const sorted = [...(row.editDistances ?? [])].sort((a: number, b: number) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : undefined;
  const isProvisional = row.count < 30;
  return { approvedPct, editedPct, discardedPct, ignoredPct, median, isProvisional };
}

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

    <h2>Violations <span class="small">{{ violations.length }} active</span></h2>
    <table data-testid="ref-violations">
      <thead><tr><th>Invariant</th><th>Message</th><th>Subjects</th><th>Options</th><th>Raise</th></tr></thead>
      <tbody>
        <tr v-for="v in violations" :key="v.id">
          <td class="mono">{{ v.invariant }}</td>
          <td>{{ v.message }}</td>
          <td><span v-for="s in v.subjects" :key="s" class="tag" :title="s" @click="state.selectedId = s" style="cursor: pointer">{{ s.slice(0, 20) }}</span></td>
          <td><span v-for="(o, i) in v.options" :key="i" class="tag small">{{ o }}</span></td>
          <td class="mono">{{ v.raise }}</td>
        </tr>
      </tbody>
    </table>

    <h2>Open items <span class="small">{{ open.length }} ranked by tier</span></h2>
    <table data-testid="ref-open">
      <thead><tr><th>Tier</th><th>Source</th><th>Prompt</th><th>Produces</th><th>Subjects</th></tr></thead>
      <tbody>
        <tr v-for="o in open" :key="o.id">
          <td class="mono"><span class="tag">{{ ['Blocking', 'Next question', 'Gap', 'Open thread'][o.tier - 1] }}</span></td>
          <td class="mono">{{ o.source }}</td>
          <td>{{ o.prompt }}</td>
          <td class="mono">{{ o.produces }}</td>
          <td><span v-for="s in o.subjects" :key="s" class="tag" :title="s" @click="state.selectedId = s" style="cursor: pointer">{{ s.slice(0, 20) }}</span></td>
        </tr>
      </tbody>
    </table>

    <h2>Edge shapes <span class="small">from/to kinds per edge type, and kind needs</span></h2>
    <table data-testid="ref-edge-shapes">
      <thead><tr><th>Type</th><th>From kinds</th><th>To kinds</th><th>Kernel</th><th>Hint</th><th>Kind needs</th></tr></thead>
      <tbody>
        <tr v-for="e in edgeShapes.edgeTypes" :key="e.id">
          <td class="mono">{{ e.label }}</td>
          <td class="mono small">{{ e.from.join(', ') || 'any' }}</td>
          <td class="mono small">{{ e.to.join(', ') || 'any' }}</td>
          <td><span class="tag" :class="e.kernel ? 'kernel' : 'ext'">{{ e.kernel ? 'kernel' : 'ext' }}</span></td>
          <td><span style="font-size: 0.85rem">{{ e.hint }}</span></td>
          <td class="small">
            <template v-for="(needs, kindId) in Array.from(edgeShapes.needs)" :key="kindId">
              <template v-if="(needs[1] as any[]).some((n: any) => n.edge === e.id)">
                <div class="mono" style="font-size: 0.75rem">
                  {{ kindById[needs[0]]?.label }}:
                  <span v-for="n in (needs[1] as any[]).filter((x: any) => x.edge === e.id)" :key="n.edge" class="tag small">
                    {{ n.dir === 'out' ? '→' : '←' }} {{ n.min }}
                    <span v-if="n.produces">({{ n.produces }})</span>
                  </span>
                </div>
              </template>
            </template>
          </td>
        </tr>
      </tbody>
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
    <div class="toolbar">
      <label class="mono small" data-testid="ref-ai-runtime">
        <input type="radio" value="stub" v-model="state.aiRuntime" /> stub
        <input type="radio" value="flue" v-model="state.aiRuntime" /> flue
      </label>
      <button @click="copyCalls">Copy calls JSON</button>
      <span class="small">Total cost: ${{ totalCostUsd.toFixed(4) }}</span>
    </div>
    <table data-testid="ref-ai-calls">
      <thead><tr><th>At</th><th>Fn</th><th>Version</th><th>Runtime</th><th>Status</th><th>Model</th><th>Cost</th><th>Context digest</th><th>Input</th><th>Output</th><th>Rating</th><th>Outcome</th></tr></thead>
      <tbody>
        <tr v-for="c in calls" :key="c.id">
          <td class="mono small">{{ new Date(c.at).toLocaleString() }}</td>
          <td class="mono">{{ c.fn }}</td>
          <td class="mono">{{ c.version }}</td>
          <td class="mono">{{ c.runtime }}</td>
          <td class="mono small">{{ c.status ?? '—' }}</td>
          <td class="mono small">{{ c.model ?? '—' }}</td>
          <td class="mono small">{{ c.costUsd !== undefined ? '$' + c.costUsd.toFixed(4) : '—' }}</td>
          <td>{{ c.contextDigest }}</td>
          <td :title="c.input">{{ truncate(c.input) }}</td>
          <td :title="c.output">{{ truncate(c.output) }}</td>
          <td>
            <span v-if="c.rating" class="tag">{{ c.rating.value }}</span>
            <span v-else class="ratebar">
              <button v-for="opt in fnById[c.fn]?.feedback ?? []" :key="opt.value" class="small" @click="rateCall(c.id, opt.value)">{{ opt.label }}</button>
            </span>
          </td>
          <td class="mono small">
            <span v-if="c.outcome">{{ c.outcome.state }}<span v-if="c.outcome.editDistance !== undefined"> (Δ {{ c.outcome.editDistance }})</span></span>
            <span v-else>—</span>
          </td>
        </tr>
      </tbody>
    </table>

    <h2>Efficacy <span class="small">outcome metrics per function/version</span></h2>
    <table data-testid="ref-ai-efficacy">
      <thead><tr><th>Fn</th><th>Version</th><th>Calls</th><th>Approved %</th><th>Edited %</th><th>Median edit Δ</th><th>Discarded %</th><th>Ignored %</th><th>Ratings</th></tr></thead>
      <tbody>
        <tr v-for="r in efficacy" :key="r.fn + r.version">
          <td class="mono">{{ r.fn }}</td>
          <td class="mono">{{ r.version }}<span v-if="getEfficacyStats(r).isProvisional" class="small"> provisional</span></td>
          <td>{{ r.count }}</td>
          <td>{{ getEfficacyStats(r).approvedPct }}%</td>
          <td>{{ getEfficacyStats(r).editedPct }}%</td>
          <td class="mono">{{ getEfficacyStats(r).median ?? '—' }}</td>
          <td>{{ getEfficacyStats(r).discardedPct }}%</td>
          <td>{{ getEfficacyStats(r).ignoredPct }}%</td>
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
