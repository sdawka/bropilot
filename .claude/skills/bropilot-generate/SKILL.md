---
name: bropilot-generate
description: Generate or update SPA code from a Bropilot knowledge graph (spec). Use when the user wants to scaffold or modify an app from a Bropilot graph provided as JSON, Markdown, or pasted clipboard content.
---

# Bropilot Generate: Spec → Code

Generate or update SPA code from a Bropilot knowledge graph.

**Related**: Use `/bropilot-extract` to create a graph from existing code.

---

## Input

Accepts a Bropilot graph as:
- **JSON**: `{ nodes: [...], edges: [...] }`
- **Markdown**: Structured export with Basics/Problem/Solution/Crosscutting sections
- **Clipboard**: Paste directly after invoking

If no graph is provided, prompt user to paste or specify file path.

---

## Bropilot Schema (Quick Reference)

### Node Kinds → Code Artifacts

| Kind | Generated |
|------|-----------|
| `screen` | Route/page component |
| `component` | Reusable component file |
| `entity` | TypeScript interface |
| `api` | API client function |
| `state` | Store/context |
| `flow` | Validates navigation exists |
| `constraint` | Architecture decisions |
| `requirement` | Must be implemented |

### Edge Types

```
has, uses, triggers, implements, depends_on, extends, contains, references
```

---

## Generation Rules

### 1. Directory Structure

```
src/
├── routes/              # screen nodes
│   ├── index.tsx
│   └── {screen-title}.tsx
├── components/          # component nodes
│   └── {ComponentTitle}.tsx
├── lib/
│   ├── types.ts         # entity nodes
│   ├── api.ts           # api nodes
│   └── store.ts         # state nodes
├── App.tsx              # Router setup
└── main.tsx             # Entry point
```

### 2. Screens → Routes

For each `screen` node:

```typescript
// src/routes/{kebab-title}.tsx
// [screen:{node-id}] {node.title}
// {node.description}

export function ScreenName() {
  return (
    // Structure inferred from description and edges
  );
}
```

Route path: `/{kebab-case(screen.title)}`

### 3. Components

For each `component` node:

```typescript
// src/components/{PascalTitle}.tsx
// [component:{node-id}] {node.title}

interface {ComponentName}Props {
  // Inferred from description and incoming edges
}

export function ComponentName({ ...props }: {ComponentName}Props) {
  return (
    // Implementation from description
  );
}
```

### 4. Entities → Types

For each `entity` node:

```typescript
// src/lib/types.ts
// [entity:{node-id}] {node.title}
export interface EntityName {
  id: string;
  // Fields inferred from description
  // Relationships from edges become references
}
```

### 5. APIs → Client Functions

For each `api` node:

```typescript
// src/lib/api.ts
// [api:{node-id}] {node.title}
export async function apiName(params: ApiParams): Promise<ApiResponse> {
  const response = await fetch('/api/endpoint', {
    method: 'POST', // inferred from title/description
    body: JSON.stringify(params),
  });
  return response.json();
}
```

### 6. State → Stores

For each `state` node:

```typescript
// src/lib/store.ts
// [state:{node-id}] {node.title}
import { create } from 'zustand';

interface StateNameStore {
  // Fields from description
  // Actions inferred
}

export const useStateName = create<StateNameStore>((set) => ({
  // Initial state and actions
}));
```

---

## Traceability Comments

Every generated file includes comments linking to source nodes:

```typescript
// [screen:main-layout] Main Layout
// Two-column layout: chat pane + graph canvas
```

Format: `// [{kind}:{id}] {title}`

This allows:
- Finding which spec node generated which code
- Updating code when spec changes
- Detecting drift between spec and implementation

---

## Framework Defaults

Unless `constraint` or `design` nodes specify otherwise:

| Concern | Default |
|---------|---------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| Routing | React Router v6 |
| State | Zustand |
| API | fetch with typed wrappers |

### Override via Constraints

If graph contains:
```json
{ "kind": "constraint", "title": "Vue.js", "description": "Must use Vue 3..." }
```

Then generate Vue components instead.

---

## Edge Interpretation

### `contains` → Render child

```typescript
// screen "Dashboard" contains component "Sidebar"
function Dashboard() {
  return (
    <div>
      <Sidebar />  {/* from contains edge */}
      ...
    </div>
  );
}
```

### `uses` → Import

```typescript
// component "UserCard" uses entity "User"
import type { User } from '../lib/types';

function UserCard({ user }: { user: User }) { ... }
```

### `implements` → Satisfies requirement

Track which `requirement` nodes are implemented. Warn if any are missing.

### `triggers` → Event handler

```typescript
// component "SubmitButton" triggers event "form-submitted"
function SubmitButton({ onSubmit }: { onSubmit: () => void }) {
  return <button onClick={onSubmit}>Submit</button>;
}
```

---

## Validation

Before completing, verify:

- [ ] Every `screen` node → route exists
- [ ] Every `component` node → component file exists
- [ ] Every `entity` node → interface in types.ts
- [ ] Every `requirement` node → implementation found
- [ ] Every `constraint` node → architecture respects it
- [ ] Every `flow` node → can navigate through screens

Report missing implementations:

```
WARNING: Unimplemented requirements:
- [requirement:offline-mode] Offline mode — no implementation found
- [requirement:export-pdf] PDF export — no implementation found
```

---

## Modes

### Scaffold (default)

Generate complete file structure from scratch.

```
/bropilot-generate
```

### Update

Update existing files to match spec, preserving custom code.

```
/bropilot-generate --update
```

Only regenerates sections with traceability comments. Custom code outside those sections is preserved.

### Diff

Show what would change without writing files.

```
/bropilot-generate --diff
```

---

## Example

### Input Graph (excerpt)

```json
{
  "nodes": [
    { "id": "screen-dashboard", "kind": "screen", "title": "Dashboard", 
      "description": "Main view with metrics grid and sidebar navigation" },
    { "id": "component-metric-card", "kind": "component", "title": "MetricCard",
      "description": "Displays a single metric with label, value, and trend indicator" },
    { "id": "entity-metric", "kind": "entity", "title": "Metric",
      "description": "A tracked metric with name, current value, previous value, and unit" }
  ],
  "edges": [
    { "srcId": "screen-dashboard", "dstId": "component-metric-card", "type": "contains" },
    { "srcId": "component-metric-card", "dstId": "entity-metric", "type": "uses" }
  ]
}
```

### Output

**src/lib/types.ts**
```typescript
// [entity:entity-metric] Metric
// A tracked metric with name, current value, previous value, and unit
export interface Metric {
  id: string;
  name: string;
  currentValue: number;
  previousValue: number;
  unit: string;
}
```

**src/components/MetricCard.tsx**
```typescript
// [component:component-metric-card] MetricCard
// Displays a single metric with label, value, and trend indicator

import type { Metric } from '../lib/types';

interface MetricCardProps {
  metric: Metric;
}

export function MetricCard({ metric }: MetricCardProps) {
  const trend = metric.currentValue >= metric.previousValue ? 'up' : 'down';
  const change = Math.abs(metric.currentValue - metric.previousValue);
  
  return (
    <div className="rounded-lg border p-4">
      <span className="text-sm text-gray-500">{metric.name}</span>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold">
          {metric.currentValue}{metric.unit}
        </span>
        <span className={trend === 'up' ? 'text-green-600' : 'text-red-600'}>
          {trend === 'up' ? '↑' : '↓'} {change}{metric.unit}
        </span>
      </div>
    </div>
  );
}
```

**src/routes/dashboard.tsx**
```typescript
// [screen:screen-dashboard] Dashboard
// Main view with metrics grid and sidebar navigation

import { MetricCard } from '../components/MetricCard';

export function Dashboard() {
  // TODO: fetch metrics from API
  const metrics = [];
  
  return (
    <div className="flex h-screen">
      {/* Sidebar navigation */}
      <aside className="w-64 border-r">
        {/* TODO: navigation links */}
      </aside>
      
      {/* Metrics grid */}
      <main className="flex-1 p-6">
        <div className="grid grid-cols-3 gap-4">
          {metrics.map(metric => (
            <MetricCard key={metric.id} metric={metric} />
          ))}
        </div>
      </main>
    </div>
  );
}
```

---

## Usage

```
/bropilot-generate

# Paste graph when prompted, or:
/bropilot-generate ./spec.json
/bropilot-generate --framework vue
/bropilot-generate --update
/bropilot-generate --diff
```
