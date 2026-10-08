// src/checks/types.ts
import type { Ref } from 'vue';
import type { Band, Changeset, Edge, Graph, Node, S1Answer, S1Question } from '../types';
import type { Ontology, OntoEdgeType } from '../s1/onto';
export type Family = 'solidity' | 'completeness' | 'consistency';
export type CheckId =
  | 'sol-edge' | 'sol-satisfies' | 'sol-implements' | 'sol-verifies' | 'sol-evidence' | 'sol-monitors' | 'sol-realises' | 'sol-bet-metric' | 'sol-retype'
  | 'cmp-need' | 'cmp-problem-audience' | 'cmp-outcome-metric' | 'cmp-interface-carries' | 'cmp-flow-screen' | 'cmp-purpose-outcome'
  | 'con-rule-pair' | 'con-bet-evidence' | 'con-outcome-metric' | 'con-test-case' | 'con-feature-stages' | 'con-dup-title' | 'con-summary' | 'con-term-usage';
export type Verdict = 'solid' | 'weak' | 'broken' | 'unknown';
export type CheckModel = 'flash' | 'escalate' | 'clef';
export interface CheckOntology extends Ontology {
  EDGE_TYPES: (OntoEdgeType & { hint: string })[];
  RELATIONS: { src: string; edge: string; dst: string; many?: boolean; at: 'src' | 'dst' | 'both'; need?: string }[];
  LIFECYCLE_STAGES: string[];
}
export interface CheckScope { nodeIds?: string[]; edgeIds?: string[]; families?: Family[]; checkIds?: CheckId[] }
export interface CheckUnit {
  key: string;                                   // `${checkId}|${subjects.join(',')}`
  checkId: CheckId; family: Family;
  subjects: string[];                            // node ids; an edge is 'edge:<id>', then its src and dst ids
  questions: Record<string, S1Question>;         // keys: unit.key or `${unit.key}|${slot}`; empty when `code` is set
  meta: Record<string, string | string[]>;       // ids the resolver needs (edgeId, slots, candidate ids, linked flag)
  code?: { verdict: Verdict; finding: string; evidence: string; repairs: Repair[] };
}
export type Repair = { label: string; primary?: boolean } & (
  | { op: 'remove-edge'; edgeId: string }
  | { op: 'retype-edge'; edgeId: string; to: string }
  | { op: 'add-edge'; src: string; dst: string; type: string }
  | { op: 'add-node'; node: { kind: string; title: string; props?: Record<string, string> }; link?: { type: string; dir: 'out' | 'in'; other: string } }
  | { op: 'update-node'; nodeId: string; props: Record<string, string> }
  | { op: 'merge-nodes'; keep: string; drop: string }
  | { op: 'question'; text: string; nodeIds: string[]; kind: string | null }
  | { op: 'mark-reviewed' });
export interface CheckResult {
  id: string;                                    // = unit.key
  checkId: CheckId; family: Family; subjects: string[];
  verdict: Verdict; finding: string; confidence: number; band: Band;
  answers: Record<string, S1Answer>; evidence: string; repairs: Repair[];
  at: string; model: string; fake: boolean; hash: string;
}
export interface PlanCtx { graph: Graph; onto: CheckOntology; project: string; byId: Map<string, Node>;
  out: Map<string, Edge[]>; in: Map<string, Edge[]> }
export interface CheckDef { id: CheckId; family: Family; label: string; findings: readonly string[];
  plan(ctx: PlanCtx, scope: CheckScope): CheckUnit[];
  resolve(unit: CheckUnit, answers: Record<string, S1Answer>, ctx: PlanCtx): Omit<CheckResult, 'at' | 'model' | 'fake' | 'hash'>;
  fake(unit: CheckUnit, ctx: PlanCtx): Record<string, S1Answer> }
export interface CheckProgress { done: number; total: number; questions: number; requests: number; usd: number }
export interface CostEstimate { questions: number; requests: number; tokens: number; usd: number; model: CheckModel }
export interface ChecksApi {
  results: Ref<Record<string, CheckResult>>; pending: Ref<Set<string>>; progress: Ref<CheckProgress | null>;
  forEdge(edgeId: string): CheckResult | undefined;       // its solidity result, retype folded in
  forNode(nodeId: string): CheckResult[];
  score(): { solid: number; weak: number; broken: number; unknown: number; checked: number; edges: number };
  ensure(scope: CheckScope): Promise<void>;               // debounced 250 ms; runs only uncached units
  recheck(scope: CheckScope): Promise<void>;              // immediate; bypasses the cache for the scope's units, replaces their results
  runAll(): Promise<void>; cancel(): void;
  estimate(scope?: CheckScope): CostEstimate;
  previewChangeset(cs: Changeset): Promise<{ solid: number; weak: number; broken: number; unknown: number; results: CheckResult[] }>;
  markReviewed(resultId: string): void;
  exportJson(): string;
}
