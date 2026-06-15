import { defineTool } from '@flue/runtime';
import * as store from './store.js';
import { NODE_KINDS, EDGE_TYPES, type NodeKind, type EdgeType, type Space } from './types.js';
import { validateGraph, validateChange, type GraphChange } from './validation.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProcessInputPayload, ProcessInputResult } from '../workflows/process-input.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nodeKindEnum = Object.keys(NODE_KINDS) as NodeKind[];
const spaceEnum: Space[] = ['basics', 'problem', 'solution', 'crosscutting'];
const edgeTypeEnum = [...EDGE_TYPES] as EdgeType[];

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling Utilities
// ─────────────────────────────────────────────────────────────────────────────

interface ToolError {
  error: true;
  code: string;
  message: string;
  details?: unknown;
}

interface ToolSuccess<T> {
  error?: false;
  data: T;
}

type ToolResult<T> = ToolError | ToolSuccess<T>;

/**
 * Create a structured error response
 */
function toolError(code: string, message: string, details?: unknown): string {
  const error: ToolError = { error: true, code, message };
  if (details !== undefined) {
    error.details = details;
  }
  console.error(`[Tool Error] ${code}: ${message}`, details || '');
  return JSON.stringify(error);
}

/**
 * Wrap a tool execution with error handling
 */
async function safeExecute<T>(
  toolName: string,
  fn: () => T | Promise<T>
): Promise<string> {
  try {
    const result = await fn();
    return JSON.stringify(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = getErrorCode(err);
    console.error(`[${toolName}] Execution failed:`, err);
    return toolError(code, message, {
      toolName,
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}

/**
 * Map errors to standardized error codes
 */
function getErrorCode(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    // Database errors
    if (msg.includes('sqlite') || msg.includes('database')) {
      return 'DATABASE_ERROR';
    }
    if (msg.includes('constraint') || msg.includes('unique')) {
      return 'CONSTRAINT_VIOLATION';
    }
    if (msg.includes('not found')) {
      return 'NOT_FOUND';
    }

    // Validation errors
    if (msg.includes('invalid') || msg.includes('validation')) {
      return 'VALIDATION_ERROR';
    }
    if (msg.includes('required')) {
      return 'MISSING_REQUIRED_FIELD';
    }

    // Network errors
    if (msg.includes('fetch') || msg.includes('network')) {
      return 'NETWORK_ERROR';
    }
    if (msg.includes('timeout')) {
      return 'TIMEOUT_ERROR';
    }
  }

  return 'INTERNAL_ERROR';
}

/**
 * Validate required fields before executing
 */
function validateRequired(args: Record<string, unknown>, required: string[]): string | null {
  for (const field of required) {
    if (args[field] === undefined || args[field] === null || args[field] === '') {
      return toolError('MISSING_REQUIRED_FIELD', `Missing required field: ${field}`, { field });
    }
  }
  return null;
}

// Helper to format dates for display
function formatDate(ts: number): string {
  return new Date(ts).toISOString();
}

let schemaInitialized = false;
function ensureSchema() {
  if (!schemaInitialized) {
    store.initSchema();
    schemaInitialized = true;
  }
}

// Load bootstrap graph from fixture file
function loadBootstrapGraph(): store.BootstrapResult {
  try {
    const fixturePath = resolve(__dirname, '../../fixtures/bropilot-bootstrap.json');
    const data = readFileSync(fixturePath, 'utf-8');
    const bootstrapData = JSON.parse(data) as store.BootstrapGraph;
    return store.loadBootstrapGraph(bootstrapData);
  } catch (err) {
    return {
      success: false,
      nodeCount: 0,
      edgeCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const graphTools = [
  defineTool({
    name: 'get_graph',
    description: 'Get the entire knowledge graph (all nodes and edges)',
    parameters: {},
    execute: async () => {
      return safeExecute('get_graph', () => {
        ensureSchema();
        return store.getGraph();
      });
    },
  }),

  defineTool({
    name: 'add_node',
    description: 'Add a new node to the knowledge graph. Always include sourceExcerpt with the exact user words that led to this node.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: nodeKindEnum, description: 'The type of node' },
        title: { type: 'string', description: 'Short title for the node (2-5 words)' },
        description: { type: 'string', description: 'Detailed description' },
        sourceExcerpt: { type: 'string', description: 'The exact quote from user input that led to this node' },
      },
      required: ['kind', 'title', 'description', 'sourceExcerpt'],
    },
    execute: async (args: Record<string, unknown>) => {
      // Validate required fields
      const validationError = validateRequired(args, ['kind', 'title', 'description', 'sourceExcerpt']);
      if (validationError) return validationError;

      return safeExecute('add_node', () => {
        ensureSchema();
        const { kind, title, description, sourceExcerpt } = args as { kind: NodeKind; title: string; description: string; sourceExcerpt: string };

        // Validate kind is valid
        if (!nodeKindEnum.includes(kind)) {
          throw new Error(`Invalid node kind: ${kind}. Must be one of: ${nodeKindEnum.join(', ')}`);
        }

        const sourceRefs = [{ turnId: 'current', excerpt: sourceExcerpt }];
        return store.addNode(kind, title, description, sourceRefs);
      });
    },
  }),

  defineTool({
    name: 'update_node',
    description: 'Update an existing node',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The node ID' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        addSourceExcerpt: { type: 'string', description: 'Additional quote from user input to add as source reference' },
      },
      required: ['id', 'title', 'description'],
    },
    execute: async (args: Record<string, unknown>) => {
      const validationError = validateRequired(args, ['id', 'title', 'description']);
      if (validationError) return validationError;

      return safeExecute('update_node', () => {
        ensureSchema();
        const { id, title, description, addSourceExcerpt } = args as { id: string; title: string; description: string; addSourceExcerpt?: string };

        const existing = store.getNode(id);
        if (!existing) {
          throw new Error(`Node not found: ${id}`);
        }

        let sourceRefs = existing.sourceRefs;
        if (addSourceExcerpt) {
          sourceRefs = [...existing.sourceRefs, { turnId: 'current', excerpt: addSourceExcerpt }];
        }

        const result = store.updateNode(id, title, description, sourceRefs);
        if (!result) {
          throw new Error(`Failed to update node: ${id}`);
        }
        return result;
      });
    },
  }),

  defineTool({
    name: 'delete_node',
    description: 'Delete a node and its connected edges',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The node ID to delete' },
      },
      required: ['id'],
    },
    execute: async (args: Record<string, unknown>) => {
      const validationError = validateRequired(args, ['id']);
      if (validationError) return validationError;

      return safeExecute('delete_node', () => {
        ensureSchema();
        const { id } = args as { id: string };

        // Check if node exists first
        const existing = store.getNode(id);
        if (!existing) {
          throw new Error(`Node not found: ${id}`);
        }

        const deleted = store.deleteNode(id);
        return { deleted, nodeId: id };
      });
    },
  }),

  defineTool({
    name: 'add_edge',
    description: 'Add an edge connecting two nodes',
    parameters: {
      type: 'object',
      properties: {
        srcId: { type: 'string', description: 'Source node ID' },
        dstId: { type: 'string', description: 'Destination node ID' },
        type: { type: 'string', enum: edgeTypeEnum, description: 'Relationship type' },
        label: { type: 'string', description: 'Optional label for the edge' },
      },
      required: ['srcId', 'dstId', 'type'],
    },
    execute: async (args: Record<string, unknown>) => {
      const validationError = validateRequired(args, ['srcId', 'dstId', 'type']);
      if (validationError) return validationError;

      return safeExecute('add_edge', () => {
        ensureSchema();
        const { srcId, dstId, type, label } = args as { srcId: string; dstId: string; type: EdgeType; label?: string };

        // Validate edge type
        if (!edgeTypeEnum.includes(type)) {
          throw new Error(`Invalid edge type: ${type}. Must be one of: ${edgeTypeEnum.join(', ')}`);
        }

        // Validate source node exists
        if (!store.getNode(srcId)) {
          throw new Error(`Source node not found: ${srcId}`);
        }

        // Validate destination node exists
        if (!store.getNode(dstId)) {
          throw new Error(`Destination node not found: ${dstId}`);
        }

        // Prevent self-referencing edges
        if (srcId === dstId) {
          throw new Error('Cannot create edge from a node to itself');
        }

        return store.addEdge(srcId, dstId, type, label);
      });
    },
  }),

  defineTool({
    name: 'delete_edge',
    description: 'Delete an edge',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The edge ID to delete' },
      },
      required: ['id'],
    },
    execute: async (args: Record<string, unknown>) => {
      const validationError = validateRequired(args, ['id']);
      if (validationError) return validationError;

      return safeExecute('delete_edge', () => {
        ensureSchema();
        const { id } = args as { id: string };

        // Check if edge exists
        const existing = store.getEdge(id);
        if (!existing) {
          throw new Error(`Edge not found: ${id}`);
        }

        const deleted = store.deleteEdge(id);
        return { deleted, edgeId: id };
      });
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Snapshot tools
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'create_snapshot',
    description: 'Save a named snapshot of the current graph state. Snapshots can be restored later or used for comparison.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Unique name for the snapshot (e.g., "v1.0", "before-refactor")' },
      },
      required: ['name'],
    },
    execute: async (args: Record<string, unknown>) => {
      ensureSchema();
      const { name } = args as { name: string };
      const snapshot = store.createSnapshot(name);
      const graph = JSON.parse(snapshot.graphJson) as { nodes: unknown[]; edges: unknown[] };
      return JSON.stringify({
        id: snapshot.id,
        name: snapshot.name,
        createdAt: formatDate(snapshot.createdAt),
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      });
    },
  }),

  defineTool({
    name: 'list_snapshots',
    description: 'List all saved snapshots of the knowledge graph',
    parameters: {},
    execute: async () => {
      ensureSchema();
      const snapshots = store.listSnapshots();
      return JSON.stringify(snapshots.map((s) => ({
        id: s.id,
        name: s.name,
        createdAt: formatDate(s.createdAt),
      })));
    },
  }),

  defineTool({
    name: 'restore_snapshot',
    description: 'Restore the graph to a previously saved snapshot state. WARNING: This will replace all current nodes and edges.',
    parameters: {
      type: 'object',
      properties: {
        nameOrId: { type: 'string', description: 'The snapshot name or ID to restore' },
      },
      required: ['nameOrId'],
    },
    execute: async (args: Record<string, unknown>) => {
      ensureSchema();
      const { nameOrId } = args as { nameOrId: string };
      const result = store.restoreSnapshot(nameOrId);
      return JSON.stringify(result);
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Diff tool
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'diff_snapshot',
    description: 'Compare the current graph state with a saved snapshot. Shows added, removed, and changed nodes/edges.',
    parameters: {
      type: 'object',
      properties: {
        nameOrId: { type: 'string', description: 'The snapshot name or ID to compare against' },
      },
      required: ['nameOrId'],
    },
    execute: async (args: Record<string, unknown>) => {
      ensureSchema();
      const { nameOrId } = args as { nameOrId: string };
      const diff = store.diffSnapshot(nameOrId);
      if (!diff) {
        return JSON.stringify({ error: 'Snapshot not found', nameOrId });
      }
      return JSON.stringify({
        summary: {
          nodesAdded: diff.nodes.added.length,
          nodesRemoved: diff.nodes.removed.length,
          nodesChanged: diff.nodes.changed.length,
          edgesAdded: diff.edges.added.length,
          edgesRemoved: diff.edges.removed.length,
        },
        nodes: diff.nodes,
        edges: diff.edges,
      });
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Export tool
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'export_markdown',
    description: 'Export the knowledge graph as structured markdown documentation. Groups content by space (basics, problem, solution, crosscutting) and includes relationships and source references.',
    parameters: {},
    execute: async () => {
      ensureSchema();
      const markdown = store.exportMarkdown();
      return JSON.stringify({ markdown });
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Completeness tool
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'get_completeness',
    description: 'Get a completeness score for the knowledge graph, including per-space scores, missing essentials, and suggestions for what to add next.',
    parameters: {},
    execute: async () => {
      ensureSchema();
      return JSON.stringify(store.getCompletenessScore());
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Suggestions tool
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'get_suggestions',
    description: 'Get contextual suggestions for improving the knowledge graph based on gaps, missing connections, and implicit concepts.',
    parameters: {
      type: 'object',
      properties: {
        selectedNodeId: { type: 'string', description: 'Optional: ID of the currently selected node for context-specific suggestions' },
        recentNodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: IDs of recently added nodes for context',
        },
      },
      required: [],
    },
    execute: async ({ selectedNodeId, recentNodeIds }: { selectedNodeId?: string; recentNodeIds?: string[] }) => {
      ensureSchema();
      return JSON.stringify(store.getSuggestions(selectedNodeId, recentNodeIds));
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Targeted Query Tools (for scalability)
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'search_nodes',
    description: 'Search for nodes matching a text query. More efficient than get_graph when you know what you\'re looking for. Returns compact results with id, kind, title, and relevance score.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for in node titles and descriptions' },
        kinds: {
          type: 'array',
          items: { type: 'string', enum: nodeKindEnum },
          description: 'Optional: Filter to specific node kinds',
        },
        spaces: {
          type: 'array',
          items: { type: 'string', enum: spaceEnum },
          description: 'Optional: Filter to specific spaces (basics, problem, solution, crosscutting)',
        },
        limit: { type: 'number', description: 'Maximum results to return (default: 10)' },
      },
      required: ['query'],
    },
    execute: async (args: Record<string, unknown>) => {
      ensureSchema();
      const { query, kinds, spaces, limit } = args as { query: string; kinds?: NodeKind[]; spaces?: Space[]; limit?: number };
      return JSON.stringify(store.searchNodes(query, { kinds, spaces, limit }));
    },
  }),

  defineTool({
    name: 'get_node_context',
    description: 'Get a node with all its immediate connections (1-hop neighbors). Use this instead of get_graph when updating or analyzing a specific node — gives you the focused view needed without loading the entire graph.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'The ID of the node to get context for' },
      },
      required: ['nodeId'],
    },
    execute: async (args: Record<string, unknown>) => {
      ensureSchema();
      const { nodeId } = args as { nodeId: string };
      const context = store.getNodeContext(nodeId);
      if (!context) {
        return JSON.stringify({ error: 'Node not found', nodeId });
      }
      return JSON.stringify(context);
    },
  }),

  defineTool({
    name: 'find_related_nodes',
    description: 'Find nodes that might be semantically related to a concept, even if not an exact match. Useful for discovering where a new concept should connect in the graph.',
    parameters: {
      type: 'object',
      properties: {
        concept: { type: 'string', description: 'The concept or topic to find related nodes for' },
        limit: { type: 'number', description: 'Maximum results to return (default: 5)' },
      },
      required: ['concept'],
    },
    execute: async (args: Record<string, unknown>) => {
      ensureSchema();
      const { concept, limit } = args as { concept: string; limit?: number };
      return JSON.stringify(store.findRelatedNodes(concept, limit));
    },
  }),

  defineTool({
    name: 'get_graph_summary',
    description: 'Get a high-level overview of the graph: node counts per kind and per space, plus all node titles grouped by space. Use this first to understand graph structure before diving into specific nodes.',
    parameters: {},
    execute: async () => {
      ensureSchema();
      return JSON.stringify(store.getGraphSummary());
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Validation tool
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'validate_graph',
    description: `Check the graph for consistency issues and quality problems.

Returns three categories of issues:
- errors: Block save/commit — must be fixed (duplicate singular nodes, invalid edges, self-references)
- warnings: Should address — graph quality issues (orphan nodes, missing connections, no traceability)
- suggestions: Helpful hints — areas for improvement (empty basics, missing assumptions, imbalanced spaces)

Run validation after major changes and proactively address warnings. Never ignore errors.`,
    parameters: {
      type: 'object',
      properties: {
        change: {
          type: 'object',
          description: 'Optional: validate a proposed change before applying it',
          properties: {
            type: {
              type: 'string',
              enum: ['add_node', 'update_node', 'delete_node', 'add_edge', 'delete_edge'],
              description: 'Type of change to validate',
            },
            node: {
              type: 'object',
              description: 'Node data for node operations',
              properties: {
                id: { type: 'string' },
                kind: { type: 'string', enum: nodeKindEnum },
                title: { type: 'string' },
                description: { type: 'string' },
              },
            },
            edge: {
              type: 'object',
              description: 'Edge data for edge operations',
              properties: {
                id: { type: 'string' },
                srcId: { type: 'string' },
                dstId: { type: 'string' },
                type: { type: 'string', enum: edgeTypeEnum },
              },
            },
          },
          required: ['type'],
        },
      },
      required: [],
    },
    execute: async ({ change }: { change?: GraphChange }) => {
      ensureSchema();
      const graph = store.getGraph();

      if (change) {
        // Validate proposed change
        const result = validateChange(change, graph);
        return JSON.stringify({
          validatingChange: true,
          changeType: change.type,
          ...result,
        });
      }

      // Validate current graph
      const result = validateGraph(graph);
      return JSON.stringify(result);
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Change Tracking / Undo-Redo Tools
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'undo',
    description: 'Undo the most recent graph change. Returns details about what was undone, including the action type and affected node/edge.',
    parameters: {},
    execute: async () => {
      ensureSchema();
      const result = store.undoLastChange();
      if (!result.success) {
        return JSON.stringify({ success: false, error: result.error });
      }
      const change = result.change!;
      return JSON.stringify({
        success: true,
        undone: {
          action: change.action,
          targetId: change.targetId,
          timestamp: formatDate(change.timestamp),
          beforeState: change.beforeState,
          afterState: change.afterState,
        },
      });
    },
  }),

  defineTool({
    name: 'redo',
    description: 'Redo the most recently undone change. Returns details about what was redone.',
    parameters: {},
    execute: async () => {
      ensureSchema();
      const result = store.redoLastUndo();
      if (!result.success) {
        return JSON.stringify({ success: false, error: result.error });
      }
      const change = result.change!;
      return JSON.stringify({
        success: true,
        redone: {
          action: change.action,
          targetId: change.targetId,
          timestamp: formatDate(change.timestamp),
          beforeState: change.beforeState,
          afterState: change.afterState,
        },
      });
    },
  }),

  defineTool({
    name: 'get_change_history',
    description: 'Get a history of recent graph changes. Useful for understanding how the graph evolved and for auditing decisions. Each change includes the action, what was changed, and the before/after states.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of changes to return (default: 50)' },
        turnId: { type: 'string', description: 'Optional: Filter to changes from a specific conversation turn' },
      },
      required: [],
    },
    execute: async ({ limit, turnId }: { limit?: number; turnId?: string }) => {
      ensureSchema();
      let changes: store.Change[];
      if (turnId) {
        changes = store.getChangesForTurn(turnId);
      } else {
        changes = store.getChangeHistory(limit ?? 50);
      }
      return JSON.stringify(
        changes.map((c) => ({
          id: c.id,
          action: c.action,
          targetId: c.targetId,
          timestamp: formatDate(c.timestamp),
          sourceTurn: c.sourceTurn,
          undone: c.undone,
          beforeState: c.beforeState,
          afterState: c.afterState,
        }))
      );
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Bootstrap Demo Tool
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'load_bootstrap',
    description: 'Load the Bropilot bootstrap graph (Bropilot\'s own self-specification) as a demo. This clears the current graph and loads 52 nodes and 58 edges describing Bropilot itself.',
    parameters: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm clearing current graph and loading bootstrap data',
        },
      },
      required: ['confirm'],
    },
    execute: async (args: Record<string, unknown>) => {
      ensureSchema();
      const { confirm } = args as { confirm: boolean };
      if (!confirm) {
        return JSON.stringify({ error: 'Must confirm to load bootstrap data (pass confirm: true)' });
      }
      return JSON.stringify(loadBootstrapGraph());
    },
  }),

  // ─────────────────────────────────────────────────────────────────────────────
  // Complex Input Processing Tool (via workflow)
  // ─────────────────────────────────────────────────────────────────────────────

  defineTool({
    name: 'process_complex_input',
    description: `Process a complex user input through the multi-stage pipeline for reliable graph updates.

Use this tool when:
- The input mentions 3 or more concepts/entities
- You are uncertain about entity resolution (which existing nodes map to mentioned concepts)
- The user is making bulk updates or restructuring part of the graph
- The input involves multiple related operations (add nodes + connect them + update others)

The workflow handles:
1. Intent classification (add, update, delete, clarify, question)
2. Entity resolution (matching mentioned concepts to existing nodes)
3. Change planning (determining what graph operations are needed)
4. Validation (checking for conflicts before execution)
5. Execution (applying changes atomically)

For simple single-node operations (add one node, update one field), use the direct tools instead for faster response.`,
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'The user input to process through the pipeline',
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, validate the plan without executing changes. Useful to preview what would happen.',
        },
      },
      required: ['input'],
    },
    execute: async (args: Record<string, unknown>) => {
      ensureSchema();
      const { input, dryRun } = args as { input: string; dryRun?: boolean };

      // Determine the base URL for the workflow endpoint
      // In local dev, the server runs on port 3583 by default
      const baseUrl = process.env.FLUE_BASE_URL ?? 'http://localhost:3583';

      const payload: ProcessInputPayload = {
        message: input,
        dryRun: dryRun ?? false,
      };

      try {
        // Call the process-input workflow via HTTP
        // Using ?wait=result to get the completed result synchronously
        const response = await fetch(`${baseUrl}/workflows/process-input?wait=result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return JSON.stringify({
            success: false,
            error: `Workflow invocation failed: ${response.status} ${errorText}`,
          });
        }

        const result = (await response.json()) as ProcessInputResult;

        // Format the result for the agent
        return JSON.stringify({
          success: result.success,
          dryRun: dryRun ?? false,
          stages: {
            intent: result.stages.classification.intent,
            intentConfidence: result.stages.classification.confidence,
            entitiesFound: result.stages.classification.entities,
            newEntities: result.stages.resolution.newEntities,
            matchedNodes: result.stages.resolution.existingMatches.map((m) => ({
              entity: m.entity,
              matchedTitle: m.matchedNode.title,
              matchedKind: m.matchedNode.kind,
              confidence: m.confidence,
            })),
            plannedChanges: result.stages.planning.changes.length,
            planSummary: result.stages.planning.summary,
            validationPassed: result.stages.validation.valid,
            validationWarnings: result.stages.validation.warnings.map((w) => w.message),
            validationErrors: result.stages.validation.errors.map((e) => e.message),
          },
          execution: result.stages.execution
            ? {
                appliedChanges: result.stages.execution.appliedChanges,
                createdNodes: result.stages.execution.createdNodeIds.length,
                createdEdges: result.stages.execution.createdEdgeIds.length,
                summary: result.stages.execution.summary,
              }
            : undefined,
          response: result.response, // For questions/clarifications
          error: result.error,
        });
      } catch (error) {
        return JSON.stringify({
          success: false,
          error: `Failed to invoke workflow: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
  }),
];
