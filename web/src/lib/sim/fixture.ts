import type { Graph } from '../schema';

// A small, fixed graph for the ontology simulator's `resetToSample` op.
//
// The simulator must stay content-independent: its op count and runtime are
// meant to scale with `ops`, not with whatever SAMPLE_GRAPH happens to be.
// Wiring `resetToSample` straight to the real (dogfooded, ~114-node) sample
// graph made a 5000-op soak run go from ~22s to well over five minutes,
// since every resetToSample op re-seeds the live store with the full sample
// and every subsequent op then pays the cost of operating over it. This
// fixture is a copy of the frozen FIXTURE in tests/unit/query.test.ts (not an
// import — that file is test-only and unrelated to the sim), kept
// deliberately small (~25 nodes / ~40 edges) and stable regardless of how
// large SAMPLE_GRAPH grows.
export const SIM_FIXTURE: Graph = {
  nodes: [
    { id: 'name-bropilot', kind: 'name', title: 'Bropilot Studio', description: 'A studio for collecting and visualising the knowledge graph of a system.', props: {} },
    { id: 'purpose-shared-understanding', kind: 'purpose', title: 'Shared understanding, codified', description: 'Capture the why, the what and the how of a system in one navigable graph.', props: {} },
    { id: 'capability-collect', kind: 'capability', title: 'Guided collection', description: 'Structured forms walk you through every kind of knowledge a system has.', props: {} },
    { id: 'capability-visualise', kind: 'capability', title: 'Live graph view', description: 'See the whole system as an explorable node-link graph.', props: {} },
    { id: 'capability-portable', kind: 'capability', title: 'Portable spec', description: 'Import / export the Bropilot JSON schema.', props: {} },
    { id: 'persona-architect', kind: 'persona', title: 'System architect', description: 'Owns the shape of the system and keeps the graph honest.', props: { role: 'Designs and curates the knowledge graph' } },
    { id: 'persona-builder', kind: 'persona', title: 'Builder', description: 'Turns the graph into running code.', props: { role: 'Implements modules from the domain' } },
    { id: 'requirement-three-parts', kind: 'requirement', title: 'Three-part model', description: 'Foundations, Domain and Implementation must each be first-class.', props: { priority: 'must' } },
    { id: 'requirement-traceable', kind: 'requirement', title: 'Code traceability', description: 'Every implementation node links to where its code lives.', props: { priority: 'should' } },
    { id: 'usecase-onboard', kind: 'usecase', title: 'Onboard onto a system', description: 'A newcomer reads the graph to understand a system fast.', props: { situation: 'A new engineer joins.' } },
    { id: 'constraint-client-only', kind: 'constraint', title: 'No backend required', description: 'Runs entirely in the browser.', props: { invariant: 'The graph is always usable offline.' } },
    { id: 'goal-faster-alignment', kind: 'goal', title: 'Faster alignment', description: 'Cut the time a team spends arguing about what the system is.', props: { metric: 'Onboarding time trends down.' } },
    { id: 'hypothesis-graph-beats-docs', kind: 'hypothesis', title: 'A graph beats a doc', description: 'A linked graph is retained better than prose docs.', props: { belief: 'People reason about systems as connected things.', validation: 'Users navigate edges more than they read.' } },
    { id: 'term-space', kind: 'term', title: 'Space', description: 'One of four semantic groupings.', props: { aka: ['concern'] } },
    { id: 'entity-node', kind: 'entity', title: 'Node', description: 'A unit of knowledge with a kind, title and description.', props: { attributes: ['id', 'kind', 'title'] } },
    { id: 'entity-edge', kind: 'entity', title: 'Edge', description: 'A typed, directed relationship between two nodes.', props: { attributes: ['id', 'srcId', 'dstId', 'type'] } },
    { id: 'relationship-node-edge', kind: 'relationship', title: 'Nodes connect via Edges', description: 'Edges link a source node to a destination node.', props: { cardinality: 'many-to-many' } },
    { id: 'behaviour-autosave', kind: 'behaviour', title: 'Autosave', description: 'Any change to the graph is persisted to localStorage immediately.', props: {} },
    { id: 'flow-collect', kind: 'flow', title: 'Collect a system', description: 'Walk the three parts and fill in what you know.', props: { steps: ['Name & purpose', 'Domain objects'] } },
    { id: 'screen-studio', kind: 'screen', title: 'Studio', description: 'The single-page workspace hosting all views.', props: {} },
    { id: 'module-store', kind: 'module', title: 'Graph store', description: 'Reactive state + persistence + import/export.', props: { path: 'web/src/lib/store.ts', repo: '' } },
    { id: 'module-schema', kind: 'module', title: 'Schema', description: 'Kind registry, parts, spaces and field defs.', props: { path: 'web/src/lib/schema.ts', repo: '' } },
    { id: 'component-force-graph', kind: 'component', title: 'ForceGraph', description: 'd3-force layout rendered as interactive SVG.', props: { path: 'web/src/components/graph/ForceGraph.vue', repo: '' } },
    { id: 'component-node-form', kind: 'component', title: 'NodeForm', description: "Dynamic editor generated from a kind's field defs.", props: { path: 'web/src/components/form/NodeForm.vue', repo: '' } },
    { id: 'interface-graph', kind: 'interface', title: 'Graph', description: 'The serialisable shape: { nodes, edges }.', props: { signature: 'interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }' } },
    { id: 'external-d3', kind: 'external', title: 'd3-force', description: 'Physics simulation for graph layout.', props: { url: 'https://github.com/d3/d3-force' } },
    { id: 'design-glass', kind: 'design', title: 'Glass dark theme', description: 'Translucent panels, per-space accent glows.', props: {} },
  ],
  edges: [
    { id: 'e-1', srcId: 'name-bropilot', dstId: 'capability-collect', type: 'has' },
    { id: 'e-2', srcId: 'name-bropilot', dstId: 'capability-visualise', type: 'has' },
    { id: 'e-3', srcId: 'name-bropilot', dstId: 'capability-portable', type: 'has' },
    { id: 'e-4', srcId: 'capability-collect', dstId: 'requirement-three-parts', type: 'satisfies' },
    { id: 'e-5', srcId: 'persona-architect', dstId: 'usecase-onboard', type: 'triggers' },
    { id: 'e-6', srcId: 'usecase-onboard', dstId: 'screen-studio', type: 'uses' },
    { id: 'e-7', srcId: 'requirement-traceable', dstId: 'module-store', type: 'constrains' },
    { id: 'e-8', srcId: 'relationship-node-edge', dstId: 'entity-node', type: 'references' },
    { id: 'e-9', srcId: 'relationship-node-edge', dstId: 'entity-edge', type: 'references' },
    { id: 'e-10', srcId: 'screen-studio', dstId: 'component-force-graph', type: 'contains' },
    { id: 'e-11', srcId: 'screen-studio', dstId: 'component-node-form', type: 'contains' },
    { id: 'e-12', srcId: 'component-force-graph', dstId: 'external-d3', type: 'uses' },
    { id: 'e-13', srcId: 'component-force-graph', dstId: 'entity-node', type: 'uses' },
    { id: 'e-14', srcId: 'module-store', dstId: 'behaviour-autosave', type: 'implements' },
    { id: 'e-15', srcId: 'module-store', dstId: 'interface-graph', type: 'uses' },
    { id: 'e-16', srcId: 'module-schema', dstId: 'term-space', type: 'implements' },
    { id: 'e-17', srcId: 'flow-collect', dstId: 'screen-studio', type: 'uses' },
    { id: 'e-18', srcId: 'screen-studio', dstId: 'design-glass', type: 'uses' },
    { id: 'e-19', srcId: 'name-bropilot', dstId: 'purpose-shared-understanding', type: 'has' },
    { id: 'e-20', srcId: 'purpose-shared-understanding', dstId: 'goal-faster-alignment', type: 'motivates' },
    { id: 'e-21', srcId: 'hypothesis-graph-beats-docs', dstId: 'goal-faster-alignment', type: 'motivates' },
    { id: 'e-22', srcId: 'hypothesis-graph-beats-docs', dstId: 'capability-visualise', type: 'motivates' },
    { id: 'e-23', srcId: 'goal-faster-alignment', dstId: 'usecase-onboard', type: 'motivates' },
    { id: 'e-24', srcId: 'persona-architect', dstId: 'capability-collect', type: 'uses' },
    { id: 'e-25', srcId: 'persona-builder', dstId: 'capability-portable', type: 'uses' },
    { id: 'e-26', srcId: 'usecase-onboard', dstId: 'capability-visualise', type: 'uses' },
    { id: 'e-27', srcId: 'flow-collect', dstId: 'capability-collect', type: 'uses' },
    { id: 'e-28', srcId: 'component-force-graph', dstId: 'capability-visualise', type: 'implements' },
    { id: 'e-29', srcId: 'module-store', dstId: 'capability-portable', type: 'implements' },
    { id: 'e-30', srcId: 'constraint-client-only', dstId: 'module-store', type: 'constrains' },
    { id: 'e-31', srcId: 'interface-graph', dstId: 'entity-node', type: 'references' },
    { id: 'e-32', srcId: 'interface-graph', dstId: 'entity-edge', type: 'references' },
    { id: 'e-33', srcId: 'module-store', dstId: 'module-schema', type: 'depends_on' },
    { id: 'e-34', srcId: 'component-node-form', dstId: 'module-schema', type: 'uses' },
    { id: 'e-35', srcId: 'purpose-shared-understanding', dstId: 'persona-architect', type: 'serves' },
    { id: 'e-36', srcId: 'purpose-shared-understanding', dstId: 'persona-builder', type: 'serves' },
    { id: 'e-37', srcId: 'purpose-shared-understanding', dstId: 'hypothesis-graph-beats-docs', type: 'depends_on' },
    { id: 'e-38', srcId: 'persona-architect', dstId: 'flow-collect', type: 'triggers' },
    { id: 'e-39', srcId: 'screen-studio', dstId: 'module-store', type: 'uses' },
    { id: 'e-40', srcId: 'capability-portable', dstId: 'constraint-client-only', type: 'depends_on' },
    { id: 'e-41', srcId: 'persona-builder', dstId: 'requirement-traceable', type: 'motivates' },
    { id: 'e-42', srcId: 'entity-node', dstId: 'relationship-node-edge', type: 'has' },
  ],
};
