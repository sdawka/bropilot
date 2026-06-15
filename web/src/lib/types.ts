export type Space = 'basics' | 'problem' | 'solution' | 'crosscutting';

export type NodeKind =
  | 'name' | 'purpose' | 'capability'
  | 'persona' | 'usecase' | 'flow' | 'screen' | 'constraint' | 'assumption' | 'requirement'
  | 'entity' | 'relationship' | 'module' | 'component' | 'interface' | 'api' | 'event' | 'state' | 'behaviour' | 'logic'
  | 'repository' | 'tests' | 'observability' | 'external' | 'design';

export type EdgeType = 'has' | 'uses' | 'triggers' | 'implements' | 'depends_on' | 'extends' | 'contains' | 'references';

export interface Node {
  id: string;
  kind: NodeKind;
  title: string;
  description: string;
  sourceRefs: SourceRef[];
  createdAt: number;
  updatedAt: number;
}

export interface Edge {
  id: string;
  srcId: string;
  dstId: string;
  type: EdgeType;
  label?: string;
}

export interface SourceRef {
  turnId: string;
  excerpt: string;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  output?: unknown;
}

export const SPACE_COLORS: Record<Space, string> = {
  basics: '#d29922',
  problem: '#f85149',
  solution: '#39d9d9',
  crosscutting: '#a371f7',
};

export const KIND_TO_SPACE: Record<NodeKind, Space> = {
  name: 'basics',
  purpose: 'basics',
  capability: 'basics',
  persona: 'problem',
  usecase: 'problem',
  flow: 'problem',
  screen: 'problem',
  constraint: 'problem',
  assumption: 'problem',
  requirement: 'problem',
  entity: 'solution',
  relationship: 'solution',
  module: 'solution',
  component: 'solution',
  interface: 'solution',
  api: 'solution',
  event: 'solution',
  state: 'solution',
  behaviour: 'solution',
  logic: 'solution',
  repository: 'crosscutting',
  tests: 'crosscutting',
  observability: 'crosscutting',
  external: 'crosscutting',
  design: 'crosscutting',
};

export interface Snapshot {
  id: string;
  name: string;
  createdAt: number;
}

export interface MissingItem {
  kind: string;
  message: string;
  severity: 'required' | 'recommended';
}

export interface Suggestion {
  kind: string;
  prompt: string;
  priority: number;
}

export interface SpaceScore {
  space: Space;
  score: number;
  maxScore: number;
  missing: MissingItem[];
}

export interface CompletenessScore {
  overall: number;
  spaces: SpaceScore[];
  missing: MissingItem[];
  suggestions: Suggestion[];
}

export type SuggestionCategory =
  | 'orphan'
  | 'missing_connection'
  | 'missing_error_handling'
  | 'implicit_concept'
  | 'unbalanced_space'
  | 'missing_assumption';

export interface AISuggestion {
  id: string;
  text: string;
  suggestedKind: NodeKind | null;
  suggestedTitle: string | null;
  priority: 'high' | 'medium' | 'low';
  category: SuggestionCategory;
  relatedNodeId?: string;
}

// Validation types
export interface ValidationIssue {
  ruleId: string;
  severity: 'error' | 'warning' | 'suggestion';
  message: string;
  nodeIds?: string[];
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  suggestions: ValidationIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
    suggestionCount: number;
  };
}

// Undo/Redo types
export type ChangeAction = 'add_node' | 'update_node' | 'delete_node' | 'add_edge' | 'delete_edge';

export interface Change {
  id: string;
  action: ChangeAction;
  targetId: string;
  timestamp: string;
  sourceTurn: string | null;
  undone: boolean;
  beforeState: Node | Edge | null;
  afterState: Node | Edge | null;
}

export interface UndoRedoResult {
  success: boolean;
  error?: string;
  undone?: {
    action: ChangeAction;
    targetId: string;
    timestamp: string;
    beforeState: Node | Edge | null;
    afterState: Node | Edge | null;
  };
  redone?: {
    action: ChangeAction;
    targetId: string;
    timestamp: string;
    beforeState: Node | Edge | null;
    afterState: Node | Edge | null;
  };
}
