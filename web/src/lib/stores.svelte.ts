import type { Graph, Node, Edge, Message, Space, Snapshot, CompletenessScore, ValidationResult, Change } from './types.js';
import { KIND_TO_SPACE } from './types.js';

export type FocusedPanel = 'chat' | 'graph';

export const appState = $state({
  graph: { nodes: [], edges: [] } as Graph,
  messages: [] as Message[],
  selectedNodeId: null as string | null,
  expandedNodeIds: new Set<string>(),
  visibleSpaces: new Set<Space>(['basics', 'problem', 'solution', 'crosscutting']),
  focusedNodeId: null as string | null,
  searchQuery: '',
  matchingNodeIds: new Set<string>(),
  snapshots: [] as Snapshot[],
  showExportModal: false,
  exportContent: '',
  showLegend: false,
  // Keyboard navigation state
  focusedPanel: 'chat' as FocusedPanel,
  showKeyboardHelp: false,
  // Completeness panel state
  completeness: null as CompletenessScore | null,
  showCompletenessPanel: true,
  // Validation state
  validationResult: null as ValidationResult | null,
  showValidationPanel: false,
  // Undo/Redo state
  canUndo: false,
  canRedo: false,
  changeHistory: [] as Change[],
  isUndoing: false,
  isRedoing: false,
});

export function setGraph(graph: Graph) {
  appState.graph = graph;
}

export function addMessage(msg: Message) {
  appState.messages = [...appState.messages, msg];
}

export function selectNode(id: string | null) {
  appState.selectedNodeId = id;
}

export function toggleExpanded(id: string) {
  const next = new Set(appState.expandedNodeIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  appState.expandedNodeIds = next;
}

export function toggleSpace(space: Space) {
  const next = new Set(appState.visibleSpaces);
  if (next.has(space)) {
    next.delete(space);
  } else {
    next.add(space);
  }
  appState.visibleSpaces = next;
}

export function focusNode(id: string | null) {
  appState.focusedNodeId = id;
  if (id) {
    appState.selectedNodeId = id;
  }
}

export function getConnectedNodes(nodeId: string): { incoming: Node[]; outgoing: Node[] } {
  const { nodes, edges } = appState.graph;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const incoming: Node[] = [];
  const outgoing: Node[] = [];

  for (const edge of edges) {
    if (edge.dstId === nodeId) {
      const src = nodeMap.get(edge.srcId);
      if (src) incoming.push(src);
    }
    if (edge.srcId === nodeId) {
      const dst = nodeMap.get(edge.dstId);
      if (dst) outgoing.push(dst);
    }
  }

  return { incoming, outgoing };
}

export function getSelectedNode(): Node | null {
  if (!appState.selectedNodeId) return null;
  return appState.graph.nodes.find(n => n.id === appState.selectedNodeId) ?? null;
}

export function getNodeEdges(nodeId: string): Edge[] {
  return appState.graph.edges.filter(e => e.srcId === nodeId || e.dstId === nodeId);
}

export function setSearchQuery(query: string) {
  appState.searchQuery = query;
  if (!query.trim()) {
    appState.matchingNodeIds = new Set();
    return;
  }
  const lowerQuery = query.toLowerCase();
  const matching = appState.graph.nodes.filter(
    n => n.title.toLowerCase().includes(lowerQuery) ||
         n.description.toLowerCase().includes(lowerQuery)
  );
  appState.matchingNodeIds = new Set(matching.map(n => n.id));
}

export function setSnapshots(snapshots: Snapshot[]) {
  appState.snapshots = snapshots;
}

export function addSnapshot(snapshot: Snapshot) {
  appState.snapshots = [...appState.snapshots, snapshot];
}

export function setExportModal(show: boolean, content: string = '') {
  appState.showExportModal = show;
  appState.exportContent = content;
}

export function toggleLegend() {
  appState.showLegend = !appState.showLegend;
}

export function setCompleteness(completeness: CompletenessScore | null) {
  appState.completeness = completeness;
}

export function toggleCompletenessPanel() {
  appState.showCompletenessPanel = !appState.showCompletenessPanel;
}

export function setValidationResult(result: ValidationResult | null) {
  appState.validationResult = result;
}

export function toggleValidationPanel() {
  appState.showValidationPanel = !appState.showValidationPanel;
}

export function setValidationPanel(show: boolean) {
  appState.showValidationPanel = show;
}

/**
 * Get node IDs that have validation issues of a given severity
 */
export function getNodesWithIssues(): { errors: Set<string>; warnings: Set<string> } {
  const errors = new Set<string>();
  const warnings = new Set<string>();

  if (!appState.validationResult) return { errors, warnings };

  for (const issue of appState.validationResult.errors) {
    if (issue.nodeIds) {
      for (const nodeId of issue.nodeIds) {
        errors.add(nodeId);
      }
    }
  }

  for (const issue of appState.validationResult.warnings) {
    if (issue.nodeIds) {
      for (const nodeId of issue.nodeIds) {
        warnings.add(nodeId);
      }
    }
  }

  return { errors, warnings };
}

export function getNodeKindCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of appState.graph.nodes) {
    counts[node.kind] = (counts[node.kind] || 0) + 1;
  }
  return counts;
}

export function setFocusedPanel(panel: FocusedPanel) {
  appState.focusedPanel = panel;
}

export function toggleKeyboardHelp() {
  appState.showKeyboardHelp = !appState.showKeyboardHelp;
}

export function setKeyboardHelp(show: boolean) {
  appState.showKeyboardHelp = show;
}

/**
 * Get sibling nodes (nodes at the same "level" - connected to same parent or sharing edges)
 */
export function getSiblingNodes(nodeId: string): Node[] {
  const { nodes, edges } = appState.graph;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const node = nodeMap.get(nodeId);
  if (!node) return [];

  // Find nodes that share the same incoming edge sources (siblings)
  const incomingSources = new Set<string>();
  for (const edge of edges) {
    if (edge.dstId === nodeId) {
      incomingSources.add(edge.srcId);
    }
  }

  const siblings = new Set<string>();
  for (const edge of edges) {
    if (incomingSources.has(edge.srcId) && edge.dstId !== nodeId) {
      siblings.add(edge.dstId);
    }
  }

  return Array.from(siblings)
    .map(id => nodeMap.get(id))
    .filter((n): n is Node => n !== undefined);
}

export function getReferencingNodes(nodeId: string): { node: Node; edgeType: string; direction: 'in' | 'out' }[] {
  const { nodes, edges } = appState.graph;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const refs: { node: Node; edgeType: string; direction: 'in' | 'out' }[] = [];

  for (const edge of edges) {
    if (edge.dstId === nodeId) {
      const src = nodeMap.get(edge.srcId);
      if (src) refs.push({ node: src, edgeType: edge.type, direction: 'in' });
    }
    if (edge.srcId === nodeId) {
      const dst = nodeMap.get(edge.dstId);
      if (dst) refs.push({ node: dst, edgeType: edge.type, direction: 'out' });
    }
  }

  return refs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Undo/Redo state management
// ─────────────────────────────────────────────────────────────────────────────

export function setChangeHistory(changes: Change[]) {
  appState.changeHistory = changes;
  // Update canUndo/canRedo based on history
  appState.canUndo = changes.some(c => !c.undone);
  appState.canRedo = changes.some(c => c.undone);
}

export function setUndoState(canUndo: boolean, canRedo: boolean) {
  appState.canUndo = canUndo;
  appState.canRedo = canRedo;
}

export function setIsUndoing(value: boolean) {
  appState.isUndoing = value;
}

export function setIsRedoing(value: boolean) {
  appState.isRedoing = value;
}
