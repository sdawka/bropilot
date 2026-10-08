// CHECKS-SPEC §3.2: what to ask. Code decides structure; this only collects the units each check plans. Pure.
import type { Edge, Graph, Node } from '../types';
import type { CheckOntology, CheckResult, CheckScope, CheckUnit, PlanCtx } from './types';
import { CHECKS, CHECK_IDS, retypeUnit } from './catalog';

const ctxMemo = new WeakMap<Graph, PlanCtx>();
export function makeCtx(graph: Graph, onto: CheckOntology, project: string): PlanCtx {
  const hit = ctxMemo.get(graph);
  if (hit && hit.onto === onto && hit.project === project) return hit;
  const byId = new Map<string, Node>(graph.nodes.map((n) => [n.id, n]));
  const out = new Map<string, Edge[]>(), inn = new Map<string, Edge[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.src) || !byId.has(e.dst)) continue;
    (out.get(e.src) ?? out.set(e.src, []).get(e.src)!).push(e);
    (inn.get(e.dst) ?? inn.set(e.dst, []).get(e.dst)!).push(e);
  }
  const ctx: PlanCtx = { graph, onto, project, byId, out, in: inn };
  ctxMemo.set(graph, ctx);
  return ctx;
}

/** Does the unit fall inside the scope's nodes/edges? (No node/edge scope = everything.) */
export function inScope(u: CheckUnit, scope: CheckScope): boolean {
  if (scope.families && !scope.families.includes(u.family)) return false;
  if (scope.checkIds && !scope.checkIds.includes(u.checkId)) return false;
  if (!scope.nodeIds && !scope.edgeIds) return true;
  const want = new Set([...(scope.nodeIds ?? []), ...(scope.edgeIds ?? []).map((id) => `edge:${id}`)]);
  return u.subjects.some((s) => want.has(s));
}

/** Units sorted by key; sol-retype is never planned here (it is the second pass of runChecks). */
export function planChecks(graph: Graph, onto: CheckOntology, scope: CheckScope = {}, project = ''): CheckUnit[] {
  const ctx = makeCtx(graph, onto, project);
  const seen = new Set<string>();
  const units: CheckUnit[] = [];
  for (const id of CHECK_IDS) {
    if (id === 'sol-retype') continue;
    if (scope.checkIds && !scope.checkIds.includes(id)) continue;
    if (scope.families && !scope.families.includes(CHECKS[id].family)) continue;
    for (const u of CHECKS[id].plan(ctx, scope)) {
      if (seen.has(u.key) || !inScope(u, scope)) continue;
      seen.add(u.key);
      units.push(u);
    }
  }
  return units.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** One sol-retype unit per weak|broken solidity result. */
export function planRetype(results: CheckResult[], ctx: PlanCtx): CheckUnit[] {
  return results.filter((r) => r.family === 'solidity' && r.checkId !== 'sol-retype' && (r.verdict === 'weak' || r.verdict === 'broken'))
    .map((r) => retypeUnit(r, ctx)).filter((u): u is CheckUnit => !!u)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
