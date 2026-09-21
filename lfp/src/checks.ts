// checks.ts — the meta layer: kernel constraints -> violations. Pure over a Graph (no state, no
// side effects), Node-runnable (imports only ./kernel.ts and ./types.ts, both Node-runnable).
// Never auto-repairs anything; every violation carries repair options and a `raise` kind so
// store.ts::syncRaised() can turn it into a FollowUp the user answers.

import { KINDS, kindById, edgeTypeById } from './kernel.ts';
import type { Graph, Node, Violation } from './types.ts';

/** A rule's conditions: its description split on newlines, trimmed, non-empty — or, when it has
 * no description, one condition equal to its title (v4.1 decision: "a condition is one line of
 * the rule text"). */
export function conditionsOf(rule: Node): string[] {
  const lines = (rule.description ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines : [rule.title];
}

/** Simple djb2 string hash (hex) of a node's meaningful content — title, description, props.
 * Used to detect edits for versioning/staleness (store.ts::commit/directCommit/revalidate). */
export function contentHash(node: Node): string {
  const s = `${node.title}|${node.description ?? ''}|${JSON.stringify(node.props ?? {})}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
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
};

export function checkInvariants(graph: Graph): Violation[] {
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
  for (const kind of KINDS) {
    if (!kind.needs) continue;
    for (const need of kind.needs) {
      const invariantId =
        kind.id === 'rule' ? null :
        kind.id === 'test' && need.edge === 'verifies' ? 'test-has-rule' :
        kind.id === 'protocol' && need.edge === 'realises' ? 'protocol-realised' :
        'needs-cardinality';
      if (!invariantId) continue;
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
          violations.push({
            id: `${invariantId}:${n.id}`,
            invariant: invariantId,
            subjects: [n.id],
            message: need.ask.replace('{title}', n.title),
            options: OPTIONS[invariantId],
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
    conds.forEach((cond, i) => {
      const covered = graph.edges.some(
        (e) => e.type === 'verifies' && e.dst === rule.id && (byId[e.src]?.props?.condition ?? '').trim() === cond,
      );
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
  for (const n of graph.nodes) {
    if (kindById[n.kind]?.singular || n.kind === 'term') continue;
    if (!graph.edges.some((e) => e.src === n.id || e.dst === n.id)) {
      violations.push({
        id: `orphans:${n.id}`,
        invariant: 'orphans',
        subjects: [n.id],
        message: `"${n.title}" (${n.kind}) has no edges at all.`,
        options: OPTIONS.orphans,
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

  return violations;
}
