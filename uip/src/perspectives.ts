// Perspectives (SPEC §3): data-driven chains. A step lists its kinds and the hops that reach them from
// the parent row's kind. Column N = union of hops in step N whose `from` is the selected node's kind.
import type { Perspective, PerspId, Hop } from './types';

const h = (from: string, edge: string, dir: 'out' | 'in' = 'out'): Hop => ({ from, edge, dir });

export const PERSPECTIVES: Perspective[] = [
  {
    id: 'user', label: 'User', blurb: 'Who it is for, what they try to do, and the screens that get them there.',
    steps: [
      { kinds: ['audience'], via: [] },
      { kinds: ['usecase', 'problem'], via: [h('audience', 'has')] },
      { kinds: ['capability', 'feature'], waypoint: true, via: [h('usecase', 'satisfies', 'in'), h('problem', 'satisfies', 'in')] },
      { kinds: ['flow', 'screen'], via: [h('capability', 'implements', 'in'), h('feature', 'has')] },
      { kinds: ['screen', 'interface'], via: [h('flow', 'uses'), h('screen', 'uses')] },
      { kinds: ['interface', 'thing'], via: [h('screen', 'uses'), h('interface', 'carries')] },
    ],
  },
  {
    id: 'domain', label: 'Domain', blurb: 'The system as modules, what they expose, the things they carry, the rules and their tests.',
    steps: [
      { kinds: ['system'], via: [] },
      { kinds: ['module'], via: [h('system', 'contains')] },
      { kinds: ['interface', 'screen'], via: [h('module', 'exposes')] },
      { kinds: ['thing', 'event'], via: [h('interface', 'carries'), h('interface', 'emits'), h('screen', 'uses')] },
      { kinds: ['rule'], via: [h('thing', 'governs', 'in')] },
      { kinds: ['test'], via: [h('rule', 'verifies', 'in')] },
    ],
  },
  {
    id: 'intent', label: 'Intent', blurb: 'Why it exists: purpose, outcomes, the bets on them, and what reality says.',
    steps: [
      { kinds: ['purpose'], via: [] },
      { kinds: ['outcome'], via: [h('purpose', 'motivates')] },
      { kinds: ['hypothesis', 'metric'], via: [h('outcome', 'references', 'in'), h('outcome', 'monitors', 'in')] },
      { kinds: ['assumption', 'evidence', 'metric-reading'], via: [h('hypothesis', 'references', 'in'), h('hypothesis', 'supports', 'in'), h('hypothesis', 'refutes', 'in'), h('metric', 'measures', 'in')] },
    ],
  },
  {
    id: 'delivery', label: 'Delivery', blurb: 'Planned change: epics, the tasks under them, the tests they must turn green.',
    steps: [
      { kinds: ['epic'], via: [] },
      { kinds: ['task'], via: [h('epic', 'contains')] },
      { kinds: ['test'], via: [h('task', 'targets')] },
      { kinds: ['test-result', 'rule'], via: [h('test', 'reports', 'in'), h('test', 'verifies')] },
    ],
  },
  {
    id: 'product', label: 'Product', blurb: 'Capabilities, the agents that run them, the features they implement, the needs they meet.',
    steps: [
      { kinds: ['capability'], via: [] },
      { kinds: ['agent'], via: [h('capability', 'has')] },
      { kinds: ['feature'], via: [h('agent', 'implements')] },
      { kinds: ['problem', 'usecase'], via: [h('feature', 'satisfies')] },
    ],
  },
];

export const PERSP_IDS: PerspId[] = ['user', 'domain', 'intent', 'delivery', 'product', 'raw'];
export const perspById = Object.fromEntries(PERSPECTIVES.map((p) => [p.id, p])) as Record<Exclude<PerspId, 'raw'>, Perspective>;
export const perspLabel = (id: PerspId) => (id === 'raw' ? 'Raw' : perspById[id].label);
export const isPersp = (s: string): s is PerspId => (PERSP_IDS as string[]).includes(s);

/** Kinds where perspectives cross; they get a ⇄ badge. */
export const BRIDGE_KINDS = new Set(['screen', 'interface', 'thing', 'test', 'capability', 'module']);

/** Chain text for cards and S1 criteria: "audience › usecase › (capability) › flow …". */
export function chainText(p: Perspective, sep = ' › '): string {
  return p.steps.map((s) => (s.waypoint ? `(${s.kinds[0]})` : s.kinds[0])).join(sep);
}
/** Indices of steps whose kinds include this kind. */
export const stepsWithKind = (p: Perspective, kind: string) => p.steps.flatMap((s, i) => (s.kinds.includes(kind) ? [i] : []));
export const perspHasKind = (p: Perspective, kind: string) => p.steps.some((s) => s.kinds.includes(kind));
/** Which perspective to open when a space tile is clicked. */
export const PERSP_FOR_SPACE: Record<string, PerspId> = {
  basics: 'intent', problem: 'user', hypothesis: 'intent', solution: 'domain', current: 'delivery', planned: 'delivery', effects: 'intent',
};
