import { getCloudflareContext } from '@flue/runtime/cloudflare';
import type { Node, Edge, NodeKind, EdgeType, SourceRef, Space } from './types.js';
import { NODE_KINDS, EDGE_TYPES } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Database Access & Error Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Custom error class for store operations
 */
export class StoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly operation: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/**
 * Get the database connection with error handling
 */
function db() {
  try {
    return getCloudflareContext().storage.sql;
  } catch (err) {
    throw new StoreError(
      'Failed to connect to database',
      'DB_CONNECTION_ERROR',
      'db',
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * @deprecated No longer needed - store always uses Cloudflare context
 */
export async function initStore(): Promise<void> {
  initSchema();
}

/**
 * Validate a UUID format
 */
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Validate a node kind
 */
function isValidNodeKind(kind: string): kind is NodeKind {
  return kind in NODE_KINDS;
}

/**
 * Validate an edge type
 */
function isValidEdgeType(type: string): type is EdgeType {
  return EDGE_TYPES.includes(type as EdgeType);
}

/**
 * Sanitize string input to prevent injection
 */
function sanitizeString(input: string, maxLength: number = 10000): string {
  if (typeof input !== 'string') {
    throw new StoreError('Input must be a string', 'INVALID_INPUT', 'sanitize');
  }
  // Trim and limit length
  return input.trim().slice(0, maxLength);
}

/**
 * Execute a database operation with error handling
 */
function dbExec<T>(operation: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Map SQLite errors to user-friendly messages
    let code = 'DB_ERROR';
    let friendlyMessage = message;

    if (message.includes('UNIQUE constraint')) {
      code = 'DUPLICATE_ENTRY';
      friendlyMessage = 'An item with this identifier already exists';
    } else if (message.includes('FOREIGN KEY constraint')) {
      code = 'REFERENCE_ERROR';
      friendlyMessage = 'Referenced item does not exist';
    } else if (message.includes('NOT NULL constraint')) {
      code = 'MISSING_REQUIRED';
      friendlyMessage = 'A required field is missing';
    } else if (message.includes('no such table')) {
      code = 'SCHEMA_ERROR';
      friendlyMessage = 'Database schema not initialized';
    } else if (message.includes('database is locked')) {
      code = 'DB_LOCKED';
      friendlyMessage = 'Database is temporarily unavailable, please try again';
    }

    console.error(`[Store] ${operation} failed:`, message);
    throw new StoreError(friendlyMessage, code, operation, { originalError: message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Tracking Types
// ─────────────────────────────────────────────────────────────────────────────

export type ChangeAction = 'add_node' | 'update_node' | 'delete_node' | 'add_edge' | 'delete_edge';

export interface Change {
  id: string;
  timestamp: number;
  action: ChangeAction;
  targetId: string;
  beforeState: Node | Edge | null;
  afterState: Node | Edge | null;
  sourceTurn: string | null;
  undone: boolean;
}

type ChangeRow = {
  id: string;
  timestamp: number;
  action: ChangeAction;
  target_id: string;
  before_state: string | null;
  after_state: string | null;
  source_turn: string | null;
  undone: number;
};

function rowToChange(row: ChangeRow): Change {
  return {
    id: row.id,
    timestamp: row.timestamp,
    action: row.action,
    targetId: row.target_id,
    beforeState: row.before_state ? JSON.parse(row.before_state) : null,
    afterState: row.after_state ? JSON.parse(row.after_state) : null,
    sourceTurn: row.source_turn,
    undone: row.undone === 1,
  };
}

export function initSchema() {
  dbExec('initSchema', () => {
    db().exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source_refs TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        src_id TEXT NOT NULL,
        dst_id TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT,
        FOREIGN KEY (src_id) REFERENCES nodes(id),
        FOREIGN KEY (dst_id) REFERENCES nodes(id)
      );
      CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src_id);
      CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst_id);
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        graph_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS changes (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL,
        before_state TEXT,
        after_state TEXT,
        source_turn TEXT,
        undone INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_changes_timestamp ON changes(timestamp);
      CREATE INDEX IF NOT EXISTS idx_changes_source_turn ON changes(source_turn);
    `);
  });
}

type NodeRow = {
  id: string;
  kind: NodeKind;
  title: string;
  description: string;
  source_refs: string;
  createdAt: number;
  updatedAt: number;
};

function rowToNode(row: NodeRow): Node {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    sourceRefs: JSON.parse(row.source_refs) as SourceRef[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Tracking Functions
// ─────────────────────────────────────────────────────────────────────────────

export function recordChange(
  action: ChangeAction,
  targetId: string,
  before: Node | Edge | null,
  after: Node | Edge | null,
  sourceTurn: string | null = null
): Change {
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  db().exec(
    'INSERT INTO changes (id, timestamp, action, target_id, before_state, after_state, source_turn, undone) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
    id,
    timestamp,
    action,
    targetId,
    before ? JSON.stringify(before) : null,
    after ? JSON.stringify(after) : null,
    sourceTurn
  );
  return { id, timestamp, action, targetId, beforeState: before, afterState: after, sourceTurn, undone: false };
}

export function getChangeHistory(limit: number = 50): Change[] {
  const rows = (db()
    .exec(
      'SELECT id, timestamp, action, target_id, before_state, after_state, source_turn, undone FROM changes ORDER BY timestamp DESC LIMIT ?',
      limit
    )
    .toArray() as unknown) as ChangeRow[];
  return rows.map(rowToChange);
}

export function getChangesForTurn(turnId: string): Change[] {
  const rows = (db()
    .exec(
      'SELECT id, timestamp, action, target_id, before_state, after_state, source_turn, undone FROM changes WHERE source_turn = ? ORDER BY timestamp ASC',
      turnId
    )
    .toArray() as unknown) as ChangeRow[];
  return rows.map(rowToChange);
}

export interface UndoResult {
  success: boolean;
  change: Change | null;
  error?: string;
}

export function undoLastChange(): UndoResult {
  // Find the most recent non-undone change
  const rows = (db()
    .exec(
      'SELECT id, timestamp, action, target_id, before_state, after_state, source_turn, undone FROM changes WHERE undone = 0 ORDER BY timestamp DESC LIMIT 1'
    )
    .toArray() as unknown) as ChangeRow[];

  if (rows.length === 0) {
    return { success: false, change: null, error: 'No changes to undo' };
  }

  const change = rowToChange(rows[0]);

  try {
    // Perform the inverse operation
    switch (change.action) {
      case 'add_node': {
        // Undo add -> delete the node (without recording a new change)
        const nodeId = change.targetId;
        db().exec('DELETE FROM edges WHERE src_id = ? OR dst_id = ?', nodeId, nodeId);
        db().exec('DELETE FROM nodes WHERE id = ?', nodeId);
        break;
      }
      case 'update_node': {
        // Undo update -> restore previous state
        const before = change.beforeState as Node;
        if (before) {
          db().exec(
            'UPDATE nodes SET kind = ?, title = ?, description = ?, source_refs = ?, updated_at = ? WHERE id = ?',
            before.kind,
            before.title,
            before.description,
            JSON.stringify(before.sourceRefs),
            before.updatedAt,
            before.id
          );
        }
        break;
      }
      case 'delete_node': {
        // Undo delete -> re-insert the node
        const before = change.beforeState as Node;
        if (before) {
          db().exec(
            'INSERT INTO nodes (id, kind, title, description, source_refs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            before.id,
            before.kind,
            before.title,
            before.description,
            JSON.stringify(before.sourceRefs),
            before.createdAt,
            before.updatedAt
          );
        }
        break;
      }
      case 'add_edge': {
        // Undo add -> delete the edge
        db().exec('DELETE FROM edges WHERE id = ?', change.targetId);
        break;
      }
      case 'delete_edge': {
        // Undo delete -> re-insert the edge
        const before = change.beforeState as Edge;
        if (before) {
          db().exec(
            'INSERT INTO edges (id, src_id, dst_id, type, label) VALUES (?, ?, ?, ?, ?)',
            before.id,
            before.srcId,
            before.dstId,
            before.type,
            before.label ?? null
          );
        }
        break;
      }
    }

    // Mark the change as undone
    db().exec('UPDATE changes SET undone = 1 WHERE id = ?', change.id);
    change.undone = true;

    return { success: true, change };
  } catch (err) {
    return { success: false, change, error: err instanceof Error ? err.message : String(err) };
  }
}

export function redoLastUndo(): UndoResult {
  // Find the most recent undone change (earliest undo that hasn't been redone)
  const rows = (db()
    .exec(
      'SELECT id, timestamp, action, target_id, before_state, after_state, source_turn, undone FROM changes WHERE undone = 1 ORDER BY timestamp DESC LIMIT 1'
    )
    .toArray() as unknown) as ChangeRow[];

  if (rows.length === 0) {
    return { success: false, change: null, error: 'No undone changes to redo' };
  }

  const change = rowToChange(rows[0]);

  try {
    // Re-apply the original operation
    switch (change.action) {
      case 'add_node': {
        // Redo add -> re-insert the node
        const after = change.afterState as Node;
        if (after) {
          db().exec(
            'INSERT INTO nodes (id, kind, title, description, source_refs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            after.id,
            after.kind,
            after.title,
            after.description,
            JSON.stringify(after.sourceRefs),
            after.createdAt,
            after.updatedAt
          );
        }
        break;
      }
      case 'update_node': {
        // Redo update -> apply the after state
        const after = change.afterState as Node;
        if (after) {
          db().exec(
            'UPDATE nodes SET kind = ?, title = ?, description = ?, source_refs = ?, updated_at = ? WHERE id = ?',
            after.kind,
            after.title,
            after.description,
            JSON.stringify(after.sourceRefs),
            after.updatedAt,
            after.id
          );
        }
        break;
      }
      case 'delete_node': {
        // Redo delete -> delete the node again
        const nodeId = change.targetId;
        db().exec('DELETE FROM edges WHERE src_id = ? OR dst_id = ?', nodeId, nodeId);
        db().exec('DELETE FROM nodes WHERE id = ?', nodeId);
        break;
      }
      case 'add_edge': {
        // Redo add -> re-insert the edge
        const after = change.afterState as Edge;
        if (after) {
          db().exec(
            'INSERT INTO edges (id, src_id, dst_id, type, label) VALUES (?, ?, ?, ?, ?)',
            after.id,
            after.srcId,
            after.dstId,
            after.type,
            after.label ?? null
          );
        }
        break;
      }
      case 'delete_edge': {
        // Redo delete -> delete the edge again
        db().exec('DELETE FROM edges WHERE id = ?', change.targetId);
        break;
      }
    }

    // Mark the change as not undone
    db().exec('UPDATE changes SET undone = 0 WHERE id = ?', change.id);
    change.undone = false;

    return { success: true, change };
  } catch (err) {
    return { success: false, change, error: err instanceof Error ? err.message : String(err) };
  }
}

export function listNodes(): Node[] {
  return ((db().exec('SELECT id, kind, title, description, source_refs, created_at as createdAt, updated_at as updatedAt FROM nodes').toArray() as unknown) as NodeRow[]).map(rowToNode);
}

export function getNode(id: string): Node | null {
  const rows = (db().exec('SELECT id, kind, title, description, source_refs, created_at as createdAt, updated_at as updatedAt FROM nodes WHERE id = ?', id).toArray() as unknown) as NodeRow[];
  return rows[0] ? rowToNode(rows[0]) : null;
}

export function addNode(kind: NodeKind, title: string, description: string, sourceRefs: SourceRef[] = [], sourceTurn?: string): Node {
  // Validate inputs
  if (!isValidNodeKind(kind)) {
    throw new StoreError(`Invalid node kind: ${kind}`, 'INVALID_KIND', 'addNode');
  }

  const sanitizedTitle = sanitizeString(title, 500);
  const sanitizedDescription = sanitizeString(description, 10000);

  if (!sanitizedTitle) {
    throw new StoreError('Node title is required', 'MISSING_REQUIRED', 'addNode');
  }

  return dbExec('addNode', () => {
    const id = crypto.randomUUID();
    const now = Date.now();
    db().exec(
      'INSERT INTO nodes (id, kind, title, description, source_refs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id, kind, sanitizedTitle, sanitizedDescription, JSON.stringify(sourceRefs), now, now
    );
    const node: Node = { id, kind, title: sanitizedTitle, description: sanitizedDescription, sourceRefs, createdAt: now, updatedAt: now };
    recordChange('add_node', id, null, node, sourceTurn ?? null);
    return node;
  });
}

export function updateNode(id: string, title: string, description: string, sourceRefs?: SourceRef[], sourceTurn?: string): Node | null {
  // Validate ID format
  if (!isValidUUID(id)) {
    throw new StoreError(`Invalid node ID format: ${id}`, 'INVALID_ID', 'updateNode');
  }

  const sanitizedTitle = sanitizeString(title, 500);
  const sanitizedDescription = sanitizeString(description, 10000);

  if (!sanitizedTitle) {
    throw new StoreError('Node title is required', 'MISSING_REQUIRED', 'updateNode');
  }

  return dbExec('updateNode', () => {
    const before = getNode(id);
    if (!before) {
      throw new StoreError(`Node not found: ${id}`, 'NOT_FOUND', 'updateNode');
    }

    const now = Date.now();
    if (sourceRefs !== undefined) {
      db().exec('UPDATE nodes SET title = ?, description = ?, source_refs = ?, updated_at = ? WHERE id = ?', sanitizedTitle, sanitizedDescription, JSON.stringify(sourceRefs), now, id);
    } else {
      db().exec('UPDATE nodes SET title = ?, description = ?, updated_at = ? WHERE id = ?', sanitizedTitle, sanitizedDescription, now, id);
    }
    const after = getNode(id);
    if (after) {
      recordChange('update_node', id, before, after, sourceTurn ?? null);
    }
    return after;
  });
}

export function deleteNode(id: string, sourceTurn?: string): boolean {
  // Validate ID format
  if (!isValidUUID(id)) {
    throw new StoreError(`Invalid node ID format: ${id}`, 'INVALID_ID', 'deleteNode');
  }

  return dbExec('deleteNode', () => {
    const before = getNode(id);
    if (!before) {
      throw new StoreError(`Node not found: ${id}`, 'NOT_FOUND', 'deleteNode');
    }

    // Delete connected edges first
    db().exec('DELETE FROM edges WHERE src_id = ? OR dst_id = ?', id, id);
    const result = db().exec('DELETE FROM nodes WHERE id = ?', id);
    if ((result.rowsWritten ?? 0) > 0) {
      recordChange('delete_node', id, before, null, sourceTurn ?? null);
      return true;
    }
    return false;
  });
}

export function listEdges(): Edge[] {
  return (db().exec('SELECT id, src_id as srcId, dst_id as dstId, type, label FROM edges').toArray() as unknown) as Edge[];
}

export function getEdge(id: string): Edge | null {
  const rows = (db().exec('SELECT id, src_id as srcId, dst_id as dstId, type, label FROM edges WHERE id = ?', id).toArray() as unknown) as Edge[];
  return rows[0] ?? null;
}

export function addEdge(srcId: string, dstId: string, type: EdgeType, label?: string, sourceTurn?: string): Edge {
  // Validate inputs
  if (!isValidUUID(srcId)) {
    throw new StoreError(`Invalid source node ID format: ${srcId}`, 'INVALID_ID', 'addEdge');
  }
  if (!isValidUUID(dstId)) {
    throw new StoreError(`Invalid destination node ID format: ${dstId}`, 'INVALID_ID', 'addEdge');
  }
  if (!isValidEdgeType(type)) {
    throw new StoreError(`Invalid edge type: ${type}`, 'INVALID_TYPE', 'addEdge');
  }
  if (srcId === dstId) {
    throw new StoreError('Cannot create edge from a node to itself', 'SELF_REFERENCE', 'addEdge');
  }

  return dbExec('addEdge', () => {
    // Verify source and destination nodes exist
    if (!getNode(srcId)) {
      throw new StoreError(`Source node not found: ${srcId}`, 'NOT_FOUND', 'addEdge');
    }
    if (!getNode(dstId)) {
      throw new StoreError(`Destination node not found: ${dstId}`, 'NOT_FOUND', 'addEdge');
    }

    const id = crypto.randomUUID();
    const sanitizedLabel = label ? sanitizeString(label, 200) : undefined;
    db().exec('INSERT INTO edges (id, src_id, dst_id, type, label) VALUES (?, ?, ?, ?, ?)', id, srcId, dstId, type, sanitizedLabel ?? null);
    const edge: Edge = { id, srcId, dstId, type, label: sanitizedLabel };
    recordChange('add_edge', id, null, edge, sourceTurn ?? null);
    return edge;
  });
}

export function deleteEdge(id: string, sourceTurn?: string): boolean {
  // Validate ID format
  if (!isValidUUID(id)) {
    throw new StoreError(`Invalid edge ID format: ${id}`, 'INVALID_ID', 'deleteEdge');
  }

  return dbExec('deleteEdge', () => {
    const before = getEdge(id);
    if (!before) {
      throw new StoreError(`Edge not found: ${id}`, 'NOT_FOUND', 'deleteEdge');
    }

    const result = db().exec('DELETE FROM edges WHERE id = ?', id);
    if ((result.rowsWritten ?? 0) > 0) {
      recordChange('delete_edge', id, before, null, sourceTurn ?? null);
      return true;
    }
    return false;
  });
}

export function getGraph(): { nodes: Node[]; edges: Edge[] } {
  return { nodes: listNodes(), edges: listEdges() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshots
// ─────────────────────────────────────────────────────────────────────────────

export interface Snapshot {
  id: string;
  name: string;
  createdAt: number;
  graphJson: string;
}

type SnapshotRow = {
  id: string;
  name: string;
  created_at: number;
  graph_json: string;
};

function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    graphJson: row.graph_json,
  };
}

export function createSnapshot(name: string): Snapshot {
  const id = crypto.randomUUID();
  const now = Date.now();
  const graph = getGraph();
  const graphJson = JSON.stringify(graph);
  db().exec(
    'INSERT INTO snapshots (id, name, created_at, graph_json) VALUES (?, ?, ?, ?)',
    id, name, now, graphJson
  );
  return { id, name, createdAt: now, graphJson };
}

export function listSnapshots(): Omit<Snapshot, 'graphJson'>[] {
  return ((db()
    .exec('SELECT id, name, created_at, graph_json FROM snapshots ORDER BY created_at DESC')
    .toArray() as unknown) as SnapshotRow[])
    .map((row: SnapshotRow) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    }));
}

export function getSnapshot(nameOrId: string): Snapshot | null {
  const rows = (db()
    .exec(
      'SELECT id, name, created_at, graph_json FROM snapshots WHERE id = ? OR name = ?',
      nameOrId, nameOrId
    )
    .toArray() as unknown) as SnapshotRow[];
  return rows[0] ? rowToSnapshot(rows[0]) : null;
}

export function restoreSnapshot(nameOrId: string): { restored: boolean; nodeCount: number; edgeCount: number } {
  const snapshot = getSnapshot(nameOrId);
  if (!snapshot) {
    return { restored: false, nodeCount: 0, edgeCount: 0 };
  }

  const graph = JSON.parse(snapshot.graphJson) as { nodes: Node[]; edges: Edge[] };

  // Clear current graph
  db().exec('DELETE FROM edges');
  db().exec('DELETE FROM nodes');

  // Restore nodes
  for (const node of graph.nodes) {
    db().exec(
      'INSERT INTO nodes (id, kind, title, description, source_refs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      node.id, node.kind, node.title, node.description, JSON.stringify(node.sourceRefs), node.createdAt, node.updatedAt
    );
  }

  // Restore edges
  for (const edge of graph.edges) {
    db().exec(
      'INSERT INTO edges (id, src_id, dst_id, type, label) VALUES (?, ?, ?, ?, ?)',
      edge.id, edge.srcId, edge.dstId, edge.type, edge.label ?? null
    );
  }

  return { restored: true, nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff
// ─────────────────────────────────────────────────────────────────────────────

export interface NodeDiff {
  added: Node[];
  removed: Node[];
  changed: Array<{ before: Node; after: Node }>;
}

export interface EdgeDiff {
  added: Edge[];
  removed: Edge[];
}

export interface GraphDiff {
  nodes: NodeDiff;
  edges: EdgeDiff;
}

export function diffSnapshot(nameOrId: string): GraphDiff | null {
  const snapshot = getSnapshot(nameOrId);
  if (!snapshot) {
    return null;
  }

  const snapshotGraph = JSON.parse(snapshot.graphJson) as { nodes: Node[]; edges: Edge[] };
  const currentGraph = getGraph();

  const snapshotNodeMap = new Map(snapshotGraph.nodes.map((n) => [n.id, n]));
  const currentNodeMap = new Map(currentGraph.nodes.map((n) => [n.id, n]));

  const snapshotEdgeMap = new Map(snapshotGraph.edges.map((e) => [e.id, e]));
  const currentEdgeMap = new Map(currentGraph.edges.map((e) => [e.id, e]));

  // Nodes diff
  const addedNodes: Node[] = [];
  const removedNodes: Node[] = [];
  const changedNodes: Array<{ before: Node; after: Node }> = [];

  for (const [id, node] of currentNodeMap) {
    const snapshotNode = snapshotNodeMap.get(id);
    if (!snapshotNode) {
      addedNodes.push(node);
    } else if (
      snapshotNode.title !== node.title ||
      snapshotNode.description !== node.description ||
      snapshotNode.kind !== node.kind
    ) {
      changedNodes.push({ before: snapshotNode, after: node });
    }
  }

  for (const [id, node] of snapshotNodeMap) {
    if (!currentNodeMap.has(id)) {
      removedNodes.push(node);
    }
  }

  // Edges diff
  const addedEdges: Edge[] = [];
  const removedEdges: Edge[] = [];

  for (const [id, edge] of currentEdgeMap) {
    if (!snapshotEdgeMap.has(id)) {
      addedEdges.push(edge);
    }
  }

  for (const [id, edge] of snapshotEdgeMap) {
    if (!currentEdgeMap.has(id)) {
      removedEdges.push(edge);
    }
  }

  return {
    nodes: { added: addedNodes, removed: removedNodes, changed: changedNodes },
    edges: { added: addedEdges, removed: removedEdges },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

const SPACE_ORDER: Space[] = ['basics', 'problem', 'solution', 'crosscutting'];
const SPACE_TITLES: Record<Space, string> = {
  basics: 'Basics',
  problem: 'Problem Space',
  solution: 'Solution Space',
  crosscutting: 'Cross-cutting Concerns',
};

export function exportMarkdown(): string {
  const graph = getGraph();
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // Group nodes by space
  const bySpace = new Map<Space, Node[]>();
  for (const space of SPACE_ORDER) {
    bySpace.set(space, []);
  }
  for (const node of graph.nodes) {
    const space = NODE_KINDS[node.kind]?.space ?? 'crosscutting';
    bySpace.get(space)!.push(node);
  }

  // Build outgoing edges map
  const outgoingEdges = new Map<string, Edge[]>();
  for (const edge of graph.edges) {
    if (!outgoingEdges.has(edge.srcId)) {
      outgoingEdges.set(edge.srcId, []);
    }
    outgoingEdges.get(edge.srcId)!.push(edge);
  }

  const lines: string[] = [];
  lines.push('# Knowledge Graph Export');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  for (const space of SPACE_ORDER) {
    const nodes = bySpace.get(space)!;
    if (nodes.length === 0) continue;

    lines.push(`## ${SPACE_TITLES[space]}`);
    lines.push('');

    // Sort nodes by kind then title
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.title.localeCompare(b.title);
    });

    let currentKind: string | null = null;
    for (const node of nodes) {
      if (node.kind !== currentKind) {
        currentKind = node.kind;
        lines.push(`### ${capitalize(node.kind)}`);
        lines.push('');
      }

      lines.push(`#### ${node.title}`);
      lines.push('');
      lines.push(node.description);
      lines.push('');

      // Relationships
      const edges = outgoingEdges.get(node.id) ?? [];
      if (edges.length > 0) {
        lines.push('**Relationships:**');
        for (const edge of edges) {
          const target = nodeMap.get(edge.dstId);
          const targetLabel = target ? `${target.title} (${target.kind})` : edge.dstId;
          const label = edge.label ? ` "${edge.label}"` : '';
          lines.push(`- ${edge.type}${label} -> ${targetLabel}`);
        }
        lines.push('');
      }

      // Source references
      if (node.sourceRefs.length > 0) {
        lines.push('**Sources:**');
        for (const ref of node.sourceRefs) {
          lines.push(`- "${ref.excerpt}"`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Completeness Score
// ─────────────────────────────────────────────────────────────────────────────

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

export function getCompletenessScore(): CompletenessScore {
  const graph = getGraph();
  const nodesByKind = new Map<string, Node[]>();

  for (const node of graph.nodes) {
    if (!nodesByKind.has(node.kind)) {
      nodesByKind.set(node.kind, []);
    }
    nodesByKind.get(node.kind)!.push(node);
  }

  const hasKind = (kind: string) => (nodesByKind.get(kind)?.length ?? 0) > 0;
  const countKind = (kind: string) => nodesByKind.get(kind)?.length ?? 0;

  const allMissing: MissingItem[] = [];
  const suggestions: Suggestion[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Basics space (30 points max)
  // ─────────────────────────────────────────────────────────────────────────
  const basicsMissing: MissingItem[] = [];
  let basicsScore = 0;
  const basicsMax = 30;

  if (hasKind('name')) {
    basicsScore += 15;
  } else {
    basicsMissing.push({ kind: 'name', message: 'No name defined', severity: 'required' });
    suggestions.push({ kind: 'name', prompt: 'What is the name of your app/project?', priority: 100 });
  }

  if (hasKind('purpose')) {
    basicsScore += 15;
  } else {
    basicsMissing.push({ kind: 'purpose', message: 'No purpose defined', severity: 'required' });
    suggestions.push({ kind: 'purpose', prompt: 'What problem does it solve? Who is it for?', priority: 95 });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Problem space (35 points max)
  // ─────────────────────────────────────────────────────────────────────────
  const problemMissing: MissingItem[] = [];
  let problemScore = 0;
  const problemMax = 35;

  if (hasKind('persona')) {
    problemScore += 10;
  } else {
    problemMissing.push({ kind: 'persona', message: 'No personas defined', severity: 'recommended' });
    suggestions.push({ kind: 'persona', prompt: 'Describe the main types of users', priority: 80 });
  }

  if (hasKind('usecase')) {
    problemScore += 10;
  } else {
    problemMissing.push({ kind: 'usecase', message: 'No use cases defined', severity: 'recommended' });
    suggestions.push({ kind: 'usecase', prompt: 'What are the main things users want to accomplish?', priority: 75 });
  }

  if (hasKind('flow')) {
    problemScore += 10;
  } else {
    problemMissing.push({ kind: 'flow', message: 'No user flows defined', severity: 'recommended' });
    suggestions.push({ kind: 'flow', prompt: 'Walk through a typical user journey step by step', priority: 70 });
  }

  // Bonus points for assumption capture
  if (hasKind('assumption')) {
    problemScore += 5;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Solution space (25 points max)
  // ─────────────────────────────────────────────────────────────────────────
  const solutionMissing: MissingItem[] = [];
  let solutionScore = 0;
  const solutionMax = 25;

  // Solution nodes are expected only if flows exist (indicating design has progressed)
  const hasFlows = hasKind('flow');

  if (hasKind('entity')) {
    solutionScore += 10;
  } else if (hasFlows) {
    solutionMissing.push({ kind: 'entity', message: 'No entities defined', severity: 'recommended' });
    suggestions.push({ kind: 'entity', prompt: 'What are the main data objects in the system?', priority: 60 });
  }

  if (hasKind('component')) {
    solutionScore += 10;
  } else if (hasFlows) {
    solutionMissing.push({ kind: 'component', message: 'No components defined', severity: 'recommended' });
    suggestions.push({ kind: 'component', prompt: 'What UI components will you need?', priority: 55 });
  }

  if (hasKind('api') || hasKind('interface')) {
    solutionScore += 5;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Crosscutting concerns (10 points max)
  // ─────────────────────────────────────────────────────────────────────────
  const crosscuttingMissing: MissingItem[] = [];
  let crosscuttingScore = 0;
  const crosscuttingMax = 10;

  if (hasKind('assumption')) {
    crosscuttingScore += 5;
  } else {
    crosscuttingMissing.push({ kind: 'assumption', message: 'No assumptions captured', severity: 'recommended' });
    suggestions.push({ kind: 'assumption', prompt: 'What assumptions are you making about users, tech, or scope?', priority: 65 });
  }

  if (hasKind('constraint')) {
    crosscuttingScore += 3;
  }

  if (hasKind('external')) {
    crosscuttingScore += 2;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Aggregate
  // ─────────────────────────────────────────────────────────────────────────
  allMissing.push(...basicsMissing, ...problemMissing, ...solutionMissing, ...crosscuttingMissing);

  const totalScore = basicsScore + problemScore + solutionScore + crosscuttingScore;
  const totalMax = basicsMax + problemMax + solutionMax + crosscuttingMax;
  const overall = Math.round((totalScore / totalMax) * 100);

  // Sort suggestions by priority descending
  suggestions.sort((a, b) => b.priority - a.priority);

  return {
    overall,
    spaces: [
      { space: 'basics', score: basicsScore, maxScore: basicsMax, missing: basicsMissing },
      { space: 'problem', score: problemScore, maxScore: problemMax, missing: problemMissing },
      { space: 'solution', score: solutionScore, maxScore: solutionMax, missing: solutionMissing },
      { space: 'crosscutting', score: crosscuttingScore, maxScore: crosscuttingMax, missing: crosscuttingMissing },
    ],
    missing: allMissing,
    suggestions: suggestions.slice(0, 5), // Top 5 suggestions
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Suggestions
// ─────────────────────────────────────────────────────────────────────────────

export interface AISuggestion {
  id: string;
  text: string;
  suggestedKind: NodeKind | null;
  suggestedTitle: string | null;
  priority: 'high' | 'medium' | 'low';
  category: 'orphan' | 'missing_connection' | 'missing_error_handling' | 'implicit_concept' | 'unbalanced_space' | 'missing_assumption';
  relatedNodeId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Targeted Graph Queries (for scalability)
// ─────────────────────────────────────────────────────────────────────────────

export interface CompactNode {
  id: string;
  kind: NodeKind;
  title: string;
  relevance?: number;
}

export interface NodeContext {
  node: Node;
  connectedNodes: Node[];
  edges: Edge[];
}

export interface GraphSummary {
  totalNodes: number;
  totalEdges: number;
  byKind: Record<string, number>;
  bySpace: Record<string, { count: number; titles: string[] }>;
}

/**
 * Search nodes by matching title and description against a query string.
 * Uses SQLite LIKE for text matching.
 */
export function searchNodes(
  query: string,
  options?: { kinds?: NodeKind[]; spaces?: Space[]; limit?: number }
): CompactNode[] {
  const limit = options?.limit ?? 10;
  const searchPattern = `%${query}%`;

  let sql = `
    SELECT id, kind, title, description
    FROM nodes
    WHERE (title LIKE ? OR description LIKE ?)
  `;
  const params: (string | number)[] = [searchPattern, searchPattern];

  if (options?.kinds && options.kinds.length > 0) {
    const placeholders = options.kinds.map(() => '?').join(',');
    sql += ` AND kind IN (${placeholders})`;
    params.push(...options.kinds);
  }

  if (options?.spaces && options.spaces.length > 0) {
    // Map spaces to their node kinds
    const kindsInSpaces = Object.entries(NODE_KINDS)
      .filter(([_, meta]) => options.spaces!.includes(meta.space))
      .map(([kind]) => kind);
    if (kindsInSpaces.length > 0) {
      const placeholders = kindsInSpaces.map(() => '?').join(',');
      sql += ` AND kind IN (${placeholders})`;
      params.push(...kindsInSpaces);
    }
  }

  sql += ` LIMIT ?`;
  params.push(limit);

  interface SearchRow { id: string; kind: NodeKind; title: string; description: string }
  const rows = (db().exec(sql, ...params).toArray() as unknown) as SearchRow[];

  // Calculate simple relevance: title match scores higher than description match
  return rows.map((row: SearchRow) => {
    const titleMatch = row.title.toLowerCase().includes(query.toLowerCase());
    const descMatch = row.description.toLowerCase().includes(query.toLowerCase());
    const relevance = (titleMatch ? 2 : 0) + (descMatch ? 1 : 0);
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      relevance,
    };
  }).sort((a: CompactNode, b: CompactNode) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

/**
 * Get a node with all its immediate connections (1-hop neighbors).
 * Returns the focused view needed for updating a specific part of the graph.
 */
export function getNodeContext(nodeId: string): NodeContext | null {
  const node = getNode(nodeId);
  if (!node) return null;

  // Get all edges connected to this node (either as source or destination)
  const edges = (db()
    .exec('SELECT id, src_id as srcId, dst_id as dstId, type, label FROM edges WHERE src_id = ? OR dst_id = ?', nodeId, nodeId)
    .toArray() as unknown) as Edge[];

  // Collect all connected node IDs
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    if (edge.srcId !== nodeId) connectedIds.add(edge.srcId);
    if (edge.dstId !== nodeId) connectedIds.add(edge.dstId);
  }

  // Fetch connected nodes
  const connectedNodes: Node[] = [];
  for (const id of connectedIds) {
    const connectedNode = getNode(id);
    if (connectedNode) connectedNodes.push(connectedNode);
  }

  return { node, connectedNodes, edges };
}

/**
 * Find nodes that might be semantically related to a concept.
 * Searches across all text fields with broader matching.
 */
export function findRelatedNodes(concept: string, limit: number = 5): CompactNode[] {
  // Split concept into words for more flexible matching
  const words = concept.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return [];

  // Build a query that matches any word in title or description
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  for (const word of words) {
    conditions.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    params.push(`%${word}%`, `%${word}%`);
  }

  const sql = `
    SELECT id, kind, title, description
    FROM nodes
    WHERE ${conditions.join(' OR ')}
    LIMIT ?
  `;
  params.push(limit * 2); // Fetch extra to allow for scoring

  interface SearchRow { id: string; kind: NodeKind; title: string; description: string }
  const rows = (db().exec(sql, ...params).toArray() as unknown) as SearchRow[];

  // Score by how many words match
  const scored = rows.map((row: SearchRow) => {
    const text = (row.title + ' ' + row.description).toLowerCase();
    const matchCount = words.filter(w => text.includes(w)).length;
    const titleBoost = words.some(w => row.title.toLowerCase().includes(w)) ? 1 : 0;
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      relevance: matchCount + titleBoost,
    };
  });

  // Sort by relevance and take top results
  return scored
    .sort((a: CompactNode, b: CompactNode) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, limit);
}

/**
 * Get a high-level summary of the graph without loading all descriptions.
 * Returns counts per kind, per space, and node titles grouped by space.
 */
export function getGraphSummary(): GraphSummary {
  // Get counts by kind
  interface KindCountRow { kind: NodeKind; count: number }
  const kindCounts = (db()
    .exec('SELECT kind, COUNT(*) as count FROM nodes GROUP BY kind')
    .toArray() as unknown) as KindCountRow[];

  const byKind: Record<string, number> = {};
  for (const row of kindCounts) {
    byKind[row.kind] = row.count;
  }

  // Get all node titles with kinds (lightweight)
  interface TitleRow { kind: NodeKind; title: string }
  const titles = (db()
    .exec('SELECT kind, title FROM nodes ORDER BY kind, title')
    .toArray() as unknown) as TitleRow[];

  // Group by space
  const bySpace: Record<string, { count: number; titles: string[] }> = {
    basics: { count: 0, titles: [] },
    problem: { count: 0, titles: [] },
    solution: { count: 0, titles: [] },
    crosscutting: { count: 0, titles: [] },
  };

  for (const row of titles) {
    const space = NODE_KINDS[row.kind as NodeKind]?.space ?? 'crosscutting';
    bySpace[space].count++;
    bySpace[space].titles.push(`${row.title} (${row.kind})`);
  }

  // Get total edges
  interface CountRow { count: number }
  const edgeCountResult = (db().exec('SELECT COUNT(*) as count FROM edges').toArray() as unknown) as CountRow[];
  const totalEdges = edgeCountResult[0]?.count ?? 0;

  const totalNodes = titles.length;

  return { totalNodes, totalEdges, byKind, bySpace };
}

export function getSuggestions(selectedNodeId?: string, recentNodeIds?: string[]): AISuggestion[] {
  const graph = getGraph();
  const suggestions: AISuggestion[] = [];

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const nodesByKind = new Map<NodeKind, Node[]>();
  const nodesBySpace = new Map<Space, Node[]>();

  for (const node of graph.nodes) {
    // Group by kind
    if (!nodesByKind.has(node.kind)) {
      nodesByKind.set(node.kind, []);
    }
    nodesByKind.get(node.kind)!.push(node);

    // Group by space
    const space = NODE_KINDS[node.kind]?.space ?? 'crosscutting';
    if (!nodesBySpace.has(space)) {
      nodesBySpace.set(space, []);
    }
    nodesBySpace.get(space)!.push(node);
  }

  // Build adjacency sets
  const connectedNodeIds = new Set<string>();
  const outgoingEdges = new Map<string, Edge[]>();
  const incomingEdges = new Map<string, Edge[]>();

  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.srcId);
    connectedNodeIds.add(edge.dstId);

    if (!outgoingEdges.has(edge.srcId)) {
      outgoingEdges.set(edge.srcId, []);
    }
    outgoingEdges.get(edge.srcId)!.push(edge);

    if (!incomingEdges.has(edge.dstId)) {
      incomingEdges.set(edge.dstId, []);
    }
    incomingEdges.get(edge.dstId)!.push(edge);
  }

  const hasKind = (kind: NodeKind) => (nodesByKind.get(kind)?.length ?? 0) > 0;
  const countKind = (kind: NodeKind) => nodesByKind.get(kind)?.length ?? 0;
  const countSpace = (space: Space) => nodesBySpace.get(space)?.length ?? 0;

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Orphan nodes (no edges)
  // ─────────────────────────────────────────────────────────────────────────
  for (const node of graph.nodes) {
    // Skip singular basics nodes that are naturally orphans
    if (node.kind === 'name' || node.kind === 'purpose') continue;

    if (!connectedNodeIds.has(node.id)) {
      suggestions.push({
        id: `orphan-${node.id}`,
        text: `"${node.title}" has no connections — how does it relate to other parts of the system?`,
        suggestedKind: null,
        suggestedTitle: null,
        priority: 'medium',
        category: 'orphan',
        relatedNodeId: node.id,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Usecases without flows
  // ─────────────────────────────────────────────────────────────────────────
  const usecases = nodesByKind.get('usecase') ?? [];
  const flows = nodesByKind.get('flow') ?? [];

  for (const usecase of usecases) {
    const usecaseEdges = outgoingEdges.get(usecase.id) ?? [];
    const hasFlow = usecaseEdges.some(e => {
      const target = nodeMap.get(e.dstId);
      return target?.kind === 'flow';
    });

    if (!hasFlow) {
      suggestions.push({
        id: `usecase-no-flow-${usecase.id}`,
        text: `Use case "${usecase.title}" has no user flow — what steps does the user take?`,
        suggestedKind: 'flow',
        suggestedTitle: `${usecase.title} Flow`,
        priority: 'high',
        category: 'missing_connection',
        relatedNodeId: usecase.id,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Flows without error states
  // ─────────────────────────────────────────────────────────────────────────
  const errorKeywords = ['error', 'fail', 'invalid', 'exception', 'timeout', 'retry', 'cancel'];

  for (const flow of flows) {
    const flowText = (flow.title + ' ' + flow.description).toLowerCase();
    const hasErrorMention = errorKeywords.some(kw => flowText.includes(kw));

    if (!hasErrorMention) {
      // Check connected constraint nodes for error handling
      const flowEdges = [...(outgoingEdges.get(flow.id) ?? []), ...(incomingEdges.get(flow.id) ?? [])];
      const hasConstraintWithError = flowEdges.some(e => {
        const otherNodeId = e.srcId === flow.id ? e.dstId : e.srcId;
        const otherNode = nodeMap.get(otherNodeId);
        if (otherNode?.kind === 'constraint') {
          const constraintText = (otherNode.title + ' ' + otherNode.description).toLowerCase();
          return errorKeywords.some(kw => constraintText.includes(kw));
        }
        return false;
      });

      if (!hasConstraintWithError) {
        suggestions.push({
          id: `flow-no-error-${flow.id}`,
          text: `"${flow.title}" has no error handling — what happens when something goes wrong?`,
          suggestedKind: 'constraint',
          suggestedTitle: `Error Handling: ${flow.title}`,
          priority: 'medium',
          category: 'missing_error_handling',
          relatedNodeId: flow.id,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Entities without relationships
  // ─────────────────────────────────────────────────────────────────────────
  const entities = nodesByKind.get('entity') ?? [];

  if (entities.length >= 2) {
    const relationships = nodesByKind.get('relationship') ?? [];

    if (relationships.length === 0) {
      // No explicit relationship nodes
      suggestions.push({
        id: 'entities-no-relationships',
        text: `You have ${entities.length} entities but no relationships — how do they connect?`,
        suggestedKind: 'relationship',
        suggestedTitle: null,
        priority: 'high',
        category: 'missing_connection',
      });
    } else {
      // Check for entities not involved in any relationship
      const entitiesInRelationships = new Set<string>();
      for (const rel of relationships) {
        const relEdges = [...(outgoingEdges.get(rel.id) ?? []), ...(incomingEdges.get(rel.id) ?? [])];
        for (const edge of relEdges) {
          const otherId = edge.srcId === rel.id ? edge.dstId : edge.srcId;
          const other = nodeMap.get(otherId);
          if (other?.kind === 'entity') {
            entitiesInRelationships.add(other.id);
          }
        }
      }

      for (const entity of entities) {
        if (!entitiesInRelationships.has(entity.id)) {
          suggestions.push({
            id: `entity-no-rel-${entity.id}`,
            text: `Entity "${entity.title}" isn't connected to any relationships — is it standalone or does it relate to others?`,
            suggestedKind: 'relationship',
            suggestedTitle: null,
            priority: 'medium',
            category: 'missing_connection',
            relatedNodeId: entity.id,
          });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Missing assumptions (every major decision needs rationale)
  // ─────────────────────────────────────────────────────────────────────────
  const assumptions = nodesByKind.get('assumption') ?? [];
  const majorDecisions = [
    ...(nodesByKind.get('entity') ?? []),
    ...(nodesByKind.get('api') ?? []),
    ...(nodesByKind.get('external') ?? []),
  ];

  if (majorDecisions.length >= 3 && assumptions.length === 0) {
    suggestions.push({
      id: 'no-assumptions',
      text: 'You have several technical decisions but no documented assumptions — what are you taking for granted?',
      suggestedKind: 'assumption',
      suggestedTitle: null,
      priority: 'high',
      category: 'missing_assumption',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Unbalanced spaces
  // ─────────────────────────────────────────────────────────────────────────
  const problemCount = countSpace('problem');
  const solutionCount = countSpace('solution');

  // Too much solution without enough problem definition
  if (solutionCount > 5 && problemCount < 2) {
    suggestions.push({
      id: 'solution-heavy',
      text: 'Lots of solution details but sparse problem definition — who are the users and what are they trying to do?',
      suggestedKind: 'persona',
      suggestedTitle: null,
      priority: 'high',
      category: 'unbalanced_space',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Implicit concepts in descriptions (look for quotes or mentions)
  // ─────────────────────────────────────────────────────────────────────────
  const existingTitles = new Set(graph.nodes.map(n => n.title.toLowerCase()));
  const implicitConceptPatterns = [
    { pattern: /\b(payment|checkout|billing)\b/i, kind: 'entity' as NodeKind, title: 'Payment' },
    { pattern: /\b(login|authentication|auth|signin|sign in)\b/i, kind: 'flow' as NodeKind, title: 'Authentication' },
    { pattern: /\b(admin|administrator|moderator)\b/i, kind: 'persona' as NodeKind, title: 'Admin' },
    { pattern: /\b(notification|alert|notify)\b/i, kind: 'event' as NodeKind, title: 'Notification' },
    { pattern: /\b(search|filter|query)\b/i, kind: 'flow' as NodeKind, title: 'Search' },
    { pattern: /\b(upload|import)\b/i, kind: 'flow' as NodeKind, title: 'Upload' },
    { pattern: /\b(export|download)\b/i, kind: 'flow' as NodeKind, title: 'Export' },
    { pattern: /\b(settings|preferences|config)\b/i, kind: 'screen' as NodeKind, title: 'Settings' },
  ];

  const foundImplicit = new Set<string>();

  for (const node of graph.nodes) {
    const nodeText = node.title + ' ' + node.description;

    for (const { pattern, kind, title } of implicitConceptPatterns) {
      if (pattern.test(nodeText) && !existingTitles.has(title.toLowerCase()) && !foundImplicit.has(title)) {
        foundImplicit.add(title);
        suggestions.push({
          id: `implicit-${title.toLowerCase()}-${node.id}`,
          text: `"${node.title}" mentions "${title.toLowerCase()}" but there's no dedicated node for it — should there be?`,
          suggestedKind: kind,
          suggestedTitle: title,
          priority: 'low',
          category: 'implicit_concept',
          relatedNodeId: node.id,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Context-specific suggestions for selected node
  // ─────────────────────────────────────────────────────────────────────────
  if (selectedNodeId) {
    const selected = nodeMap.get(selectedNodeId);
    if (selected) {
      const selectedEdges = [...(outgoingEdges.get(selectedNodeId) ?? []), ...(incomingEdges.get(selectedNodeId) ?? [])];

      // Persona without usecase
      if (selected.kind === 'persona' && !selectedEdges.some(e => {
        const otherId = e.srcId === selectedNodeId ? e.dstId : e.srcId;
        return nodeMap.get(otherId)?.kind === 'usecase';
      })) {
        suggestions.unshift({
          id: `persona-usecase-${selectedNodeId}`,
          text: `What does "${selected.title}" want to accomplish with this app?`,
          suggestedKind: 'usecase',
          suggestedTitle: null,
          priority: 'high',
          category: 'missing_connection',
          relatedNodeId: selectedNodeId,
        });
      }

      // Entity without attributes described
      if (selected.kind === 'entity' && selected.description.length < 50) {
        suggestions.unshift({
          id: `entity-details-${selectedNodeId}`,
          text: `"${selected.title}" could use more detail — what properties or attributes does it have?`,
          suggestedKind: null,
          suggestedTitle: null,
          priority: 'medium',
          category: 'implicit_concept',
          relatedNodeId: selectedNodeId,
        });
      }

      // Flow without screen
      if (selected.kind === 'flow' && !selectedEdges.some(e => {
        const otherId = e.srcId === selectedNodeId ? e.dstId : e.srcId;
        return nodeMap.get(otherId)?.kind === 'screen';
      })) {
        suggestions.unshift({
          id: `flow-screen-${selectedNodeId}`,
          text: `What does the user see during "${selected.title}"?`,
          suggestedKind: 'screen',
          suggestedTitle: `${selected.title} Screen`,
          priority: 'medium',
          category: 'missing_connection',
          relatedNodeId: selectedNodeId,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sort by priority and limit
  // ─────────────────────────────────────────────────────────────────────────
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap Demo Loading
// ─────────────────────────────────────────────────────────────────────────────

export interface BootstrapResult {
  success: boolean;
  nodeCount: number;
  edgeCount: number;
  error?: string;
}

export interface BootstrapGraph {
  nodes: Array<{
    id: string;
    kind: NodeKind;
    title: string;
    description: string;
    sourceRefs: SourceRef[];
  }>;
  edges: Array<{
    id: string;
    srcId: string;
    dstId: string;
    type: EdgeType;
    label?: string;
  }>;
}

/**
 * Load the bootstrap graph from the fixture file.
 * Clears current graph and loads the Bropilot self-spec as a demo.
 */
export function loadBootstrapGraph(bootstrapData: BootstrapGraph): BootstrapResult {
  try {
    // Clear current graph
    db().exec('DELETE FROM edges');
    db().exec('DELETE FROM nodes');

    const now = Date.now();

    // Insert nodes
    for (const node of bootstrapData.nodes) {
      const sourceRefs = node.sourceRefs || [];
      db().exec(
        'INSERT INTO nodes (id, kind, title, description, source_refs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        node.id,
        node.kind,
        node.title,
        node.description,
        JSON.stringify(sourceRefs),
        now,
        now
      );
    }

    // Insert edges
    for (const edge of bootstrapData.edges) {
      db().exec(
        'INSERT INTO edges (id, src_id, dst_id, type, label) VALUES (?, ?, ?, ?, ?)',
        edge.id,
        edge.srcId,
        edge.dstId,
        edge.type,
        edge.label ?? null
      );
    }

    return {
      success: true,
      nodeCount: bootstrapData.nodes.length,
      edgeCount: bootstrapData.edges.length,
    };
  } catch (err) {
    return {
      success: false,
      nodeCount: 0,
      edgeCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
