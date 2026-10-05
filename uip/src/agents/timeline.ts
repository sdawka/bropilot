// The agent timeline (SPEC §4, §8): fixture entries per project plus everything the session adds
// (chat-staged changesets, send-back replies). Accept applies effects to WP1's in-memory graph as
// drafts; Commit flips them to committed.
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Author, Changeset, Effect, Timeline, TimelineEntry } from '../types';
import { flags } from '../flags';
import { provideChangesets, useGraphApi } from '../chat/graphApi';

export const ME: Author = { kind: 'human', id: 'you', name: 'You' };
export const S1: Author = { kind: 's1', id: 's1', name: 'S1' };
let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const useTimeline = defineStore('uip-timeline', () => {
  const project = ref<string | null>(null);
  const entries = ref<TimelineEntry[]>([]);
  /** Entries up to this index came from the fixture ("you are here" sits after them). */
  const fixtureCount = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load(id: string) {
    if (project.value === id && entries.value.length) return;
    project.value = id; loading.value = true; error.value = null;
    const urls = flags.store === 'artifacts' ? [`/api/projects/${id}/timeline`, `/projects/${id}.timeline.json`] : [`/projects/${id}.timeline.json`];
    let tl: Timeline | null = null;
    for (const u of urls) {
      try { const r = await fetch(u); if (r.ok) { tl = await r.json(); break; } } catch { /* next */ }
    }
    if (project.value !== id) return; // switched meanwhile
    entries.value = (tl?.entries ?? []).slice().sort((a, b) => a.at.localeCompare(b.at));
    fixtureCount.value = entries.value.length;
    if (!tl) error.value = `no timeline for ${id}`;
    loading.value = false;
  }

  const changesets = computed<Changeset[]>(() =>
    entries.value.flatMap((e) => (e.type === 'changeset' ? [e.changeset] : [])));
  const openChangesets = computed(() => changesets.value.filter((c) => c.status === 'open' || c.status === 'partial'));
  const needsYou = computed(() => changesets.value.filter((c) => c.status === 'open').length);
  const byId = (id: string) => changesets.value.find((c) => c.id === id);

  function push(e: TimelineEntry) { entries.value.push(e); return e; }
  function stage(cs: Changeset, nodeRefs: string[] = []) {
    return push({ id: uid('tl'), at: new Date().toISOString(), author: cs.author, nodeRefs, type: 'changeset', changeset: cs });
  }
  function nextNumber() { return Math.max(10, ...changesets.value.map((c) => c.number)) + 1; }

  const accepted = (cs: Changeset) => cs.effects.filter((e) => e.verdict !== 'rejected');
  function setVerdict(csId: string, effectId: string, verdict: Effect['verdict'], reason?: string) {
    const e = byId(csId)?.effects.find((x) => x.id === effectId);
    if (!e) return;
    e.verdict = verdict;
    if (verdict === 'rejected') e.reason = reason ?? e.reason; else delete e.reason;
  }
  function accept(csId: string) {
    const cs = byId(csId); if (!cs) return;
    const ok = accepted(cs);
    for (const e of ok) e.verdict = 'accepted';
    useGraphApi().applyEffects(ok, 'draft');
    cs.status = ok.length === cs.effects.length ? 'accepted' : 'partial';
    clearGhost(csId);
  }
  function commit(csId: string) {
    const cs = byId(csId); if (!cs) return;
    useGraphApi().applyEffects(cs.effects.filter((e) => e.verdict === 'accepted'), 'committed');
    cs.status = 'committed';
    push({ id: uid('tl'), at: new Date().toISOString(), author: ME, type: 'commit', summary: `committed #${cs.number} ${cs.title}`,
      effects: cs.effects.filter((e) => e.verdict === 'accepted').map(effectLine), nodeRefs: refsOf(cs) });
  }
  function discard(csId: string) { const cs = byId(csId); if (cs) { cs.status = 'rejected'; clearGhost(csId); } }
  /** Requires a reason on every rejected effect; the agent answers after 1.2 s. */
  function sendBack(csId: string): string | null {
    const cs = byId(csId); if (!cs) return 'unknown changeset';
    const rejected = cs.effects.filter((e) => e.verdict === 'rejected');
    if (!rejected.length) return 'reject at least one effect to send back';
    if (rejected.some((e) => !e.reason?.trim())) return 'every rejected effect needs a reason';
    cs.status = 'sent-back';
    clearGhost(csId);
    const reasons = rejected.map((e) => `“${e.reason}”`).join(', ');
    setTimeout(() => push({ id: uid('tl'), at: new Date().toISOString(), author: cs.author, nodeRefs: refsOf(cs), type: 'message',
      text: `Got it on #${cs.number}: ${reasons}. I'll keep the ${cs.effects.length - rejected.length} accepted effect(s) and come back with a revision.` }), 1200);
    return null;
  }
  function ghost(csId: string) {
    const g = useGraphApi(); const cs = byId(csId); if (!cs) return;
    g.ghost.value = cs;
    g.dispatch({ verb: 'ghost', changesetId: csId });
  }
  function clearGhost(csId?: string) {
    const g = useGraphApi();
    if (!csId || g.ghost.value?.id === csId) { g.ghost.value = null; }
  }
  provideChangesets(() => changesets.value);
  return { project, entries, fixtureCount, loading, error, load, changesets, openChangesets, needsYou, byId, push, stage,
    nextNumber, accepted, setVerdict, accept, commit, discard, sendBack, ghost, clearGhost };
});

export function effectLine(e: Effect): string {
  if (e.op === 'add-node') return `+ ${e.node?.kind} ${e.node?.title}`;
  if (e.op === 'remove-node') return `− ${e.node?.kind} ${e.node?.title ?? e.node?.id}`;
  if (e.op === 'update-node') return `~ ${e.node?.title ?? e.node?.id}`;
  if (e.op === 'add-edge') return `+ ${e.edge?.type}`;
  return `− ${e.edge?.type}`;
}
export function refsOf(cs: Changeset): string[] {
  return [...new Set(cs.effects.flatMap((e) => [e.node?.id, e.edge?.src, e.edge?.dst].filter((x): x is string => !!x)))];
}
