<script setup lang="ts">
import { computed, ref } from 'vue';
import { state, nodeById, edgesOf, upsertTerm, removeNodeDirect } from '../store';
import Prov from './Prov.vue';

defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();

const q = ref('');
const editingId = ref<string | null>(null);
const editTitle = ref('');
const editDesc = ref('');
const newTitle = ref('');
const newDesc = ref('');

const terms = computed(() =>
  state.graph.nodes
    .filter((n) => n.kind === 'term')
    .filter((n) => {
      const s = q.value.trim().toLowerCase();
      if (!s) return true;
      return n.title.toLowerCase().includes(s) || (n.description ?? '').toLowerCase().includes(s);
    })
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title)),
);

const definesOf = (id: string) => edgesOf(id).filter((e) => e.src === id && e.type === 'defines').map((e) => nodeById(e.dst)?.title ?? e.dst);

function startEdit(id: string) {
  const n = nodeById(id);
  if (!n) return;
  editingId.value = id;
  editTitle.value = n.title;
  editDesc.value = n.description ?? '';
}
function cancelEdit() { editingId.value = null; }
function save() {
  if (!editingId.value || !editTitle.value.trim()) return;
  upsertTerm(editTitle.value.trim(), editDesc.value.trim(), editingId.value);
  editingId.value = null;
}
function addTerm() {
  if (!newTitle.value.trim()) return;
  upsertTerm(newTitle.value.trim(), newDesc.value.trim());
  newTitle.value = ''; newDesc.value = '';
}
function del(id: string, title: string) {
  if (confirm(`Delete term "${title}"? This cannot be undone from here.`)) removeNodeDirect(id);
}
</script>

<template>
  <aside class="glossary" v-if="open">
    <div class="head">
      <h2>Glossary</h2>
      <button class="close" @click="$emit('close')">×</button>
    </div>
    <p class="small note">Edits commit immediately (escape hatch, flow Q5) and are undoable from Definition.</p>

    <div class="add-form">
      <input v-model="newTitle" placeholder="New term" />
      <input v-model="newDesc" placeholder="Description" />
      <button class="primary" @click="addTerm">+ Add term</button>
    </div>

    <input class="search" v-model="q" placeholder="Search terms…" />

    <ul class="terms">
      <li v-for="t in terms" :key="t.id" class="term">
        <template v-if="editingId === t.id">
          <input v-model="editTitle" />
          <input v-model="editDesc" placeholder="Description" />
          <div class="row">
            <button class="primary" @click="save">Save</button>
            <button @click="cancelEdit">Cancel</button>
          </div>
        </template>
        <template v-else>
          <div class="row head-row">
            <b class="title" @click="startEdit(t.id)">{{ t.title }}</b>
            <Prov :source="t.source" />
          </div>
          <p class="small" v-if="t.description">{{ t.description }}</p>
          <p class="small defines" v-if="definesOf(t.id).length">defines: {{ definesOf(t.id).join(', ') }}</p>
          <div class="row actions">
            <button @click="startEdit(t.id)">Edit</button>
            <button @click="del(t.id, t.title)">Delete</button>
          </div>
        </template>
      </li>
      <li v-if="!terms.length" class="empty small">No terms match.</li>
    </ul>
  </aside>
</template>

<style scoped>
.glossary { position: fixed; right: 1rem; top: 4rem; bottom: 1rem; border-radius: 10px; width: 400px; overflow-y: auto; background: var(--panel); border-left: 1px solid var(--line); box-shadow: -8px 0 30px rgba(0, 0, 0, .1); z-index: 20; padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
.head { display: flex; justify-content: space-between; align-items: center; }
.head h2 { margin: 0; }
.close { border: none; font-size: 1.2rem; background: none; padding: 0 .3rem; }
.note { margin: 0; }
.add-form { display: flex; flex-direction: column; gap: .35rem; border: 1px solid var(--line); border-radius: 8px; padding: .6rem; }
.search { width: 100%; }
input { font: inherit; padding: .35rem .5rem; border: 1px solid var(--line); border-radius: 6px; }
.terms { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
.term { border: 1px solid var(--line); border-radius: 8px; padding: .6rem; display: flex; flex-direction: column; gap: .3rem; }
.term input { margin-bottom: .1rem; }
.row { display: flex; gap: .4rem; align-items: center; }
.head-row { justify-content: space-between; }
.title { cursor: pointer; font-size: .95rem; }
.defines { color: var(--muted); }
.actions { margin-top: .2rem; }
.empty { text-align: center; padding: 1rem 0; }
</style>
