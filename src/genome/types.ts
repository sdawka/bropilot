// Spaces organize node kinds into conceptual areas
export type Space = 'basics' | 'problem' | 'solution' | 'crosscutting';

// All node kinds in the knowledge graph
export const NODE_KINDS = {
  // Basics (Act 1)
  name: { space: 'basics' as Space, singular: true },
  purpose: { space: 'basics' as Space, singular: true },
  capability: { space: 'basics' as Space },

  // Problem space
  persona: { space: 'problem' as Space },
  usecase: { space: 'problem' as Space },
  flow: { space: 'problem' as Space },
  screen: { space: 'problem' as Space },
  constraint: { space: 'problem' as Space },
  assumption: { space: 'problem' as Space },
  requirement: { space: 'problem' as Space },

  // Solution space
  entity: { space: 'solution' as Space },
  relationship: { space: 'solution' as Space },
  module: { space: 'solution' as Space },
  component: { space: 'solution' as Space },
  interface: { space: 'solution' as Space },
  api: { space: 'solution' as Space },
  event: { space: 'solution' as Space },
  state: { space: 'solution' as Space },
  behaviour: { space: 'solution' as Space },
  logic: { space: 'solution' as Space },

  // Cross-cutting
  repository: { space: 'crosscutting' as Space },
  tests: { space: 'crosscutting' as Space },
  observability: { space: 'crosscutting' as Space },
  external: { space: 'crosscutting' as Space },
  design: { space: 'crosscutting' as Space },
} as const;

export type NodeKind = keyof typeof NODE_KINDS;

// Edge types that connect nodes
export const EDGE_TYPES = [
  'has',
  'uses',
  'triggers',
  'implements',
  'depends_on',
  'extends',
  'contains',
  'references',
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

// Source reference linking a node to user input
export interface SourceRef {
  turnId: string;
  excerpt: string;
}

// A node in the graph
export interface Node {
  id: string;
  kind: NodeKind;
  title: string;
  description: string;
  sourceRefs: SourceRef[];
  createdAt: number;
  updatedAt: number;
}

// An edge between nodes
export interface Edge {
  id: string;
  srcId: string;
  dstId: string;
  type: EdgeType;
  label?: string;
}
