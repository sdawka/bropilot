// ─────────────────────────────────────────────────────────────────────────
// Bropilot knowledge-graph schema.
// The single source of truth for node kinds, the three "parts" of the graph,
// the four semantic spaces, per-kind editable fields, and edge types.
// Both the Astro shell and every Vue island import from here.
// ─────────────────────────────────────────────────────────────────────────

export type Part = 'foundations' | 'domain' | 'implementation';
export type Space = 'basics' | 'problem' | 'solution' | 'crosscutting';

export type FieldType = 'text' | 'textarea' | 'list' | 'select' | 'link';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  options?: string[];
}

export interface KindDef {
  kind: string;
  label: string; // singular human label
  plural: string;
  part: Part;
  space: Space;
  icon: string; // emoji glyph
  blurb: string; // one-line description shown in the editor
  singular?: boolean; // only one node of this kind allowed (name, purpose)
  fields?: FieldDef[]; // extra fields beyond title + description (stored in node.props)
}

// ── The three parts the studio is organised around ──────────────────────────
export interface PartDef {
  id: Part;
  label: string;
  tagline: string;
  description: string;
  icon: string;
}

export const PARTS: PartDef[] = [
  {
    id: 'foundations',
    label: 'Foundations',
    tagline: 'The business & problem space',
    description:
      'What this system is and why it exists — its name and purpose, the people who use it, what they need, the situations it shows up in, the constraints it must honour, and the value it bets on delivering.',
    icon: '◆',
  },
  {
    id: 'domain',
    label: 'Domain',
    tagline: 'Where reality meets representation',
    description:
      'The common language of the business codified as objects, behaviours and relationships — plus the journeys users take through that world.',
    icon: '◈',
  },
  {
    id: 'implementation',
    label: 'Implementation',
    tagline: 'The code behind the domain',
    description:
      'Modules, components, interfaces and APIs that realise the domain — each linked to where the code actually lives.',
    icon: '◇',
  },
];

// ── Semantic spaces (drive colour + meaning) ────────────────────────────────
export interface SpaceDef {
  id: Space;
  label: string;
  hue: string; // primary accent colour
  glow: string; // translucent variant for glows / fills
}

export const SPACES: Record<Space, SpaceDef> = {
  basics: { id: 'basics', label: 'Basics', hue: '#f5b94d', glow: 'rgba(245,185,77,0.16)' },
  problem: { id: 'problem', label: 'Problem', hue: '#a78bfa', glow: 'rgba(167,139,250,0.16)' },
  solution: { id: 'solution', label: 'Solution', hue: '#38bdf8', glow: 'rgba(56,189,248,0.16)' },
  crosscutting: { id: 'crosscutting', label: 'Crosscutting', hue: '#34d399', glow: 'rgba(52,211,153,0.16)' },
};

// ── Node kinds ──────────────────────────────────────────────────────────────
const stakes: FieldDef = {
  key: 'priority',
  label: 'Priority',
  type: 'select',
  options: ['must', 'should', 'could', 'wont'],
};

export const KINDS: KindDef[] = [
  // ── Part 1 · Foundations (basics + problem) ──
  { kind: 'name', label: 'Name', plural: 'Name', part: 'foundations', space: 'basics', icon: '🏷️', blurb: 'What the system is called.', singular: true },
  { kind: 'purpose', label: 'Purpose', plural: 'Purpose', part: 'foundations', space: 'basics', icon: '🎯', blurb: 'The core mission — why it exists.', singular: true },
  { kind: 'capability', label: 'Capability', plural: 'Capabilities', part: 'foundations', space: 'basics', icon: '⚡', blurb: 'A high-level thing the system can do.' },
  {
    kind: 'persona', label: 'Persona', plural: 'Personas', part: 'foundations', space: 'problem', icon: '👤',
    blurb: 'A type of user or role.',
    fields: [{ key: 'role', label: 'Role / context', type: 'text', placeholder: 'e.g. Sales rep on the road' }],
  },
  {
    kind: 'requirement', label: 'Requirement', plural: 'Requirements', part: 'foundations', space: 'problem', icon: '✅',
    blurb: 'A must-have piece of functionality or need.',
    fields: [stakes],
  },
  {
    kind: 'usecase', label: 'Use case', plural: 'Use cases', part: 'foundations', space: 'problem', icon: '🎬',
    blurb: 'Something a user accomplishes, and when it shows up.',
    fields: [{ key: 'situation', label: 'Situation / trigger', type: 'textarea', placeholder: 'The context or moment this arises' }],
  },
  {
    kind: 'constraint', label: 'Constraint', plural: 'Constraints', part: 'foundations', space: 'problem', icon: '⛓️',
    blurb: 'A hard limitation or invariant the system must always honour.',
    fields: [{ key: 'invariant', label: 'Invariant', type: 'textarea', placeholder: 'What must always remain true' }],
  },
  {
    kind: 'goal', label: 'Goal', plural: 'Goals', part: 'foundations', space: 'problem', icon: '🌟',
    blurb: 'Value the system aims to deliver, above and beyond.',
    fields: [{ key: 'metric', label: 'Success metric', type: 'text', placeholder: 'How you would know it landed' }],
  },
  {
    kind: 'hypothesis', label: 'Hypothesis', plural: 'Hypotheses', part: 'foundations', space: 'problem', icon: '🔬',
    blurb: 'A belief about value yet to be validated.',
    fields: [
      { key: 'belief', label: 'We believe that…', type: 'textarea' },
      { key: 'validation', label: 'We will know we are right when…', type: 'textarea' },
    ],
  },
  { kind: 'assumption', label: 'Assumption', plural: 'Assumptions', part: 'foundations', space: 'problem', icon: '💭', blurb: 'Something taken to be true (until proven otherwise).' },

  // ── Part 2 · Domain (the common language) ──
  {
    kind: 'term', label: 'Term', plural: 'Ubiquitous language', part: 'domain', space: 'solution', icon: '📖',
    blurb: 'A word in the shared language, defined once.',
    fields: [{ key: 'aka', label: 'Also known as', type: 'list', placeholder: 'synonyms' }],
  },
  {
    kind: 'entity', label: 'Entity', plural: 'Entities', part: 'domain', space: 'solution', icon: '🧱',
    blurb: 'A domain object or model.',
    fields: [{ key: 'attributes', label: 'Attributes', type: 'list', placeholder: 'one field per line' }],
  },
  {
    kind: 'relationship', label: 'Relationship', plural: 'Relationships', part: 'domain', space: 'solution', icon: '🔗',
    blurb: 'How two entities relate.',
    fields: [{ key: 'cardinality', label: 'Cardinality', type: 'select', options: ['one-to-one', 'one-to-many', 'many-to-many'] }],
  },
  { kind: 'behaviour', label: 'Behaviour', plural: 'Behaviours', part: 'domain', space: 'solution', icon: '⚙️', blurb: 'A business rule governing how the system behaves.' },
  { kind: 'event', label: 'Event', plural: 'Events', part: 'domain', space: 'solution', icon: '⚡', blurb: 'Something notable that happens in the system.' },
  { kind: 'state', label: 'State', plural: 'State', part: 'domain', space: 'solution', icon: '🗃️', blurb: 'Data tracked over time.' },
  {
    kind: 'flow', label: 'Flow', plural: 'Journeys & flows', part: 'domain', space: 'solution', icon: '🧭',
    blurb: 'A step-by-step journey through the domain.',
    fields: [{ key: 'steps', label: 'Steps', type: 'list', placeholder: 'one step per line' }],
  },
  { kind: 'screen', label: 'Screen', plural: 'Screens', part: 'domain', space: 'solution', icon: '🖼️', blurb: 'A UI view or page.' },

  // ── Part 3 · Implementation (code) ──
  {
    kind: 'module', label: 'Module', plural: 'Modules', part: 'implementation', space: 'solution', icon: '📦',
    blurb: 'A logical grouping of code.',
    fields: [{ key: 'path', label: 'Path', type: 'text', placeholder: 'src/lib/billing' }, { key: 'repo', label: 'Repository / link', type: 'link', placeholder: 'https://github.com/org/repo/tree/main/src/lib/billing' }],
  },
  {
    kind: 'component', label: 'Component', plural: 'Components', part: 'implementation', space: 'solution', icon: '🧩',
    blurb: 'A reusable UI piece.',
    fields: [{ key: 'path', label: 'Path', type: 'text', placeholder: 'src/components/Button.vue' }, { key: 'repo', label: 'Source link', type: 'link' }],
  },
  {
    kind: 'interface', label: 'Interface', plural: 'Interfaces', part: 'implementation', space: 'solution', icon: '🔌',
    blurb: 'A contract or type.',
    fields: [{ key: 'signature', label: 'Signature', type: 'textarea', placeholder: 'interface Foo { … }' }],
  },
  {
    kind: 'api', label: 'API', plural: 'APIs', part: 'implementation', space: 'solution', icon: '🌐',
    blurb: 'A backend endpoint.',
    fields: [
      { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { key: 'route', label: 'Route', type: 'text', placeholder: '/api/users/:id' },
      { key: 'repo', label: 'Source link', type: 'link' },
    ],
  },
  {
    kind: 'logic', label: 'Logic', plural: 'Logic', part: 'implementation', space: 'solution', icon: '🧮',
    blurb: 'An algorithm or non-trivial computation.',
    fields: [{ key: 'repo', label: 'Source link', type: 'link' }],
  },
  {
    kind: 'repository', label: 'Repository', plural: 'Repositories', part: 'implementation', space: 'crosscutting', icon: '📂',
    blurb: 'Where code or data lives.',
    fields: [{ key: 'url', label: 'URL', type: 'link', placeholder: 'https://github.com/org/repo' }],
  },
  {
    kind: 'external', label: 'External service', plural: 'External services', part: 'implementation', space: 'crosscutting', icon: '🛰️',
    blurb: 'A third-party dependency.',
    fields: [{ key: 'url', label: 'Docs / link', type: 'link' }],
  },
  { kind: 'tests', label: 'Test suite', plural: 'Tests', part: 'implementation', space: 'crosscutting', icon: '🧪', blurb: 'A testing strategy or suite.' },
  { kind: 'observability', label: 'Observability', plural: 'Observability', part: 'implementation', space: 'crosscutting', icon: '📈', blurb: 'Logging, metrics or monitoring.' },
  { kind: 'design', label: 'Design', plural: 'Design', part: 'implementation', space: 'crosscutting', icon: '🎨', blurb: 'A visual or UX decision.' },
];

export const KIND_MAP: Record<string, KindDef> = Object.fromEntries(KINDS.map((k) => [k.kind, k]));

export function kindsForPart(part: Part): KindDef[] {
  return KINDS.filter((k) => k.part === part);
}

// ── Edge types ──────────────────────────────────────────────────────────────
// A 17-type ontology in five categories, deliberated from three modelling
// traditions (ArchiMate/C4, RDF/OWL pragmatics, SysML/KAOS goal modelling).
// The 8 stock Bropilot types keep their names and stay valid everywhere —
// richer types are advisory upgrades, never migrations. Kind hints are
// ordering suggestions only; nothing is ever blocked.

export type EdgeCategory = 'structural' | 'dependency' | 'behavioural' | 'intentional' | 'verification';

export const EDGE_CATEGORIES: { id: EdgeCategory; label: string; description: string }[] = [
  { id: 'structural', label: 'Structural', description: 'What things are made of and how they realise or expose specs.' },
  { id: 'dependency', label: 'Dependency & reference', description: 'What things rely on or point to.' },
  { id: 'behavioural', label: 'Behavioural', description: 'What happens at runtime: causal succession and event production.' },
  { id: 'intentional', label: 'Intentional', description: 'Why things exist: motivation, value delivered, needs met, limits imposed.' },
  { id: 'verification', label: 'Verification', description: 'How we know it works: test evidence and live monitoring.' },
];

export interface EdgeTypeDef {
  type: string;
  label: string;
  hint: string;
  category: EdgeCategory;
  /** part of the original Bropilot 8 — round-trips with /bropilot-extract & /bropilot-generate */
  stock?: boolean;
}

export const EDGE_TYPES: EdgeTypeDef[] = [
  // structural
  { type: 'contains', label: 'contains', category: 'structural', stock: true, hint: 'Structural nesting of implementation artifacts — the child is a building block whose lifecycle the parent owns.' },
  { type: 'has', label: 'has', category: 'structural', stock: true, hint: 'Conceptual possession in the problem/domain space — the target is an attribute or aspect, not a building block. For code artifacts use contains.' },
  { type: 'extends', label: 'extends', category: 'structural', stock: true, hint: 'Specialisation or inheritance — the source is a more specific kind of the target.' },
  { type: 'implements', label: 'implements', category: 'structural', stock: true, hint: 'Realises a solution-space spec (interface, behaviour, capability, screen, flow, design). For problem-space statements use satisfies.' },
  { type: 'exposes', label: 'exposes', category: 'structural', hint: 'Makes the target reachable at its boundary for others to consume. Distinct from implements, which fulfils the contract itself.' },
  // dependency & reference
  { type: 'uses', label: 'uses', category: 'dependency', stock: true, hint: 'Runtime dependency — the source calls or consumes the target while the system runs. For build-time coupling use depends_on.' },
  { type: 'depends_on', label: 'depends on', category: 'dependency', stock: true, hint: 'Build-time or logical prerequisite — the source relies on the target existing or holding true, without calling it at runtime.' },
  { type: 'describes', label: 'describes', category: 'dependency', hint: 'Defines or documents the target — terms and design decisions annotating what they explain, without owning it.' },
  { type: 'references', label: 'references', category: 'dependency', stock: true, hint: 'Weak link of last resort — mentions the target with no structural, causal, or intentional commitment. Prefer a richer type when one fits.' },
  // behavioural
  { type: 'triggers', label: 'triggers', category: 'behavioural', stock: true, hint: 'Causal succession — the source causes the target to start or occur. For producing an event, use emits.' },
  { type: 'emits', label: 'emits', category: 'behavioural', hint: 'Event production — the source produces the target event as an output signal. The mirror of triggers: emits is event-out, triggers is event-in.' },
  // intentional
  { type: 'motivates', label: 'motivates', category: 'intentional', hint: 'Is the reason the target exists — points down the why-chain (purpose motivates goal, persona motivates usecase). The canonical intent direction.' },
  { type: 'serves', label: 'serves', category: 'intentional', hint: 'Delivers value to a beneficiary — who or what this exists for (capability serves persona). For intent-to-intent links use motivates.' },
  { type: 'satisfies', label: 'satisfies', category: 'intentional', hint: 'Meets a problem-space statement — requirement, constraint, or use case. For solution-space specs use implements.' },
  { type: 'constrains', label: 'constrains', category: 'intentional', hint: 'Imposes a limit or invariant the target must respect — the home for constraint-to-module and requirement-to-design edges.' },
  // verification
  { type: 'verifies', label: 'verifies', category: 'verification', hint: 'Provides pass/fail proof that the target holds or works — the primary outgoing edge for test suites, including hypothesis validation.' },
  { type: 'monitors', label: 'monitors', category: 'verification', hint: 'Watches the target at runtime — metrics, logs, alerts; point it at a goal to track that goal’s success metric.' },
];

export const EDGE_TYPE_SET = new Set(EDGE_TYPES.map((e) => e.type));

export const EDGE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EDGE_TYPES.map((e) => [e.type, e.label]),
);

export function edgeTypesByCategory(): { category: (typeof EDGE_CATEGORIES)[number]; types: EdgeTypeDef[] }[] {
  return EDGE_CATEGORIES.map((c) => ({ category: c, types: EDGE_TYPES.filter((t) => t.category === c.id) }));
}

/**
 * Likely edge types per source kind — pure ordering hints for the editor.
 * Nothing is validated or blocked; kinds not listed fall back to all types.
 */
export const SUGGESTED_EDGE_TYPES: Partial<Record<string, string[]>> = {
  name: ['references', 'describes'],
  purpose: ['motivates', 'references'],
  capability: ['satisfies', 'serves', 'uses', 'depends_on'],
  persona: ['motivates', 'has', 'triggers'],
  requirement: ['constrains', 'depends_on', 'references'],
  usecase: ['triggers', 'motivates', 'uses'],
  constraint: ['constrains', 'references'],
  goal: ['motivates', 'depends_on', 'references'],
  hypothesis: ['motivates', 'depends_on', 'references'],
  assumption: ['constrains', 'references'],
  term: ['describes', 'extends', 'references'],
  entity: ['has', 'extends', 'references'],
  relationship: ['references', 'describes'],
  behaviour: ['emits', 'triggers', 'uses'],
  event: ['triggers', 'references'],
  state: ['has', 'triggers', 'references'],
  flow: ['contains', 'triggers', 'satisfies', 'uses'],
  screen: ['uses', 'triggers', 'serves'],
  module: ['contains', 'exposes', 'implements', 'depends_on'],
  component: ['implements', 'uses', 'emits', 'contains'],
  interface: ['extends', 'references'],
  api: ['implements', 'uses', 'emits'],
  logic: ['implements', 'uses', 'depends_on'],
  repository: ['contains', 'references'],
  external: ['references', 'triggers'],
  tests: ['verifies', 'references'],
  observability: ['monitors', 'references'],
  design: ['describes', 'constrains', 'references'],
};

// ── Node / edge / graph types ───────────────────────────────────────────────
export interface SourceRef {
  turnId: string;
  excerpt: string;
}

export interface GraphNode {
  id: string;
  kind: string;
  title: string;
  description: string;
  props?: Record<string, unknown>;
  sourceRefs?: SourceRef[];
}

export interface GraphEdge {
  id: string;
  srcId: string;
  dstId: string;
  type: string;
  label?: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function kebab(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nodeSpace(node: GraphNode): Space {
  return KIND_MAP[node.kind]?.space ?? 'solution';
}

export function nodeHue(node: GraphNode): string {
  return SPACES[nodeSpace(node)].hue;
}
