---
name: typescript-packages
description: Implements TypeScript packages — CRUD library, API contract types, code generator
---

# TypeScript Packages Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving TypeScript packages in `packages/`:
- API contract types (Zod schemas)
- TypeScript CRUD library (Hono-compatible, D1-ready)
- Code generator (entities → types, routes, migrations, test stubs)
- Shared type definitions

## Required Skills

None — verification through tsc and Vitest/Node test runner.

## Work Procedure

1. **Read the feature description and preconditions.** Read `AGENTS.md` for TypeScript conventions. Read `.factory/library/architecture.md` for API contract reference.

2. **Set up package structure** (if new package). Each package in `packages/` needs:
   - `package.json` with name, version, scripts (build, test, typecheck)
   - `tsconfig.json` with strict mode
   - `src/` directory for source code
   - Install dependencies: `cd packages/<name> && npm install`

3. **Write tests first (RED).** Use Vitest or Node test runner:
   - For types: verify Zod schemas parse valid/reject invalid data
   - For CRUD: test create/read/update/delete operations
   - For generator: test output is valid TypeScript (tsc --noEmit)

4. **Implement the feature.** Follow conventions:
   - Use Zod for runtime validation
   - Use Hono patterns for route definitions
   - Export types from central `types.ts` files
   - Use strict TypeScript (no `any`)
   - For generator: use template literals, not string concatenation

5. **Type check.** Run `npx tsc --noEmit` — must pass with zero errors.

6. **Run tests.** Run `npx vitest run` (or `node --test`) — all must pass.

7. **Integration check.** If the package is consumed by the Astro UI or Elixir backend, verify the integration:
   - For API types: import in `web/src/lib/api.ts` and verify no type errors
   - For CRUD library: write a simple integration test
   - For generator: generate code from a sample entity spec and compile it

## Example Handoff

```json
{
  "salientSummary": "Created packages/api-types with Zod schemas for all 34+ API endpoints. Each schema validates request params and response bodies. Exported TypeScript types via z.infer. tsc --noEmit passes. 42 Vitest tests covering all schemas (valid input passes, invalid input rejected with descriptive errors).",
  "whatWasImplemented": "packages/api-types/src/: index.ts (barrel exports), health.ts, project.ts, spaces.ts, map.ts, pipeline.ts, vibe.ts, domain.ts, work.ts, knowledge.ts, traceability.ts, pair.ts. Each exports request and response Zod schemas plus inferred TypeScript types.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {"command": "cd packages/api-types && npx tsc --noEmit", "exitCode": 0, "observation": "Zero type errors"},
      {"command": "cd packages/api-types && npx vitest run", "exitCode": 0, "observation": "42 tests passing"},
      {"command": "mix test", "exitCode": 0, "observation": "298 tests, 0 failures (no Elixir regressions)"}
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {"file": "packages/api-types/src/__tests__/schemas.test.ts", "cases": [
        {"name": "health response schema validates", "verifies": "Schema matches actual API shape"},
        {"name": "spaces response schema validates", "verifies": "Schema matches actual API shape"},
        {"name": "invalid map slot request rejected", "verifies": "Validation catches missing fields"}
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- API endpoint behavior doesn't match what's documented
- Dependency conflicts with existing web/ package
- Generator output requires Elixir-side changes to work
- Need spec schema definitions that don't exist yet
