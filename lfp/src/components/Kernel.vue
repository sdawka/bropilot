<script setup lang="ts">
import { ref, computed } from 'vue';
import { SPACES, KINDS, EDGE_TYPES, QUESTIONS, INVARIANTS, KERNEL_OBJECTS, LIFECYCLE_STAGES, LIFECYCLE_SOURCE, STATEMENTS, OPEN_QUESTIONS, type Provenance } from '../kernel';
import Prov from './Prov.vue';
import { unanchored, BRIEFS } from '../brief';
const missingAnchors = unanchored();

const onlyInferred = ref(false);
const keep = (s: Provenance) => !onlyInferred.value || s.kind === 'inferred';
const objects = computed(() => KERNEL_OBJECTS.filter((o) => keep(o.source)));
const spaces = computed(() => SPACES.filter((o) => keep(o.source)));
const kinds = computed(() => KINDS.filter((o) => keep(o.source)));
const edges = computed(() => EDGE_TYPES.filter((o) => keep(o.source)));
const questions = computed(() => QUESTIONS.filter((o) => keep(o.source)));
const invariants = computed(() => INVARIANTS.filter((o) => keep(o.source)));
const counts = computed(() => {
  const all = [...KERNEL_OBJECTS, ...SPACES, ...KINDS, ...EDGE_TYPES, ...QUESTIONS, ...INVARIANTS].map((x) => x.source);
  return { said: all.filter((s) => s.kind === 'said').length, inferred: all.filter((s) => s.kind === 'inferred').length };
});
</script>

<template>
  <div class="kernel">
    <div class="toolbar">
      <label><input type="checkbox" v-model="onlyInferred" /> show only <b>inferred</b> items (to challenge)</label>
      <span class="small">{{ counts.said }} said · {{ counts.inferred }} inferred</span>
    </div>

    <h2>Kernel objects <span class="small">(immutable; the domain of Bropilot itself)</span></h2>
    <table>
      <thead><tr><th>Object</th><th>Definition</th><th>Attributes</th><th>Source</th></tr></thead>
      <tbody><tr v-for="o in objects" :key="o.id"><td><b>{{ o.id }}</b></td><td>{{ o.definition }}</td><td class="mono">{{ o.attrs }}</td><td><Prov :source="o.source" /></td></tr></tbody>
    </table>

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
</style>
