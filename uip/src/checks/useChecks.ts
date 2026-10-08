// CHECKS-SPEC §3.4-3.5 / §4: the Pinia store behind every checks surface. `useChecks()` returns the
// ChecksApi with real Refs (storeToRefs), so components read `.value` like GraphApi.
import { defineStore, storeToRefs } from 'pinia';
import { computed, ref, shallowRef, watch } from 'vue';
import type { Changeset, Graph } from '../types';
import { flags } from '../flags';
import { ontology } from '../s1/ontologyData';
import { useGraph } from '../store/graph';
import type { CheckOntology, CheckProgress, CheckResult, CheckScope, ChecksApi, CostEstimate } from './types';
import { routeEdge } from './catalog';
import { evictSubjects, reviewed } from './cache';
import { estimate as estimateUnits } from './cost';
import { makeCtx, planChecks } from './plan';
import { fromCache, runChecks, sortResults } from './run';

const onto = ontology as unknown as CheckOntology;
const DEBOUNCE_MS = 250;

const useChecksStore = defineStore('checks', () => {
  const g = useGraph();
  const results = ref<Record<string, CheckResult>>({});
  const pending = ref<Set<string>>(new Set());
  const progress = shallowRef<CheckProgress | null>(null);
  let ctl: AbortController | null = null;

  const projectId = () => g.project.value?.id ?? g.view.value.project ?? '';
  const ctxOf = (graph: Graph = g.graph.value) => makeCtx(graph, onto, projectId());

  // index: subject id → result keys
  const bySubject = computed(() => {
    const m = new Map<string, string[]>();
    for (const r of Object.values(results.value)) for (const s of r.subjects) (m.get(s) ?? m.set(s, []).get(s)!).push(r.id);
    return m;
  });

  function merge(rs: CheckResult[]) {
    if (!rs.length) return;
    const next = { ...results.value };
    for (const r of rs) next[r.id] = r;
    results.value = next;
  }
  function setPending(keys: string[], on: boolean) {
    const s = new Set(pending.value);
    for (const k of keys) on ? s.add(k) : s.delete(k);
    pending.value = s;
  }

  /** Units of the scope that have no result, or whose result was computed from other inputs. */
  async function stale(scope: CheckScope) {
    const ctx = ctxOf();
    const units = planChecks(ctx.graph, onto, scope, ctx.project).filter((u) => !pending.value.has(u.key));
    const { known, todo } = await fromCache(units, ctx, flags.checkModel);
    merge([...known.values()].filter((r) => results.value[r.id]?.hash !== r.hash));
    return { ctx, todo };
  }

  /** all: top-bar progress (runAll). fresh: bypass the cache for these units (recheck). mix: lazy packing. */
  async function run(scope: CheckScope, o: { all?: boolean; fresh?: boolean; mix?: boolean } = {}) {
    const all = !!o.all;
    let ctx = ctxOf(), todo;
    if (o.fresh) todo = planChecks(ctx.graph, onto, scope, ctx.project).filter((u) => !pending.value.has(u.key));
    else ({ ctx, todo } = await stale(scope));
    if (!todo.length) return;
    if (!ctl || ctl.signal.aborted) ctl = new AbortController();
    const signal = ctl.signal;
    const keys = todo.map((u) => u.key);
    setPending(keys, true);
    try {
      const rs = await runChecks(todo, { model: flags.checkModel, ctx, signal, useCache: !o.fresh, mixSmall: !!o.mix,
        onProgress: all ? (p) => { progress.value = p; } : undefined });
      if (projectId() === ctx.project) merge(rs);
    } finally {
      setPending(keys, false);
      if (all) progress.value = null;
    }
  }

  // ensure(): debounced 250 ms, all scopes in the window planned as one
  let queued: CheckScope[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiters: (() => void)[] = [];
  function ensure(scope: CheckScope): Promise<void> {
    if (flags.checks === 'off') return Promise.resolve();
    queued.push(scope);
    if (timer) clearTimeout(timer);
    return new Promise<void>((resolve) => {
      waiters.push(resolve);
      timer = setTimeout(async () => {
        const scopes = queued, done = waiters;
        queued = []; waiters = []; timer = null;
        const u: CheckScope = { nodeIds: [...new Set(scopes.flatMap((s) => s.nodeIds ?? []))], edgeIds: [...new Set(scopes.flatMap((s) => s.edgeIds ?? []))] };
        const wantsAll = scopes.some((s) => !s.nodeIds && !s.edgeIds);
        const fams = scopes.every((s) => s.families) ? [...new Set(scopes.flatMap((s) => s.families!))] : undefined;
        const ids = scopes.every((s) => s.checkIds) ? [...new Set(scopes.flatMap((s) => s.checkIds!))] : undefined;
        try { await run({ ...(wantsAll ? {} : u), families: fams, checkIds: ids }, { mix: flags.checks === 'lazy' }); } finally { done.forEach((f) => f()); }
      }, DEBOUNCE_MS);
    });
  }

  const runAll = () => run({}, { all: true });
  /** Like ensure, but immediate and bypassing the cache for the scope's units (the `Re-check` buttons). Works under `off`. */
  const recheck = (scope: CheckScope) => run(scope, { fresh: true, mix: true });
  function cancel() { ctl?.abort(); ctl = null; progress.value = null; pending.value = new Set(); }

  function forEdge(edgeId: string): CheckResult | undefined {
    const keys = bySubject.value.get(`edge:${edgeId}`) ?? [];
    return keys.map((k) => results.value[k]).find((r) => r && r.subjects[0] === `edge:${edgeId}`);
  }
  function forNode(nodeId: string): CheckResult[] {
    return sortResults((bySubject.value.get(nodeId) ?? []).map((k) => results.value[k]).filter(Boolean));
  }
  function score() {
    const s = { solid: 0, weak: 0, broken: 0, unknown: 0, checked: 0, edges: 0 };
    // zeros, never undefined: fake results are memory-only, so after a reload the score may be empty (§3.4)
    for (const r of Object.values(results.value ?? {})) {
      if (r?.family !== 'solidity' || !(r.verdict in s)) continue;
      s[r.verdict]++; s.checked++;
    }
    const ctx = ctxOf();
    s.edges = (ctx.graph?.edges ?? []).filter((e) => { const c = routeEdge(e, ctx); return c !== null && c.startsWith('sol-'); }).length;
    return s;
  }
  function estimate(scope: CheckScope = {}): CostEstimate {
    const ctx = ctxOf();
    const units = planChecks(ctx.graph, onto, scope, ctx.project).filter((u) => !results.value[u.key]);
    return estimateUnits(units, flags.checkModel);
  }

  /** §3.5: graph + pending effects (adds/updates as drafts, removals dropped), checks on what they touch. */
  async function previewChangeset(cs: Changeset) {
    const base = g.graph.value;
    const nodes = new Map(base.nodes.map((n) => [n.id, n])), edges = new Map(base.edges.map((e) => [e.id, e]));
    const touched = new Set<string>();
    for (const fx of cs.effects) {
      if (fx.verdict === 'rejected') continue;
      if (fx.node) touched.add(fx.node.id);
      if (fx.op === 'add-node' || fx.op === 'update-node') { if (fx.node) nodes.set(fx.node.id, { ...fx.node, status: 'draft' }); }
      else if (fx.op === 'remove-node') { if (fx.node) nodes.delete(fx.node.id); }
      else if (fx.op === 'add-edge' && fx.edge) { edges.set(fx.edge.id, { ...fx.edge, status: 'draft' }); touched.add(fx.edge.id); touched.add(fx.edge.src); touched.add(fx.edge.dst); }
      else if (fx.op === 'remove-edge' && fx.edge) edges.delete(fx.edge.id);
    }
    const g2: Graph = { nodes: [...nodes.values()], edges: [...edges.values()] };
    const ctx = makeCtx(g2, onto, projectId());
    const ids = [...touched];
    const units = planChecks(g2, onto, { nodeIds: ids, edgeIds: ids }, ctx.project);
    const rs = units.length ? await runChecks(units, { model: flags.checkModel, ctx }) : [];
    const n = { solid: 0, weak: 0, broken: 0, unknown: 0 };
    for (const r of rs) n[r.verdict]++;
    return { ...n, results: rs };
  }

  function markReviewed(resultId: string) {
    const r = results.value[resultId];
    if (!r) return;
    reviewed.mark(projectId(), r.id, r.hash);
    merge([{ ...r, verdict: 'solid', finding: 'reviewed', repairs: [] }]);
  }
  function exportJson(): string {
    return JSON.stringify({ project: projectId(), at: new Date().toISOString(), model: flags.checkModel, results: sortResults(Object.values(results.value)) }, null, 1);
  }

  // project open: hydrate from cache (no calls), then runAll under `eager`
  watch(() => g.project.value?.id, async (id) => {
    cancel();
    results.value = {};
    if (!id) return;
    const ctx = ctxOf();
    const { known } = await fromCache(planChecks(ctx.graph, onto, {}, id), ctx, flags.checkModel);
    if (projectId() === id) merge([...known.values()]);
    if (flags.checks === 'eager' && projectId() === id) await runAll();
  }, { immediate: true });

  // removed nodes/edges drop their in-memory results
  watch(() => g.graph.value, (graph) => {
    if (!graph.nodes.length) return; // project still loading
    const live = new Set([...graph.nodes.map((n) => n.id), ...graph.edges.map((e) => `edge:${e.id}`)]);
    const gone = new Set<string>();
    for (const r of Object.values(results.value)) for (const s of r.subjects) {
      if (!live.has(s) && !isNeedSlot(s)) gone.add(s.startsWith('edge:') ? s.slice(5) : s);
    }
    if (gone.size) results.value = evictSubjects(results.value, gone);
  }, { deep: false });

  return { results, pending, progress, forEdge, forNode, score, ensure, recheck, runAll, cancel, estimate, previewChangeset, markReviewed, exportJson };
});

/** cmp-need subjects end with the need's edge type (`[nodeId, 'verifies']`), which is not a node id. */
const EDGE_IDS = new Set(onto.EDGE_TYPES.map((e) => e.id));
const isNeedSlot = (s: string) => EDGE_IDS.has(s);

let api: ChecksApi | null = null;
export function useChecks(): ChecksApi {
  if (api) return api;
  const s = useChecksStore();
  const { results, pending, progress } = storeToRefs(s);
  api = { results, pending, progress, forEdge: s.forEdge, forNode: s.forNode, score: s.score, ensure: s.ensure, runAll: s.runAll,
    recheck: s.recheck, cancel: s.cancel, estimate: s.estimate, previewChangeset: s.previewChangeset, markReviewed: s.markReviewed, exportJson: s.exportJson };
  return api;
}
