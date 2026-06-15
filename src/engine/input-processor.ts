/**
 * Input processing helpers for the multi-stage graph update workflow.
 *
 * These functions are called by the process-input workflow to handle
 * complex user inputs through structured stages.
 */

import type { Node, Edge, NodeKind, EdgeType } from '../genome/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Stage 1: Intent Classification
// ─────────────────────────────────────────────────────────────────────────────

export type Intent = 'add' | 'update' | 'clarify' | 'refine' | 'delete' | 'question';

export interface IntentResult {
  intent: Intent;
  entities: string[];
  confidence: number;
  reasoning?: string;
}

export interface GraphSummary {
  nodeCount: number;
  edgeCount: number;
  nodesByKind: Record<string, number>;
  nodesBySpace: Record<string, number>;
  recentNodes: Array<{ id: string; kind: string; title: string }>;
  orphanCount: number;
}

/**
 * Build a summary of the current graph state for intent classification.
 * This gives the classifier context about what exists without sending the full graph.
 */
export function buildGraphSummary(nodes: Node[], edges: Edge[]): GraphSummary {
  const nodesByKind: Record<string, number> = {};
  const nodesBySpace: Record<string, number> = {};

  // Import NODE_KINDS inline to avoid circular deps
  const spaceMap: Record<string, string> = {
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

  for (const node of nodes) {
    nodesByKind[node.kind] = (nodesByKind[node.kind] ?? 0) + 1;
    const space = spaceMap[node.kind] ?? 'crosscutting';
    nodesBySpace[space] = (nodesBySpace[space] ?? 0) + 1;
  }

  // Find orphan nodes (no edges)
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.srcId);
    connectedIds.add(edge.dstId);
  }
  const orphanCount = nodes.filter(
    (n) => !connectedIds.has(n.id) && n.kind !== 'name' && n.kind !== 'purpose'
  ).length;

  // Recent nodes (last 5 by updatedAt)
  const recentNodes = [...nodes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map((n) => ({ id: n.id, kind: n.kind, title: n.title }));

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodesByKind,
    nodesBySpace,
    recentNodes,
    orphanCount,
  };
}

/**
 * Heuristic intent classification based on message patterns.
 * Used as a fallback or pre-filter before LLM classification.
 */
export function classifyIntentHeuristic(message: string, graphSummary: GraphSummary): IntentResult {
  const lower = message.toLowerCase().trim();
  const entities: string[] = [];

  // Extract quoted strings as potential entities
  const quotedMatches = message.match(/"([^"]+)"/g) ?? [];
  entities.push(...quotedMatches.map((q) => q.replace(/"/g, '')));

  // Question patterns
  const questionPatterns = [
    /^(what|why|how|when|where|who|which|can|should|would|could|is|are|do|does|will)\b/i,
    /\?$/,
  ];
  if (questionPatterns.some((p) => p.test(lower))) {
    return { intent: 'question', entities, confidence: 0.7 };
  }

  // Delete patterns
  const deletePatterns = [
    /\b(delete|remove|drop|eliminate|get rid of)\b/i,
    /\bdon't (need|want)\b/i,
  ];
  if (deletePatterns.some((p) => p.test(lower))) {
    return { intent: 'delete', entities, confidence: 0.8 };
  }

  // Update/refine patterns (references to existing things)
  const updatePatterns = [
    /\b(change|modify|update|edit|fix|correct|adjust)\b/i,
    /\bshould (be|have|include)\b/i,
    /\bactually\b/i,
  ];
  if (updatePatterns.some((p) => p.test(lower))) {
    return { intent: 'update', entities, confidence: 0.7 };
  }

  // Clarify patterns
  const clarifyPatterns = [
    /\b(mean|meant|meant by|specifically|clarify|explain|elaborate)\b/i,
    /\bwhat (about|if)\b/i,
  ];
  if (clarifyPatterns.some((p) => p.test(lower))) {
    return { intent: 'clarify', entities, confidence: 0.65 };
  }

  // Refine patterns (adding detail to existing)
  const refinePatterns = [
    /\b(also|and|plus|additionally|furthermore|another thing)\b/i,
    /\bmore (detail|info|information|specifics)\b/i,
  ];
  if (refinePatterns.some((p) => p.test(lower))) {
    return { intent: 'refine', entities, confidence: 0.6 };
  }

  // Default to add (new information)
  return { intent: 'add', entities, confidence: 0.5 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 2: Entity Resolution
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityMatch {
  entity: string;
  matchedNode: Node;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'semantic';
}

export interface ResolvedEntities {
  newEntities: string[];
  existingMatches: EntityMatch[];
}

/**
 * Search for nodes matching a query string.
 * Checks title, description, and kind.
 */
export function searchNodes(
  query: string,
  nodes: Node[],
  options: { limit?: number; kindFilter?: NodeKind } = {}
): Array<{ node: Node; score: number }> {
  const { limit = 10, kindFilter } = options;
  const lower = query.toLowerCase();
  const results: Array<{ node: Node; score: number }> = [];

  for (const node of nodes) {
    if (kindFilter && node.kind !== kindFilter) continue;

    let score = 0;

    // Exact title match
    if (node.title.toLowerCase() === lower) {
      score = 1.0;
    }
    // Title contains query
    else if (node.title.toLowerCase().includes(lower)) {
      score = 0.8;
    }
    // Description contains query
    else if (node.description.toLowerCase().includes(lower)) {
      score = 0.5;
    }
    // Kind matches query
    else if (node.kind.toLowerCase().includes(lower)) {
      score = 0.3;
    }

    if (score > 0) {
      results.push({ node, score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Resolve entity strings to existing nodes or mark as new.
 */
export function resolveEntities(entities: string[], nodes: Node[]): ResolvedEntities {
  const newEntities: string[] = [];
  const existingMatches: EntityMatch[] = [];

  for (const entity of entities) {
    const matches = searchNodes(entity, nodes, { limit: 3 });

    if (matches.length > 0 && matches[0].score >= 0.7) {
      // High-confidence match
      existingMatches.push({
        entity,
        matchedNode: matches[0].node,
        confidence: matches[0].score,
        matchType: matches[0].score === 1.0 ? 'exact' : 'fuzzy',
      });
    } else if (matches.length > 0 && matches[0].score >= 0.4) {
      // Possible match, lower confidence
      existingMatches.push({
        entity,
        matchedNode: matches[0].node,
        confidence: matches[0].score,
        matchType: 'fuzzy',
      });
    } else {
      // No good match, treat as new
      newEntities.push(entity);
    }
  }

  return { newEntities, existingMatches };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 3: Change Planning
// ─────────────────────────────────────────────────────────────────────────────

export type ChangeAction = 'add_node' | 'update_node' | 'add_edge' | 'delete_node' | 'delete_edge';

export interface PlannedChange {
  action: ChangeAction;
  params: Record<string, unknown>;
  reason: string;
  dependsOn?: string; // ID of another change this depends on
}

export interface ChangePlan {
  changes: PlannedChange[];
  summary: string;
}

export interface PlanContext {
  intent: Intent;
  resolvedEntities: ResolvedEntities;
  relevantNodes: Node[];
  message: string;
}

/**
 * Generate a change plan based on intent and resolved entities.
 * This is a heuristic planner; the workflow can use LLM for complex cases.
 */
export function planChanges(context: PlanContext): ChangePlan {
  const { intent, resolvedEntities, relevantNodes, message } = context;
  const changes: PlannedChange[] = [];

  switch (intent) {
    case 'add': {
      // For new entities, suggest add_node
      for (const entity of resolvedEntities.newEntities) {
        changes.push({
          action: 'add_node',
          params: {
            title: entity,
            // Kind will be determined by LLM in the workflow
            description: `[To be filled based on context from: "${message}"]`,
            sourceExcerpt: extractExcerpt(message, entity),
          },
          reason: `New concept "${entity}" mentioned in user input`,
        });
      }

      // For matched entities that might need edges
      for (const match of resolvedEntities.existingMatches) {
        if (match.confidence < 0.9) {
          // Might be a refinement, not a connection
          changes.push({
            action: 'update_node',
            params: {
              id: match.matchedNode.id,
              addSourceExcerpt: extractExcerpt(message, match.entity),
            },
            reason: `Adding source reference for "${match.entity}"`,
          });
        }
      }
      break;
    }

    case 'update': {
      for (const match of resolvedEntities.existingMatches) {
        changes.push({
          action: 'update_node',
          params: {
            id: match.matchedNode.id,
            // Title and description will be determined by LLM
          },
          reason: `Updating "${match.matchedNode.title}" based on user input`,
        });
      }
      break;
    }

    case 'delete': {
      for (const match of resolvedEntities.existingMatches) {
        if (match.confidence >= 0.8) {
          changes.push({
            action: 'delete_node',
            params: { id: match.matchedNode.id },
            reason: `User requested deletion of "${match.matchedNode.title}"`,
          });
        }
      }
      break;
    }

    case 'refine': {
      // Refine adds detail to existing nodes
      for (const match of resolvedEntities.existingMatches) {
        changes.push({
          action: 'update_node',
          params: {
            id: match.matchedNode.id,
            addSourceExcerpt: extractExcerpt(message, match.entity),
          },
          reason: `Refining "${match.matchedNode.title}" with additional details`,
        });
      }
      break;
    }

    case 'clarify':
    case 'question': {
      // Questions and clarifications don't generate changes directly
      // The workflow should handle these by responding to the user
      break;
    }
  }

  const summary =
    changes.length > 0
      ? `${changes.length} change(s) planned: ${changes.map((c) => c.action).join(', ')}`
      : 'No changes planned (question/clarification detected)';

  return { changes, summary };
}

/**
 * Extract a relevant excerpt from the message for source references.
 */
function extractExcerpt(message: string, entity: string): string {
  // Try to find a sentence containing the entity
  const sentences = message.split(/[.!?]+/).filter((s) => s.trim());
  const relevant = sentences.find((s) => s.toLowerCase().includes(entity.toLowerCase()));
  if (relevant) {
    return relevant.trim();
  }
  // Fall back to first 100 chars
  return message.slice(0, 100).trim() + (message.length > 100 ? '...' : '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4: Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  changeIndex?: number;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationIssue[];
  errors: ValidationIssue[];
}

/**
 * Validate a change plan for conflicts and completeness.
 */
export function validateChanges(
  plan: ChangePlan,
  nodes: Node[],
  edges: Edge[]
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const nodeTitles = new Set(nodes.map((n) => n.title.toLowerCase()));

  // Track deletions for dependency checking
  const pendingDeletions = new Set<string>();

  for (let i = 0; i < plan.changes.length; i++) {
    const change = plan.changes[i];

    switch (change.action) {
      case 'add_node': {
        const title = change.params.title as string | undefined;
        if (!title) {
          errors.push({
            level: 'error',
            code: 'MISSING_TITLE',
            message: 'add_node requires a title',
            changeIndex: i,
          });
        } else if (nodeTitles.has(title.toLowerCase())) {
          warnings.push({
            level: 'warning',
            code: 'DUPLICATE_TITLE',
            message: `A node with title "${title}" already exists`,
            changeIndex: i,
          });
        }
        break;
      }

      case 'update_node': {
        const id = change.params.id as string | undefined;
        if (!id) {
          errors.push({
            level: 'error',
            code: 'MISSING_ID',
            message: 'update_node requires an id',
            changeIndex: i,
          });
        } else if (!nodeMap.has(id)) {
          errors.push({
            level: 'error',
            code: 'NODE_NOT_FOUND',
            message: `Node with id "${id}" does not exist`,
            changeIndex: i,
          });
        } else if (pendingDeletions.has(id)) {
          errors.push({
            level: 'error',
            code: 'UPDATE_DELETED_NODE',
            message: `Cannot update node "${id}" that is scheduled for deletion`,
            changeIndex: i,
          });
        }
        break;
      }

      case 'delete_node': {
        const id = change.params.id as string | undefined;
        if (!id) {
          errors.push({
            level: 'error',
            code: 'MISSING_ID',
            message: 'delete_node requires an id',
            changeIndex: i,
          });
        } else if (!nodeMap.has(id)) {
          errors.push({
            level: 'error',
            code: 'NODE_NOT_FOUND',
            message: `Node with id "${id}" does not exist`,
            changeIndex: i,
          });
        } else {
          pendingDeletions.add(id);
          // Check for orphaned edges
          const connectedEdges = edges.filter((e) => e.srcId === id || e.dstId === id);
          if (connectedEdges.length > 0) {
            warnings.push({
              level: 'warning',
              code: 'ORPHAN_EDGES',
              message: `Deleting node "${id}" will remove ${connectedEdges.length} edge(s)`,
              changeIndex: i,
            });
          }
        }
        break;
      }

      case 'add_edge': {
        const srcId = change.params.srcId as string | undefined;
        const dstId = change.params.dstId as string | undefined;
        if (!srcId || !dstId) {
          errors.push({
            level: 'error',
            code: 'MISSING_EDGE_IDS',
            message: 'add_edge requires srcId and dstId',
            changeIndex: i,
          });
        } else {
          if (!nodeMap.has(srcId) && !plan.changes.some((c) => c.action === 'add_node' && c.params.id === srcId)) {
            errors.push({
              level: 'error',
              code: 'SRC_NODE_NOT_FOUND',
              message: `Source node "${srcId}" does not exist`,
              changeIndex: i,
            });
          }
          if (!nodeMap.has(dstId) && !plan.changes.some((c) => c.action === 'add_node' && c.params.id === dstId)) {
            errors.push({
              level: 'error',
              code: 'DST_NODE_NOT_FOUND',
              message: `Destination node "${dstId}" does not exist`,
              changeIndex: i,
            });
          }
          // Check for circular dependency (self-loop)
          if (srcId === dstId) {
            warnings.push({
              level: 'warning',
              code: 'SELF_LOOP',
              message: `Edge creates a self-loop on node "${srcId}"`,
              changeIndex: i,
            });
          }
        }
        break;
      }

      case 'delete_edge': {
        const id = change.params.id as string | undefined;
        if (!id) {
          errors.push({
            level: 'error',
            code: 'MISSING_ID',
            message: 'delete_edge requires an id',
            changeIndex: i,
          });
        } else if (!edges.some((e) => e.id === id)) {
          errors.push({
            level: 'error',
            code: 'EDGE_NOT_FOUND',
            message: `Edge with id "${id}" does not exist`,
            changeIndex: i,
          });
        }
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage 5: Execution Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutionResult {
  success: boolean;
  appliedChanges: number;
  createdNodeIds: string[];
  createdEdgeIds: string[];
  errors: string[];
  summary: string;
}

/**
 * Build an execution summary from the applied changes.
 */
export function buildExecutionSummary(
  plan: ChangePlan,
  createdNodeIds: string[],
  createdEdgeIds: string[],
  errors: string[]
): ExecutionResult {
  const appliedChanges = plan.changes.length - errors.length;

  const parts: string[] = [];
  if (createdNodeIds.length > 0) {
    parts.push(`${createdNodeIds.length} node(s) created`);
  }
  if (createdEdgeIds.length > 0) {
    parts.push(`${createdEdgeIds.length} edge(s) created`);
  }
  const updatedCount = plan.changes.filter((c) => c.action === 'update_node').length;
  if (updatedCount > 0) {
    parts.push(`${updatedCount} node(s) updated`);
  }
  const deletedCount = plan.changes.filter((c) => c.action === 'delete_node' || c.action === 'delete_edge').length;
  if (deletedCount > 0) {
    parts.push(`${deletedCount} item(s) deleted`);
  }
  if (errors.length > 0) {
    parts.push(`${errors.length} error(s)`);
  }

  return {
    success: errors.length === 0,
    appliedChanges,
    createdNodeIds,
    createdEdgeIds,
    errors,
    summary: parts.length > 0 ? parts.join(', ') : 'No changes applied',
  };
}
