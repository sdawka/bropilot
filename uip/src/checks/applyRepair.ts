// WP-B: the one door from a check result's repair button to the graph (CHECKS-SPEC §4, §6 WP-B).
// question → QuestionStub in chat; mark-reviewed → useChecks().markReviewed; anything else →
// repairToEffects → a Changeset by S1 titled `Check repair: <label>`, staged in the thread
// (repairMode=thread) or accepted at once as drafts with an undo toast (repairMode=inline).
// Also: the UI's adapter over the store (Pinia unwraps refs; ChecksApi promises Refs) and the small
// verdict helpers every checks component shares.
import { computed, isRef, toRef, type Ref } from 'vue';
import { toast } from 'vue-sonner';
import type { Changeset, Graph } from '../types';
import type { CheckId, CheckResult, ChecksApi, Repair, Verdict } from './types';
import { useChecks } from './useChecks';
import { repairToEffects } from './repairs';
import { CHECKS } from './catalog';
import { flags } from '../flags';
import { useGraphApi } from '../chat/graphApi';
import { S1, refsOf, uid, useTimeline } from '../agents/timeline';
import { chatCollapsed } from '../store/ui';

export type UiChecks = ChecksApi & { isPending(subjects: string[]): boolean };

let cached: UiChecks | null = null;
/** useChecks() with real Refs, whichever way the store exposes them. */
export function checksApi(): UiChecks {
  if (cached) return cached;
  const s = useChecks() as any;
  const ref = <T,>(k: string): Ref<T> => (isRef(s[k]) ? s[k] : toRef(s, k)) as Ref<T>;
  const results = ref<Record<string, CheckResult>>('results');
  const pending = ref<Set<string>>('pending');
  const progress = ref<ChecksApi['progress']['value']>('progress');
  const pendingSubjects = computed(() => {
    const out = new Set<string>();
    for (const key of pending.value ?? []) {
      const subj = String(key).split('|')[1] ?? '';
      for (const x of subj.split(',')) if (x) out.add(x);
    }
    return out;
  });
  cached = {
    results, pending, progress,
    forEdge: (id) => s.forEdge(id), forNode: (id) => s.forNode(id), score: () => s.score(),
    ensure: (sc) => s.ensure(sc), runAll: () => s.runAll(), cancel: () => s.cancel(),
    estimate: (sc) => s.estimate(sc), previewChangeset: (cs) => s.previewChangeset(cs),
    markReviewed: (id) => s.markReviewed(id), exportJson: () => s.exportJson(),
    isPending: (subjects) => subjects.some((x) => pendingSubjects.value.has(x)),
    recheck: (sc) => s.recheck(sc),   // bypasses the cache for the scope's units
  };
  return cached;
}

export const checkLabel = (id: CheckId | string) => (CHECKS as Record<string, { label: string }>)[id]?.label ?? id;
export const VERDICT_ORDER: Record<Verdict, number> = { broken: 0, weak: 1, unknown: 2, solid: 3 };
export const worstFirst = (a: CheckResult, b: CheckResult) =>
  VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || a.confidence - b.confidence;
/** Node ids among a result's subjects (drops the `edge:<id>` marker). */
export const nodeSubjects = (r: CheckResult) => r.subjects.filter((x) => !x.startsWith('edge:'));
export const modelTag = (r: CheckResult) => (r.fake ? 'fake' : r.model);
export function age(iso: string): string {
  const t = Date.parse(iso); if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
/** Primary repair first, then the rest in catalog order. */
export const orderedRepairs = (r: CheckResult) => [...r.repairs].sort((a, b) => Number(!!b.primary) - Number(!!a.primary));

export function repairChangeset(r: Repair, result: CheckResult, graph: Graph): Changeset {
  const effects = repairToEffects(r, graph);
  const tl = useTimeline();
  return {
    id: uid('cs'), number: tl.nextNumber(), title: `Check repair: ${r.label}`, author: S1, status: 'open', effects,
    checks: { ok: effects.length, warn: 0, messages: [] },
    blast: `${checkLabel(result.checkId)} · ${result.evidence.length > 120 ? result.evidence.slice(0, 119) + '…' : result.evidence}`,
    createdAt: new Date().toISOString(),
  };
}

export function applyRepair(r: Repair, result: CheckResult): void {
  const g = useGraphApi();
  if (r.op === 'mark-reviewed') { checksApi().markReviewed(result.id); toast(`Marked reviewed: ${checkLabel(result.checkId)}`); return; }
  if (r.op === 'question') {
    const first = r.nodeIds[0] ?? nodeSubjects(result)[0] ?? null;
    const kind = r.kind ?? (first ? g.byId(first)?.kind : undefined) ?? 'note';
    chatCollapsed.value = false;
    g.openGap(kind, first, r.text);
    return;
  }
  const cs = repairChangeset(r, result, g.graph.value);
  if (!cs.effects.length) { toast('Nothing to change', { description: r.label }); return; }
  const tl = useTimeline();
  tl.stage(cs, refsOf(cs));
  if (flags.repairMode === 'thread') {
    chatCollapsed.value = false;
    toast('Repair staged for review', { description: cs.title });
    return;
  }
  // inline: accept at once (effects land as drafts); undo puts the graph back and closes the changeset
  const before = g.graph.value;
  tl.accept(cs.id);
  toast(`Applied: ${r.label}`, {
    description: 'Landed as drafts',
    action: { label: 'Undo', onClick: () => { g.graph.value = before; cs.status = 'rejected'; const live = tl.byId(cs.id); if (live) live.status = 'rejected'; } },
  });
}
