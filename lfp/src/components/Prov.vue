<script setup lang="ts">
import { ref, computed } from 'vue';
import { STATEMENTS, type Provenance } from '../kernel';
import { contextFor, BRIEFS } from '../brief';

const props = defineProps<{ source?: Provenance; full?: boolean }>();
const hover = ref<number | null>(null);
const expanded = ref<number | null>(null); // statement whose full brief is shown
const statements = computed(() => (props.source?.kind === 'said' ? props.source.statements : []));
const ctx = (n: number) => contextFor(n);
const highlight = (text: string, anchor: string) => {
  const i = text.indexOf(anchor);
  return i < 0 ? [{ t: text, hit: false }] : [{ t: text.slice(0, i), hit: false }, { t: anchor, hit: true }, { t: text.slice(i + anchor.length), hit: false }];
};
const briefWithHighlight = (n: number) => {
  const c = ctx(n); if (!c) return null;
  return { title: c.brief.title, date: c.brief.date, parts: highlight(c.brief.text, c.hit.trim()) };
};
</script>

<template>
  <span v-if="!source" class="prov none" title="No provenance recorded">?</span>

  <span v-else-if="source.kind === 'said'" class="prov-wrap" @mouseleave="hover = null">
    <span class="prov said" @mouseenter="hover = statements[0]">said S{{ statements.join(' S') }}</span>
    <!-- hover popover: quote in context -->
    <span v-if="hover !== null && !full" class="pop">
      <template v-for="n in statements" :key="n">
        <span class="pop-s" v-if="ctx(n)">
          <b>S{{ n }}</b> <i class="brief-name">{{ ctx(n)!.brief.title }}</i>
          <span class="ctx"><span class="dim">{{ ctx(n)!.before }}</span><span v-for="(p, i) in highlight(ctx(n)!.hit, ctx(n)!.anchor)" :key="i" :class="{ hit: p.hit, sentence: !p.hit }">{{ p.t }}</span><span class="dim">{{ ctx(n)!.after }}</span></span>
        </span>
      </template>
    </span>
  </span>

  <span v-else class="prov inferred" :title="source.reason">inferred</span>

  <!-- full mode: quotes with context, and an expandable full brief -->
  <div v-if="full && source" class="prov-detail">
    <template v-if="source.kind === 'said'">
      <div v-for="n in statements" :key="n" class="quote">
        <blockquote><b>S{{ n }}</b> “{{ STATEMENTS[n] }}”</blockquote>
        <div v-if="ctx(n)" class="ctx block">
          <span class="dim">{{ ctx(n)!.before }}</span><span v-for="(p, i) in highlight(ctx(n)!.hit, ctx(n)!.anchor)" :key="i" :class="{ hit: p.hit, sentence: !p.hit }">{{ p.t }}</span><span class="dim">{{ ctx(n)!.after }}</span>
          <a class="more" @click="expanded = expanded === n ? null : n">{{ expanded === n ? 'hide full brief' : `read the full ${ctx(n)!.brief.title.toLowerCase()} ↓` }}</a>
        </div>
        <div v-if="expanded === n && briefWithHighlight(n)" class="full-brief">
          <div class="small"><b>{{ briefWithHighlight(n)!.title }}</b> · {{ briefWithHighlight(n)!.date }} · {{ BRIEFS.length }} briefs on record</div>
          <p><span v-for="(p, i) in briefWithHighlight(n)!.parts" :key="i" :class="{ hit: p.hit }">{{ p.t }}</span></p>
        </div>
      </div>
    </template>
    <p v-else class="reason">Inferred: {{ source.reason }}</p>
  </div>
</template>
