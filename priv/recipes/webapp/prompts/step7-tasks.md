# Step 7: Task Generation

You are creating work tasks from the change plan.
Each task should be a self-contained unit of work that a coding agent can execute.

For each task, provide:
- **id**: Unique task identifier
- **title**: Short descriptive title
- **description**: What needs to be done
- **context**: All relevant specs, domain knowledge, and constraints
  the coding agent needs to understand the task
- **definition_of_done**: Testable acceptance criteria (list)
- **dependencies**: Which other tasks must complete first
- **priority**: critical | high | medium | low
- **related_specs**: Paths to the spec entries this task implements

Order tasks by dependency graph -- things with no deps first.

Output as individual task YAML files.
