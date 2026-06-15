import type { Node, Edge, NodeKind, Space } from './types.js';
import { NODE_KINDS } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  ruleId: string;
  severity: 'error' | 'warning' | 'suggestion';
  message: string;
  nodeIds?: string[];
  suggestion?: string;
}

export interface ValidationRule {
  id: string;
  description: string;
  severity: 'error' | 'warning' | 'suggestion';
  check: (graph: Graph) => ValidationIssue[];
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Error Rules (block save/commit)
// ─────────────────────────────────────────────────────────────────────────────

const noDuplicateSingular: ValidationRule = {
  id: 'no-duplicate-singular',
  description: "Can't have multiple 'name' or 'purpose' nodes",
  severity: 'error',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const singularKinds = Object.entries(NODE_KINDS)
      .filter(([_, meta]) => 'singular' in meta && meta.singular)
      .map(([kind]) => kind as NodeKind);

    for (const kind of singularKinds) {
      const nodesOfKind = graph.nodes.filter((n) => n.kind === kind);
      if (nodesOfKind.length > 1) {
        issues.push({
          ruleId: 'no-duplicate-singular',
          severity: 'error',
          message: `Multiple '${kind}' nodes found (only one allowed)`,
          nodeIds: nodesOfKind.map((n) => n.id),
          suggestion: `Keep only one '${kind}' node and merge the content if needed`,
        });
      }
    }

    return issues;
  },
};

const edgeReferencesValid: ValidationRule = {
  id: 'edge-references-valid',
  description: 'Edges must reference existing nodes',
  severity: 'error',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    for (const edge of graph.edges) {
      const invalidRefs: string[] = [];

      if (!nodeIds.has(edge.srcId)) {
        invalidRefs.push(`source '${edge.srcId}'`);
      }
      if (!nodeIds.has(edge.dstId)) {
        invalidRefs.push(`destination '${edge.dstId}'`);
      }

      if (invalidRefs.length > 0) {
        issues.push({
          ruleId: 'edge-references-valid',
          severity: 'error',
          message: `Edge '${edge.id}' references non-existent ${invalidRefs.join(' and ')}`,
          nodeIds: [edge.srcId, edge.dstId].filter((id) => !nodeIds.has(id)),
          suggestion: 'Delete this edge or restore the missing node',
        });
      }
    }

    return issues;
  },
};

const noSelfReference: ValidationRule = {
  id: 'no-self-reference',
  description: "Node can't edge to itself",
  severity: 'error',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    for (const edge of graph.edges) {
      if (edge.srcId === edge.dstId) {
        const node = nodeMap.get(edge.srcId);
        const nodeName = node ? `"${node.title}"` : edge.srcId;
        issues.push({
          ruleId: 'no-self-reference',
          severity: 'error',
          message: `Node ${nodeName} has a self-referencing edge`,
          nodeIds: [edge.srcId],
          suggestion: 'Remove the self-referencing edge',
        });
      }
    }

    return issues;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Warning Rules (show in UI)
// ─────────────────────────────────────────────────────────────────────────────

const orphanNodes: ValidationRule = {
  id: 'orphan-nodes',
  description: 'Nodes with no connections',
  severity: 'warning',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const connectedNodeIds = new Set<string>();

    for (const edge of graph.edges) {
      connectedNodeIds.add(edge.srcId);
      connectedNodeIds.add(edge.dstId);
    }

    for (const node of graph.nodes) {
      // Skip singular basics nodes that are naturally standalone
      if (node.kind === 'name' || node.kind === 'purpose') continue;

      if (!connectedNodeIds.has(node.id)) {
        issues.push({
          ruleId: 'orphan-nodes',
          severity: 'warning',
          message: `"${node.title}" (${node.kind}) has no connections`,
          nodeIds: [node.id],
          suggestion: 'Connect this node to related concepts using edges',
        });
      }
    }

    return issues;
  },
};

const usecaseNeedsPersona: ValidationRule = {
  id: 'usecase-needs-persona',
  description: 'Usecases should connect to a persona',
  severity: 'warning',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    const usecases = graph.nodes.filter((n) => n.kind === 'usecase');
    const hasAnyPersona = graph.nodes.some((n) => n.kind === 'persona');

    // Only check if there are personas defined
    if (!hasAnyPersona) return issues;

    // Build edge adjacency
    const connectedTo = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!connectedTo.has(edge.srcId)) connectedTo.set(edge.srcId, new Set());
      if (!connectedTo.has(edge.dstId)) connectedTo.set(edge.dstId, new Set());
      connectedTo.get(edge.srcId)!.add(edge.dstId);
      connectedTo.get(edge.dstId)!.add(edge.srcId);
    }

    for (const usecase of usecases) {
      const neighbors = connectedTo.get(usecase.id) ?? new Set();
      const hasPersonaConnection = Array.from(neighbors).some((neighborId) => {
        const neighbor = nodeMap.get(neighborId);
        return neighbor?.kind === 'persona';
      });

      if (!hasPersonaConnection) {
        issues.push({
          ruleId: 'usecase-needs-persona',
          severity: 'warning',
          message: `Use case "${usecase.title}" is not connected to any persona`,
          nodeIds: [usecase.id],
          suggestion: 'Connect this use case to the persona(s) who perform it',
        });
      }
    }

    return issues;
  },
};

const flowNeedsUsecase: ValidationRule = {
  id: 'flow-needs-usecase',
  description: 'Flows should connect to a usecase',
  severity: 'warning',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    const flows = graph.nodes.filter((n) => n.kind === 'flow');
    const hasAnyUsecase = graph.nodes.some((n) => n.kind === 'usecase');

    // Only check if there are usecases defined
    if (!hasAnyUsecase) return issues;

    // Build edge adjacency
    const connectedTo = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!connectedTo.has(edge.srcId)) connectedTo.set(edge.srcId, new Set());
      if (!connectedTo.has(edge.dstId)) connectedTo.set(edge.dstId, new Set());
      connectedTo.get(edge.srcId)!.add(edge.dstId);
      connectedTo.get(edge.dstId)!.add(edge.srcId);
    }

    for (const flow of flows) {
      const neighbors = connectedTo.get(flow.id) ?? new Set();
      const hasUsecaseConnection = Array.from(neighbors).some((neighborId) => {
        const neighbor = nodeMap.get(neighborId);
        return neighbor?.kind === 'usecase';
      });

      if (!hasUsecaseConnection) {
        issues.push({
          ruleId: 'flow-needs-usecase',
          severity: 'warning',
          message: `Flow "${flow.title}" is not connected to any use case`,
          nodeIds: [flow.id],
          suggestion: 'Connect this flow to the use case it implements',
        });
      }
    }

    return issues;
  },
};

const entityNeedsRelationship: ValidationRule = {
  id: 'entity-needs-relationship',
  description: 'Entities should have at least one relationship',
  severity: 'warning',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    const entities = graph.nodes.filter((n) => n.kind === 'entity');

    // Only check if there are multiple entities
    if (entities.length < 2) return issues;

    // Build edge adjacency
    const connectedTo = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!connectedTo.has(edge.srcId)) connectedTo.set(edge.srcId, new Set());
      if (!connectedTo.has(edge.dstId)) connectedTo.set(edge.dstId, new Set());
      connectedTo.get(edge.srcId)!.add(edge.dstId);
      connectedTo.get(edge.dstId)!.add(edge.srcId);
    }

    for (const entity of entities) {
      const neighbors = connectedTo.get(entity.id) ?? new Set();
      const hasRelationshipOrEntity = Array.from(neighbors).some((neighborId) => {
        const neighbor = nodeMap.get(neighborId);
        return neighbor?.kind === 'relationship' || neighbor?.kind === 'entity';
      });

      if (!hasRelationshipOrEntity) {
        issues.push({
          ruleId: 'entity-needs-relationship',
          severity: 'warning',
          message: `Entity "${entity.title}" has no relationships to other entities`,
          nodeIds: [entity.id],
          suggestion: 'Add a relationship node or connect directly to related entities',
        });
      }
    }

    return issues;
  },
};

const missingSourceRef: ValidationRule = {
  id: 'missing-source-ref',
  description: 'Nodes without sourceRefs (no traceability)',
  severity: 'warning',
  check: (graph) => {
    const issues: ValidationIssue[] = [];

    for (const node of graph.nodes) {
      if (!node.sourceRefs || node.sourceRefs.length === 0) {
        issues.push({
          ruleId: 'missing-source-ref',
          severity: 'warning',
          message: `"${node.title}" (${node.kind}) has no source references`,
          nodeIds: [node.id],
          suggestion: 'Add a source reference to trace this back to user input',
        });
      }
    }

    return issues;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion Rules (helpful hints)
// ─────────────────────────────────────────────────────────────────────────────

const emptyBasics: ValidationRule = {
  id: 'empty-basics',
  description: 'No name or purpose defined yet',
  severity: 'suggestion',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const hasName = graph.nodes.some((n) => n.kind === 'name');
    const hasPurpose = graph.nodes.some((n) => n.kind === 'purpose');

    if (!hasName && !hasPurpose) {
      issues.push({
        ruleId: 'empty-basics',
        severity: 'suggestion',
        message: 'No name or purpose defined yet',
        suggestion: 'Start by defining what the project is called and what problem it solves',
      });
    } else if (!hasName) {
      issues.push({
        ruleId: 'empty-basics',
        severity: 'suggestion',
        message: 'No name defined for the project',
        suggestion: 'Add a name node to give the project an identity',
      });
    } else if (!hasPurpose) {
      issues.push({
        ruleId: 'empty-basics',
        severity: 'suggestion',
        message: 'No purpose defined for the project',
        suggestion: 'Add a purpose node to clarify what problem this solves',
      });
    }

    return issues;
  },
};

const noAssumptions: ValidationRule = {
  id: 'no-assumptions',
  description: 'No assumptions captured (should surface these!)',
  severity: 'suggestion',
  check: (graph) => {
    const issues: ValidationIssue[] = [];
    const hasAssumptions = graph.nodes.some((n) => n.kind === 'assumption');

    // Only suggest if the graph has substantial content
    const problemNodes = graph.nodes.filter((n) => {
      const space = NODE_KINDS[n.kind]?.space;
      return space === 'problem' || space === 'solution';
    });

    if (!hasAssumptions && problemNodes.length >= 3) {
      issues.push({
        ruleId: 'no-assumptions',
        severity: 'suggestion',
        message: 'No assumptions have been captured',
        suggestion: 'Surface and document assumptions about users, technology, or scope',
      });
    }

    return issues;
  },
};

const solutionBeforeProblem: ValidationRule = {
  id: 'solution-before-problem',
  description: 'Solution nodes exist but problem space is sparse',
  severity: 'suggestion',
  check: (graph) => {
    const issues: ValidationIssue[] = [];

    const problemNodes = graph.nodes.filter((n) => NODE_KINDS[n.kind]?.space === 'problem');
    const solutionNodes = graph.nodes.filter((n) => NODE_KINDS[n.kind]?.space === 'solution');

    // Solution work is happening but problem space is underdeveloped
    if (solutionNodes.length >= 3 && problemNodes.length < 2) {
      issues.push({
        ruleId: 'solution-before-problem',
        severity: 'suggestion',
        message: 'Solution details exist but problem space is sparse',
        nodeIds: solutionNodes.slice(0, 3).map((n) => n.id),
        suggestion: 'Consider defining personas, use cases, and flows before diving into solution details',
      });
    }

    return issues;
  },
};

const unbalancedGraph: ValidationRule = {
  id: 'unbalanced-graph',
  description: 'One space has 10x more nodes than another',
  severity: 'suggestion',
  check: (graph) => {
    const issues: ValidationIssue[] = [];

    const bySpace = new Map<Space, number>();
    for (const node of graph.nodes) {
      const space = NODE_KINDS[node.kind]?.space ?? 'crosscutting';
      bySpace.set(space, (bySpace.get(space) ?? 0) + 1);
    }

    // Only check if we have meaningful data
    const spaces = Array.from(bySpace.entries()).filter(([_, count]) => count > 0);
    if (spaces.length < 2) return issues;

    const maxCount = Math.max(...Array.from(bySpace.values()));
    const minCount = Math.min(...Array.from(bySpace.values()).filter((c) => c > 0));

    if (maxCount >= 10 && maxCount >= minCount * 10) {
      const maxSpace = Array.from(bySpace.entries()).find(([_, c]) => c === maxCount)?.[0];
      const minSpace = Array.from(bySpace.entries()).find(([_, c]) => c === minCount)?.[0];

      issues.push({
        ruleId: 'unbalanced-graph',
        severity: 'suggestion',
        message: `Graph is unbalanced: ${maxSpace} has ${maxCount} nodes while ${minSpace} has only ${minCount}`,
        suggestion: `Consider adding more detail to the ${minSpace} space`,
      });
    }

    return issues;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// All Rules
// ─────────────────────────────────────────────────────────────────────────────

export const validationRules: ValidationRule[] = [
  // Errors
  noDuplicateSingular,
  edgeReferencesValid,
  noSelfReference,
  // Warnings
  orphanNodes,
  usecaseNeedsPersona,
  flowNeedsUsecase,
  entityNeedsRelationship,
  missingSourceRef,
  // Suggestions
  emptyBasics,
  noAssumptions,
  solutionBeforeProblem,
  unbalancedGraph,
];

// ─────────────────────────────────────────────────────────────────────────────
// Validation Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all validation rules against the graph
 */
export function validateGraph(graph: Graph): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suggestions: ValidationIssue[] = [];

  for (const rule of validationRules) {
    const issues = rule.check(graph);
    for (const issue of issues) {
      switch (issue.severity) {
        case 'error':
          errors.push(issue);
          break;
        case 'warning':
          warnings.push(issue);
          break;
        case 'suggestion':
          suggestions.push(issue);
          break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
      suggestionCount: suggestions.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface GraphChange {
  type: 'add_node' | 'update_node' | 'delete_node' | 'add_edge' | 'delete_edge';
  node?: Partial<Node> & { id?: string; kind?: NodeKind };
  edge?: Partial<Edge> & { id?: string; srcId?: string; dstId?: string };
}

/**
 * Validate a proposed change against the current graph
 * Returns issues that would arise if the change were applied
 */
export function validateChange(change: GraphChange, graph: Graph): ValidationResult {
  // Create a simulated graph with the change applied
  const simulatedGraph = simulateChange(change, graph);
  return validateGraph(simulatedGraph);
}

function simulateChange(change: GraphChange, graph: Graph): Graph {
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];

  switch (change.type) {
    case 'add_node':
      if (change.node) {
        const newNode: Node = {
          id: change.node.id ?? crypto.randomUUID(),
          kind: change.node.kind ?? 'capability',
          title: change.node.title ?? '',
          description: change.node.description ?? '',
          sourceRefs: change.node.sourceRefs ?? [],
          createdAt: change.node.createdAt ?? Date.now(),
          updatedAt: change.node.updatedAt ?? Date.now(),
        };
        nodes.push(newNode);
      }
      break;

    case 'update_node':
      if (change.node?.id) {
        const idx = nodes.findIndex((n) => n.id === change.node!.id);
        if (idx !== -1) {
          nodes[idx] = { ...nodes[idx], ...change.node, updatedAt: Date.now() };
        }
      }
      break;

    case 'delete_node':
      if (change.node?.id) {
        const nodeId = change.node.id;
        const nodeIdx = nodes.findIndex((n) => n.id === nodeId);
        if (nodeIdx !== -1) {
          nodes.splice(nodeIdx, 1);
        }
        // Also remove connected edges
        for (let i = edges.length - 1; i >= 0; i--) {
          if (edges[i].srcId === nodeId || edges[i].dstId === nodeId) {
            edges.splice(i, 1);
          }
        }
      }
      break;

    case 'add_edge':
      if (change.edge && change.edge.srcId && change.edge.dstId) {
        const newEdge: Edge = {
          id: change.edge.id ?? crypto.randomUUID(),
          srcId: change.edge.srcId,
          dstId: change.edge.dstId,
          type: change.edge.type ?? 'references',
          label: change.edge.label,
        };
        edges.push(newEdge);
      }
      break;

    case 'delete_edge':
      if (change.edge?.id) {
        const edgeIdx = edges.findIndex((e) => e.id === change.edge!.id);
        if (edgeIdx !== -1) {
          edges.splice(edgeIdx, 1);
        }
      }
      break;
  }

  return { nodes, edges };
}
