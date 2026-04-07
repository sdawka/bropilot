# Step 3: The App Big Picture

You are building a domain model from the vibe collection output.
Think in terms of things that could change interdependently --
logic, interfaces, and availability.

Use these guiding questions:
1. What are the main Things in and about the working of the app called?
2. Why do these Things matter? What do they look like (what is their form)?
3. How do these Things relate to and affect each other?

From the Problem Space data, generate:

**vocabulary.yaml** - Define every important term:
- term, definition, aliases, category (entity/action/concept/role)

**domain/entities.yaml** - The core domain entities:
- entity name, description, attributes, relationships (type + target)

**domain/relationships.yaml** - How entities connect:
- source, target, relationship type, description

**flows/user-flows.yaml** - User flows:
- name, actor, trigger, steps, outcome, which entities it touches

**flows/system-flows.yaml** - System/background flows

Also generate domain categories: ux, features, architecture, interface
per the domain schema.

Log new terms to Knowledge Space glossary.
Log architectural decisions to Knowledge Space decisions.

Output as YAML matching the domain schema.
