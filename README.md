# Bropilot

An app that makes apps. Bropilot guides you from a rough idea to a working web application through a structured, LLM-powered pipeline. It walks through deliberate steps -- collecting vibes, building a shared vocabulary, expanding specs, and dispatching supervised coding agents to produce real artifacts.

## Architecture

The system has two runtime components:

- **Elixir backend** (port 4000) -- Bandit/Plug HTTP API, OTP supervision trees, pipeline engine, LLM orchestration, YAML-based storage
- **Astro frontend** (port 3200) -- Alpine.js interactive pages, Mermaid diagrams, deployed to Cloudflare Pages

### Three-Tier Authority Model

- **Spaces** (immutable) -- 5 hardcoded knowledge domains every project must fill
- **Recipes** (superuser) -- configurable schemas, prompts, and pipeline definitions
- **Maps** (user) -- the actual data you provide and the system generates

### The Pipeline

```
Act 1: Vibe Collection          Act 2: Common Language           Act 3: Build
+-----------------------+  +------------------------------+  +-------------------------+
| #1 The basics         |  | #3 Domain model              |  | #5 Snapshot             |
| #2 Messy detail       |--| #4 Spec expansion (11 types) |--| #6 Change plan          |
|                       |  |                              |  | #7 Task generation      |
|                       |  |                              |  | #8 Codegen agents       |
+-----------------------+  +------------------------------+  +-------------------------+
     Problem Space            Solution Space               Work / Measurement / Knowledge
```

**5 Spaces** gate every transition: Problem, Solution, Work, Measurement, and Knowledge. You cannot advance to Act 2 until the Problem Space slots are filled. The Knowledge Space is cross-cutting -- it accumulates a glossary, decisions, and changelog throughout.

## Getting Started

Prerequisites: Elixir 1.19+/OTP 27+, Node.js 22+.

```bash
# Install dependencies
mix deps.get
cd web && npm install && cd ..

# Set an LLM provider key (at least one)
export OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Initialize a project and start building
mkdir my-app && cd my-app
mix bro.init
mix bro.vibe        # conversational intake (Act 1)
mix bro.status      # see pipeline progress
mix bro.build       # run codegen agents (Act 3)
```

## Development

```bash
# Start the API server
mix bro.server

# Start the Astro dev server
cd web && npm run dev

# Run Elixir tests
mix test

# Run frontend tests
cd web && npx vitest run

# Run TypeScript package tests
cd packages/crud && npx vitest run
cd packages/api-types && npx vitest run

# Build the Astro frontend
cd web && npm run build
```

## Web UI and Remote Access

```bash
mix bro.server

# +--------------------------------------------------+
# |  Bropilot Server                                 |
# |  Local:   http://localhost:4000                  |
# |  Token:   falcon-3817                            |
# |  Remote:  https://abc.trycloudflare.com          |
# +--------------------------------------------------+
```

- **Local**: `localhost:4000` -- no token needed
- **Remote**: Cloudflare Quick Tunnel with auto-generated pairing code
- **Phone**: Scan QR code or enter token in the connect screen

## CLI Commands

| Command | Description |
|---------|-------------|
| `mix bro.init` | Initialize a `.bropilot/` project in the current directory |
| `mix bro.status` | Show pipeline progress and space fill status |
| `mix bro.vibe` | Interactive vibe collection (Act 1) |
| `mix bro.snapshot` | Create a versioned snapshot of current specs |
| `mix bro.plan` | Generate change plan from latest snapshot |
| `mix bro.tasks` | Generate work tasks from changes |
| `mix bro.build` | Dispatch supervised coding agents |
| `mix bro.server` | Start the HTTP API server |
| `mix bro.recipe` | Manage recipes (list, install, publish) |
| `mix bro.demo` | Generate the self-referential demo project |

## LLM Providers

| Priority | Env Var | Provider |
|----------|---------|----------|
| 1 | `OPENROUTER_API_KEY` | OpenRouter (recommended -- access to all models) |
| 2 | `ANTHROPIC_API_KEY` | Anthropic Claude |
| 3 | `OPENAI_API_KEY` | OpenAI |
| -- | *(none)* | Mock (works offline, returns placeholder data) |

## Project Structure

```
lib/bropilot/
  api/                  # Plug router, auth, session, pairing
    handlers/           # Route handlers: vibe, domain, pipeline, work, knowledge, traceability, project
  cli/                  # Mix task helpers
  codegen/              # File writer, Pi agent backend
  crud/                 # Generic CRUD operations (Elixir)
  generator/            # Code generator: TS types, Hono routes, D1 migrations, test stubs
  llm/                  # LLM client abstraction (OpenRouter, Anthropic, OpenAI, Mock)
  map/                  # Map store (YAML read/write for user data)
  pi/                   # Agent pool: Pool, Port, Protocol
  pipeline/
    act1/               # Vibe collection workers and extractors
    act2/               # Domain modeling workers and extractors
    act3/               # Snapshot, diff, task generation, executor
    engine.ex           # Pipeline state machine with persistent YAML state
  recipe/               # Recipe registry, schema validation, install/publish
  spaces/               # 5 Spaces model and gate logic
  state/                # State behaviour: GenServer (local), Durable Objects (cloud interface)
  storage/              # Storage behaviour: FileStorage (local), CloudStorage (cloud interface)
  traceability/         # Spec-to-code linkage: auto-linker, writer
  config.ex             # Backend selection (BROPILOT_BACKEND=local|cloud)
  storage.ex            # Storage behaviour definition
  state.ex              # State behaviour definition
  traceability.ex       # Traceability data model and API
  tunnel.ex             # Cloudflare Quick Tunnel management
  qr.ex                 # QR code generation for pairing

packages/
  api-types/            # @bropilot/api-types -- Zod schemas and TS types for all API endpoints
  crud/                 # @bropilot/crud -- Hono-compatible CRUD library (D1-ready)

web/
  src/
    pages/              # Astro pages
      index.astro       # Dashboard
      vibe.astro        # Act 1 vibe collection
      domain.astro      # Act 2 domain modeling
      er.astro          # ER diagram visualization (Mermaid)
      build.astro       # Act 3 code generation
      traceability.astro # Spec-to-code linkage matrix
      solution.astro    # Solution space viewer
      problem.astro     # Problem space viewer
      work.astro        # Work space viewer
      knowledge.astro   # Knowledge space viewer
      connect.astro     # Remote pairing screen
    components/         # Shared Astro/Alpine components
    lib/                # Frontend utilities and API client
    styles/             # Global styles

test/                   # 694 ExUnit tests (unit, integration, e2e, cross-flow)
web/__tests__/          # 54 Vitest tests (component and frontend logic)
docs/
  ARCHITECTURE.md       # Detailed architecture documentation
  GETTING_STARTED.md    # Prerequisites and first project walkthrough
```

## Key Modules

### Spec-to-Code Traceability

Links between spec items (across all 11 categories: entities, api, behaviours, constraints, modules, events, views, components, streams, externals, infra) and generated code artifacts. Links are stored in `map/knowledge/traceability.yaml` and auto-populated during codegen. The traceability page shows a matrix view with clickable navigation to GitHub file URLs.

### ER Diagram Visualization

The `/er` page renders entities and relationships from the Solution Space domain model as an interactive Mermaid ER diagram. Clicking an entity shows its attributes, relationships, related constraints, and traceability links.

### CRUD Library and Generator

- **Elixir CRUD** (`lib/bropilot/crud/`) -- generic read/write/list/delete over the map store with schema validation, filtering, and pagination
- **TypeScript CRUD** (`packages/crud/`) -- Hono-compatible, D1-ready prepared statements, Zod validation
- **Generator** (`lib/bropilot/generator/`) -- takes Act 2 entity specs and produces TypeScript type definitions, Hono route handlers, D1 migration SQL, and test stubs

### Backend Abstraction

Storage and State behaviours enable dual-backend support. Set `BROPILOT_BACKEND=local` (default) for the current YAML/GenServer implementation, or `BROPILOT_BACKEND=cloud` for the Cloudflare Workers interface (D1/KV storage, Durable Objects state).

### Recipe System

Recipes define the schema, prompts, and pipeline for a project type. The default `webapp` recipe includes 14 schemas, 7 prompt templates, and validation rules.

```bash
mix bro.recipe list
mix bro.recipe publish ./my-recipe
mix bro.recipe install ./my-recipe.tar.gz
```

## Documentation

- [Getting Started](docs/GETTING_STARTED.md) -- prerequisites, installation, first project walkthrough
- [Architecture](docs/ARCHITECTURE.md) -- three-tier model, 5 Spaces, 8-step pipeline, OTP supervision, deployment patterns

## License

See [LICENSE](LICENSE) for details.
