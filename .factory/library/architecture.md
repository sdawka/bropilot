# Architecture

## System Overview

Bropilot is an Elixir/OTP application that guides users from idea to working web app through an 8-step pipeline across 3 acts. It has an Astro web UI and a CLI interface.

## Three-Tier Authority Model

1. **Spaces** (immutable, hardcoded in `Bropilot.Spaces`): 5 knowledge domains — Problem, Solution, Work, Measurement, Knowledge. Each has required slots and gate validation.
2. **Recipes** (superuser-configurable, YAML in `.bropilot/recipe/`): Schemas, prompts, pipeline definitions. Default: `webapp` recipe with 14 schemas, 7 prompts, 8 steps.
3. **Maps** (user data, YAML in `.bropilot/map/`): Actual project data filled by the pipeline.

## Pipeline (8 Steps, 3 Acts)

```
Act 1 (Problem Space):  Step 1 (basics) → Step 2 (gory detail)
Act 2 (Solution Space): Step 3 (big picture/domain) → Step 4 (specs expansion)
Act 3 (Work Space):     Step 5 (snapshot) → Step 6 (change plan) → Step 7 (tasks) → Step 8 (codegen)
```

Space gates enforce transitions: can't advance to Act 2 until Problem Space slots are filled.

## Key Modules

| Module | Responsibility |
|--------|---------------|
| `Bropilot.Application` | OTP app. Starts Recipe.Registry always; conditionally starts Session, Bandit, Tunnel |
| `Bropilot.Spaces` | 5 hardcoded space definitions with gate validation |
| `Bropilot.Map.Store` | YAML read/write to `.bropilot/map/{space}/{slot}.yaml` |
| `Bropilot.Pipeline.Engine` | GenServer tracking pipeline position and step completion |
| `Bropilot.Pipeline.Act1.Worker` | GenServer for vibe collection (Steps 1-2) |
| `Bropilot.Pipeline.Act2.Worker` | GenServer for domain modeling (Steps 3-4) |
| `Bropilot.Pipeline.Act3.Executor` | Orchestrates snapshot→diff→tasks→feedback |
| `Bropilot.Task.Supervisor` | DynamicSupervisor with topological sort for task dispatch |
| `Bropilot.Task.Agent` | GenServer per codegen task with prompt building |
| `Bropilot.LLM` | Facade routing to OpenRouter/Anthropic/OpenAI/Mock providers |
| `Bropilot.Recipe.Registry` | GenServer loading/caching recipe definitions |
| `Bropilot.Api.Endpoint` | Plug pipeline: CORS → JSON → Auth → Router |
| `Bropilot.Api.Router` | 34 REST endpoints for the full API |
| `Bropilot.Api.Auth` | Token auth with localhost bypass |
| `Bropilot.Api.Session` | Agent holding human-readable session token |
| `Bropilot.Tunnel` | GenServer managing cloudflared Quick Tunnel |

## 11 Spec Categories (Step 4 Output)

API, Behaviours, Constraints, Entities, Modules, Events, Externals, Views, Components, Streams, Infra. Each has a `.schema.yaml` in `priv/recipes/webapp/schemas/solution/specs/`.

The `modules` spec is the central cross-reference hub — referenced by events, externals, and streams. It has a `path` field mapping directly to source files.

## Storage

All persistence is YAML files on disk in `.bropilot/`. No database. GenServers hold in-memory state for active sessions but final artifacts go to YAML.

```
.bropilot/
├── recipe/           # Copy of the active recipe
├── map/
│   ├── problem/      # Audience, vibes, assumptions, etc.
│   ├── solution/     # Vocabulary, domain, specs (11 categories)
│   ├── work/         # Versions, tasks, artifacts
│   ├── measurement/  # Validation reports
│   └── knowledge/    # Glossary, decisions, changelog, xrefs, traceability
├── spaces.lock       # Hash of space definitions
└── pipeline_state.yaml  # (NEW) Persistent pipeline position
```

## Web UI (Astro)

Located in `web/`. Uses Alpine.js for interactivity, CSS custom properties for theming. Communicates with Elixir API at localhost:4000. Pages include index, problem, solution, work, knowledge, vibe, build, connect, domain (Act 2), and traceability. ER diagram page remains pending.

## API Contract

34+ REST endpoints at `/api/*`. JSON responses follow `{ok: true, data: ...}` / `{ok: false, error: "..."}` pattern. Auth via Bearer token (localhost bypassed). Traceability routes are scoped at `/api/traceability` (not `/api/projects/:path/...`).

## Data Flow

```
User Input → Act1.Worker → .bropilot/map/problem/ (YAML)
           → Act2.Worker → .bropilot/map/solution/ (YAML)
           → Act3.Executor → .bropilot/map/work/versions/ (YAML)
           → Feedback → .bropilot/map/knowledge/ (YAML)
```

## Invariants

- Spaces are immutable — never modify `Bropilot.Spaces`
- Gate validation before crossing space boundaries
- YAML is the single storage format (abstraction layer wraps, doesn't replace)
- Recipe defines what data is collected; Spaces define what domains exist
- API responses always include `ok` boolean field
