# Getting Started with Bropilot

This guide walks you through setting up Bropilot and generating your first project.

---

## Prerequisites

- **Elixir** 1.19+ and Erlang/OTP 27+ ([install guide](https://elixir-lang.org/install.html))
- **Node.js** 20+ (for the Astro web UI, optional)
- An **OpenRouter API key** ([get one here](https://openrouter.ai/keys))

## 1. Clone the Repository

```bash
git clone https://github.com/bropilot/bropilot.git
cd bropilot
```

## 2. Install Dependencies

```bash
mix deps.get
```

## 3. Set Your API Key

Bropilot uses [OpenRouter](https://openrouter.ai) as the recommended LLM provider. OpenRouter gives you access to Claude, GPT-4o, Gemini, and dozens of other models through a single API key.

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

> **Alternative providers**: You can also use `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` directly. Bropilot auto-detects which provider to use based on which key is set. See [LLM Integration](./ARCHITECTURE.md#llm-integration) for the full priority order.

## 4. Initialize a New Project

Navigate to your project directory (or create a new one) and run:

```bash
mkdir my-app && cd my-app
mix bro.init
```

This creates the `.bropilot/` directory with:
- `spaces.lock` — The immutable space contracts
- `recipe/` — The default `webapp` recipe (pipeline, prompts, schemas)
- `map/` — Empty directories for each space, ready to be filled

## 5. Explore Problem and Solution

Exploration happens through the HTTP API (and the web UI). Start the server:

```bash
mix bro.server
```

Then drive a session from another terminal or the web UI. Problem and Solution slots fill concurrently through freeform conversation — there's no forced order.

```bash
# Start the exploration worker (mock mode needs no LLM key)
curl -X POST http://localhost:4000/api/explore/start \
  -H 'content-type: application/json' \
  -d '{"mode":"mock"}'

# Send a freeform message describing your idea
curl -X POST http://localhost:4000/api/explore/message \
  -H 'content-type: application/json' \
  -d '{"text":"I want to build a focus tool for ADHD developers who lose hyperfocus to notification interrupts"}'

# Run extraction across both Problem and Solution spaces
curl -X POST http://localhost:4000/api/explore/extract

# See what got filled
curl http://localhost:4000/api/explore/readiness
```

Keep sending messages and extracting until readiness shows both Problem and Solution slots are sufficiently filled. The recipe exposes optional **lenses** (suggested conversation prompts like "The App Basics", "The Big Picture", "The Gory Detail Specs") via `GET /api/explore/lenses` — you can use them as guides, but they're not a forced sequence.

## 6. Commit to Build

When you're satisfied with the exploration, trigger the commitment gate:

```bash
curl -X POST http://localhost:4000/api/explore/commit
```

- **Success (200)**: Both Problem and Solution slots passed validation. The pipeline transitions to the Work phase.
- **Failure (422)**: The response includes a structured list of which slots in each space are still unfilled. Go back to exploration, fill the gaps, and retry.

## 7. Run the Work Phase

Once committed, walk through the work steps sequentially:

```bash
# Each call advances to the next work step
curl -X POST http://localhost:4000/api/pipeline/advance
```

The work phase runs four steps:
- **Snapshot**: Version snapshot of the Problem + Solution state
- **Changes**: Change detection against the previous version
- **Tasks**: Task generation with dependency ordering
- **Codegen**: Supervised coding agents execute each task

You can also invoke the work steps directly:

```bash
mix bro.snapshot   # or POST /api/snapshot
mix bro.plan       # or POST /api/plan
mix bro.tasks      # or POST /api/tasks
mix bro.build      # or POST /api/build
```

## 8. Start the Web UI (Optional)

Bropilot includes an Astro-based web dashboard with pages for both exploration lenses and every space:

```bash
# Terminal 1: Start the Elixir API server
mix bro.server

# Terminal 2: Start the Astro dev server
mix bro.web dev
```

Visit **http://localhost:4321** for the Astro UI, which talks to the Elixir API at **http://localhost:4000**. Key pages:

- `/vibe` — Problem-focused exploration lens
- `/domain` — Solution-focused exploration lens (shares the same session as `/vibe`)
- `/problem`, `/solution`, `/work`, `/knowledge` — Space viewers
- `/er` — Interactive Mermaid ER diagram of the Solution domain
- `/traceability` — Spec-to-code linkage matrix

## 9. Check Status

At any point, check the pipeline status:

```bash
mix bro.status
```

---

## Common Commands

| Command | Description |
|---------|-------------|
| `mix bro.init` | Initialize a new project with `.bropilot/` directory |
| `mix bro.server` | Start the HTTP API server (drives exploration via `/api/explore/*`) |
| `mix bro.status` | Show current pipeline phase and space fill status |
| `mix bro.plan` | Generate a change plan from the latest snapshot |
| `mix bro.tasks` | List generated tasks and their status |
| `mix bro.snapshot` | Take a version snapshot |
| `mix bro.build` | Run the build step |
| `mix bro.web dev` | Start Astro dev server |
| `mix bro.web build` | Build the Astro site for production |
| `mix bro.web deploy` | Deploy Astro site to Cloudflare Pages |
| `mix bro.recipe install <name>` | Install a recipe |
| `mix bro.recipe publish` | Publish the current recipe |

---

## Project Structure After Init

```
my-app/
├── .bropilot/
│   ├── spaces.lock          # Immutable space contracts
│   ├── recipe/              # Active recipe
│   │   ├── recipe.yaml
│   │   ├── pipeline.yaml
│   │   ├── prompts/
│   │   └── schemas/
│   └── map/                 # Your project data
│       ├── project.yaml
│       ├── problem/
│       ├── solution/
│       ├── work/
│       ├── measurement/
│       └── knowledge/
└── ... (your app code, generated during the Work phase)
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Recommended | OpenRouter API key (access to all models) |
| `ANTHROPIC_API_KEY` | Alternative | Direct Anthropic API key |
| `OPENAI_API_KEY` | Alternative | Direct OpenAI API key |

If no API key is set, Bropilot falls back to mock mode — useful for exploring the pipeline structure without LLM costs.

---

## Next Steps

- Read the [Architecture Guide](./ARCHITECTURE.md) for a deep dive into how Bropilot works
- Explore the default `webapp` recipe in `priv/recipes/webapp/`
- Check `.bropilot/map/` to see the structured data produced by the pipeline
