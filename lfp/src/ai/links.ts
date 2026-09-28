// LINKS (v4.3): the edge a template-produced node needs so it isn't born an orphan. Node-runnable
// (imports only kernel.ts) so scripts and the build can check it. Read by ai/functions/link-answer.ts,
// which proposes these edges for the nodes a just-staged answer added.
//
// `dir: 'in'` means target → edge → new node (audience has context); `'out'` means new node → edge →
// target. `many` means one new node may link to every candidate of the target kind. Kinds with no
// entry (name, purpose, summary, audience, outcome) are linked elsewhere or are singular.
import { EDGE_TYPES } from '../kernel.ts';

export interface LinkRule { edge: string; dir: 'out' | 'in'; target: string; many?: boolean }

export const LINKS: Record<string, LinkRule> = {
  context: { edge: 'has', dir: 'in', target: 'audience', many: true },
  usecase: { edge: 'has', dir: 'in', target: 'audience', many: true },
  problem: { edge: 'has', dir: 'in', target: 'audience', many: true },
  hypothesis: { edge: 'references', dir: 'out', target: 'outcome' },
  assumption: { edge: 'references', dir: 'out', target: 'hypothesis' },
  metric: { edge: 'monitors', dir: 'out', target: 'outcome' },
  capability: { edge: 'satisfies', dir: 'out', target: 'problem', many: true },
};

/** Every rule must name a real edge type whose from/to admit the pair, or the module fails to load. */
for (const [kind, rule] of Object.entries(LINKS)) {
  const et = EDGE_TYPES.find((e) => e.id === rule.edge);
  if (!et) throw new Error(`ai/links: LINKS.${kind} names unknown edge type "${rule.edge}"`);
  const [from, to] = rule.dir === 'out' ? [kind, rule.target] : [rule.target, kind];
  if (!et.from.includes(from) || !et.to.includes(to)) throw new Error(`ai/links: LINKS.${kind}: "${rule.edge}" does not allow ${from} → ${to}`);
}

/** src/dst of the edge a rule makes between a new node and one target. */
export const endpoints = (rule: LinkRule, nodeId: string, targetId: string) =>
  (rule.dir === 'out' ? { src: nodeId, dst: targetId } : { src: targetId, dst: nodeId });
