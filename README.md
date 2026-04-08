# Bropilot

An app that makes apps. Bropilot guides you from a rough idea to a working web application through a two-phase, LLM-powered pipeline: freeform **exploration** of the problem and solution space, a deliberate **commitment gate**, then supervised coding agents that produce real artifacts.

## Architecture

The system has two runtime components:

- **Elixir backend** (port 4000) — Bandit/Plug HTTP API, OTP supervision trees, pipeline engine, LLM orchestration, YAML-based storage
- **Astro frontend** (port 3200) — Alpine.js interactive pages, Mermaid diagrams, deployed to Cloudflare Pages

### Three-Tier Authority Model

- **Spaces** (immutable) — 5 hardcoded knowledge domains every project must fill
- **Recipes** (superuser) — configurable schemas, prompts, and lenses
- **Maps** (user) — the actual data you provide and the system generates

### The Pipeline

```
EXPLORATION PHASE                      COMMIT GATE          WORK PHASE
+-------------------------------+                           +-------------------+
| Freeform conversation fills   |                           | #1 Snapshot       |
| Problem and Solution slots    |  --->  validate_gate ---> | #2 Change plan    |
| concurrently via extraction   |  Problem + Solution       | #3 Task generation|
| across optional "lenses"      |                           | #4 Codegen agents |
+-------------------------------+                           +-------------------+
  Problem + Solution spaces         single deliberate gate    Work space

                       Measurement and Knowledge spaces
                       accumulate automatically throughout
```

**5 Spaces**: Problem, Solution, Work, Measurement, Knowledge.

- **Problem + Solution** are explored concurrently in freeform conversation. No gate between them — the act of sketching a solution naturally refines your understanding of the problem, and vice versa.
- **Commit gate** validates that both Problem and Solution slots are sufficiently filled before any resources are spent on building.
- **Work** is sequential (snapshot → changes → tasks → codegen) and unchanged by the commit.
- **Measurement** is cross-cutting and accumulates automatically as Work produces artifacts (test results, validation).
- **Knowledge** is cross-cutting and derives from Measurement + Solution hypotheses (glossary, decisions, changelog, cross-references).

## Getting Started

Prerequisites: Elixir 1.19+/OTP 27+, Node.js 22+.

```bash
# Install dependencies
mix deps.get
cd web && npm install && cd ..

# Set an LLM provider key (at least one)
export OPENROUTER_API_KEY=YOUR_API_KEY_HERE

# Initialize a project
mkdir my-app && cd my-app
mix bro.init

# Start the server and drive exploration through the web UI or the API
mix bro.server
```

Then either visit `http://localhost:4000` (served by the Astro frontend — run `cd web && npm run dev` in another terminal) or drive the pipeline directly via HTTP:

```bash
# Start an exploration session
curl -X POST http://localhost:4000/api/explore/start -d '{"mode":"mock"}'

# Submit freeform messages that describe your idea
curl -X POST http://localhost:4000/api/explore/message \
  -H 'content-type: application/json' \
  -d '{"text":"I want to build a focus tool for ADHD developers"}'

# Trigger extraction across both spaces
curl -X POST http://localhost:4000/api/explore/extract

# See what's filled
curl http://localhost:4000/api/explore/readiness

# Commit when ready — transitions to the Work phase
curl -X POST http://localhost:4000/api/explore/commit

# Walk through work steps
curl -X POST http://localhost:4000/api/pipeline/advance
```

## Development

```bash
# Start the API server
mix bro.server

# Start the Astro dev server
cd web && npm run dev

# Run Elixir tests (636 tests)
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
# |  Token:   <pairing-code>                          |
# |  Remote:  https://abc.trycloudflare.com          |
# +--------------------------------------------------+
```

- **Local**: `localhost:4000` — no token needed
- **Remote**: Cloudflare Quick Tunnel with auto-generated pairing code
- **Phone**: Scan QR code or enter token in the connect screen

## CLI Commands

| Command | Description |
|---------|-------------|
| `mix bro.init` | Initialize a `.bropilot/` project in the current directory |
| `mix bro.status` | Show pipeline phase and space fill status |
| `mix bro.snapshot` | Create a versioned snapshot of current specs |
| `mix bro.plan` | Generate change plan from latest snapshot |
| `mix bro.tasks` | Generate work tasks from changes |
| `mix bro.build` | Dispatch supervised coding agents |
| `mix bro.server` | Start the HTTP API server |
| `mix bro.web` | Build or dev the Astro frontend |
| `mix bro.recipe` | Manage recipes (list, install, publish) |
| `mix bro.demo` | Generate the self-referential demo project |

Exploration happens through `mix bro.server` + the `/api/explore/*` endpoints (or the `/vibe` and `/domain` UI pages), not a separate CLI task.

## API Endpoints

### Exploration phase
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/explore/start` | Start a session (`{mode: "mock"\|"llm"}`) |
| POST | `/api/explore/message` | Submit a conversation message |
| POST | `/api/explore/buffer` | Append to an additive STT/text buffer |
| POST | `/api/explore/extract` | Run extraction across both spaces |
| GET  | `/api/explore/readiness` | Slot fill status for Problem + Solution |
| GET  | `/api/explore/lenses` | Optional UI lens prompts from the recipe |
| POST | `/api/explore/auto` | Toggle auto-extraction after each message |
| POST | `/api/explore/commit` | The single commitment gate |

### Work phase
| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/pipeline/status` | Current phase + step statuses |
| POST | `/api/pipeline/advance` | Advance to the next work step |
| POST | `/api/snapshot` | Create a version snapshot |
| POST | `/api/plan` | Generate a change plan |
| POST | `/api/tasks` | Generate work tasks |
| POST | `/api/build` | Execute codegen agents |

## LLM Providers

| Priority | Env Var | Provider |
|----------|---------|----------|
| 1 | `OPENROUTER_API_KEY` | OpenRouter (recommended — access to all models) |
| 2 | `ANTHROPIC_API_KEY` | Anthropic Claude |
| 3 | `OPENAI_API_KEY` | OpenAI |
| — | *(none)* | Mock (works offline, returns placeholder data) |

## Project Structure

```
lib/bropilot/
  api/                  # Plug router, auth, session, pairing
    handlers/           # Route handlers: explore, pipeline, work, knowledge, traceability, project
  cli/                  # Mix task helpers
  codegen/              # File writer, Pi agent backend
  crud/                 # Generic CRUD operations (Elixir)
  generator/            # Code generator: TS types, Hono routes, D1 migrations, test stubs
  llm/                  # LLM client abstraction (OpenRouter, Anthropic, OpenAI, Mock)
  map/                  # Map store (YAML read/write for user data)
  pi/                   # Agent pool: Pool, Port, Protocol
  pipeline/
    exploration/        # Unified exploration worker + extractor coordinator
    act1/extractor.ex   # Pure-function Problem-space extractors (reused)
    act2/extractor.ex   # Pure-function Solution-space extractors (reused)
    act3/               # Snapshot, diff, task generation, executor
    engine.ex           # Phase-based state machine (:exploration | :work | :complete)
  recipe/               # Recipe registry, schema validation, install/publish
  spaces/               # 5 Spaces model and commitment gate logic
  state/                # State behaviour: GenServer (local), Durable Objects (cloud interface)
  storage/              # Storage behaviour: FileStorage (local), CloudStorage (cloud interface)
  traceability/         # Spec-to-code linkage: auto-linker, writer
  config.ex             # Backend selection (BROPILOT_BACKEND=local|cloud)
  tunnel.ex             # Cloudflare Quick Tunnel management
  qr.ex                 # QR code generation for pairing

packages/
  api-types/            # @bropilot/api-types — Zod schemas and TS types for all API endpoints
  crud/                 # @bropilot/crud — Hono-compatible CRUD library (D1-ready)

web/
  src/
    pages/              # Astro pages
      index.astro       # Dashboard
      vibe.astro        # Problem-focused exploration lens
      domain.astro      # Solution-focused exploration lens
      problem.astro     # Problem space viewer
      solution.astro    # Solution space viewer
      er.astro          # ER diagram visualization (Mermaid)
      build.astro       # Work phase / code generation
      traceability.astro # Spec-to-code linkage matrix
      work.astro        # Work space viewer
      knowledge.astro   # Knowledge space viewer
      connect.astro     # Remote pairing screen
    components/         # Shared Astro/Alpine components
    lib/                # Frontend utilities and API client
    styles/             # Global styles

test/                   # 636 ExUnit tests (unit, integration, e2e, cross-flow)
web/__tests__/          # Vitest tests (component and frontend logic)
docs/
  ARCHITECTURE.md       # Detailed architecture documentation
  GETTING_STARTED.md    # Prerequisites and first project walkthrough
```

## Key Modules

### Exploration Worker

`Bropilot.Pipeline.Exploration.Worker` (GenServer) holds the conversation history and an additive buffer, and delegates to `Bropilot.Pipeline.Exploration.Extractor` which coordinates the existing Act1/Act2 pure-function extractors. One worker feeds both Problem and Solution slots — the `/vibe` and `/domain` UI pages are two different lenses into the same session.

### Commitment Gate

`Bropilot.Spaces.validate_commitment_gate/1` is the single gate between exploration and work. It validates that all required Problem and Solution slots exist on disk, and returns a structured error listing which slots in each space are missing. Called by `Engine.commit/1`, which transitions `:exploration → :work`.

### Spec-to-Code Traceability

Links between spec items (across 11 categories: entities, api, behaviours, constraints, modules, events, views, components, streams, externals, infra) and generated code artifacts. Links are stored in `map/knowledge/traceability.yaml` and auto-populated during codegen. The traceability page shows a matrix view with clickable navigation to GitHub file URLs.

### ER Diagram Visualization

The `/er` page renders entities and relationships from the Solution Space domain model as an interactive Mermaid ER diagram. Clicking an entity shows its attributes, relationships, related constraints, and traceability links.

### CRUD Library and Generator

- **Elixir CRUD** (`lib/bropilot/crud/`) — generic read/write/list/delete over the map store with schema validation, filtering, and pagination
- **TypeScript CRUD** (`packages/crud/`) — Hono-compatible, D1-ready prepared statements, Zod validation
- **Generator** (`lib/bropilot/generator/`) — takes Solution Space entity specs and produces TypeScript type definitions, Hono route handlers, D1 migration SQL, and test stubs

### Backend Abstraction

Storage and State behaviours enable dual-backend support. Set `BROPILOT_BACKEND=local` (default) for the current YAML/GenServer implementation, or `BROPILOT_BACKEND=cloud` for the Cloudflare Workers interface (D1/KV storage, Durable Objects state).

### Recipe System

Recipes define the schema, prompts, lenses, and work steps for a project type. The default `webapp` recipe uses the new two-phase format (`phases: [exploration, work]`) with exploration lenses and work steps. The registry supports both the new format and the legacy `acts:` format for backward compatibility.

```bash
mix bro.recipe list
mix bro.recipe publish ./my-recipe
mix bro.recipe install ./my-recipe.tar.gz
```

## Documentation

- [Getting Started](docs/GETTING_STARTED.md) — prerequisites, installation, first project walkthrough
- [Architecture](docs/ARCHITECTURE.md) — three-tier model, 5 Spaces, exploration/commit/work phases, OTP supervision, deployment patterns

## License

See [LICENSE](LICENSE) for details.
