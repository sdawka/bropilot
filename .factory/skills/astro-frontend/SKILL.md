---
name: astro-frontend
description: Implements Astro/Alpine.js web UI features — pages, components, interactive flows
---

# Astro Frontend Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving the Astro web UI:
- New pages (Act 2 domain modeling, ER diagram, traceability)
- Component creation/modification
- API client (api.ts) additions
- Alpine.js interactive flows
- Navigation/sidebar changes
- Frontend testing (Vitest)

## Required Skills

- `agent-browser` — for visual verification of pages after implementation

## Work Procedure

1. **Read the feature description and preconditions.** Read `AGENTS.md` for UI conventions. Read `.factory/library/architecture.md` for system context.

2. **Study existing patterns.** Read the most similar existing page to understand the pattern:
   - Data display: `problem.astro`, `solution.astro`
   - Interactive: `vibe.astro`, `build.astro`
   - Standalone: `connect.astro`
   - Read `Layout.astro`, `NavSidebar.astro` for layout patterns.
   - Read `api.ts` for API client patterns.

3. **Add API client functions first** (if needed). Add new functions to `web/src/lib/api.ts` following existing patterns (fetchApi wrapper, typed responses).

4. **Write Vitest tests (RED)** if Vitest is configured. Create test files in `web/src/__tests__/` or colocated. Test component rendering, API function types, data transformations.

5. **Implement the page/component.**
   - Create page in `web/src/pages/<name>.astro`
   - Set `export const prerender = false;`
   - Use `<Layout title="...">` wrapper
   - For interactive features: register Alpine.js data in `<script>` block
   - Import API functions from `api.ts` — never duplicate fetch logic
   - Use CSS custom properties from `global.css`
   - Add nav entry to `NavSidebar.astro`

6. **Verify with agent-browser.** Invoke the `agent-browser` skill to:
   - Navigate to the new page
   - Verify it renders correctly (no JS errors, expected content visible)
   - Test interactive flows (click buttons, submit forms, see results)
   - Screenshot key states

7. **Run tests.** If Vitest is set up: `cd web && npx vitest run`. Also run `mix test` to ensure no backend regressions.

8. **Check all existing pages.** Use agent-browser to quickly verify /, /problem/, /solution/ still load without errors.

## Example Handoff

```json
{
  "salientSummary": "Built the Act 2 domain modeling page at /domain/ with Alpine.js interactive flow: Start Domain → show Step 3 prompt → accept input → extract → show domain model cards → proceed to Step 4 → show 11 spec tabs. Added startDomain() and extractDomain() to api.ts. Added nav entry. Verified via agent-browser: full flow works, all tabs render, back-navigation to /solution/ shows extracted data.",
  "whatWasImplemented": "web/src/pages/domain.astro — full Act 2 interactive page with Alpine.js. Modes: idle→step3→extracting3→step3_done→step4→extracting4→complete. Uses fetchApi for domain/start, domain/extract. Shows domain cards (vocabulary, entities, relationships, flows, architecture) and spec tabs (11 categories). Added startDomain(), extractDomain() to api.ts. Added 'Domain' nav entry to NavSidebar.astro.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {"command": "cd web && npx vitest run", "exitCode": 0, "observation": "3 tests passing"},
      {"command": "mix test", "exitCode": 0, "observation": "298 tests, 0 failures"}
    ],
    "interactiveChecks": [
      {"action": "Navigate to /domain/", "observed": "Page loads with 'Start Domain Modeling' button, no JS errors"},
      {"action": "Click 'Start Domain Modeling'", "observed": "Step 3 prompt appears with guiding questions"},
      {"action": "Enter domain description and click Extract", "observed": "Loading spinner, then domain model cards appear"},
      {"action": "Click 'Proceed to Specs' button", "observed": "11 spec tabs appear, each populated"},
      {"action": "Navigate to /solution/", "observed": "Solution page shows extracted vocabulary, domain data"},
      {"action": "Navigate to / (dashboard)", "observed": "Dashboard loads without errors"}
    ]
  },
  "tests": {
    "added": [
      {"file": "web/src/__tests__/api.test.ts", "cases": [
        {"name": "startDomain calls correct endpoint", "verifies": "API function wiring"},
        {"name": "extractDomain calls correct endpoint", "verifies": "API function wiring"}
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Required API endpoint doesn't exist or returns unexpected data
- Layout/NavSidebar patterns have changed from what was expected
- Agent-browser reveals rendering issues that need backend fixes
- Vitest configuration is broken or missing
