// Bropilot v4 kernel — the source of truth for the lfp.
// Everything here carries provenance back to the brief (STATEMENTS) or is flagged as inferred.

export type Provenance =
  | { kind: 'said'; statements: number[] }
  | { kind: 'inferred'; reason: string };

export const said = (...s: number[]): Provenance => ({ kind: 'said', statements: s });
export const inferred = (reason: string): Provenance => ({ kind: 'inferred', reason });

// ── Statement bank (verbatim / near-verbatim from the 2026-09-07 brief) ──────
export const STATEMENTS: Record<number, string> = {
  1: 'business requirements orchestrator',
  2: 'a project managed and orchestrated by an agentic team',
  3: "We'll use flue for this but implementation details",
  4: 'APM, a marketing specialist, a strategist… a UX researcher… a designer…',
  5: 'clearly enumerate all the functions first and then distribute them by grouping, which will tell us what agents we need',
  6: 'a standard project ontology kind of template',
  7: "Tony Fadell's ideas of looking at the full life cycle, like, how do you educate your users",
  8: 'software is the standardized manipulation of information',
  9: 'a software system that\'s meant to be useful has to have a clear idea of what is the real world effect and value of itself',
  10: 'describe bropilot with bropilot',
  11: 'building self sustaining software systems',
  12: 'the product is just a manifestation of the value proposition',
  13: "someone… who wants to build these systems… but they don't necessarily have the rigorous training of having worked at all the different roles in a startup",
  14: 'guide them and provide the constraints that will make sure they stay streamlined',
  15: 'having direction for what good is so that the system can iteratively improve over time',
  16: 'vibe coding apps allow you to build anything… there are no constraints. There is no template',
  17: 'templates for different things, like web apps or mobile apps or information products or courses',
  18: 'different implementation styles, like React on Vercel or vue on Cloudflare',
  19: 'people talk about ideas… as one mess… a hazy picture… slowly coming into focus',
  20: "now I am in charge of the path I'm taking in this focusing… because I have the knowledge",
  21: 'a structured series of questions and actions, which have the downstream effects of updating the manifestation side',
  22: 'the ultimate dream of documentation as code',
  23: 'one layer where we are purely in the problem space and the hypothesis space and the solution space… the representation layer',
  24: 'the reality layer, which is the coded and deployed software system, which is being used, and users are providing feedback or there are events',
  25: 'validating our hypotheses, ensuring people are happy',
  26: 'that iterative representation and reality loop… for other functions like marketing',
  27: 'a series of actions or questions, and then they can see the downstream effects, which they can commit to, and then agents will make things happen',
  28: 'an agent that looks at how it is being used and suggests improvements to itself',
  29: 'first the basics, like the name and purpose',
  30: 'the audience, the use cases, the context around that, their problems, the capabilities… the hypothesis… the outcomes… the assumptions',
  31: 'the flows or the happy paths, which then let us condense the different things of the domain and the rules… The vocabulary should be fixed',
  32: 'value will be categorized by different features… described in terms of user journeys and flows',
  33: 'a domain… and some architecture for how the domain interacts or which parts are divided into their own modules',
  34: 'funnels, leads, that kind of stuff',
  35: 'our modules will always expose some kind of RPC, whether it\'s used by other modules or agents or the user',
  36: 'user interfaces, which are usually different screens, which then are composed of different layouts and components',
  37: 'the overall design system guiding not just the product, the marketing materials… tone',
  38: 'stub out a lot other than the core of creating and sharing a system for now',
  39: 'start with local, Flue running here… much later… representation layer in the cloud, work layer in sandboxes… deployed from GH and workers… metrics feed back',
  40: 'Representation only for now, but stub the reality layer and plan the shape of it',
  41: 'secondary explorer but… revisit the UI',
  42: 'no we are starting fresh',
  43: 'What is immutable, what is extensible, what relates to what how',
  44: "relating your decisions to things I've explicitly said as the reference",
  45: 'enrich and iterate on the layers from left to right in the representation layer',
  46: 'use it to improve itself and update the graph together',
};

// ── Layers & spaces ─────────────────────────────────────────────────────────
export type Layer = 'representation' | 'reality' | 'orchestration';
export type SpaceId = 'basics' | 'problem' | 'hypothesis' | 'solution' | 'functions' | 'system' | 'usage' | 'evidence';

export interface SpaceDef {
  id: SpaceId;
  label: string;
  layer: Layer;
  order: number;
  settled: boolean; // flips to true when we agree the column is right
  hue: string;
  blurb: string;
  source: Provenance;
}

export const SPACES: SpaceDef[] = [
  { id: 'basics', label: 'Basics', layer: 'representation', order: 0, settled: false, hue: '#d9a441', blurb: 'Name and purpose. The one-liner.', source: said(29) },
  { id: 'problem', label: 'Problem', layer: 'representation', order: 1, settled: false, hue: '#9b7bea', blurb: 'Who, in what context, with what problems, wanting what outcomes.', source: said(23, 30) },
  { id: 'hypothesis', label: 'Hypothesis', layer: 'representation', order: 2, settled: false, hue: '#e0699a', blurb: 'What we are betting on and assuming; how we will know.', source: said(23, 25, 30) },
  { id: 'solution', label: 'Solution', layer: 'representation', order: 3, settled: false, hue: '#3fa9e0', blurb: 'Capabilities, features, journeys, domain, architecture, interface.', source: said(23, 31, 32, 33, 35, 36) },
  { id: 'functions', label: 'Functions', layer: 'representation', order: 4, settled: false, hue: '#3fbf8a', blurb: 'The non-product functions and the agents that own them.', source: said(5, 26, 34, 37) },
  { id: 'system', label: 'System', layer: 'reality', order: 5, settled: false, hue: '#888', blurb: 'The deployed thing as observed. STUB.', source: said(24, 40) },
  { id: 'usage', label: 'Usage', layer: 'reality', order: 6, settled: false, hue: '#888', blurb: 'Events, sessions, feedback. STUB.', source: said(24, 40) },
  { id: 'evidence', label: 'Evidence', layer: 'reality', order: 7, settled: false, hue: '#888', blurb: 'Metric readings and hypothesis verdicts. STUB.', source: said(25, 39, 40) },
];

export const REPRESENTATION_SPACES = SPACES.filter((s) => s.layer === 'representation');

// ── Kinds ───────────────────────────────────────────────────────────────────
export interface FieldDef { key: string; label: string; type?: 'text' | 'select'; options?: string[] }

export interface KindDef {
  id: string;
  label: string;
  plural: string;
  space: SpaceId;
  icon: string;
  kernel: boolean; // immutable if true; templates can only add kinds
  singular?: boolean;
  fields?: FieldDef[];
  blurb: string;
  source: Provenance;
}

export const KINDS: KindDef[] = [
  // basics
  { id: 'name', label: 'Name', plural: 'Name', space: 'basics', icon: '🏷️', kernel: true, singular: true, blurb: 'What the system is called.', source: said(29) },
  { id: 'purpose', label: 'Purpose', plural: 'Purpose', space: 'basics', icon: '🎯', kernel: true, singular: true, blurb: 'Why it exists; the real-world effect and value it is for.', source: said(9, 29) },
  // problem
  { id: 'audience', label: 'Audience', plural: 'Audience', space: 'problem', icon: '👤', kernel: true, blurb: 'A type of person or agent the system is for.', source: said(30) },
  { id: 'context', label: 'Context', plural: 'Contexts', space: 'problem', icon: '🌍', kernel: true, blurb: 'The situation an audience is in when the problem shows up.', source: said(30) },
  { id: 'usecase', label: 'Use case', plural: 'Use cases', space: 'problem', icon: '🎬', kernel: true, blurb: 'Something an audience is trying to get done.', source: said(30) },
  { id: 'problem', label: 'Problem', plural: 'Problems', space: 'problem', icon: '🧨', kernel: true, blurb: 'What stands in their way today.', source: said(30) },
  { id: 'outcome', label: 'Outcome', plural: 'Outcomes', space: 'problem', icon: '🌟', kernel: true, blurb: 'The change we want for the audience. Should be measurable.', fields: [{ key: 'metric', label: 'Success metric' }], source: said(15, 30) },
  // hypothesis
  { id: 'hypothesis', label: 'Hypothesis', plural: 'Hypotheses', space: 'hypothesis', icon: '🔬', kernel: true, blurb: 'A falsifiable bet linking what we build to an outcome.', fields: [{ key: 'verdict', label: 'Verdict', type: 'select', options: ['open', 'supported', 'refuted'] }], source: said(25, 30) },
  { id: 'assumption', label: 'Assumption', plural: 'Assumptions', space: 'hypothesis', icon: '💭', kernel: true, blurb: 'Taken as true until reality says otherwise.', source: said(30) },
  { id: 'metric', label: 'Metric', plural: 'Metrics', space: 'hypothesis', icon: '📏', kernel: true, blurb: 'How an outcome or hypothesis will be measured.', source: inferred('Outcomes and hypothesis validation (S15, S25) need a named measure; the brief never says "metric".') },
  // solution (kernel core; template kinds come as we reach this column)
  { id: 'capability', label: 'Capability', plural: 'Capabilities', space: 'solution', icon: '⚡', kernel: true, blurb: 'A high-level thing the system can do.', source: said(30) },
  { id: 'feature', label: 'Feature', plural: 'Features', space: 'solution', icon: '🎁', kernel: false, blurb: 'A value grouping, described by journeys and flows.', source: said(32) },
  { id: 'flow', label: 'Flow', plural: 'Journeys & flows', space: 'solution', icon: '🧭', kernel: false, blurb: 'A happy path through the system.', source: said(31, 32) },
  { id: 'term', label: 'Term', plural: 'Vocabulary', space: 'solution', icon: '📖', kernel: false, blurb: 'A fixed word of the domain.', source: said(31) },
  { id: 'rule', label: 'Rule', plural: 'Rules', space: 'solution', icon: '⚖️', kernel: false, blurb: 'Logic of the domain.', source: said(31) },
  { id: 'module', label: 'Module', plural: 'Modules', space: 'solution', icon: '📦', kernel: false, blurb: 'A division of the architecture. Always exposes an RPC.', source: said(33, 35) },
  { id: 'rpc', label: 'RPC', plural: 'RPCs', space: 'solution', icon: '🔌', kernel: false, blurb: 'A module surface used by modules, agents, or the user.', source: said(35) },
  { id: 'screen', label: 'Screen', plural: 'Screens', space: 'solution', icon: '🖼️', kernel: false, blurb: 'A user interface; composed of layouts and components.', source: said(36) },
  { id: 'design-system', label: 'Design system', plural: 'Design system', space: 'solution', icon: '🎨', kernel: false, singular: true, blurb: 'Guides product and marketing material, including tone.', source: said(37) },
  // functions
  { id: 'function', label: 'Function', plural: 'Functions', space: 'functions', icon: '🧩', kernel: true, fields: [{ key: 'stages', label: 'Lifecycle stages' }], blurb: 'An area of responsibility in running the project.', source: said(5, 7) },
  { id: 'agent', label: 'Agent', plural: 'Agents', space: 'functions', icon: '🤖', kernel: true, fields: [{ key: 'status', label: 'Status', type: 'select', options: ['core', 'stub'] }], blurb: 'A grouping of functions that executes actions.', source: said(2, 4, 5) },
  // reality (stub)
  { id: 'evidence', label: 'Evidence', plural: 'Evidence', space: 'evidence', icon: '🧾', kernel: true, blurb: 'An observation from reality tied to a hypothesis or metric. STUB.', source: said(24, 25, 40) },
];

export const kindById = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<string, KindDef>;

// ── Edge types ──────────────────────────────────────────────────────────────
export type EdgeCategory = 'structural' | 'dependency' | 'behavioural' | 'intentional' | 'verification' | 'orchestration';

export interface EdgeTypeDef {
  id: string;
  label: string;
  category: EdgeCategory;
  kernel: boolean;
  hint: string;
  source: Provenance;
}

export const EDGE_TYPES: EdgeTypeDef[] = [
  { id: 'motivates', label: 'motivates', category: 'intentional', kernel: true, hint: 'Is the reason the target exists (purpose → outcome).', source: said(9, 12) },
  { id: 'serves', label: 'serves', category: 'intentional', kernel: true, hint: 'Delivers value to an audience.', source: said(9, 13) },
  { id: 'satisfies', label: 'satisfies', category: 'intentional', kernel: true, hint: 'Meets a problem-space statement.', source: inferred('Needed to connect capabilities back to problems; the brief implies it via "value proposition" (S12).') },
  { id: 'has', label: 'has', category: 'structural', kernel: true, hint: 'Conceptual possession (audience has problem).', source: inferred('Generic structural link; no direct quote.') },
  { id: 'implements', label: 'implements', category: 'structural', kernel: true, hint: 'Realises a solution-space spec.', source: said(33) },
  { id: 'contains', label: 'contains', category: 'structural', kernel: true, hint: 'Composition (screen contains component).', source: said(36) },
  { id: 'exposes', label: 'exposes', category: 'structural', kernel: true, hint: 'Module exposes an RPC.', source: said(35) },
  { id: 'uses', label: 'uses', category: 'dependency', kernel: true, hint: 'Runtime dependency.', source: said(35) },
  { id: 'references', label: 'references', category: 'dependency', kernel: true, hint: 'Weak link of last resort.', source: inferred('Escape hatch so nothing is ever blocked.') },
  { id: 'triggers', label: 'triggers', category: 'behavioural', kernel: true, hint: 'Causal succession.', source: inferred('Needed once flows and events exist (S31).') },
  { id: 'monitors', label: 'monitors', category: 'verification', kernel: true, hint: 'Metric watches an outcome.', source: said(15, 39) },
  { id: 'supports', label: 'supports', category: 'verification', kernel: true, hint: 'Evidence supports a hypothesis. STUB.', source: said(25) },
  { id: 'refutes', label: 'refutes', category: 'verification', kernel: true, hint: 'Evidence refutes a hypothesis. STUB.', source: said(25) },
  { id: 'owns', label: 'owns', category: 'orchestration', kernel: true, hint: 'Agent owns a function.', source: said(5) },
  { id: 'in-stage', label: 'in stage', category: 'orchestration', kernel: true, hint: 'Tags any node with a lifecycle stage.', source: said(7) },
];

export const edgeTypeById = Object.fromEntries(EDGE_TYPES.map((e) => [e.id, e])) as Record<string, EdgeTypeDef>;

// ── Lifecycle stages (Fadell) ───────────────────────────────────────────────
export const LIFECYCLE_STAGES = ['awareness', 'acquisition', 'onboarding', 'use', 'support', 'retention', 'advocacy', 'end-of-life'] as const;
export const LIFECYCLE_SOURCE: Provenance = inferred('S7 names Fadell and "educate your users"; the exact eight stages are my reading of Build.');

// ── Questions (the path) ────────────────────────────────────────────────────
export interface QuestionDef {
  id: string;
  prompt: string;
  help: string;
  space: SpaceId;
  produces: string; // kind id; one node per line of the answer (or one node if singular)
  unlocksAfter: string[];
  kernel: boolean;
  source: Provenance;
}

export const QUESTIONS: QuestionDef[] = [
  { id: 'q-name', prompt: 'What is it called?', help: 'One line.', space: 'basics', produces: 'name', unlocksAfter: [], kernel: true, source: said(29) },
  { id: 'q-purpose', prompt: 'What is it for? What real-world effect should it have?', help: 'One or two sentences. Not features.', space: 'basics', produces: 'purpose', unlocksAfter: ['q-name'], kernel: true, source: said(9, 29) },
  { id: 'q-audience', prompt: 'Who is it for?', help: 'One audience per line.', space: 'problem', produces: 'audience', unlocksAfter: ['q-purpose'], kernel: true, source: said(30) },
  { id: 'q-context', prompt: 'In what situations do they meet this?', help: 'One context per line.', space: 'problem', produces: 'context', unlocksAfter: ['q-audience'], kernel: true, source: said(30) },
  { id: 'q-usecase', prompt: 'What are they trying to get done?', help: 'One use case per line.', space: 'problem', produces: 'usecase', unlocksAfter: ['q-audience'], kernel: true, source: said(30) },
  { id: 'q-problem', prompt: 'What gets in their way today?', help: 'One problem per line.', space: 'problem', produces: 'problem', unlocksAfter: ['q-audience'], kernel: true, source: said(30) },
  { id: 'q-outcome', prompt: 'What should be different for them afterwards?', help: 'One outcome per line. Each will get a purpose→motivates edge.', space: 'problem', produces: 'outcome', unlocksAfter: ['q-problem'], kernel: true, source: said(15, 30) },
  { id: 'q-hypothesis', prompt: 'What are you betting on?', help: 'One falsifiable hypothesis per line.', space: 'hypothesis', produces: 'hypothesis', unlocksAfter: ['q-outcome'], kernel: true, source: said(25, 30) },
  { id: 'q-assumption', prompt: 'What are you taking for granted?', help: 'One assumption per line.', space: 'hypothesis', produces: 'assumption', unlocksAfter: ['q-outcome'], kernel: true, source: said(30) },
  { id: 'q-metric', prompt: 'How will you know?', help: 'One metric per line.', space: 'hypothesis', produces: 'metric', unlocksAfter: ['q-outcome'], kernel: true, source: inferred('Follows from S15/S25; the brief has no explicit "how will you measure" question.') },
  { id: 'q-capability', prompt: 'What must it be able to do?', help: 'One capability per line.', space: 'solution', produces: 'capability', unlocksAfter: ['q-hypothesis'], kernel: true, source: said(30) },
];

// ── Invariants ──────────────────────────────────────────────────────────────
export interface Invariant { id: string; text: string; source: Provenance }

export const INVARIANTS: Invariant[] = [
  { id: 'inv-commit-gate', text: 'A node or edge becomes committed only through a Commit. Agents never write directly; their output is a changeset.', source: said(27) },
  { id: 'inv-provenance', text: 'Every effect traces to exactly one Answer or one Action.', source: inferred('Needed for "documentation as code" (S22) to be auditable.') },
  { id: 'inv-kernel-additive', text: 'Templates can add kinds, edge types, and questions; they cannot remove kernel ones.', source: said(6, 43) },
  { id: 'inv-unlock', text: 'A question unlocks only after all of its unlocksAfter questions have a committed answer.', source: said(20, 21) },
  { id: 'inv-undo', text: 'Undo reverts one whole Commit, never a partial.', source: inferred('Standard; keeps the commit the unit of meaning.') },
  { id: 'inv-left-to-right', text: 'Spaces are enriched left to right: basics → problem → hypothesis → solution → functions.', source: said(19, 29, 45) },
  { id: 'inv-fixed-vocab', text: 'Once a term is committed in the vocabulary, other nodes should use it verbatim.', source: said(31) },
  { id: 'inv-dogfood', text: 'Bropilot must be describable in Bropilot with no special cases.', source: said(10, 46) },
];

// ── Flows ───────────────────────────────────────────────────────────────────
export type FlowScope = 'core' | 'stub' | 'later';
export interface FlowDef {
  id: string;
  group: string;
  title: string;
  steps: string[];
  scope: FlowScope;
  touches: string[]; // kernel object names (free text ids for highlighting)
  source: Provenance;
}

export const FLOWS: FlowDef[] = [
  { id: 'P1', group: 'Project', title: 'Create project', steps: ['name', 'pick template', 'kernel questions unlocked'], scope: 'core', touches: ['Project', 'Template', 'Question'], source: said(29, 17) },
  { id: 'P3', group: 'Project', title: 'Share / export', steps: ['serialise nodes, edges, commits', 'file or link'], scope: 'core', touches: ['Project', 'Node', 'Edge', 'Commit'], source: said(38) },
  { id: 'P4', group: 'Project', title: 'Import', steps: ['file', 'changeset (add/update)', 'review', 'commit'], scope: 'core', touches: ['Changeset', 'Commit'], source: inferred('Mirror of share.') },
  { id: 'Q1', group: 'Path', title: 'Answer next question', steps: ['show next unlocked question', 'user answers', 'effects staged'], scope: 'core', touches: ['Question', 'Answer', 'Effect'], source: said(21, 27) },
  { id: 'Q2', group: 'Path', title: 'Jump to a question', steps: ['pick any unlocked question', 'answer'], scope: 'core', touches: ['Question'], source: said(20) },
  { id: 'Q3', group: 'Path', title: 'Re-answer', steps: ['new answer', 'effects update/remove old nodes'], scope: 'core', touches: ['Answer', 'Effect', 'Node'], source: said(19) },
  { id: 'Q5', group: 'Path', title: 'Direct edit (escape hatch)', steps: ['edit node in board', 'treated as an answer', 'effects staged'], scope: 'core', touches: ['Node', 'Answer', 'Effect'], source: inferred('Author has the knowledge (S20) and will want to bypass the path.') },
  { id: 'Q6', group: 'Path', title: 'Question from evidence', steps: ['evidence refutes hypothesis', 'new question unlocked'], scope: 'stub', touches: ['Evidence', 'Question'], source: said(25, 26) },
  { id: 'C1', group: 'Commit', title: 'Review changeset', steps: ['effects grouped by space', 'toggle each', 'warnings on top'], scope: 'core', touches: ['Changeset', 'Effect'], source: said(27) },
  { id: 'C2', group: 'Commit', title: 'Commit', steps: ['apply accepted effects', 'nodes → committed', 'dispatch actions'], scope: 'core', touches: ['Commit', 'Action'], source: said(27) },
  { id: 'C4', group: 'Commit', title: 'Undo commit', steps: ['revert all its effects'], scope: 'core', touches: ['Commit'], source: inferred('Safety net for the commit gate.') },
  { id: 'C5', group: 'Commit', title: 'Review agent output', steps: ['action done', 'its effects appear as a changeset', 'review & commit'], scope: 'core', touches: ['Action', 'Changeset'], source: said(27) },
  { id: 'O1', group: 'Orchestration', title: 'Dispatch action', steps: ['commit', 'action queued for owning agent'], scope: 'core', touches: ['Commit', 'Action', 'Agent'], source: said(2, 27) },
  { id: 'O2', group: 'Orchestration', title: 'Agent executes', steps: ['reads inputs', 'produces effects and/or artefacts'], scope: 'core', touches: ['Agent', 'Action', 'Effect'], source: said(2, 3) },
  { id: 'O5', group: 'Orchestration', title: 'Meta-agent proposal', steps: ['usage observed', 'insight + action on Bropilot\'s own project', 'review & commit'], scope: 'stub', touches: ['Agent', 'Evidence', 'Action'], source: said(28) },
  { id: 'E1', group: 'Explore', title: 'Browse by space', steps: ['board columns left to right'], scope: 'core', touches: ['Space', 'Node'], source: said(45) },
  { id: 'E2', group: 'Explore', title: 'Browse graph', steps: ['node-link explorer'], scope: 'later', touches: ['Node', 'Edge'], source: said(41) },
  { id: 'E3', group: 'Explore', title: 'Inspect provenance', steps: ['node → answer/commit/action that produced it'], scope: 'core', touches: ['Node', 'Answer', 'Commit'], source: said(44) },
  { id: 'R1', group: 'Reality', title: 'Record evidence manually', steps: ['pick hypothesis/metric', 'enter observation', 'supports/refutes edge'], scope: 'stub', touches: ['Evidence', 'Node'], source: said(40) },
  { id: 'R2', group: 'Reality', title: 'Ingest events', steps: ['adapter', 'evidence nodes'], scope: 'later', touches: ['Evidence'], source: said(24, 39) },
  { id: 'R4', group: 'Reality', title: 'Deploy', steps: ['engineer action', 'artefact + deployment node'], scope: 'later', touches: ['Action', 'Agent'], source: said(39) },
];

// ── Kernel objects (orchestration + meta) shown on the Kernel page ──────────
export interface KernelObject { id: string; definition: string; attrs: string; immutable: boolean; source: Provenance }

export const KERNEL_OBJECTS: KernelObject[] = [
  { id: 'Project', definition: 'One system being built. Root of everything.', attrs: 'name, template', immutable: true, source: said(2) },
  { id: 'Layer', definition: 'representation | reality | orchestration', attrs: '—', immutable: true, source: said(23, 24) },
  { id: 'Space', definition: 'A partition of a layer; the board columns.', attrs: 'layer, order, settled', immutable: true, source: said(23, 45) },
  { id: 'Node', definition: 'The atom of knowledge.', attrs: 'id, kind, title, description, props, status', immutable: true, source: inferred('Graph representation carried over as the natural form.') },
  { id: 'Edge', definition: 'Directed typed link.', attrs: 'src, dst, type, status', immutable: true, source: said(43) },
  { id: 'Kind', definition: 'What a node is; kernel or template-declared.', attrs: 'space, fields, kernel', immutable: true, source: said(6, 43) },
  { id: 'Question', definition: 'A prompt on the path; unlocks after others; produces kinds.', attrs: 'prompt, unlocksAfter, produces', immutable: true, source: said(21) },
  { id: 'Answer', definition: 'Raw user input to a question. Immutable once given.', attrs: 'question, content, at', immutable: true, source: inferred('Immutability is my choice so provenance never changes under a node.') },
  { id: 'Effect', definition: 'One staged change: add/update/remove a node or edge, or propose an action.', attrs: 'op, target, payload, source', immutable: true, source: said(21, 27) },
  { id: 'Changeset', definition: 'Effects awaiting review.', attrs: 'effects, warnings', immutable: true, source: said(27) },
  { id: 'Commit', definition: 'An accepted changeset. One undo step, one dispatch.', attrs: 'accepted effects, at', immutable: true, source: said(27) },
  { id: 'Action', definition: 'A unit of agent work dispatched by a commit.', attrs: 'agent, inputs, status, output effects', immutable: true, source: said(2, 27) },
  { id: 'Agent', definition: 'A grouping of functions that executes actions.', attrs: 'functions, reads, writes', immutable: true, source: said(4, 5) },
  { id: 'Template', definition: 'A project type: extension kinds, questions, agents, implementation styles.', attrs: 'extends, kinds, questions, agents, styles', immutable: true, source: said(6, 17, 18) },
  { id: 'Evidence', definition: 'An observation from reality. STUB.', attrs: 'source, value, verdict', immutable: true, source: said(24, 25, 40) },
];
