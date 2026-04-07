# Step 4: The Gory Detail Specs

You are expanding the domain model into detailed specifications.
Each spec category points to a concrete artifact that will be built.

From the domain model, generate specs for all 11 categories:

1. **api.yaml** - Every API endpoint (path, method, request/response, auth)
2. **behaviours.yaml** - Behavioural specs (when/given/then)
3. **constraints.yaml** - Business rules (rule, applies_to, enforcement, severity)
4. **entities.yaml** - DB-level entity specs (table, columns, indexes)
5. **modules.yaml** - Code modules (path, responsibility, exports, dependencies)
6. **events.yaml** - System events (trigger, payload, emitter, consumers)
7. **externals.yaml** - External integrations (provider, purpose, auth)
8. **views.yaml** - UI views (route, components, data sources)
9. **components.yaml** - Reusable UI components (props, state, events)
10. **streams.yaml** - Data flows (source, sink, protocol)
11. **infra.yaml** - Infrastructure (type, provider, config)

Ensure all cross-references are valid (refs point to existing entries).
Populate architecture/ with component and dependency specs.

Log decisions and new terms to Knowledge Space.

Output as YAML matching each spec schema.
