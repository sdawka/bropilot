# CLAUDE.md

This file provides guidance to Claude Code when working on the Bropilot codebase.

## Commands

```bash
npm run setup                          # install + build SPA (once after clone)
npm run dev:mock                       # backend + built SPA at :3583, zero API keys
npm run dev                            # live mode (needs .env, see .env.example)
npm run dev:web                        # Vite hot-reload UI at :5173 (alongside one of the above)
npm test                               # full suite; e2e tests spawn their own mock servers
npx vitest run test/genome.test.ts     # single file
npx vitest run -t "auto-apply"         # single test by name
npm run typecheck
npx flue docs read <page>              # offline Flue docs matched to the pinned version
```

Mock mode (`BROPILOT_MOCK=1`) runs the entire pipeline against `fixtures/<scenario>/script.json` — always develop and test against it first; no API key is ever required for tests.

## Architecture

### Core Components

```
src/
├── app.ts                     # Hono server, CORS, mounts Flue at /
├── agents/
│   └── explorer.ts            # Main conversational agent
├── workflows/
│   └── process-input.ts       # Multi-stage input processing pipeline
├── engine/
│   └── input-processor.ts     # Intent classification, entity resolution, planning
└── genome/
    ├── types.ts               # Node kinds, edge types, Space enum
    ├── tools.ts               # Agent tools (20+ tools, see Tools Reference)
    ├── store.ts               # SQLite persistence, undo/redo, snapshots
    ├── validation.ts          # 12 validation rules (errors/warnings/suggestions)
    └── prompt.ts              # System prompt for explorer agent

web/src/
├── App.svelte                 # Layout: header + chat + graph + keyboard handling
├── components/
│   ├── ChatPane.svelte        # Message list + input
│   ├── GraphCanvas.svelte     # xyflow with dagre layout + undo/redo controls
│   ├── GraphNode.svelte       # Custom node renderer
│   ├── NodeInspector.svelte   # Selected node detail panel
│   └── KeyboardHelp.svelte    # Keyboard shortcuts modal
└── lib/
    ├── api.svelte.ts          # SSE streaming, message sending
    ├── stores.svelte.ts       # Svelte 5 $state (incl. undo/redo state)
    └── types.ts               # Graph types (mirrored from backend)
```

### Data Flow

1. User types in ChatPane -> `sendMessage()` POSTs to `/agents/explorer/{sessionId}`
2. Flue streams SSE events (text_delta, tool_start, tool_call)
3. `handleFlueEvent()` updates `streamState` and triggers graph refresh on mutations
4. GraphCanvas recomputes layout via dagre when `appState.graph` changes

### Input Processing Pipeline

For complex inputs (3+ entities, bulk updates, restructuring), the `process-input` workflow handles multi-stage processing:

1. **Intent Classification** — determine what the user wants (add/update/delete/clarify/question)
2. **Entity Resolution** — match mentioned entities to existing nodes (exact/fuzzy/semantic)
3. **Change Planning** — generate atomic graph operations with reasons
4. **Validation** — check for conflicts and completeness against 12 rules
5. **Execution** — apply changes atomically with change tracking

Files: `src/workflows/process-input.ts`, `src/engine/input-processor.ts`

The explorer agent uses `process_complex_input` tool for complex inputs, direct tools (`add_node`, etc.) for simple single-node operations.

### Validation System

12 validation rules in `src/genome/validation.ts`:

**Errors (block save/commit):**
- `no-duplicate-singular` — can't have multiple 'name' or 'purpose' nodes
- `edge-references-valid` — edges must reference existing nodes
- `no-self-reference` — node can't edge to itself

**Warnings (show in UI):**
- `orphan-nodes` — nodes with no connections
- `usecase-needs-persona` — usecases should connect to a persona
- `flow-needs-usecase` — flows should connect to a usecase
- `entity-needs-relationship` — entities should have relationships
- `missing-source-ref` — nodes without traceability

**Suggestions (helpful hints):**
- `empty-basics` — no name or purpose defined
- `no-assumptions` — no assumptions captured
- `solution-before-problem` — solution nodes exist but problem space sparse
- `unbalanced-graph` — one space has 10x more nodes than another

### Change Tracking (Undo/Redo)

All graph mutations are recorded in the `changes` table with before/after state. The `undo`/`redo` tools traverse this history.

- Changes record: `action`, `targetId`, `beforeState`, `afterState`, `timestamp`, `undone` flag
- Undo reverses the operation (delete→re-insert, update→restore previous)
- Redo re-applies the original operation
- Change history queryable by turn for auditing

### Key Constraints

**Flue Discovery**
- Only files directly in `src/agents/` and `src/workflows/` become agents/workflows
- Supporting code must live in `src/engine/` or similar—Flue will try to mount anything in those folders

**Cloudflare Durable Objects**
- The genome store uses `getCloudflareContext().storage.sql` for SQLite
- Schema lives in `store.ts initSchema()`—no separate migration files currently
- Two DO classes: `FlueRegistry` (Flue internals) and `FlueExplorerAgent` (our sessions)

**SSE Format**
- Flue sends `event: data` followed by `data: {json}` or `data: [{json}, ...]`
- Event types: `text_delta` (streaming text), `tool_start`, `tool_call` (with result)
- Always handle both single-object and array payloads

**Types Must Stay in Sync**
- `src/genome/types.ts` defines the authoritative node kinds and edge types
- `web/src/lib/types.ts` mirrors these for the frontend
- `src/genome/prompt.ts` generates the system prompt from types.ts
- When adding node kinds, update all three

## How to Add a New Node Kind

1. **Add to types.ts**:
   ```typescript
   // src/genome/types.ts
   export const NODE_KINDS = {
     // ... existing kinds ...
     newkind: { space: 'solution' as Space },  // pick appropriate space
   } as const;
   ```

2. **Mirror in frontend**:
   ```typescript
   // web/src/lib/types.ts
   export type NodeKind = 
     | /* existing */ 
     | 'newkind';
   
   export const KIND_TO_SPACE: Record<NodeKind, Space> = {
     // ... existing ...
     newkind: 'solution',
   };
   ```

3. **Rebuild**: The system prompt auto-generates from NODE_KINDS, so no prompt changes needed.

## How to Add a New Tool

1. **Define in tools.ts**:
   ```typescript
   // src/genome/tools.ts
   defineTool({
     name: 'new_tool',
     description: 'What this tool does',
     parameters: {
       type: 'object',
       properties: {
         param1: { type: 'string', description: '...' },
       },
       required: ['param1'],
     },
     execute: async ({ param1 }: { param1: string }) => {
       // Implementation
       return JSON.stringify({ result: '...' });
     },
   }),
   ```

2. **Add to graphTools array** in the same file.

3. **Handle in frontend** (if tool output affects UI):
   ```typescript
   // web/src/lib/api.svelte.ts in handleFlueEvent()
   if (name === 'new_tool' && lastCall.output) {
     // Update state as needed
   }
   ```

## How to Add a New Edge Type

1. **Add to EDGE_TYPES**:
   ```typescript
   // src/genome/types.ts
   export const EDGE_TYPES = [
     // ... existing ...
     'new_relation',
   ] as const;
   ```

2. **Mirror in frontend**:
   ```typescript
   // web/src/lib/types.ts
   export type EdgeType = /* existing */ | 'new_relation';
   ```

## How to Add a Validation Rule

1. **Define the rule** in `src/genome/validation.ts`:
   ```typescript
   const myNewRule: ValidationRule = {
     id: 'my-new-rule',
     description: 'What this rule checks',
     severity: 'warning', // 'error' | 'warning' | 'suggestion'
     check: (graph) => {
       const issues: ValidationIssue[] = [];
       // ... check logic ...
       return issues;
     },
   };
   ```

2. **Add to validationRules array** in the same file.

## Tools Reference

### Graph Query Tools

| Tool | Description |
|------|-------------|
| `get_graph` | Get entire graph (all nodes and edges) |
| `search_nodes` | Search nodes by text query with kind/space filters |
| `get_node_context` | Get a node with all 1-hop neighbors |
| `find_related_nodes` | Find semantically related nodes |
| `get_graph_summary` | High-level overview (counts by kind/space, titles) |

### Graph Mutation Tools

| Tool | Description |
|------|-------------|
| `add_node` | Add a new node (requires sourceExcerpt for traceability) |
| `update_node` | Update an existing node |
| `delete_node` | Delete a node and its edges |
| `add_edge` | Connect two nodes |
| `delete_edge` | Remove an edge |

### Validation & Quality Tools

| Tool | Description |
|------|-------------|
| `validate_graph` | Run 12 validation rules, get errors/warnings/suggestions |
| `get_completeness` | Get completeness score per space with suggestions |
| `get_suggestions` | Context-aware suggestions (orphans, missing flows, implicit concepts) |

### Change Tracking Tools

| Tool | Description |
|------|-------------|
| `undo` | Undo the most recent graph change |
| `redo` | Redo the most recently undone change |
| `get_change_history` | Get history of changes (optionally by turn) |

### Snapshot Tools

| Tool | Description |
|------|-------------|
| `create_snapshot` | Save a named snapshot of current state |
| `list_snapshots` | List all saved snapshots |
| `restore_snapshot` | Restore graph to a snapshot state |
| `diff_snapshot` | Compare current state with a snapshot |
| `export_markdown` | Export graph as structured markdown |

### Advanced Tools

| Tool | Description |
|------|-------------|
| `process_complex_input` | Run input through multi-stage pipeline (intent → resolution → planning → validation → execution) |
| `load_bootstrap` | Load Bropilot self-spec as demo (52 nodes, 58 edges) |

## Testing

Tests use Vitest. E2E tests spawn their own servers with isolated ports/DBs.

```bash
npm test                               # full suite
npx vitest run test/genome.test.ts     # single file
npx vitest run -t "auto-apply"         # single test by name
```

- Mock `getCloudflareContext()` for store tests
- Test tools in isolation by calling `execute()` directly
- E2E tests (`test/e2e-*.test.ts`) spawn `npx flue dev` with isolated `FLUE_DB`, `BROPILOT_DB`

## Common Patterns

### Reading the Graph
```typescript
const { nodes, edges } = store.getGraph();
```

### Adding with Source Reference
```typescript
store.addNode(kind, title, description, [
  { turnId: 'current', excerpt: 'user said this' }
]);
```

### Frontend State Updates
```typescript
// Use the stores
import { setGraph, addMessage, selectNode, setChangeHistory, setUndoState } from './lib/stores.svelte.js';

setGraph(newGraph);                    // Replace entire graph
selectNode(nodeId);                    // Set selection
setChangeHistory(changes);             // Update change history (triggers canUndo/canRedo)
setUndoState(true, false);             // Manually set undo/redo availability
```

### Validation in Components
```typescript
import { validateGraph } from '../genome/validation.js';
import { setValidationResult } from './lib/stores.svelte.js';

const result = validateGraph(graph);
setValidationResult(result);
// UI shows errors/warnings/suggestions with node highlighting
```

## Deployment

```bash
# Ensure wrangler.jsonc has your account settings
npm run deploy
```

The deploy:
1. Builds Flue for Cloudflare target
2. Runs `wrangler deploy` with the config

Secrets should be set via Wrangler:
```bash
wrangler secret put OPENROUTER_API_KEY
```
