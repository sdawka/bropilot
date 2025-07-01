# Bropilot: Self-Aware Application Development CLI

## Overview

Bropilot is a global CLI tool that transforms application development from code-first to conversation-first. It enables developers to build self-aware applications through natural language conversations that are systematically processed into structured specifications, work plans, and executable code.

## Core Architecture

### Global CLI Tool
Bropilot installs globally (`npm install -g bropilot` or `pip install bropilot`) and can be used in any directory to initialize and manage application projects. Each project maintains its own knowledge graph and generated artifacts.

### Project Structure
When `bro init <app-name>` is run, the following structure is created:

```
my-app/
├── .bro/
│   ├── meta.db                    # SQLite knowledge graph
│   ├── config.yaml                # Agent and workflow configuration
│   ├── chats/                     # Chat transcript storage
│   │   ├── session-001.json       # Individual chat sessions
│   │   └── session-002.json
│   ├── docs/                      # Generated YAML specifications
│   │   ├── application.yaml       # Core app definition
│   │   ├── domains.yaml           # Domain boundaries
│   │   ├── features.yaml          # Feature definitions
│   │   ├── modules.yaml           # Architecture (things, behaviors, flows)
│   │   ├── components.yaml        # UI components (when applicable)
│   │   ├── events.yaml            # Domain events, producers and consumers
│   │   ├── infrastructure.yaml    # Deployment specs
│   │   ├── contracts.yaml         # API contracts
│   │   ├── releases.yaml          # Release definitions
│   │   └── work-plan.yaml         # Current work plan
│   └── releases/
│       ├── v0.1.0/                # Versioned specifications
│       │   ├── specification.yaml # Complete spec snapshot
│       │   ├── work-plan.yaml     # Work plan for this release
│       │   └── tasks.json         # Task breakdown
│       └── v0.2.0/
├── src/                           # Generated application code
├── docs/                          # Generated documentation
├── tests/                         # Generated tests
├── infrastructure/                # Generated deployment configs
└── README.md                      # Generated project documentation
```

## Processing Pipeline

### 1. Conversation Processing (`bro chat`)
- Records chat sessions in `.bro/chats/`
- Uses processing prompts stored in `meta.db` to extract entities
- Populates knowledge graph with domains, features, requirements

### 2. Document Generation (`bro docs generate`)
- Queries knowledge graph using stored prompts
- Generates structured YAML files in `.bro/docs/`
- Maintains traceability between conversations and specifications

### 3. Release Planning (`bro release create v1.0.0`)
- Creates versioned specifications in `.bro/releases/v1.0.0/`
- Generates work plans comparing against previous versions
- Breaks down changes into executable tasks

### 4. Code Generation (`bro work start`)
- Executes tasks using configured AI agents
- Generates code, tests, and documentation
- Maintains bidirectional sync between specifications and implementation

## Core Entities and YAML Documents

### `.bro/docs/application.yaml`
```yaml
application:
  name: string
  purpose: string
  current_phase: 1-5
  current_version: string
  constraints: [string]
  success_metrics: [string]
```

### `.bro/docs/domains.yaml`
```yaml
domains:
  domain_name:
    description: string
    responsibilities: [string]
    modules: [module_name]
```

### `.bro/docs/features.yaml`
```yaml
features:
  feature_name:
    purpose: string
    domains: [domain_name]
    requirements: [string]
    metrics: [string]
    flows: [flow_name]
```

### `.bro/docs/modules.yaml`
```yaml
modules:
  module_name:
    type: core|ui
    description: string
    domain: domain_name
    
    interface:
      type: rpc_api|web_app
      description: string
      
    state:
      type: postgresql|sqlite|nanostores|redux
      schema: string # for databases
      stores: [string] # for frontend state
    
    things:
      thing_name:
        schema:
          field_name:
            type: string
            constraints: [string]
        invariants: [string]
        
    behaviors:
      behavior_name:
        trigger: rpc_call|user_action|event|schedule
        preconditions: [string]
        rules: [string]
        effects: [string]
        
    flows:
      flow_name:
        purpose: string
        requirements: [string]
        streams:
          stream_name:
            variant: happy_path|error_case|edge_case
            steps: [flow_step]
```

### `.bro/docs/components.yaml` (UI modules only)
```yaml
components:
  component_name:
    module: module_name
    props: [string]
    state: [string]
    events: [string]
    
screens:
  screen_name:
    module: module_name
    route: string
    components: [component_name]
    data_needs: [string]
    actions: [string]
    affordances:
      - action: string
        trigger: string
        calls: service.method
```

### `.bro/docs/infrastructure.yaml`
```yaml
architecture:
  pattern: microservices|modular_monolith
  orchestration: docker-compose|kubernetes
  
services:
  service_name:
    image: string
    ports: [string]
    environment: [string]
    depends_on: [service_name]
    volumes: [string]
```

### `.bro/docs/contracts.yaml`
```yaml
api_contracts:
  service_name:
    base_url: string
    protocol: grpc|rest|graphql
    
    rpc_methods:
      method_name:
        request: schema_definition
        response: schema_definition
        behavior_mapping: string
        
    rest_endpoints: [string] # auto-generated CRUD
```

### `.bro/docs/releases.yaml`
```yaml
releases:
  version: string
  status: draft|specification_complete|in_progress|completed
  features_included: [feature_name]
  modules: [module_name]
  api_compatibility: [string]
  breaking_changes: [string]
  deployment_requirements: [string]
```

### `.bro/docs/work-plan.yaml`
```yaml
work_plan:
  release_version: string
  estimated_duration: string
  total_tasks: integer
  methodology: test_driven_development|behavior_driven_development
  qa_mode: automated|automated_with_human_checkpoints|manual
  pr_granularity: task_level|story_level|feature_level
  
  phases:
    phase_name:
      description: string
      tasks: [task]
      checkpoint: string # optional
      
tasks:
  task_id:
    title: string
    type: code_generation|test_generation|validation|documentation
    assigned_to: string
    dependencies: [task_id]
    estimated_effort: string
    artifacts: [file_path]
    status: pending|in_progress|completed|blocked|needs_review
```

## Command Reference

### Project Initialization
```bash
# Initialize new project
bro init <app-name>
cd <app-name>

# Check current status
bro status
```

### Phase 1: Conversation & Requirements
```bash
# Start interactive chat
bro chat
bro chat --continue  # Resume previous session
bro chat --import requirements.txt  # Import from file

# Process chats into knowledge graph
bro process chats

# Generate initial documentation
bro docs generate
```

### Phase 2: Architecture Definition
```bash
# Edit entities directly (optional - usually done via chat)
bro domains add <name> --description "..."
bro features add <name> --purpose "..." --domains <d1,d2>
bro modules generate  # Auto-generate from domains

# Update documentation
bro docs generate
```

### Phase 3: Contract Specification
```bash
# Generate API contracts
bro contracts generate
bro contracts validate

# Create release
bro release create v1.0.0
```

### Phase 4: Work Planning
```bash
# Generate work plan
bro plan generate --from v0.1.0
bro plan show

# Configure agents
bro agents config --type coding --count 2
bro agents test  # Verify connectivity
```

### Phase 5: Implementation
```bash
# Start work
bro work start
bro work status
bro work pause

# Handle checkpoints
bro checkpoints list
bro checkpoints approve <id>
bro checkpoints reject <id> --feedback "..."
```

### Synchronization & Maintenance
```bash
# Document regeneration
bro docs generate --force
bro docs status  # Show which docs are outdated

# Sync management
bro sync status  # Check meta.db vs code consistency
bro sync pull    # Update meta.db from code changes
bro sync push    # Regenerate code from meta.db

# Knowledge graph inspection
bro kg show      # Visual graph (opens browser)
bro kg query "SELECT * FROM features WHERE..."
bro kg export --format yaml
```

## Processing Prompts

Bropilot stores processing prompts in the `meta.db` database, making them configurable and version-controlled:

### Chat to Knowledge Graph
```sql
INSERT INTO processing_prompts (step_name, prompt_template) VALUES (
  'chat_to_kg',
  'Analyze this conversation and extract domains, features, and requirements:
   
   {{chat_content}}
   
   Output JSON with extracted entities including confidence scores.'
);
```

### Knowledge Graph to YAML
```sql
INSERT INTO processing_prompts (step_name, prompt_template) VALUES (
  'kg_to_docs',
  'Generate YAML documentation from knowledge graph data:
   
   Entities: {{entities}}
   Relationships: {{relationships}}
   
   Generate complete specifications for: {{document_types}}'
);
```

### Work Plan Generation
```sql
INSERT INTO processing_prompts (step_name, prompt_template) VALUES (
  'docs_to_workplan',
  'Create implementation work plan:
   
   Current specifications: {{current_docs}}
   Previous version: {{previous_version}}
   Agent configuration: {{agent_config}}
   
   Generate task breakdown with dependencies and effort estimates.'
);
```

## Agent Integration

Bropilot supports pluggable AI agents through a standard interface:

```bash
# Configure default agent
bro agents set openai --model gpt-4 --api-key $OPENAI_API_KEY

# Switch agents
bro agents set claude --model claude-sonnet-4 --api-key $ANTHROPIC_API_KEY

# Test agent connectivity
bro agents test
```

The CLI translates high-level tasks into agent-specific prompts, enabling seamless switching between different AI providers while maintaining consistent workflow and quality.

## Meta-Development: Building Bropilot with Bropilot

Bropilot itself is built using the same patterns it creates for other applications:

1. **Bootstrap**: Hand-written initial CLI with core processing logic
2. **Self-Host**: Import Bropilot's architecture into its own meta.db
3. **Self-Improve**: Use `bro` commands to evolve Bropilot's features and implementation

This creates a self-aware development tool that can systematically improve itself through the same conversation-driven process it provides to users.

## Key Benefits

### For Developers
- **Conversation-First Development**: Define applications through natural language rather than technical specifications
- **Systematic Evolution**: All changes tracked through knowledge graph with full traceability
- **Agent-Agnostic**: Switch between AI providers without changing workflow
- **Documentation-Code Sync**: Generated documentation always matches implementation
- **Progressive Complexity**: Start simple, add complexity only when needed

### For Applications
- **Self-Awareness**: Complete understanding of own structure and purpose
- **Traceable Evolution**: Every feature linked to conversations, requirements, and implementation
- **Automated Quality**: Generated tests, documentation, and validation
- **Deployment Ready**: Infrastructure and deployment configs generated automatically

### For Teams
- **Shared Understanding**: Knowledge graph provides single source of truth
- **Async Collaboration**: Conversation history and specifications enable distributed work
- **Quality Gates**: Human checkpoints ensure critical decisions are reviewed
- **Learning System**: Processing prompts improve over time with feedback

Bropilot transforms software development from a craft requiring deep technical knowledge into a systematic design process that anyone can participate in through conversation.