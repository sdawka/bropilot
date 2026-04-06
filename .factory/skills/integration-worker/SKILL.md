---
name: integration-worker
description: Cross-cutting integration work — cleanup, setup, wiring, configuration changes
---

# Integration Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features that span multiple layers or are primarily configuration/cleanup:
- Vitest setup and configuration
- Legacy code removal (loader.ts, config.ts)
- API deduplication (vibe/build pages → api.ts)
- Spec category migration (old names → new names)
- Wiring features together (Pi agent integration)
- Cross-cutting refactors

## Required Skills

- `agent-browser` — when changes affect web UI (verify pages still render after cleanup)

## Work Procedure

1. **Read the feature description carefully.** Integration features often touch many files. Understand the full scope before starting.

2. **Audit current state.** Before making changes, grep/search for all affected patterns:
   - For cleanup: find all references to files being removed
   - For migration: find all occurrences of old patterns
   - For wiring: trace the call chain from entry point to destination

3. **Write tests for the desired end state.** For cleanup, this may be negative tests (import X should NOT exist) or integration tests (feature still works after refactor). For setup, test that tools are configured correctly.

4. **Make changes incrementally.** Don't do a big-bang refactor:
   - Change one file at a time
   - Run `mix test` after each significant change
   - For web changes: run `cd web && npx vitest run` (if configured)
   - Verify no regressions at each step

5. **Verify with agent-browser** (if UI is affected). Navigate to affected pages and confirm they still render correctly. Check browser console for errors.

6. **Final verification.** Run full test suite: `mix test` AND `cd web && npx vitest run`. Both must pass.

## Example Handoff

```json
{
  "salientSummary": "Removed legacy loader.ts and config.ts from web/src/lib/. Migrated spec categories in solution.astro from old names (api_contracts, data_model, etc.) to new names (api, behaviours, constraints, etc.). Deduplicated API logic in vibe.astro and build.astro — both now import from api.ts. Grep confirms zero references to old files or old category names. agent-browser verified: solution, vibe, and build pages all render correctly. mix test: 298 passing.",
  "whatWasImplemented": "Removed web/src/lib/loader.ts and web/src/lib/config.ts. Updated solution.astro SPEC_CATEGORIES to use new 11 names. Refactored vibe.astro to import startVibe/submitVibeInput/extractVibe from api.ts instead of inline fetch. Refactored build.astro to import createSnapshot/generatePlan/generateTasks/startBuild from api.ts.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {"command": "rg 'loader.ts|config.ts' web/src/ --type ts --type astro", "exitCode": 1, "observation": "Zero references to removed files"},
      {"command": "rg 'api_contracts|data_model|error_handling|ui_ux' web/src/", "exitCode": 1, "observation": "Zero references to old category names"},
      {"command": "mix test", "exitCode": 0, "observation": "298 tests, 0 failures"},
      {"command": "cd web && npx vitest run", "exitCode": 0, "observation": "5 tests passing"}
    ],
    "interactiveChecks": [
      {"action": "Navigate to /solution/", "observed": "Solution page renders with 11 new spec tabs, data loads correctly"},
      {"action": "Navigate to /vibe/ and start a session", "observed": "Vibe page works — chat flow functional"},
      {"action": "Navigate to /build/", "observed": "Build page loads, buttons functional"}
    ]
  },
  "tests": {
    "added": []
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Cleanup reveals that removed code is actually used in unexpected places
- Migration scope is larger than described in the feature
- Wiring requires API changes not covered by the feature
- Test failures in unrelated areas after changes
