/**
 * Multi-stage workflow for processing user inputs into graph updates.
 *
 * This workflow breaks down complex graph updates into structured stages:
 * 1. Intent Classification - determine what the user wants to do
 * 2. Entity Resolution - match entities to existing nodes
 * 3. Change Planning - create a plan of graph operations
 * 4. Validation - check for conflicts and completeness
 * 5. Execution - apply changes atomically
 *
 * The workflow can be called from the explorer agent for complex inputs,
 * while simple inputs continue to use direct tools.
 */

import { createAgent, type FlueContext } from '@flue/runtime';
import * as v from 'valibot';
import * as store from '../genome/store.js';
import { NODE_KINDS, type NodeKind, type EdgeType } from '../genome/types.js';
import {
  buildGraphSummary,
  classifyIntentHeuristic,
  resolveEntities,
  planChanges,
  validateChanges,
  buildExecutionSummary,
  searchNodes,
  type IntentResult,
  type ResolvedEntities,
  type ChangePlan,
  type ValidationResult,
  type ExecutionResult,
  type PlannedChange,
} from '../engine/input-processor.js';

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Payload
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessInputPayload {
  message: string;
  turnId?: string;
  // Optional: skip stages for simple inputs
  skipClassification?: boolean;
  // Optional: force a specific intent
  forceIntent?: IntentResult['intent'];
  // Optional: dry run (validate but don't execute)
  dryRun?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Result
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessInputResult {
  stages: {
    classification: IntentResult;
    resolution: ResolvedEntities;
    planning: ChangePlan;
    validation: ValidationResult;
    execution?: ExecutionResult;
  };
  response?: string; // For questions/clarifications, a response to the user
  success: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent for LLM-based stages
// ─────────────────────────────────────────────────────────────────────────────

const nodeKindEnum = Object.keys(NODE_KINDS) as NodeKind[];

const classifier = createAgent(() => ({
  model: 'openrouter/anthropic/claude-haiku-4-5',
  instructions: `You are an intent classifier for a knowledge graph editor. Given a user message and graph summary, determine:
1. The user's intent (add, update, clarify, refine, delete, or question)
2. Key entities mentioned that might correspond to nodes
3. Your confidence (0-1)

Be precise about entity extraction - look for nouns, proper names, and quoted strings that could be node titles.`,
}));

const planner = createAgent(() => ({
  model: 'openrouter/anthropic/claude-sonnet-4-6',
  instructions: `You are a change planner for a knowledge graph. Given intent, resolved entities, and context, produce a list of atomic graph changes.

Available actions:
- add_node: Create a new node (requires kind, title, description, sourceExcerpt)
- update_node: Update an existing node (requires id, optionally title, description, addSourceExcerpt)
- add_edge: Connect two nodes (requires srcId, dstId, type, optionally label)
- delete_node: Remove a node and its edges (requires id)
- delete_edge: Remove an edge (requires id)

Node kinds: ${nodeKindEnum.join(', ')}
Edge types: has, uses, triggers, implements, depends_on, extends, contains, references

Be conservative - only plan changes that are clearly supported by the user's input.
Always include a reason explaining why each change is needed.`,
}));

const responder = createAgent(() => ({
  model: 'openrouter/anthropic/claude-haiku-4-5',
  instructions: `You are a helpful assistant for a knowledge graph editor. When the user asks a question or seeks clarification, provide a concise, helpful response.`,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Structured Output Schemas
// ─────────────────────────────────────────────────────────────────────────────

const IntentSchema = v.object({
  intent: v.picklist(['add', 'update', 'clarify', 'refine', 'delete', 'question']),
  entities: v.array(v.string()),
  confidence: v.number(),
  reasoning: v.optional(v.string()),
});

const PlannedChangeSchema = v.object({
  action: v.picklist(['add_node', 'update_node', 'add_edge', 'delete_node', 'delete_edge']),
  params: v.record(v.string(), v.unknown()),
  reason: v.string(),
});

const ChangePlanSchema = v.object({
  changes: v.array(PlannedChangeSchema),
  summary: v.string(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Workflow Implementation
// ─────────────────────────────────────────────────────────────────────────────

let schemaInitialized = false;
function ensureSchema() {
  if (!schemaInitialized) {
    store.initSchema();
    schemaInitialized = true;
  }
}

export async function run({ init, payload }: FlueContext<ProcessInputPayload>): Promise<ProcessInputResult> {
  const { message, turnId, skipClassification, forceIntent, dryRun } = payload;

  ensureSchema();

  // Get current graph state
  const graph = store.getGraph();
  const graphSummary = buildGraphSummary(graph.nodes, graph.edges);

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 1: Intent Classification
  // ─────────────────────────────────────────────────────────────────────────
  let classification: IntentResult;

  if (forceIntent) {
    // Use forced intent (for testing or when caller knows the intent)
    classification = {
      intent: forceIntent,
      entities: [],
      confidence: 1.0,
    };
  } else if (skipClassification) {
    // Use heuristic classification only
    classification = classifyIntentHeuristic(message, graphSummary);
  } else {
    // Use LLM for classification
    const heuristic = classifyIntentHeuristic(message, graphSummary);

    // If heuristic is confident, use it; otherwise call LLM
    if (heuristic.confidence >= 0.8) {
      classification = heuristic;
    } else {
      try {
        const harness = await init(classifier);
        const session = await harness.session();
        const response = await session.prompt(
          `User message: "${message}"

Graph summary:
- ${graphSummary.nodeCount} nodes, ${graphSummary.edgeCount} edges
- Recent nodes: ${graphSummary.recentNodes.map((n) => `"${n.title}" (${n.kind})`).join(', ') || 'none'}
- Nodes by space: ${Object.entries(graphSummary.nodesBySpace).map(([s, c]) => `${s}: ${c}`).join(', ') || 'none'}

Classify the intent and extract entities.`,
          { result: IntentSchema }
        );
        classification = response.data;
      } catch (error) {
        // Fall back to heuristic on error
        classification = heuristic;
        classification.reasoning = `LLM classification failed, using heuristic: ${error}`;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 2: Entity Resolution
  // ─────────────────────────────────────────────────────────────────────────
  let resolution: ResolvedEntities;

  // Extract more entities from message if classification found few
  const entities = [...classification.entities];

  // Add quoted strings
  const quotedMatches = message.match(/"([^"]+)"/g) ?? [];
  for (const quoted of quotedMatches) {
    const clean = quoted.replace(/"/g, '');
    if (!entities.includes(clean)) {
      entities.push(clean);
    }
  }

  // Add capitalized multi-word phrases (potential proper nouns/titles)
  const capitalizedMatches = message.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g) ?? [];
  for (const cap of capitalizedMatches) {
    if (!entities.includes(cap)) {
      entities.push(cap);
    }
  }

  resolution = resolveEntities(entities, graph.nodes);

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 3: Change Planning
  // ─────────────────────────────────────────────────────────────────────────
  let planning: ChangePlan;

  // For questions and clarifications, don't plan changes
  if (classification.intent === 'question' || classification.intent === 'clarify') {
    planning = { changes: [], summary: 'No changes needed - responding to question/clarification' };
  } else if (resolution.newEntities.length === 0 && resolution.existingMatches.length === 0) {
    // No entities identified, need LLM to plan
    try {
      const harness = await init(planner);
      const session = await harness.session();
      const response = await session.prompt(
        `User message: "${message}"
Intent: ${classification.intent}
Confidence: ${classification.confidence}

No specific entities were identified. Analyze the message and plan appropriate graph changes.

Current graph has ${graphSummary.nodeCount} nodes across spaces: ${Object.entries(graphSummary.nodesBySpace).map(([s, c]) => `${s}: ${c}`).join(', ') || 'none'}`,
        { result: ChangePlanSchema }
      );
      planning = response.data;
    } catch (error) {
      planning = {
        changes: [],
        summary: `Failed to generate plan: ${error}`,
      };
    }
  } else {
    // Use heuristic planning, then enhance with LLM if needed
    const relevantNodes = [
      ...resolution.existingMatches.map((m) => m.matchedNode),
    ];
    planning = planChanges({
      intent: classification.intent,
      resolvedEntities: resolution,
      relevantNodes,
      message,
    });

    // If we have new entities but no kind assigned, use LLM to determine kinds
    const addNodeChanges = planning.changes.filter((c) => c.action === 'add_node' && !c.params.kind);
    if (addNodeChanges.length > 0) {
      try {
        const harness = await init(planner);
        const session = await harness.session();
        const response = await session.prompt(
          `User message: "${message}"
Intent: ${classification.intent}

I need to determine the appropriate node kinds for these new entities:
${addNodeChanges.map((c) => `- "${c.params.title}"`).join('\n')}

Available node kinds and their spaces:
${Object.entries(NODE_KINDS).map(([kind, meta]) => `- ${kind} (${meta.space})`).join('\n')}

Update the change plan with correct kinds and improved descriptions.`,
          { result: ChangePlanSchema }
        );
        // Merge LLM results
        planning = response.data;
      } catch (error) {
        // Keep heuristic plan, log error in summary
        planning.summary += ` (LLM enhancement failed: ${error})`;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 4: Validation
  // ─────────────────────────────────────────────────────────────────────────
  const validation = validateChanges(planning, graph.nodes, graph.edges);

  // ─────────────────────────────────────────────────────────────────────────
  // Handle questions/clarifications
  // ─────────────────────────────────────────────────────────────────────────
  let response: string | undefined;

  if (classification.intent === 'question' || classification.intent === 'clarify') {
    try {
      const harness = await init(responder);
      const session = await harness.session();

      // Build context from matched nodes
      const contextParts: string[] = [];
      for (const match of resolution.existingMatches) {
        const node = match.matchedNode;
        contextParts.push(`${node.kind}: "${node.title}" - ${node.description}`);
      }

      const prompt = contextParts.length > 0
        ? `User question: "${message}"

Relevant nodes in the graph:
${contextParts.join('\n')}

Answer the question based on the graph context.`
        : `User question: "${message}"

The graph currently has ${graphSummary.nodeCount} nodes. Answer the question and suggest what information might be needed.`;

      const result = await session.prompt(prompt);
      response = result.text;
    } catch (error) {
      response = `I couldn't process your question: ${error}`;
    }

    return {
      stages: {
        classification,
        resolution,
        planning,
        validation,
      },
      response,
      success: true,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stage 5: Execution (skip if dry run or validation failed)
  // ─────────────────────────────────────────────────────────────────────────
  let execution: ExecutionResult | undefined;

  if (dryRun) {
    return {
      stages: {
        classification,
        resolution,
        planning,
        validation,
      },
      success: validation.valid,
    };
  }

  if (!validation.valid) {
    return {
      stages: {
        classification,
        resolution,
        planning,
        validation,
      },
      success: false,
      error: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
    };
  }

  // Execute changes
  const createdNodeIds: string[] = [];
  const createdEdgeIds: string[] = [];
  const errors: string[] = [];

  // Map from placeholder IDs to real IDs (for edges referencing new nodes)
  const idMap = new Map<string, string>();

  for (const change of planning.changes) {
    try {
      switch (change.action) {
        case 'add_node': {
          const kind = change.params.kind as NodeKind;
          const title = change.params.title as string;
          const description = change.params.description as string;
          const sourceExcerpt = change.params.sourceExcerpt as string;

          if (!kind || !title) {
            errors.push(`add_node missing required params: kind=${kind}, title=${title}`);
            continue;
          }

          const sourceRefs = sourceExcerpt ? [{ turnId: turnId ?? 'workflow', excerpt: sourceExcerpt }] : [];
          const node = store.addNode(kind, title, description || '', sourceRefs);
          createdNodeIds.push(node.id);

          // Track ID for edge creation
          if (change.params.tempId) {
            idMap.set(change.params.tempId as string, node.id);
          }
          break;
        }

        case 'update_node': {
          const id = change.params.id as string;
          const node = store.getNode(id);
          if (!node) {
            errors.push(`update_node: node ${id} not found`);
            continue;
          }

          const title = (change.params.title as string) ?? node.title;
          const description = (change.params.description as string) ?? node.description;
          let sourceRefs = node.sourceRefs;

          if (change.params.addSourceExcerpt) {
            sourceRefs = [
              ...node.sourceRefs,
              { turnId: turnId ?? 'workflow', excerpt: change.params.addSourceExcerpt as string },
            ];
          }

          store.updateNode(id, title, description, sourceRefs);
          break;
        }

        case 'add_edge': {
          let srcId = change.params.srcId as string;
          let dstId = change.params.dstId as string;
          const type = change.params.type as EdgeType;

          // Resolve temp IDs
          if (idMap.has(srcId)) srcId = idMap.get(srcId)!;
          if (idMap.has(dstId)) dstId = idMap.get(dstId)!;

          if (!srcId || !dstId || !type) {
            errors.push(`add_edge missing required params: srcId=${srcId}, dstId=${dstId}, type=${type}`);
            continue;
          }

          const edge = store.addEdge(srcId, dstId, type, change.params.label as string | undefined);
          createdEdgeIds.push(edge.id);
          break;
        }

        case 'delete_node': {
          const id = change.params.id as string;
          const deleted = store.deleteNode(id);
          if (!deleted) {
            errors.push(`delete_node: node ${id} not found`);
          }
          break;
        }

        case 'delete_edge': {
          const id = change.params.id as string;
          const deleted = store.deleteEdge(id);
          if (!deleted) {
            errors.push(`delete_edge: edge ${id} not found`);
          }
          break;
        }
      }
    } catch (error) {
      errors.push(`${change.action} failed: ${error}`);
    }
  }

  execution = buildExecutionSummary(planning, createdNodeIds, createdEdgeIds, errors);

  return {
    stages: {
      classification,
      resolution,
      planning,
      validation,
      execution,
    },
    success: execution.success,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export route handler for HTTP access
// ─────────────────────────────────────────────────────────────────────────────

import type { WorkflowRouteHandler } from '@flue/runtime';

export const route: WorkflowRouteHandler = async (_c, next) => next();
