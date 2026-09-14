<script setup lang="ts">
import { ref, computed } from 'vue';
import { FLOWS, KERNEL_OBJECTS, type FlowScope } from '../kernel';
import { state } from '../store';
import { useScreen } from '../screen';
import Prov from './Prov.vue';

const scope = ref<FlowScope | 'all'>('all');
const activeId = ref<string | null>(null);
const active = computed(() => FLOWS.find((f) => f.id === activeId.value) ?? null);
const groups = computed(() => {
  const m: Record<string, typeof FLOWS> = {};
  for (const f of FLOWS) if (scope.value === 'all' || f.scope === scope.value) (m[f.group] ??= []).push(f);
  return m;
});
const highlighted = (id: string) => state.highlight.nodes.includes(id);
const touched = (id: string) => !!active.value?.touches.includes(id) || highlighted(id);
const untouched = computed(() => KERNEL_OBJECTS.filter((o) => !FLOWS.some((f) => f.touches.includes(o.id))).map((o) => o.id));

useScreen(() => [
  ...Object.values(groups.value).flat().map((f) => ({ id: f.id, kind: 'flow', title: f.title })),
  ...(active.value?.touches.map((id) => ({ id, kind: 'kernel', title: id })) ?? []),
]);
</script>

<template>
  <div class="flows">
    <aside>
      <div class="toolbar">
        <label v-for="s in ['all', 'core', 'stub', 'later']" :key="s"><input type="radio" :value="s" v-model="scope" /> {{ s }}</label>
      </div>
      <div v-for="(fs, g) in groups" :key="g" class="flow-group">
        <h3>{{ g }}</h3>
        <button v-for="f in fs" :key="f.id" class="flow" :data-node-id="f.id" :class="[f.scope, { active: activeId === f.id, lit: highlighted(f.id) }]" @click="activeId = f.id">
          <code>{{ f.id }}</code> {{ f.title }} <span class="tag" :class="f.scope">{{ f.scope }}</span>
        </button>
      </div>
    </aside>
    <main>
      <template v-if="active">
        <h2><code>{{ active.id }}</code> {{ active.title }} <span class="tag" :class="active.scope">{{ active.scope }}</span></h2>
        <ol class="steps"><li v-for="s in active.steps" :key="s">{{ s }}</li></ol>
        <Prov :source="active.source" full />
      </template>
      <p v-else class="small">Pick a flow. The kernel objects it touches light up below.</p>
      <h3>Kernel objects</h3>
      <div class="objects">
        <span v-for="o in KERNEL_OBJECTS" :key="o.id" class="obj" :data-node-id="o.id" :class="{ lit: touched(o.id) }" :title="o.definition">{{ o.id }}</span>
      </div>
      <p v-if="untouched.length" class="small warn">Objects no flow touches: {{ untouched.join(', ') }} — either a missing flow or a needless object.</p>
      <p v-else class="small">Every kernel object is touched by at least one flow.</p>
    </main>
  </div>
</template>
