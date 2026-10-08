// checks.ts — the meta layer: kernel constraints -> violations. Pure over a Graph (no state, no
// side effects), Node-runnable (imports only ./kernel.ts and ./types.ts, both Node-runnable).
// Never auto-repairs anything; every violation carries repair options and a `raise` kind so
// store.ts::syncRaised() can turn it into a FollowUp the user answers.

import { KINDS, QUESTIONS, kindById, edgeTypeById, type KindDef, type NeedDef } from './kernel.ts';
import type { Graph, Node, Violation } from './types.ts';
import { thresholdFor } from './ai/decisionConfig.ts';
import { linkRulesFor, type LinkRule } from './ai/links.ts';

/** A rule's conditions: its description split on newlines, trimmed, non-empty — or, when it has
 * no description, one condition equal to its title (v4.1 decision: "a condition is one line of
 * the rule text"). */
export function conditionsOf(rule: Node): string[] {
  const lines = (rule.description ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines : [rule.title];
}

/** Plain djb2 string hash (hex) — the primitive `contentHash` below and `conditionPairs` share. */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/** djb2 hash (hex) of a node's meaningful content — title, description, props — or, given a plain
 * string (a rule condition line), of that string directly. Used to detect edits for
 * versioning/staleness (store.ts::commit/directCommit/revalidate) and, for the string form, as the
 * key into `reality.json`'s `matches` table (scripts/observe.mjs, this file's covered-check). */
export function contentHash(node: Node | string): string {
  if (typeof node === 'string') return djb2(node);
  const s = `${node.title}|${node.description ?? ''}|${JSON.stringify(node.props ?? {})}`;
  return djb2(s);
}

const OPTIONS: Record<string, string[]> = {
  'edge-shape': ['Widen the edge type\'s allowed kinds', 'Retype the edge', 'Remove the edge'],
  'needs-cardinality': ['Add one', 'Link an existing node', 'Mark as intentionally absent for now'],
  'rule-condition-has-test': ['Write a test for this condition', 'Merge into an existing test', 'Defer'],
  'test-has-rule': ['Link to the rule it verifies', 'Convert to a standalone health check', 'Remove the test'],
  'protocol-realised': ['Add a realising practice', 'Mark as a planned change', 'Retire the protocol'],
  'test-without-passing-fresh-result-and-no-task': ['Create a task targeting this test', 'Add it to an existing epic', 'Mark as accepted risk'],
  orphans: ['Link it to something', 'Remove it', 'Leave as a stub'],
  'suspect-edges-pending': ['Revalidate', 'Re-edit the neighbour', 'Ignore for now'],
  'task-done-without-verdict': ['Run the reviewer', 'Set status back to running', 'Accept without review'],
  'task-verified-without-green': ['Re-run the suite', 'Set status back to running'],
};

/** The repairs offered after the candidate titles when an invariant has candidates: the generic
 * "link one" option is replaced by the titles themselves, and "add one" by typing a new title. */
const LINKABLE_REPAIRS: Record<string, string[]> = {
  orphans: ['Remove it', 'Leave as a stub'],
  'needs-cardinality': ['Mark as intentionally absent for now'],
  'test-has-rule': ['Convert to a standalone health check', 'Remove the test'],
  'protocol-realised': ['Mark as a planned change', 'Retire the protocol'],
};
/** Invariants whose options are candidate node titles followed by repairs (consolidate.ts keeps
 * those whole instead of cutting a group's options to 4). */
export const CANDIDATE_INVARIANTS = new Set(Object.keys(LINKABLE_REPAIRS));

/** What picking a repair option does, in one place (store.ts::answerFollowUp reads it; no option
 * string matching lives there). `link`/`add` on the label itself stage nothing: the user names the
 * node (a candidate title links it, a new title adds it with the needed edge). `defer` is the Now
 * strip's Skip: deferred, no answer, nothing staged. `remove` stages remove-node for the subject.
 * An option not in this table (Revalidate, Accept without review …) is recorded as the answer and
 * stages nothing. */
export const OPTION_ACTS: Record<string, { act: 'link' | 'add' | 'defer' | 'remove' }> = {
  'Link it to something': { act: 'link' },
  'Link an existing node': { act: 'link' },
  'Link to the rule it verifies': { act: 'link' },
  'Merge into an existing test': { act: 'link' },
  'Add one': { act: 'add' },
  'Write a test for this condition': { act: 'add' },
  'Add a realising practice': { act: 'add' },
  'Leave as a stub': { act: 'defer' },
  'Mark as intentionally absent for now': { act: 'defer' },
  'Defer': { act: 'defer' },
  'Mark as a planned change': { act: 'defer' },
  'Ignore for now': { act: 'defer' },
  'Remove it': { act: 'remove' },
  'Remove the test': { act: 'remove' },
  'Retire the protocol': { act: 'remove' },
};
const ACT_BY_LABEL = new Map(Object.entries(OPTION_ACTS).map(([label, a]) => [label.toLowerCase(), a.act]));
/** Every repair label any invariant offers (lower-cased): used to tell candidate titles from repairs. */
const REPAIR_LABELS = new Set([...Object.values(OPTIONS).flat(), ...Object.keys(OPTION_ACTS)].map((l) => l.toLowerCase()));

/** The act of an answer that is exactly a repair label (case-insensitive); `'noted'` for a repair
 * label with no act; `null` when the answer is not a repair label (a title, or free text). */
export function actOf(answer: string): 'link' | 'add' | 'defer' | 'remove' | 'noted' | null {
  const said = answer.trim().toLowerCase();
  return ACT_BY_LABEL.get(said) ?? (REPAIR_LABELS.has(said) ? 'noted' : null);
}
export const isRepairLabel = (label: string) => REPAIR_LABELS.has(label.trim().toLowerCase());

/** Which invariant a kind's `needs` row raises as (rule's own row is skipped: rule-condition-has-test
 * is the finer per-line check that replaces it). */
function needInvariant(kind: KindDef, need: NeedDef): string | null {
  if (kind.id === 'rule') return null;
  if (kind.id === 'test' && need.edge === 'verifies') return 'test-has-rule';
  if (kind.id === 'protocol' && need.edge === 'realises') return 'protocol-realised';
  return 'needs-cardinality';
}

/** Up to 6 titles of nodes of `kinds` other than `selfId`: kind by kind in the order given (a
 * metric orphan offers outcomes before bets), newest first within a kind. */
function candidateTitles(graph: Graph, kinds: string[], selfId: string): string[] {
  return [...new Set(kinds)].flatMap((k) => graph.nodes.filter((c) => c.kind === k && c.id !== selfId).reverse()).slice(0, 6).map((c) => c.title);
}

/** How a violation is repaired by naming nodes: the subject, the edge rules from the subject to
 * the needed kind(s) (same shape as LINKS, so ai/links.ts::endpoints applies), whether a typed
 * title that matches no node may add one (a need can; an orphan only links), and props for an
 * added node (a test's condition line). `null`: not repaired by naming nodes (edge-shape, …). */
export interface Repair { subject: string; rules: LinkRule[]; add: boolean; props?: Record<string, string> }
export function repairOf(v: Violation, graph: Graph): Repair | null {
  const subject = graph.nodes.find((n) => n.id === v.subjects[0]);
  if (!subject) return null;
  if (v.invariant === 'orphans') return { subject: subject.id, rules: linkRulesFor(subject.kind), add: false };
  if (v.invariant === 'rule-condition-has-test') {
    const i = Number(/^cond(\d+)$/.exec(v.subjects[1] ?? '')?.[1] ?? -1);
    const cond = conditionsOf(subject)[i];
    return { subject: subject.id, rules: [{ edge: 'verifies', dir: 'in', target: 'test' }], add: true, props: cond ? { condition: cond } : undefined };
  }
  const kind = kindById[subject.kind];
  const need = kind?.needs?.find((n) => needInvariant(kind, n) === v.invariant && n.produces === v.produces && n.produces);
  if (!need?.produces) return null;
  return { subject: subject.id, rules: [{ edge: need.edge, dir: need.dir, target: need.produces }], add: true };
}

/** Every test a task targets reports a fresh, passing result (v4.2, S152: the reviewer gate).
 * `store.ts::applyReality` merges `reality.json`'s test-result props and edge `trace` before this
 * runs, so a stale (`trace:'suspect'`) or missing report already reads as not-green here. */
function taskTargetsGreen(task: Node, graph: Graph, byId: Record<string, Node>): boolean {
  const targets = graph.edges.filter((e) => e.type === 'targets' && e.src === task.id).map((e) => byId[e.dst]).filter(Boolean) as Node[];
  if (!targets.length) return false;
  return targets.every((t) => {
    const repEdge = graph.edges.find((e) => e.type === 'reports' && e.dst === t.id);
    if (!repEdge || repEdge.trace === 'suspect') return false;
    return byId[repEdge.src]?.props?.status === 'pass';
  });
}

/** System One's condition-match cache: contentHash(condition line) -> testId -> noul probability
 * that the test verifies the rule. Written by scripts/observe.mjs, read here. */
export interface RealityMatches { matches?: Record<string, Record<string, number>> }

/** Is `test` covered for `cond` — either by an exact string match (the v4.1 rule) or by a cached
 * System One match at/above the `condition-match` threshold? Shared by checkInvariants and (later)
 * review-change so both read the cache the same way. */
export function isCovered(cond: string, test: Node, matches: RealityMatches['matches']): boolean {
  if ((test.props?.condition ?? '').trim() === cond) return true;
  const p = matches?.[contentHash(cond)]?.[test.id];
  return p !== undefined && p >= thresholdFor('condition-match');
}

/** Every (rule condition, test that verifies the rule) pair whose strings are NOT already exactly
 * equal — the candidates worth asking System One about a condition-match. Pure, used by
 * scripts/observe.mjs to build its noul questions. */
export function conditionPairs(graph: Graph): {
  cond: string; condHash: string; ruleId: string; ruleTitle: string; testId: string; testTitle: string; testCondition: string;
}[] {
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n])) as Record<string, Node>;
  const out: { cond: string; condHash: string; ruleId: string; ruleTitle: string; testId: string; testTitle: string; testCondition: string }[] = [];
  for (const rule of graph.nodes.filter((n) => n.kind === 'rule')) {
    const conds = conditionsOf(rule);
    const tests = graph.edges.filter((e) => e.type === 'verifies' && e.dst === rule.id).map((e) => byId[e.src]).filter(Boolean) as Node[];
    for (const cond of conds) {
      for (const test of tests) {
        const testCondition = (test.props?.condition ?? '').trim();
        if (testCondition === cond) continue;
        out.push({ cond, condHash: contentHash(cond), ruleId: rule.id, ruleTitle: rule.title, testId: test.id, testTitle: test.title, testCondition });
      }
    }
  }
  return out;
}

/** `answered`: ids of template questions answered at least once (store.ts passes them). A need
 * whose kind a template question produces waits until that question was answered or the graph
 * already has a node of the kind, so "the bet needs a metric" waits for q-metric (v4.4). */
export function checkInvariants(graph: Graph, reality: RealityMatches = {}, opts: { answered?: Iterable<string> } = {}): Violation[] {
  const answered = new Set(opts.answered ?? []);
  const needReady = (kindId: string) => {
    const q = QUESTIONS.find((q) => q.produces === kindId);
    return !q || answered.has(q.id) || graph.nodes.some((n) => n.kind === kindId);
  };
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n])) as Record<string, Node>;
  const violations: Violation[] = [];

  // ── edge-shape: every edge's endpoints must fit the edge type's declared from/to kinds ────────
  for (const e of graph.edges) {
    const et = edgeTypeById[e.type];
    if (!et) continue; // unknown edge type: dogfood's job, not ours
    const s = byId[e.src], d = byId[e.dst];
    if (!s || !d) continue; // dangling edge: dogfood's job, not ours
    const fromOk = et.from.length === 0 || et.from.includes(s.kind);
    const toOk = et.to.length === 0 || et.to.includes(d.kind);
    if (!fromOk || !toOk) {
      violations.push({
        id: `edge-shape:${e.id}`,
        invariant: 'edge-shape',
        subjects: [e.id, e.src, e.dst],
        message: `Edge "${e.type}" from ${s.kind} "${s.title}" to ${d.kind} "${d.title}" doesn't fit its declared shape (from: ${et.from.join(', ') || 'any'}; to: ${et.to.join(', ') || 'any'}).`,
        options: OPTIONS['edge-shape'],
        raise: 'question',
      });
    }
  }

  // ── needs-cardinality: KindDef.needs, generic engine ────────────────────────────────────────
  // rule's own needs entry is skipped here — rule-condition-has-test below is the finer-grained
  // per-line check that replaces it for rules.
  // Options: up to 6 titles of the needed kind, then the repairs (store.ts turns a title into the edge).
  for (const kind of KINDS) {
    if (!kind.needs) continue;
    for (const need of kind.needs) {
      const invariantId = needInvariant(kind, need);
      if (!invariantId) continue;
      if (need.produces && !needReady(need.produces)) continue;
      for (const n of graph.nodes.filter((n) => n.kind === kind.id)) {
        const count = graph.edges.filter((e) => {
          if (e.type !== need.edge) return false;
          if (need.dir === 'out' ? e.src !== n.id : e.dst !== n.id) return false;
          if (need.produces) {
            const other = byId[need.dir === 'out' ? e.dst : e.src];
            if (other?.kind !== need.produces) return false;
          }
          return true;
        }).length;
        if (count < need.min) {
          const candidates = need.produces ? candidateTitles(graph, [need.produces], n.id) : [];
          violations.push({
            id: `${invariantId}:${n.id}`,
            invariant: invariantId,
            subjects: [n.id],
            message: need.ask.replace('{title}', n.title),
            options: candidates.length ? [...candidates, ...LINKABLE_REPAIRS[invariantId]] : OPTIONS[invariantId],
            raise: 'question',
            produces: need.produces,
          });
        }
      }
    }
  }

  // ── rule-condition-has-test: every condition line of every rule needs a test naming it ───────
  for (const rule of graph.nodes.filter((n) => n.kind === 'rule')) {
    const conds = conditionsOf(rule);
    const verifyingTests = graph.edges.filter((e) => e.type === 'verifies' && e.dst === rule.id).map((e) => byId[e.src]).filter(Boolean) as Node[];
    conds.forEach((cond, i) => {
      const covered = verifyingTests.some((test) => isCovered(cond, test, reality.matches));
      if (!covered) {
        violations.push({
          id: `rule-condition-has-test:${rule.id}+cond${i}`,
          invariant: 'rule-condition-has-test',
          subjects: [rule.id, `cond${i}`],
          message: `No test names the condition "${cond}" of rule "${rule.title}".`,
          options: OPTIONS['rule-condition-has-test'],
          raise: 'question',
          produces: 'test',
        });
      }
    });
  }

  // ── test-without-passing-fresh-result-and-no-task ───────────────────────────────────────────
  for (const test of graph.nodes.filter((n) => n.kind === 'test')) {
    const resultEdge = graph.edges.find((e) => e.type === 'reports' && e.dst === test.id);
    const result = resultEdge ? byId[resultEdge.src] : undefined;
    const status = result?.props?.status;
    const stale = resultEdge?.trace === 'suspect';
    const bad = !result || status !== 'pass' || stale;
    if (!bad) continue;
    const hasTask = graph.nodes.some(
      (n) => (n.kind === 'task' || n.kind === 'epic') && graph.edges.some((e) => e.type === 'targets' && e.src === n.id && e.dst === test.id),
    );
    if (!hasTask) {
      violations.push({
        id: `test-without-passing-fresh-result-and-no-task:${test.id}`,
        invariant: 'test-without-passing-fresh-result-and-no-task',
        subjects: [test.id],
        message: `"${test.title}" is ${status ?? 'missing'}${stale ? ' (stale)' : ''} and no task or epic targets it.`,
        options: OPTIONS['test-without-passing-fresh-result-and-no-task'],
        raise: 'task',
        produces: 'task',
      });
    }
  }

  // ── orphans: same rule as store.ts's dogfood check (singular kinds and terms may stand alone) ─
  // Options: up to 6 titles of the kinds it can be linked with (both directions), then the repairs.
  // A kind with link rules is raised only once something to link to exists — an audience committed
  // before any context is not a gap yet, it is the template still running (2026-09-28).
  for (const n of graph.nodes) {
    if (kindById[n.kind]?.singular || n.kind === 'term') continue;
    if (!graph.edges.some((e) => e.src === n.id || e.dst === n.id)) {
      const rules = linkRulesFor(n.kind);
      const candidates = candidateTitles(graph, rules.map((r) => r.target), n.id);
      if (rules.length && !candidates.length) continue;
      violations.push({
        id: `orphans:${n.id}`,
        invariant: 'orphans',
        subjects: [n.id],
        message: `"${n.title}" (${n.kind}) has no edges at all.`,
        options: candidates.length ? [...candidates, ...LINKABLE_REPAIRS.orphans] : OPTIONS.orphans,
        raise: 'question',
      });
    }
  }

  // ── suspect-edges-pending: one violation per node touched by at least one suspect edge ────────
  const suspectByNode = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.trace !== 'suspect') continue;
    suspectByNode.set(e.src, (suspectByNode.get(e.src) ?? 0) + 1);
    suspectByNode.set(e.dst, (suspectByNode.get(e.dst) ?? 0) + 1);
  }
  for (const [nodeId, count] of suspectByNode) {
    const n = byId[nodeId];
    if (!n) continue;
    violations.push({
      id: `suspect-edges-pending:${nodeId}`,
      invariant: 'suspect-edges-pending',
      subjects: [nodeId],
      message: `"${n.title}" has ${count} suspect edge${count === 1 ? '' : 's'} pending revalidation.`,
      options: OPTIONS['suspect-edges-pending'],
      raise: 'question',
    });
  }

  // ── task lifecycle gate: done/verified needs a verdict; verified needs every target green ─────
  for (const task of graph.nodes.filter((n) => n.kind === 'task')) {
    const status = task.props?.status;
    const hasVerdict = !!task.props?.verdict;
    if ((status === 'done' || status === 'verified') && !hasVerdict) {
      violations.push({
        id: `task-done-without-verdict:${task.id}`,
        invariant: 'task-done-without-verdict',
        subjects: [task.id],
        message: `"${task.title}" is ${status} with no reviewer verdict recorded.`,
        options: OPTIONS['task-done-without-verdict'],
        raise: 'question',
      });
    }
    if (status === 'verified' && !taskTargetsGreen(task, graph, byId)) {
      violations.push({
        id: `task-verified-without-green:${task.id}`,
        invariant: 'task-verified-without-green',
        subjects: [task.id],
        message: `"${task.title}" is verified but not every targeted test is pass and fresh.`,
        options: OPTIONS['task-verified-without-green'],
        raise: 'task',
      });
    }
  }

  return violations;
}
