<script setup lang="ts">
import { computed } from 'vue';
import { KIND_MAP, type GraphNode } from '../../lib/schema';

const props = defineProps<{ node: GraphNode }>();

const def = computed(() => KIND_MAP[props.node.kind]);

// Ensure the props bag exists for binding.
function bag(): Record<string, unknown> {
  if (!props.node.props) props.node.props = {};
  return props.node.props;
}

// List fields are edited as newline-separated text.
function listText(key: string): string {
  const v = bag()[key];
  return Array.isArray(v) ? (v as string[]).join('\n') : '';
}
function setList(key: string, text: string) {
  bag()[key] = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function scalar(key: string): string {
  const v = bag()[key];
  return v == null ? '' : String(v);
}
function setScalar(key: string, val: string) {
  bag()[key] = val;
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="label">Title</label>
      <input v-model="node.title" class="field mt-1" placeholder="Name this node…" />
    </div>

    <div>
      <label class="label">Description</label>
      <textarea v-model="node.description" rows="3" class="field mt-1 resize-y" placeholder="What is it, in plain language?" />
    </div>

    <div v-for="f in def?.fields ?? []" :key="f.key">
      <label class="label">{{ f.label }}</label>

      <input
        v-if="f.type === 'text'"
        :value="scalar(f.key)"
        @input="setScalar(f.key, ($event.target as HTMLInputElement).value)"
        class="field mt-1"
        :placeholder="f.placeholder"
      />

      <div v-else-if="f.type === 'link'" class="mt-1 flex gap-2">
        <input
          :value="scalar(f.key)"
          @input="setScalar(f.key, ($event.target as HTMLInputElement).value)"
          class="field"
          :placeholder="f.placeholder ?? 'https://…'"
          type="url"
        />
        <a
          v-if="scalar(f.key)"
          :href="scalar(f.key)"
          target="_blank"
          rel="noreferrer"
          class="btn shrink-0"
          title="Open link"
          >↗</a
        >
      </div>

      <textarea
        v-else-if="f.type === 'textarea'"
        :value="scalar(f.key)"
        @input="setScalar(f.key, ($event.target as HTMLTextAreaElement).value)"
        rows="2"
        class="field mt-1 resize-y"
        :placeholder="f.placeholder"
      />

      <select
        v-else-if="f.type === 'select'"
        :value="scalar(f.key)"
        @change="setScalar(f.key, ($event.target as HTMLSelectElement).value)"
        class="field mt-1"
      >
        <option value="">—</option>
        <option v-for="opt in f.options" :key="opt" :value="opt">{{ opt }}</option>
      </select>

      <template v-else-if="f.type === 'list'">
        <textarea
          :value="listText(f.key)"
          @input="setList(f.key, ($event.target as HTMLTextAreaElement).value)"
          rows="3"
          class="field mt-1 resize-y font-mono text-xs"
          :placeholder="f.placeholder ?? 'one per line'"
        />
        <p class="mt-1 text-[0.68rem] text-ink-400">One item per line.</p>
      </template>

      <p v-if="f.hint" class="mt-1 text-[0.68rem] text-ink-400">{{ f.hint }}</p>
    </div>
  </div>
</template>
