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

## Flow Validator Guidance: agent-browser

- Use a dedicated browser session per validator and keep it open for the full run.
- Stay on the assigned local ports/URLs only; do not access remote tunnels.
- Reuse one initialized `.bropilot` project unless the assertion explicitly requires missing-project behavior.
- Capture screenshots for every assertion and store them under the assigned evidence directory.
- After each major flow, check browser console errors and include results in the report.
- Do not restart shared services; if unavailable, mark impacted assertions as blocked.

## Flow Validator Guidance: curl

- Use the assigned API base URL only.
- Send deterministic requests for extraction-related checks with `mode=mock` where relevant.
- For assertions that depend on pipeline/app state, execute setup calls (`/api/init`, `/api/domain/start`, etc.) in-sequence inside the same run.
- Record HTTP status and response body snippets for every assertion.
- If a prerequisite endpoint fails consistently, mark downstream assertions as blocked with the root cause.

## Flow Validator Guidance: terminal

- Run only repository-local commands; no system-wide changes.
- Prefer read/verification commands for file/layout assertions, and only run build/test commands required by assigned assertions.
- For filesystem assertions, create temporary artifacts only under the repository and clean up when practical.
- Record exact command outputs (or key excerpts) for evidence in each assertion result.
- If a command is flaky, retry once and document both attempts in the report.

## Validation Notes: core-gaps (round 1)

- Contract/path mismatch observed during curl validation: implemented snapshot endpoint is `POST /api/snapshot` (not `POST /api/build/snapshot`).
- `GET /api/domain/status` is not available in current API surface; assertions that require this endpoint should use alternative state checks.
- For deterministic Act 2 UI checks, the backend should be started with/through `mode=mock`; current domain UI does not expose a direct mock-mode toggle.

## Validation Notes: core-gaps (round 2 rerun)

- Restart/crash assertions on isolated API instances can leave the assigned API port down; always perform a healthcheck and restart the isolated API before subsequent browser validation batches.
- Nested solution-map read paths used by some assertions (`/api/map/solution/domain/entities`, `/api/map/solution/flows/*`, `/api/map/solution/architecture/*`) returned 404 in this environment; use available map endpoints for evidence where possible and record path mismatch when contract requires unavailable routes.

## Validation Notes: traceability (round 1)

- Current traceability API surface is project-global on this branch (`/api/traceability` and `/api/traceability/:category/:spec_id`); project-scoped paths like `/api/projects/:path/traceability` returned 404 during user testing.
- On this run, `POST /api/build` repeatedly returned success with `files_written: []` and produced no traceability count deltas; assertions that require newly generated links (UI auto-refresh / partial-build behavior) were blocked by missing runtime preconditions.
- Shared localhost runtime already had populated traceability data before browser validation; empty-state assertions require an isolated fresh project state if they must be validated deterministically.
- `/build/` page navigation produced a browser error (`Unexpected token ':'`) during sidebar regression flow; include console checks when validating cross-page navigation.

## Validation Notes: er-diagram (round 1)

- ER rendering surface in this runtime is `/er/`; `/domain/` currently hosts Act 2 domain modeling UI. Assertions that require ER content specifically on `/domain/` fail unless routing/UI behavior changes.
- Contract example endpoints `GET /api/solution/domain/entities` and `GET /api/solution/domain/relationships` returned 404; current ER data source is `GET /api/map/solution/domain`.
- During this run, Act 2 extraction responses contained entity data but did not populate `/api/map/solution/domain`, so ER update assertions tied to Act 2 progression failed.
- `/build/` still emits browser console error `Unexpected token ':'`; include this check during navigation assertions because it can fail otherwise healthy route checks.

## Validation Notes: crud-generator (round 1)

- For script-driven generator verification, prefer `mix run --no-start`; plain `mix run` attempts to boot the app and can fail with `:eaddrinuse` when shared API is already on port 4000.
- In this runtime, `POST /api/build` returned success while reporting `files_written: []`, and traceability did not gain full per-entity CRUD link-type coverage (`implementation`, `type`, `migration`, `test`).
- For ad-hoc TypeScript checks outside package roots, use a known local compiler path (for example `web/node_modules/.bin/tsc`) or run `npx tsc` from the package directory to avoid global shim mismatches.
- During concurrent navigation validation, domain extract flow showed one transient console `400` resource message; page rendering across `/`, `/problem/`, and `/knowledge/` still remained responsive.
