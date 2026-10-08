<script setup lang="ts">
import { computed } from 'vue';
import { kindById, edgeTypeById, QUESTIONS, SPACES } from '../kernel';
import { state, nodeById, edgesOf } from '../store';
import Prov from './Prov.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ close: [] }>();

const node = computed(() => nodeById(props.id));
const kind = computed(() => (node.value ? kindById[node.value.kind] : undefined));
const space = computed(() => SPACES.find((s) => s.id === kind.value?.space));
const out = computed(() => edgesOf(props.id).filter((e) => e.src === props.id));
const inc = computed(() => edgesOf(props.id).filter((e) => e.dst === props.id));
const answer = computed(() => state.answers.find((a) => a.id === node.value?.answerId));
const question = computed(() => QUESTIONS.find((q) => q.id === answer.value?.questionId));
const commitOf = computed(() => state.commits.find((c) => c.effects.some((e) => (e.op === 'add-node' && e.node.id === props.id) || (e.op === 'update-node' && e.nodeId === props.id))));
const title = (id: string) => nodeById(id)?.title ?? id;
</script>

<template>
  <aside class="inspector" v-if="node">
    <button class="close" @click="$emit('close')">×</button>
    <div class="kind-line" :style="{ '--hue': space?.hue }">{{ kind?.icon }} {{ kind?.label }} · {{ space?.label }} · <span class="tag" :class="kind?.kernel ? 'kernel' : 'ext'">{{ kind?.kernel ? 'kernel kind' : 'template kind' }}</span></div>
    <h2>{{ node.title }}</h2>
    <p v-if="node.description" class="desc">{{ node.description }}</p>
    <dl v-if="node.props && Object.keys(node.props).length">
      <template v-for="(v, k) in node.props" :key="k"><dt>{{ kind?.fields?.find((f) => f.key === k)?.label ?? k }}</dt><dd>{{ v }}</dd></template>
    </dl>
    <h3>Provenance</h3>
    <Prov :source="node.source" full />
    <p v-if="answer" class="small">From answer to <b>{{ question?.prompt }}</b> ({{ new Date(answer.at).toLocaleString() }})<span v-if="commitOf"> · committed {{ new Date(commitOf.at).toLocaleTimeString() }}</span></p>
    <p v-else class="small">Seed node (from graph.json).</p>
    <h3>Edges out ({{ out.length }})</h3>
    <ul><li v-for="e in out" :key="e.id"><em>{{ edgeTypeById[e.type]?.label ?? e.type }}</em> → <a @click="state.selectedId = e.dst">{{ title(e.dst) }}</a></li></ul>
    <h3>Edges in ({{ inc.length }})</h3>
    <ul><li v-for="e in inc" :key="e.id"><a @click="state.selectedId = e.src">{{ title(e.src) }}</a> <em>{{ edgeTypeById[e.type]?.label ?? e.type }}</em> →</li></ul>
    <h3>Kernel rules that apply</h3>
    <ul class="small">
      <li>Status <b>{{ node.status }}</b>: became committed only through a Commit (inv-commit-gate).</li>
      <li v-if="kind?.singular">Singular kind: at most one node; re-answering updates it.</li>
      <li v-if="kind?.kernel">Kernel kind: no template can remove it (inv-kernel-additive).</li>
    </ul>
  </aside>
</template>
