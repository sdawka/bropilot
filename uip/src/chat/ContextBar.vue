<script setup lang="ts">
// "looking at": selection, perspective and level pills. Live in the composer; frozen into each sent
// message header, where clicking restores that view.
import type { Frozen } from './store';
const props = defineProps<{ ctx: Frozen; frozen?: boolean; excluded?: { node: boolean; persp: boolean; level: boolean } }>();
const emit = defineEmits<{ toggle: [k: 'node' | 'persp' | 'level']; clear: []; restore: [] }>();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const off = (k: 'node' | 'persp' | 'level') => !!props.excluded?.[k];
</script>
<template>
  <div class="flex min-w-0 flex-wrap items-center gap-1 text-[11px]" :class="frozen && 'cursor-pointer opacity-80 hover:opacity-100'"
       :title="frozen ? 'Restore this view' : ''" @click="frozen && emit('restore')">
    <span v-if="ctx.node" class="inline-flex max-w-[170px] items-center gap-0.5 rounded border border-border px-1" :class="off('node') && 'line-through opacity-40'">
      <span>◉</span><span class="truncate">{{ ctx.node.title }}</span>
      <button v-if="!frozen" type="button" class="ml-0.5 text-muted-foreground hover:text-foreground" title="Send without this" @click.stop="emit('toggle', 'node')">×</button>
    </span>
    <span v-else class="rounded border border-dashed border-border px-1 text-muted-foreground">◉ none</span>
    <span class="inline-flex items-center gap-0.5 rounded border border-border px-1" :class="off('persp') && 'line-through opacity-40'">
      ⟂ {{ cap(ctx.persp) }}
      <button v-if="!frozen" type="button" class="ml-0.5 text-muted-foreground hover:text-foreground" title="Send without this" @click.stop="emit('toggle', 'persp')">×</button>
    </span>
    <span v-if="ctx.level != null" class="inline-flex items-center gap-0.5 rounded border border-border px-1" :class="off('level') && 'line-through opacity-40'">
      L{{ ctx.level }}
      <button v-if="!frozen" type="button" class="ml-0.5 text-muted-foreground hover:text-foreground" title="Send without this" @click.stop="emit('toggle', 'level')">×</button>
    </span>
    <button v-if="!frozen" type="button" class="ml-auto text-muted-foreground hover:text-foreground" title="Ask about the whole project" @click="emit('clear')">×</button>
  </div>
</template>
