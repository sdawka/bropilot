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
  // ── feedback on v0 (2026-09-07) ──
  47: 'I like the provenance with the specific utterances, but I also want to see them in the context of the overall message',
  48: 'a few sentences before and after. So hovering or something in the side panel should show me the full thing',
  49: 'the basics should also include a summary',
  50: 'When I\'m picking amongst my projects, probably the name purpose summary is useful… once I\'m within a project… should be hidden away somewhere',
  51: 'I\'d rather see it in some kind of tree view where the outermost view is the global ontology, which is standard for a template and doesn\'t change',
  52: 'if I click on a main question and expand the node, the sub questions might be specific to the project itself based on what the user previously answered',
  53: 'Some questions could even probably have threads. we can use AI to organize this hierarchy because follow-up questions should sort of count as threads',
  54: 'completely different aspects that are being studied, each with their own depth… counts probably as more of a subtree',
  55: 'Board should probably be called overview. path can be called definition. And now the kernel page should be called domain, and it needs a complete rehaul',
  56: 'levels of view like a c4 diagram. The outermost view should be with the system itself in one bubble, the user outside, and any other systems',
  57: 'we can still separate maybe front end and back end if they are very meaningfully separate… represent the real world in a way that people would talk about it',
  58: 'Under this level is our system itself… the main modules and the different domains if we are strictly talking about domain driven development',
  59: 'above all the pages, we should also always have a glossary that is easy to view and edit and readily accessed',
  60: 'at the second level, we have separately any meaningfully different business domains… the representation layer or module, and then the reality layer or module, and then maybe a metrics collection module',
  61: 'if we have dedicated infra, like a cache or a durable object… it should also be shown within the module that it belongs to',
  62: 'Clicking on a module should probably show all the things and rules related to that module, that part of the world',
  63: 'the third level should be more detailed view of within a module… things and rules and relationships',
  64: 'things are basically entities in domain language, and the rules are logic that\'s related to the things or the nouns of our domain',
  65: 'When selecting a thing, we should see all the rules related to that thing… rules that have multiple things and define rules about relationships',
  66: 'simple ORM type stuff, like hasmany… but it can also be more complex around expectations',
  67: 'all of these statements will be tested, both positive and negative directions. The number and quality of tests is another thing that can be fed back from the reality layer',
  68: 'along with the things and the rules, we probably also have the interface, which will define the API, whether it\'s REST or RPC',
  69: 'clicking on any of these items in this level, we can basically be pointed to some file or code block in GitHub itself where it\'s implemented',
  70: 'I\'m not sure if we need a fourth layer. At the moment, I don\'t think so',
  // ── feedback on v1 (2026-09-07) ──
  71: 'what we have as functions are actually features more or less',
  72: 'the agents are a sub items of the agent orchestration solution… all of them are related to the main problem of the user not having years and years of product building experience, and then that subfielded into… what becomes a department at a startup',
  73: 'if we guide the user with standard constraints and procedures, just asking them to make simple choices and giving them options, we can get at least some level of quality and reduce the user\'s burden by a lot',
  74: 'In the vocabulary, we probably also have events',
  75: 'I want the sidebar to pop out and basically change the screen size (width)',
  76: 'the screens, we literally are building now so we can record what we built',
  77: 'Design system can stay unpopulated a little bit',
  // ── feedback on v1.1 (2026-09-11) ──
  78: 'We can keep separate specific testable versions, that\'s fine',
  79: 'on the whole, we have, let\'s say, representation and reality. Within representation, we have the problem space, the hypothesis space, and the solution space',
  80: 'the solution space then will start to link into the reality layer, but the reality layer is more temporal because we have current state, planned changes, and future state',
  81: 'instead of future state, we actually have effects such as all the measurements… which then confirm or deny the bets in the hypothesis space',
  82: 'the hypothesis space doesn\'t need to strictly talk in terms of scientific hypotheses. They can just be bets that we want to make',
  83: 'In the overview page, I want to see more connection between the problems and hypothesis and the solution',
  84: 'in the definition page, I want the tree to be more of the focus and the inputs to be something a little more on the side',
  // ── the shape of the reality layer (2026-09-11) ──
  85: 'the current state is a combination of the actual codebase and references to that in the repository',
  86: 'planned changes is like the epics in jira or something similar',
  87: 'an orchestration layer where we dispatch coding agents according to the changes needed',
  88: 'the orchestration layer above that is planning the changes would plan them so precisely that with changed tests, we have super targeted coding agent tasks',
  89: 'The end of the representation layer should also connect to the reality layer through tests',
  90: 'the representation should be specified to such a degree that for each condition, we have a test',
  91: 'in the reality layer, that test is either fulfilled And if all of them are, we don\'t need changes',
  92: 'if none of them are or some of them aren\'t, then the plan changes should involve which tests we are targeting',
  93: 'This should start with the most simplest of tests that the module exists. For example, with a health check',
  94: 'then it should use the API surface, whether it\'s RPC or not',
  95: 'modules are always defined with a strict enough boundary that they can be tested with deterministic simulation testing',
  96: 'other than the code base and infrastructure, we also have best practices and protocols that go into the current state. Maybe that counts as process flows or CI',
};

// ── Layers & spaces ─────────────────────────────────────────────────────────
export type Layer = 'representation' | 'reality' | 'orchestration';
export type SpaceId = 'basics' | 'problem' | 'hypothesis' | 'solution' | 'current' | 'planned' | 'effects';

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
  { id: 'hypothesis', label: 'Bets', layer: 'representation', order: 2, settled: false, hue: '#e0699a', blurb: 'The bets we are making and what we assume; how we will know. Not necessarily scientific hypotheses.', source: said(23, 25, 30, 82) },
  { id: 'solution', label: 'Solution', layer: 'representation', order: 3, settled: false, hue: '#3fa9e0', blurb: 'Capabilities, features (one per would-be department), agents, journeys, domain, architecture, screens.', source: said(23, 31, 32, 33, 35, 36, 71, 72) },
  { id: 'current', label: 'Current state', layer: 'reality', order: 5, settled: false, hue: '#8a8f98', blurb: 'Code and references into the repository, infrastructure, practices and protocols, and the current test results.', source: said(24, 80, 85, 96) },
  { id: 'planned', label: 'Planned changes', layer: 'reality', order: 6, settled: false, hue: '#6f7f99', blurb: 'Epics and the super-targeted coding-agent tasks under them, each naming the tests it must turn green.', source: said(80, 86, 88, 92) },
  { id: 'effects', label: 'Effects', layer: 'reality', order: 7, settled: false, hue: '#5b8c7a', blurb: 'Measurements, usage, feedback: what confirms or denies the bets. STUB.', source: said(25, 81) },
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
  level?: 1 | 2 | 3; // C4-style level on the Domain page (level 0 is the map)
  singular?: boolean;
  fields?: FieldDef[];
  blurb: string;
  source: Provenance;
}

export const KINDS: KindDef[] = [
  // basics
  { id: 'name', label: 'Name', plural: 'Name', space: 'basics', icon: '🏷️', kernel: true, singular: true, blurb: 'What the system is called.', source: said(29) },
  { id: 'purpose', label: 'Purpose', plural: 'Purpose', space: 'basics', icon: '🎯', kernel: true, singular: true, blurb: 'Why it exists; the real-world effect and value it is for.', source: said(9, 29) },
  { id: 'summary', label: 'Summary', plural: 'Summary', space: 'basics', icon: '📝', kernel: true, singular: true, blurb: 'A paragraph for picking this project out of a list.', source: said(49, 50) },
  // problem
  { id: 'audience', label: 'Audience', plural: 'Audience', space: 'problem', icon: '👤', kernel: true, blurb: 'A type of person or agent the system is for.', source: said(30) },
  { id: 'context', label: 'Context', plural: 'Contexts', space: 'problem', icon: '🌍', kernel: true, blurb: 'The situation an audience is in when the problem shows up.', source: said(30) },
  { id: 'usecase', label: 'Use case', plural: 'Use cases', space: 'problem', icon: '🎬', kernel: true, blurb: 'Something an audience is trying to get done.', source: said(30) },
  { id: 'problem', label: 'Problem', plural: 'Problems', space: 'problem', icon: '🧨', kernel: true, blurb: 'What stands in their way today.', source: said(30) },
  { id: 'outcome', label: 'Outcome', plural: 'Outcomes', space: 'problem', icon: '🌟', kernel: true, blurb: 'The change we want for the audience. Should be measurable.', fields: [{ key: 'metric', label: 'Success metric' }], source: said(15, 30) },
  // hypothesis
  { id: 'hypothesis', label: 'Bet', plural: 'Bets', space: 'hypothesis', icon: '🎲', kernel: true, blurb: 'A bet linking what we build to an outcome; some are specific and testable, some are just bets.', fields: [{ key: 'verdict', label: 'Verdict', type: 'select', options: ['open', 'supported', 'refuted'] }], source: said(25, 30, 78, 82) },
  { id: 'assumption', label: 'Assumption', plural: 'Assumptions', space: 'hypothesis', icon: '💭', kernel: true, blurb: 'Taken as true until reality says otherwise.', source: said(30) },
  { id: 'metric', label: 'Metric', plural: 'Metrics', space: 'hypothesis', icon: '📏', kernel: true, blurb: 'How an outcome or hypothesis will be measured.', source: inferred('Outcomes and hypothesis validation (S15, S25) need a named measure; the brief never says "metric".') },
  // solution (kernel core; template kinds come as we reach this column)
  { id: 'capability', label: 'Capability', plural: 'Capabilities', space: 'solution', icon: '⚡', kernel: true, blurb: 'A high-level thing the system can do.', source: said(30) },
  { id: 'feature', label: 'Feature', plural: 'Features', space: 'solution', icon: '🎁', kernel: true, fields: [{ key: 'stages', label: 'Lifecycle stages' }], blurb: 'A value grouping, described by journeys and flows. What a startup would have a department for becomes a feature here.', source: said(32, 71, 72) },
  { id: 'flow', label: 'Flow', plural: 'Journeys & flows', space: 'solution', icon: '🧭', kernel: false, blurb: 'A happy path through the system.', source: said(31, 32) },
  { id: 'term', label: 'Term', plural: 'Vocabulary', space: 'solution', icon: '📖', kernel: false, blurb: 'A fixed word of the domain.', source: said(31) },
  // domain, C4-style levels
  { id: 'system', label: 'System', plural: 'Systems', space: 'solution', icon: '🫧', kernel: true, level: 1, blurb: 'The system itself as one bubble, or a meaningfully separate part of it (web vs mobile).', source: said(56, 57) },
  { id: 'external', label: 'External system', plural: 'External systems', space: 'solution', icon: '🛰️', kernel: true, level: 1, blurb: 'Another system ours talks to.', source: said(56) },
  { id: 'module', label: 'Module', plural: 'Modules', space: 'solution', icon: '📦', kernel: true, level: 2, blurb: 'A business domain / bounded context. Always exposes an interface.', source: said(33, 35, 58, 60) },
  { id: 'infra', label: 'Infra', plural: 'Infra', space: 'solution', icon: '🧱', kernel: false, level: 2, blurb: 'Dedicated infrastructure (cache, durable object) shown inside its module.', source: said(61) },
  { id: 'thing', label: 'Thing', plural: 'Things', space: 'solution', icon: '🔷', kernel: true, level: 3, blurb: 'An entity in domain language; a noun.', source: said(64) },
  { id: 'rule', label: 'Rule', plural: 'Rules', space: 'solution', icon: '⚖️', kernel: true, level: 3, fields: [{ key: 'tests', label: 'Tests (pos/neg)' }], blurb: 'Logic about one or more things, from hasMany to expectations. Should be tested both ways.', source: said(31, 64, 65, 66, 67) },
  { id: 'interface', label: 'Interface', plural: 'Interfaces', space: 'solution', icon: '🔌', kernel: true, level: 3, fields: [{ key: 'style', label: 'Style', type: 'select', options: ['rpc', 'rest', 'ui', 'events'] }], blurb: 'The API a module exposes; REST, RPC, UI or events.', source: said(35, 68) },
  { id: 'event', label: 'Event', plural: 'Events', space: 'solution', icon: '⚡', kernel: true, level: 3, blurb: 'Something notable that happened; a past-tense fact in the vocabulary.', source: said(74) },
  { id: 'test', label: 'Test', plural: 'Tests', space: 'solution', icon: '🧪', kernel: true, level: 3, fields: [{ key: 'ladder', label: 'Ladder', type: 'select', options: ['exists', 'surface', 'simulation'] }], blurb: 'The bridge to reality: one per condition in a rule. Ladder: module exists (health check) → API surface → deterministic simulation.', source: said(67, 89, 90, 93, 94, 95) },
  { id: 'screen', label: 'Screen', plural: 'Screens', space: 'solution', icon: '🖼️', kernel: false, blurb: 'A user interface; composed of layouts and components.', source: said(36) },
  { id: 'design-system', label: 'Design system', plural: 'Design system', space: 'solution', icon: '🎨', kernel: false, singular: true, blurb: 'Guides product and marketing material, including tone.', source: said(37) },
  // agents (sub-items of the orchestration capability)
  { id: 'agent', label: 'Agent', plural: 'Agents', space: 'solution', icon: '🤖', kernel: true, fields: [{ key: 'status', label: 'Status', type: 'select', options: ['core', 'stub'] }], blurb: 'Executes actions for one or more features; a sub-item of the orchestration capability.', source: said(2, 4, 5, 72) },
  // reality · current state (S85, S96)
  { id: 'repository', label: 'Repository', plural: 'Repositories', space: 'current', icon: '📂', kernel: true, blurb: 'Where the actual code lives; the thing codeRefs point into.', source: said(85) },
  { id: 'codebase', label: 'Code', plural: 'Code', space: 'current', icon: '💾', kernel: true, blurb: 'A reference into the repository: a module, file or block as it actually exists.', source: said(85) },
  { id: 'infrastructure', label: 'Infrastructure', plural: 'Infrastructure', space: 'current', icon: '🏗️', kernel: true, blurb: 'What is actually provisioned and running.', source: said(96) },
  { id: 'practice', label: 'Practice', plural: 'Practices & protocols', space: 'current', icon: '📋', kernel: true, fields: [{ key: 'form', label: 'Form', type: 'select', options: ['protocol', 'process flow', 'CI'] }], blurb: 'Best practices and protocols in force: process flows, CI, conventions.', source: said(96) },
  { id: 'test-result', label: 'Test result', plural: 'Test results', space: 'current', icon: '✅', kernel: true, fields: [{ key: 'status', label: 'Status', type: 'select', options: ['pass', 'fail', 'missing'] }], blurb: 'Whether a test is fulfilled in reality right now.', source: said(91) },
  // reality · planned changes (S86–S88, S92)
  { id: 'epic', label: 'Epic', plural: 'Epics', space: 'planned', icon: '🗂️', kernel: true, blurb: 'A planned change, Jira-epic sized; exists only because some tests are not fulfilled.', source: said(86, 92) },
  { id: 'task', label: 'Task', plural: 'Tasks', space: 'planned', icon: '🎯', kernel: true, fields: [{ key: 'status', label: 'Status', type: 'select', options: ['queued', 'running', 'done', 'failed'] }], blurb: 'A super-targeted coding-agent task: names the tests it must turn green.', source: said(87, 88) },
  // reality · effects
  { id: 'evidence', label: 'Evidence', plural: 'Evidence', space: 'effects', icon: '🧾', kernel: true, blurb: 'An observation from reality tied to a hypothesis or metric. STUB.', source: said(24, 25, 40) },
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
  { id: 'exposes', label: 'exposes', category: 'structural', kernel: true, hint: 'Module exposes an interface.', source: said(35, 68) },
  { id: 'emits', label: 'emits', category: 'behavioural', kernel: true, hint: 'Produces an event (interface or rule emits event).', source: inferred('Events (S74) need a producer edge; the brief does not name it.') },
  { id: 'targets', label: 'targets', category: 'orchestration', kernel: true, hint: 'Task or epic targets the tests it must turn green.', source: said(88, 92) },
  { id: 'reports', label: 'reports', category: 'verification', kernel: true, hint: 'Test result reports on a test (reality → representation).', source: said(91) },
  { id: 'realises', label: 'realises', category: 'structural', kernel: true, hint: 'Actual code realises a solution-space module or item (current state → solution).', source: said(85) },
  { id: 'governs', label: 'governs', category: 'behavioural', kernel: true, hint: 'Rule governs a thing (or several: relationship rules).', source: said(65) },
  { id: 'defines', label: 'defines', category: 'dependency', kernel: true, hint: 'Glossary term defines a node.', source: said(31, 59) },
  { id: 'uses', label: 'uses', category: 'dependency', kernel: true, hint: 'Runtime dependency.', source: said(35) },
  { id: 'references', label: 'references', category: 'dependency', kernel: true, hint: 'Weak link of last resort.', source: inferred('Escape hatch so nothing is ever blocked.') },
  { id: 'triggers', label: 'triggers', category: 'behavioural', kernel: true, hint: 'Causal succession.', source: inferred('Needed once flows and events exist (S31).') },
  { id: 'verifies', label: 'verifies', category: 'verification', kernel: true, hint: 'Test verifies a rule (one per condition).', source: said(67, 90) },
  { id: 'monitors', label: 'monitors', category: 'verification', kernel: true, hint: 'Metric watches an outcome.', source: said(15, 39) },
  { id: 'supports', label: 'supports', category: 'verification', kernel: true, hint: 'Evidence supports a hypothesis. STUB.', source: said(25) },
  { id: 'refutes', label: 'refutes', category: 'verification', kernel: true, hint: 'Evidence refutes a hypothesis. STUB.', source: said(25) },
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
  { id: 'q-summary', prompt: 'Summarise it in a paragraph.', help: 'What you would want to read when picking this project out of a list.', space: 'basics', produces: 'summary', unlocksAfter: ['q-purpose'], kernel: true, source: said(49, 50) },
  { id: 'q-audience', prompt: 'Who is it for?', help: 'One audience per line.', space: 'problem', produces: 'audience', unlocksAfter: ['q-purpose'], kernel: true, source: said(30) },
  { id: 'q-context', prompt: 'In what situations do they meet this?', help: 'One context per line.', space: 'problem', produces: 'context', unlocksAfter: ['q-audience'], kernel: true, source: said(30) },
  { id: 'q-usecase', prompt: 'What are they trying to get done?', help: 'One use case per line.', space: 'problem', produces: 'usecase', unlocksAfter: ['q-audience'], kernel: true, source: said(30) },
  { id: 'q-problem', prompt: 'What gets in their way today?', help: 'One problem per line.', space: 'problem', produces: 'problem', unlocksAfter: ['q-audience'], kernel: true, source: said(30) },
  { id: 'q-outcome', prompt: 'What should be different for them afterwards?', help: 'One outcome per line. Each will get a purpose→motivates edge.', space: 'problem', produces: 'outcome', unlocksAfter: ['q-problem'], kernel: true, source: said(15, 30) },
  { id: 'q-hypothesis', prompt: 'What are you betting on?', help: 'One bet per line; make it testable if you can.', space: 'hypothesis', produces: 'hypothesis', unlocksAfter: ['q-outcome'], kernel: true, source: said(25, 30) },
  { id: 'q-assumption', prompt: 'What are you taking for granted?', help: 'One assumption per line.', space: 'hypothesis', produces: 'assumption', unlocksAfter: ['q-outcome'], kernel: true, source: said(30) },
  { id: 'q-metric', prompt: 'How will you know?', help: 'One metric per line.', space: 'hypothesis', produces: 'metric', unlocksAfter: ['q-outcome'], kernel: true, source: inferred('Follows from S15/S25; the brief has no explicit "how will you measure" question.') },
  { id: 'q-capability', prompt: 'What must it be able to do?', help: 'One capability per line.', space: 'solution', produces: 'capability', unlocksAfter: ['q-hypothesis'], kernel: true, source: said(30) },
];

// ── Domain levels (C4-style) ────────────────────────────────────────────────
export interface LevelDef { level: 0 | 1 | 2 | 3; label: string; blurb: string; kinds: string[]; source: Provenance }
export const LEVELS: LevelDef[] = [
  { level: 0, label: 'Map', blurb: 'Representation (problem, bets, solution) on one side; Reality (current state, planned changes, effects) on the other. Solution links into planned changes; effects confirm or deny the bets.', kinds: [], source: said(79, 80, 81) },
  { level: 1, label: 'Context', blurb: 'The real world as people talk about it: our system as a bubble, the people outside it, other systems.', kinds: ['system', 'audience', 'external'], source: said(56, 57) },
  { level: 2, label: 'Modules', blurb: 'Inside the system: meaningfully different business domains, with their dedicated infra. Arrows are calls or events between them; flows run across them.', kinds: ['module', 'infra'], source: said(58, 60, 61) },
  { level: 3, label: 'Inside a module', blurb: 'Things (nouns), rules (logic about things and their relationships), events (past-tense facts), the interface it exposes, and the tests that prove the rules. Each points at code.', kinds: ['thing', 'rule', 'event', 'interface', 'test'], source: said(63, 64, 65, 68, 69, 74) },
];
export const NO_LEVEL_4: Provenance = said(70);

// ── Invariants ──────────────────────────────────────────────────────────────
export interface Invariant { id: string; text: string; source: Provenance }

export const INVARIANTS: Invariant[] = [
  { id: 'inv-commit-gate', text: 'A node or edge becomes committed only through a Commit. Agents never write directly; their output is a changeset.', source: said(27) },
  { id: 'inv-provenance', text: 'Every effect traces to exactly one Answer or one Action.', source: inferred('Needed for "documentation as code" (S22) to be auditable.') },
  { id: 'inv-kernel-additive', text: 'Templates can add kinds, edge types, and questions; they cannot remove kernel ones.', source: said(6, 43) },
  { id: 'inv-unlock', text: 'A question unlocks only after all of its unlocksAfter questions have a committed answer.', source: said(20, 21) },
  { id: 'inv-undo', text: 'Undo reverts one whole Commit, never a partial.', source: inferred('Standard; keeps the commit the unit of meaning.') },
  { id: 'inv-left-to-right', text: 'Spaces are enriched left to right: basics → problem → hypothesis → solution.', source: said(19, 29, 45) },
  { id: 'inv-fixed-vocab', text: 'Once a term is committed in the vocabulary, other nodes should use it verbatim.', source: said(31) },
  { id: 'inv-code-ref', text: 'Every level-3 item may carry props.codeRef, a URL to the file or block on GitHub that implements it.', source: said(69) },
  { id: 'inv-rule-has-test', text: 'Every rule has at least one test per condition; tests are how the representation connects to reality.', source: said(89, 90) },
  { id: 'inv-green-means-done', text: 'If every test result is pass, there are no planned changes. Any fail or missing result must be targeted by a task.', source: said(91, 92) },
  { id: 'inv-test-ladder', text: 'Tests climb a ladder: the module exists (health check) → its API surface → deterministic simulation.', source: said(93, 94, 95) },
  { id: 'inv-module-boundary', text: 'Modules keep boundaries strict enough to be tested by deterministic simulation.', source: said(95) },
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
  { id: 'Q7', group: 'Path', title: 'Add a sub-question or thread', steps: ['expand a template question', 'add a project-specific sub-question or a follow-up thread', 'answer it → effects staged'], scope: 'core', touches: ['Question', 'Answer', 'Effect'], source: said(52, 53, 54) },
  { id: 'Q8', group: 'Path', title: 'AI organises the tree', steps: ['follow-ups clustered into threads and subtrees'], scope: 'later', touches: ['Question', 'Agent'], source: said(53, 54) },
  { id: 'G1', group: 'Glossary', title: 'Edit the glossary', steps: ['open glossary from any page', 'add / edit / delete a term', 'commits immediately (escape hatch)'], scope: 'core', touches: ['Node', 'Commit', 'Kind'], source: said(59) },
  { id: 'T1', group: 'Template', title: 'Declare a template', steps: ['pick base template', 'declare extension kinds (with space), edge types, questions, agents', 'kernel kinds untouched'], scope: 'later', touches: ['Template', 'Kind', 'Space', 'Layer', 'Question', 'Agent'], source: said(6, 17, 18, 43) },
  { id: 'D1', group: 'Domain', title: 'Walk the C4 levels', steps: ['context: system, people, other systems', 'modules with infra', 'inside a module: things, rules, interface, tests', 'jump to code on GitHub'], scope: 'core', touches: ['Node', 'Edge', 'Kind'], source: said(56, 58, 63, 69) },
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
  { id: 'R5', group: 'Reality', title: 'Plan changes from failing tests', steps: ['collect test results', 'all pass → no changes', 'else: epic per cluster of failing tests', 'tasks so targeted each names its tests', 'dispatch coding agents', 'results reported back'], scope: 'stub', touches: ['Commit', 'Action', 'Agent', 'Evidence'], source: said(87, 88, 91, 92) },
  { id: 'R6', group: 'Reality', title: 'Climb the test ladder for a module', steps: ['health check: module exists', 'API surface tests', 'deterministic simulation'], scope: 'stub', touches: ['Node', 'Edge'], source: said(93, 94, 95) },
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
