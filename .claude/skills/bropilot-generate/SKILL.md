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
| `screen` | Astro page/route |
| `component` | Vue single-file component |
| `entity` | TypeScript interface |
| `api` | Cloudflare Workers route + typed client wrapper |
| `state` | Vue `reactive()` store |
| `flow` | Validates navigation exists |
| `constraint` | Architecture decisions |
| `requirement` | Must be implemented |
| `goal` | Documented target — surfaced in README/comments, not code |
| `hypothesis` | Documented assumption — surfaced in README/comments, not code |
| `term` | Glossary comment near the closest related type/component |

### Edge Types

```
has, uses, triggers, implements, depends_on, extends, contains, references
```

### props (kind-specific fields)

Read `node.props` before falling back to inference from description — it holds the concrete detail generation needs:

| Kind | Prop(s) | Use for |
|------|---------|---------|
| `module`, `component`, `logic` | `path`, `repo` | File location and traceability link — prefer over guessed paths |
| `api` | `method`, `route`, `repo` | HTTP method + route for both the Workers handler and client wrapper |
| `entity` | `attributes` | Interface fields — use directly instead of inferring from description |
| `relationship` | `cardinality` | Whether a reference is a single field or an array |
| `flow` | `steps` | Ordered checklist to validate navigation against |
| `requirement` | `priority` | Order implementation and flag `wont`-priority items as out of scope |
| `constraint` | `invariant` | Assertion or comment to embed near the affected code |
| `term` | `aka` | Include as a comment alias near the closest related type |

---

## Generation Rules

### 1. Directory Structure

```
src/
├── pages/                # screen nodes (Astro file-based routing)
│   ├── index.astro
│   ├── {screen-title}.astro
│   └── api/               # api nodes (Cloudflare Workers routes)
│       └── {route}.ts
├── components/           # component nodes (Vue SFCs)
│   └── {ComponentTitle}.vue
├── layouts/
│   └── Layout.astro
├── lib/
│   ├── types.ts          # entity nodes
│   ├── api.ts            # api nodes — typed client wrappers
│   └── store.ts          # state nodes — Vue reactive() singleton
└── styles/
    └── global.css
```

### 2. Screens → Astro Pages

For each `screen` node:

```astro
---
// src/pages/{kebab-title}.astro
// [screen:{node-id}] {node.title}
// {node.description}
import Layout from '../layouts/Layout.astro';
---
<Layout>
  <!-- Structure inferred from description and edges -->
</Layout>
```

Route path: `/{kebab-case(screen.title)}`

### 3. Components → Vue SFCs

For each `component` node:

```vue
<!-- src/components/{PascalTitle}.vue -->
<!-- [component:{node-id}] {node.title} -->
<script setup lang="ts">
// Props inferred from description and incoming edges
</script>

<template>
  <!-- Implementation from description -->
</template>
```

### 4. Entities → Types

For each `entity` node:

```typescript
// src/lib/types.ts
// [entity:{node-id}] {node.title}
export interface EntityName {
  id: string;
  // Fields from node.props.attributes if present, else inferred from description
  // Relationships from edges become references
}
```

### 5. APIs → Cloudflare Workers Route + Client Wrapper

For each `api` node, generate both the server route and a typed client wrapper. Prefer `node.props.method`/`node.props.route` over guessing from title/description.

```typescript
// src/pages/api/{route}.ts
// [api:{node-id}] {node.title}
import type { APIRoute } from 'astro';

export const {method}: APIRoute = async ({ request, locals }) => {
  // locals.runtime.env exposes Cloudflare bindings (D1, KV, etc.)
  return new Response(JSON.stringify({ /* ... */ }));
};
```

```typescript
// src/lib/api.ts
// [api:{node-id}] {node.title}
export async function apiName(params: ApiParams): Promise<ApiResponse> {
  const response = await fetch(/* node.props.route ?? */ '/api/endpoint', {
    method: /* node.props.method ?? */ 'POST',
    body: JSON.stringify(params),
  });
  return response.json();
}
```

### 6. State → Vue Reactive Store

For each `state` node:

```typescript
// src/lib/store.ts
// [state:{node-id}] {node.title}
import { reactive } from 'vue';

export const stateName = reactive({
  // Fields from description
});

export function mutateStateName(/* ... */) {
  // Actions inferred from description/edges
}
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
| Framework | Astro 6 + Vue 3 islands |
| Build | Astro's Vite-based build |
| Styling | Tailwind CSS v4 |
| Routing | Astro file-based routing (`src/pages/`) |
| State | Vue `reactive()` singleton store |
| API | Cloudflare Workers routes (`src/pages/api/*.ts`) + typed fetch wrappers |
| Deployment | Cloudflare Workers |

### Override via Constraints

If graph contains:
```json
{ "kind": "constraint", "title": "React", "description": "Must use React 18..." }
```

Then generate React components instead of Vue/Astro.

---

## Edge Interpretation

### `contains` → Render child

```astro
---
// screen "Dashboard" contains component "Sidebar"
import Sidebar from '../components/Sidebar.vue';
---
<div>
  <Sidebar client:load />  <!-- from contains edge -->
  ...
</div>
```

### `uses` → Import

```typescript
// component "UserCard" uses entity "User"
import type { User } from '../lib/types';
```
```vue
<script setup lang="ts">
defineProps<{ user: User }>();
</script>
```

### `implements` → Satisfies requirement

Track which `requirement` nodes are implemented. Warn if any are missing.

### `triggers` → Event handler

```vue
<!-- component "SubmitButton" triggers event "form-submitted" -->
<script setup lang="ts">
const emit = defineEmits<{ submit: [] }>();
</script>

<template>
  <button @click="emit('submit')">Submit</button>
</template>
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

**src/components/MetricCard.vue**
```vue
<!-- [component:component-metric-card] MetricCard -->
<!-- Displays a single metric with label, value, and trend indicator -->
<script setup lang="ts">
import type { Metric } from '../lib/types';

const { metric } = defineProps<{ metric: Metric }>();
const trend = metric.currentValue >= metric.previousValue ? 'up' : 'down';
const change = Math.abs(metric.currentValue - metric.previousValue);
</script>

<template>
  <div class="rounded-lg border p-4">
    <span class="text-sm text-gray-500">{{ metric.name }}</span>
    <div class="mt-1 flex items-baseline gap-2">
      <span class="text-2xl font-semibold">{{ metric.currentValue }}{{ metric.unit }}</span>
      <span :class="trend === 'up' ? 'text-green-600' : 'text-red-600'">
        {{ trend === 'up' ? '↑' : '↓' }} {{ change }}{{ metric.unit }}
      </span>
    </div>
  </div>
</template>
```

**src/pages/dashboard.astro**
```astro
---
// [screen:screen-dashboard] Dashboard
// Main view with metrics grid and sidebar navigation
import Layout from '../layouts/Layout.astro';
import MetricCard from '../components/MetricCard.vue';
// TODO: fetch metrics from API
const metrics = [];
---
<Layout>
  <div class="flex h-screen">
    <aside class="w-64 border-r">
      <!-- TODO: navigation links -->
    </aside>
    <main class="flex-1 p-6">
      <div class="grid grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <MetricCard client:load metric={metric} />
        ))}
      </div>
    </main>
  </div>
</Layout>
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
