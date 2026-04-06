---
name: elixir-backend
description: Implements Elixir/OTP backend features — GenServers, API endpoints, storage, pipeline logic
---

# Elixir Backend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving Elixir backend code:
- Pipeline engine changes (persistence, state management)
- API endpoint additions/modifications
- GenServer implementations
- Storage layer abstractions
- CRUD library (Elixir side)
- Codegen execution (Task.Agent, Pi integration)
- Recipe/schema changes

## Required Skills

None — all verification is through ExUnit tests and curl.

## Work Procedure

1. **Read the feature description and preconditions.** Understand exactly what's expected. Read `AGENTS.md` for conventions. Read `.factory/library/architecture.md` for system context.

2. **Identify affected modules.** Read the relevant existing code to understand current patterns. For API work, read `router.ex` and the appropriate handler module. For pipeline work, read `engine.ex` and relevant worker/executor.

3. **Write tests first (RED).** Create or update test files in `test/`. Follow existing test patterns:
   - For API endpoints: use `Plug.Test` with `Endpoint.call(conn, @opts)` pattern
   - For GenServers: test public API functions
   - For storage: test read/write/list/delete with temp directories
   - Tests needing Session agent: `start_supervised!(Bropilot.Api.Session)` in `setup_all`

4. **Verify tests fail.** Run `mix test test/<your_test>.exs` — confirm the new tests fail as expected.

5. **Implement the feature.** Write the minimal code to make tests pass. Follow conventions in `AGENTS.md`:
   - API handlers in `lib/bropilot/api/handlers/`
   - Routes in `lib/bropilot/api/router.ex`
   - GenServers with proper init/handle_call/handle_cast
   - Use `Bropilot.Yaml` for YAML, `Bropilot.Map.Store` for map data

6. **Run tests (GREEN).** Run `mix test` — ALL tests must pass (not just new ones). Fix any regressions.

7. **Manual verification.** For API features, start the server and test with curl:
   ```
   # Start server (background)
   BROPILOT_API=true mix bro.server &
   sleep 3
   # Test endpoint
   curl -s http://localhost:4000/api/<endpoint> | python3 -m json.tool
   # Kill server
   kill %1
   ```

8. **Run full suite.** `mix test` must exit 0 with all tests passing.

## Example Handoff

```json
{
  "salientSummary": "Implemented persistent pipeline state: Engine now writes current_step_index and completed_steps to .bropilot/pipeline_state.yaml on every advance, and loads state on init. Added 6 tests covering write-on-advance, load-on-restart, and missing-file-defaults. Verified via curl that pipeline resumes after server restart. mix test: 298 passing, 0 failures.",
  "whatWasImplemented": "Pipeline.Engine now persists state to .bropilot/pipeline_state.yaml. Added persist_state/1 (writes YAML atomically via tmp+rename) and load_state/1 (reads YAML, defaults to step 0 if missing). Updated handle_call(:advance) to call persist_state after index change. Updated init to call load_state.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {"command": "mix test test/pipeline_test.exs", "exitCode": 0, "observation": "14 tests, 0 failures (6 new)"},
      {"command": "mix test", "exitCode": 0, "observation": "298 tests, 0 failures"},
      {"command": "curl -s http://localhost:4000/api/pipeline/status", "exitCode": 0, "observation": "Returns step1 as current, all pending"},
      {"command": "curl -s -X POST http://localhost:4000/api/pipeline/advance", "exitCode": 0, "observation": "Advanced to step2"},
      {"command": "cat .bropilot/pipeline_state.yaml", "exitCode": 0, "observation": "Shows current_step_index: 1, completed_steps: [step1]"}
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {"file": "test/pipeline_test.exs", "cases": [
        {"name": "persist_state writes YAML on advance", "verifies": "State file created after advance"},
        {"name": "load_state restores position", "verifies": "Engine starts at saved position"},
        {"name": "missing state file defaults to step 0", "verifies": "Graceful fallback"},
        {"name": "corrupted state file defaults to step 0", "verifies": "Error recovery"},
        {"name": "atomic write prevents corruption", "verifies": "Tmp+rename pattern"},
        {"name": "state includes completed steps set", "verifies": "Full state round-trip"}
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature depends on a module or API endpoint that doesn't exist yet
- Requirements conflict with existing behavior
- Tests reveal bugs in unrelated code
- Need clarification on data format or schema structure
