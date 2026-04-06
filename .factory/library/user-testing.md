# User Testing

Testing surface, required testing skills/tools, and resource cost classification.

---

## Validation Surface

### Surface 1: Web UI (agent-browser)
- **URL**: http://localhost:3200 (Astro dev server)
- **Pages**: /, /problem/, /solution/, /work/, /knowledge/, /vibe/, /build/, /connect/, /domain/ (new), /er/ (new), /traceability/ (new)
- **Interactivity**: Alpine.js — chat flows (vibe, domain), button actions (build), tabs (solution specs), search (knowledge), diagrams (ER)
- **Auth**: Localhost bypasses token auth. No login needed for local testing.
- **Setup**: Start Elixir API on port 4000, Astro dev server on port 3200. Init a project with `POST /api/init`.

### Surface 2: API (curl)
- **URL**: http://localhost:4000
- **Endpoints**: 34+ REST endpoints at /api/*
- **Auth**: Localhost bypass (127.0.0.1). For remote, Bearer token.
- **Setup**: Start Elixir API on port 4000. Init project.

### Surface 3: CLI (terminal)
- **Commands**: mix bro.* tasks
- **Setup**: Project must be initialized with `mix bro.init`

## Validation Concurrency

### agent-browser instances
- **Per-instance cost**: ~670 MB (API server ~40MB + Astro dev ~330MB + agent-browser ~300MB)
- **Machine**: 16 GB RAM, 8 CPU cores
- **Baseline usage**: ~6 GB
- **Available headroom**: ~10 GB × 0.7 = 7 GB
- **Max concurrent validators**: 4 (4 × 670 = 2.68 GB, well within budget)
- **Rationale**: Each validator needs its own Astro+API instance on unique ports, plus a headless browser

### curl instances
- **Per-instance cost**: Negligible (~5 MB per curl process)
- **Max concurrent validators**: 5 (limited by port allocation, not resources)

### terminal instances
- **Per-instance cost**: ~50 MB per mix task
- **Max concurrent validators**: 5

## Testing Tools Required

- `agent-browser` skill for web UI validation
- `curl` for API endpoint validation
- Terminal commands for CLI and ExUnit validation

## Port Allocation for Validators

| Validator | API Port | Astro Port |
|-----------|----------|------------|
| Validator 1 | 4001 | 3201 |
| Validator 2 | 4002 | 3202 |
| Validator 3 | 4003 | 3203 |
| Validator 4 | 4004 | 3204 |

Avoid ports: 4000 (dev), 4321-4340 (occupied), 5000, 7000, 8108
