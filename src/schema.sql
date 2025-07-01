-- Bropilot Meta Database Schema (meta.db)
-- SQLite database for storing application knowledge graphs and processing prompts

-- Enable foreign keys and JSON support
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- =============================================================================
-- CORE KNOWLEDGE GRAPH INFRASTRUCTURE
-- =============================================================================

-- Flexible node-edge architecture with semantic capabilities
CREATE TABLE knowledge_nodes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    node_type TEXT NOT NULL, -- 'application', 'domain', 'feature', 'module', 'thing', 'behavior', 'flow', etc.
    content TEXT,
    vector_embedding F32_BLOB(384), -- Sentence transformer embeddings for semantic search
    metadata JSON,
    file_path TEXT, -- Path to generated file (when applicable)
    content_hash TEXT, -- Hash for change detection
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    version INTEGER DEFAULT 1
);

-- Relationships with confidence scoring and evidence
CREATE TABLE knowledge_edges (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    relationship TEXT NOT NULL, -- 'contains', 'implements', 'documents', 'tests', 'depends_on', 'belongs_to'
    confidence REAL DEFAULT 1.0,
    detection_method TEXT DEFAULT 'manual', -- 'manual', 'ast_analysis', 'semantic_similarity', 'generated'
    evidence JSON, -- Supporting data for the relationship
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(from_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(to_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);

-- =============================================================================
-- PROCESSING PROMPTS AND TEMPLATES
-- =============================================================================

-- System prompts for each processing step
CREATE TABLE processing_prompts (
    id TEXT PRIMARY KEY,
    step_name TEXT NOT NULL, -- 'chat_to_kg', 'kg_to_yaml', 'yaml_to_workplan', 'workplan_to_tasks', etc.
    phase INTEGER, -- Which phase this applies to (1-5)
    prompt_template TEXT NOT NULL, -- The actual prompt with placeholders
    variables JSON, -- Array of variable names used in template
    description TEXT,
    version TEXT DEFAULT '1.0.0',
    active BOOLEAN DEFAULT TRUE,
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now'))
);

-- =============================================================================
-- CHAT MANAGEMENT
-- =============================================================================

-- Chat sessions for requirement gathering
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    session_name TEXT,
    started_at REAL DEFAULT (julianday('now')),
    ended_at REAL,
    status TEXT CHECK(status IN ('active', 'completed', 'archived')) DEFAULT 'active',
    total_messages INTEGER DEFAULT 0,
    processed_at REAL, -- When this was processed into knowledge graph
    extraction_confidence REAL -- Confidence in domain/feature extraction
);

-- Individual chat messages
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
    content TEXT NOT NULL,
    timestamp REAL DEFAULT (julianday('now')),
    message_order INTEGER,
    metadata JSON, -- Additional context, tokens used, etc.
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Extracted entities from chat processing
CREATE TABLE chat_extractions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- 'domain', 'feature', 'requirement', 'constraint'
    entity_name TEXT NOT NULL,
    description TEXT,
    confidence REAL,
    source_messages JSON, -- Array of message IDs that contributed
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    knowledge_node_id TEXT, -- Link to created knowledge node
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(knowledge_node_id) REFERENCES knowledge_nodes(id) ON DELETE SET NULL
);

-- =============================================================================
-- CORE APPLICATION ENTITIES
-- =============================================================================

-- Application root entity (usually one per database)
CREATE TABLE applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    purpose TEXT,
    current_phase INTEGER DEFAULT 1, -- 1-5 corresponding to the development phases
    current_version TEXT DEFAULT '0.1.0',
    constraints JSON, -- Array of constraint strings
    success_metrics JSON, -- Array of success metric strings
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now'))
);

-- Domain boundaries and responsibilities
CREATE TABLE domains (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    responsibilities JSON, -- Array of responsibility strings
    application_id TEXT NOT NULL,
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE,
    UNIQUE(name, application_id)
);

-- Features that span domains
CREATE TABLE features (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    purpose TEXT,
    requirements JSON, -- Array of requirement strings
    metrics JSON, -- Array of metric strings
    application_id TEXT NOT NULL,
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE,
    UNIQUE(name, application_id)
);

-- Feature-Domain many-to-many relationship
CREATE TABLE feature_domains (
    feature_id TEXT NOT NULL,
    domain_id TEXT NOT NULL,
    PRIMARY KEY(feature_id, domain_id),
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
    FOREIGN KEY(domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- =============================================================================
-- ARCHITECTURE ENTITIES (Phase 2+)
-- =============================================================================

-- Modules (core or UI) that implement domains
CREATE TABLE modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('core', 'ui')) NOT NULL,
    description TEXT,
    domain_id TEXT NOT NULL,
    interface_definition JSON, -- Interface schema (RPC, REST, etc.)
    state_definition JSON, -- State management schema
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    UNIQUE(name, domain_id)
);

-- Things (entities/data models) within modules
CREATE TABLE things (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    module_id TEXT NOT NULL,
    schema JSON, -- JSON schema definition
    invariants JSON, -- Array of invariant strings
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE(name, module_id)
);

-- Behaviors (business logic) within modules
CREATE TABLE behaviors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    module_id TEXT NOT NULL,
    trigger TEXT CHECK(trigger IN ('rpc_call', 'user_action', 'event', 'schedule')),
    preconditions JSON, -- Array of precondition strings
    rules JSON, -- Array of business rule strings
    effects JSON, -- Array of effect strings
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE(name, module_id)
);

-- Behavior-Thing many-to-many relationship (things used by behaviors)
CREATE TABLE behavior_things (
    behavior_id TEXT NOT NULL,
    thing_id TEXT NOT NULL,
    usage_type TEXT, -- 'read', 'write', 'create', 'delete'
    PRIMARY KEY(behavior_id, thing_id),
    FOREIGN KEY(behavior_id) REFERENCES behaviors(id) ON DELETE CASCADE,
    FOREIGN KEY(thing_id) REFERENCES things(id) ON DELETE CASCADE
);

-- Flows that implement features
CREATE TABLE flows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    purpose TEXT,
    requirements JSON, -- Array of requirement strings
    feature_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE,
    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE(name, feature_id)
);

-- Streams within flows (happy path, error cases, edge cases)
CREATE TABLE streams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    variant TEXT CHECK(variant IN ('happy_path', 'error_case', 'edge_case')) NOT NULL,
    flow_id TEXT NOT NULL,
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(flow_id) REFERENCES flows(id) ON DELETE CASCADE,
    UNIQUE(name, flow_id)
);

-- Flow steps within streams
CREATE TABLE flow_steps (
    id TEXT PRIMARY KEY,
    step_order INTEGER NOT NULL,
    component TEXT, -- References component, thing, or behavior
    action TEXT,
    conditions JSON, -- Array of condition strings
    stream_id TEXT NOT NULL,
    parent_step_id TEXT, -- For branching
    created_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(stream_id) REFERENCES streams(id) ON DELETE CASCADE,
    FOREIGN KEY(parent_step_id) REFERENCES flow_steps(id) ON DELETE CASCADE
);

-- =============================================================================
-- UI ENTITIES (for UI modules)
-- =============================================================================

-- Components within UI modules
CREATE TABLE components (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    module_id TEXT NOT NULL,
    props JSON, -- Array of prop strings
    state JSON, -- Array of state strings
    events JSON, -- Array of event strings
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE(name, module_id)
);

-- Screens within UI modules
CREATE TABLE screens (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    route TEXT,
    module_id TEXT NOT NULL,
    data_needs JSON, -- Array of data need strings
    actions JSON, -- Array of action strings
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE(name, module_id)
);

-- Screen-Component many-to-many relationship
CREATE TABLE screen_components (
    screen_id TEXT NOT NULL,
    component_id TEXT NOT NULL,
    PRIMARY KEY(screen_id, component_id),
    FOREIGN KEY(screen_id) REFERENCES screens(id) ON DELETE CASCADE,
    FOREIGN KEY(component_id) REFERENCES components(id) ON DELETE CASCADE
);

-- Affordances (UI actions) on screens
CREATE TABLE affordances (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    trigger TEXT NOT NULL,
    calls TEXT, -- service.method reference
    screen_id TEXT NOT NULL,
    created_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(screen_id) REFERENCES screens(id) ON DELETE CASCADE
);

-- =============================================================================
-- SPECIFICATION ENTITIES (Phase 3+)
-- =============================================================================

-- API contracts for modules
CREATE TABLE api_contracts (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL,
    base_url TEXT,
    protocol TEXT CHECK(protocol IN ('grpc', 'rest', 'graphql')) DEFAULT 'rest',
    specification JSON, -- OpenAPI/GraphQL/gRPC specification
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE,
    UNIQUE(module_id)
);

-- RPC methods within API contracts
CREATE TABLE rpc_methods (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    request_schema JSON,
    response_schema JSON,
    behavior_mapping TEXT, -- Reference to behavior
    api_contract_id TEXT NOT NULL,
    created_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(api_contract_id) REFERENCES api_contracts(id) ON DELETE CASCADE,
    UNIQUE(name, api_contract_id)
);

-- Releases (versioned specifications)
CREATE TABLE releases (
    id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    status TEXT CHECK(status IN ('draft', 'specification_complete', 'in_progress', 'completed')) DEFAULT 'draft',
    application_id TEXT NOT NULL,
    api_compatibility JSON, -- Array of compatibility notes
    breaking_changes JSON, -- Array of breaking change descriptions
    deployment_requirements JSON, -- Array of deployment requirement strings
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE,
    UNIQUE(version, application_id)
);

-- Release-Feature many-to-many relationship
CREATE TABLE release_features (
    release_id TEXT NOT NULL,
    feature_id TEXT NOT NULL,
    PRIMARY KEY(release_id, feature_id),
    FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE,
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE
);

-- Release-Module many-to-many relationship
CREATE TABLE release_modules (
    release_id TEXT NOT NULL,
    module_id TEXT NOT NULL,
    PRIMARY KEY(release_id, module_id),
    FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE,
    FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE
);

-- =============================================================================
-- EXECUTION ENTITIES (Phase 4+)
-- =============================================================================

-- Work plans for releases
CREATE TABLE work_plans (
    id TEXT PRIMARY KEY,
    release_id TEXT NOT NULL,
    estimated_duration TEXT,
    total_tasks INTEGER DEFAULT 0,
    methodology TEXT CHECK(methodology IN ('test_driven_development', 'behavior_driven_development')),
    qa_mode TEXT CHECK(qa_mode IN ('automated', 'automated_with_human_checkpoints', 'manual')),
    pr_granularity TEXT CHECK(pr_granularity IN ('task_level', 'story_level', 'feature_level')),
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(release_id) REFERENCES releases(id) ON DELETE CASCADE,
    UNIQUE(release_id)
);

-- Tasks within work plans
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK(type IN ('code_generation', 'test_generation', 'validation', 'documentation')) NOT NULL,
    work_plan_id TEXT NOT NULL,
    assigned_to TEXT, -- Agent identifier
    estimated_effort TEXT,
    artifacts JSON, -- Array of file paths
    status TEXT CHECK(status IN ('pending', 'in_progress', 'completed', 'blocked', 'needs_review')) DEFAULT 'pending',
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(work_plan_id) REFERENCES work_plans(id) ON DELETE CASCADE
);

-- Task dependencies
CREATE TABLE task_dependencies (
    dependent_task_id TEXT NOT NULL,
    dependency_task_id TEXT NOT NULL,
    PRIMARY KEY(dependent_task_id, dependency_task_id),
    FOREIGN KEY(dependent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(dependency_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Human checkpoints
CREATE TABLE human_checkpoints (
    id TEXT PRIMARY KEY,
    trigger TEXT NOT NULL,
    description TEXT,
    required_artifacts JSON, -- Array of artifact paths
    status TEXT CHECK(status IN ('pending_review', 'approved', 'changes_requested', 'paused')) DEFAULT 'pending_review',
    work_plan_id TEXT NOT NULL,
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(work_plan_id) REFERENCES work_plans(id) ON DELETE CASCADE
);

-- =============================================================================
-- IMPLEMENTATION TRACKING (Phase 5+)
-- =============================================================================

-- Implementations that map entities to actual code
CREATE TABLE implementations (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    entity_id TEXT NOT NULL, -- References any knowledge_nodes.id
    entity_type TEXT NOT NULL, -- thing, behavior, component, etc.
    file_path TEXT NOT NULL,
    function_name TEXT,
    line_start INTEGER,
    line_end INTEGER,
    content_hash TEXT, -- For change detection
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(entity_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);

-- Test implementations
CREATE TABLE test_implementations (
    id TEXT PRIMARY KEY,
    implementation_id TEXT NOT NULL,
    test_file_path TEXT NOT NULL,
    test_function_name TEXT,
    test_type TEXT CHECK(test_type IN ('unit', 'integration', 'e2e')) DEFAULT 'unit',
    coverage_percentage REAL,
    created_at REAL DEFAULT (julianday('now')),
    FOREIGN KEY(implementation_id) REFERENCES implementations(id) ON DELETE CASCADE
);

-- =============================================================================
-- DOCUMENT GENERATION TRACKING
-- =============================================================================

-- Track generated YAML documents in .bro/docs/
CREATE TABLE document_generations (
    id TEXT PRIMARY KEY,
    document_name TEXT NOT NULL, -- application.yaml, domains.yaml, etc.
    file_path TEXT NOT NULL, -- .bro/docs/application.yaml
    source_tables JSON, -- Array of table names used to generate this doc
    content_hash TEXT,
    generated_at REAL DEFAULT (julianday('now')),
    version TEXT, -- Semantic version when this was generated
    status TEXT CHECK(status IN ('current', 'outdated', 'error')) DEFAULT 'current'
);

-- =============================================================================
-- CONFIGURATION AND METADATA
-- =============================================================================

-- Agent configuration
CREATE TABLE agent_configuration (
    id TEXT PRIMARY KEY DEFAULT 'default',
    parallel_capacity INTEGER DEFAULT 3,
    agent_types JSON, -- Configuration for different agent types
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now'))
);

-- System metadata and versioning
CREATE TABLE system_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at REAL DEFAULT (julianday('now')),
    updated_at REAL DEFAULT (julianday('now'))
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Knowledge graph indexes
CREATE INDEX idx_knowledge_nodes_type ON knowledge_nodes(node_type);
CREATE INDEX idx_knowledge_nodes_label ON knowledge_nodes(label);
CREATE INDEX idx_knowledge_edges_relationship ON knowledge_edges(relationship);
CREATE INDEX idx_knowledge_edges_from ON knowledge_edges(from_id);
CREATE INDEX idx_knowledge_edges_to ON knowledge_edges(to_id);

-- Chat and processing indexes
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_extractions_session ON chat_extractions(session_id);
CREATE INDEX idx_chat_extractions_status ON chat_extractions(status);
CREATE INDEX idx_processing_prompts_step ON processing_prompts(step_name);
CREATE INDEX idx_processing_prompts_active ON processing_prompts(active);

-- Entity relationship indexes
CREATE INDEX idx_features_application ON features(application_id);
CREATE INDEX idx_domains_application ON domains(application_id);
CREATE INDEX idx_modules_domain ON modules(domain_id);
CREATE INDEX idx_things_module ON things(module_id);
CREATE INDEX idx_behaviors_module ON behaviors(module_id);
CREATE INDEX idx_flows_feature ON flows(feature_id);
CREATE INDEX idx_flows_module ON flows(module_id);
CREATE INDEX idx_tasks_work_plan ON tasks(work_plan_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_implementations_entity ON implementations(entity_id);
CREATE INDEX idx_document_generations_status ON document_generations(status);

-- =============================================================================
-- TRIGGERS FOR MAINTENANCE
-- =============================================================================

-- Update timestamp triggers
CREATE TRIGGER update_applications_timestamp 
    AFTER UPDATE ON applications
    BEGIN
        UPDATE applications SET updated_at = julianday('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER update_knowledge_nodes_timestamp 
    AFTER UPDATE ON knowledge_nodes
    BEGIN
        UPDATE knowledge_nodes SET updated_at = julianday('now') WHERE id = NEW.id;
    END;

-- Mark documents as outdated when source data changes
CREATE TRIGGER mark_docs_outdated_on_app_change
    AFTER UPDATE ON applications
    BEGIN
        UPDATE document_generations 
        SET status = 'outdated' 
        WHERE document_name = 'application.yaml' AND status = 'current';
    END;

CREATE TRIGGER mark_docs_outdated_on_domain_change
    AFTER UPDATE ON domains
    BEGIN
        UPDATE document_generations 
        SET status = 'outdated' 
        WHERE document_name IN ('domains.yaml', 'modules.yaml') AND status = 'current';
    END;

-- Sync knowledge graph when entities are created/updated
CREATE TRIGGER sync_application_to_kg
    AFTER INSERT ON applications
    BEGIN
        INSERT INTO knowledge_nodes (id, label, node_type, content, metadata)
        VALUES (
            NEW.id,
            NEW.name,
            'application',
            NEW.purpose,
            json_object(
                'current_phase', NEW.current_phase,
                'current_version', NEW.current_version,
                'constraints', NEW.constraints,
                'success_metrics', NEW.success_metrics
            )
        );
    END;

CREATE TRIGGER sync_domain_to_kg
    AFTER INSERT ON domains
    BEGIN
        INSERT INTO knowledge_nodes (id, label, node_type, content, metadata)
        VALUES (
            NEW.id,
            NEW.name,
            'domain',
            NEW.description,
            json_object('responsibilities', NEW.responsibilities)
        );
        
        INSERT INTO knowledge_edges (id, from_id, to_id, relationship)
        VALUES (
            'edge_' || hex(randomblob(16)),
            NEW.application_id,
            NEW.id,
            'contains'
        );
    END;

-- =============================================================================
-- INITIAL SYSTEM DATA
-- =============================================================================

-- Insert default processing prompts
INSERT INTO processing_prompts (id, step_name, phase, prompt_template, variables, description) VALUES 
(
    'chat_to_kg_v1',
    'chat_to_kg',
    1,
    'Analyze the following chat conversation and extract domains, features, and requirements. Chat content: {{chat_content}}. Extract structured entities and relationships.',
    '["chat_content"]',
    'Extract knowledge graph entities from chat conversations'
),
(
    'kg_to_docs_v1', 
    'kg_to_docs',
    2,
    'Generate YAML documentation from knowledge graph. Entities: {{entities}}. Relationships: {{relationships}}. Generate complete YAML specifications.',
    '["entities", "relationships"]',
    'Generate YAML documents from knowledge graph data'
),
(
    'docs_to_workplan_v1',
    'docs_to_workplan', 
    4,
    'Create work plan from specifications. Current docs: {{docs}}. Previous version: {{previous_version}}. Generate task breakdown and dependencies.',
    '["docs", "previous_version"]',
    'Generate work plans from documentation specifications'
),
(
    'workplan_to_tasks_v1',
    'workplan_to_tasks',
    4, 
    'Break down work plan into executable tasks. Work plan: {{work_plan}}. Agent capabilities: {{agent_config}}. Generate specific implementation tasks.',
    '["work_plan", "agent_config"]',
    'Generate implementation tasks from work plans'
);

-- Insert default agent configuration
INSERT INTO agent_configuration (id, parallel_capacity, agent_types) VALUES (
    'default',
    3,
    json_object(
        'coding', json_object('count', 2, 'specialization', 'general', 'languages', json_array('typescript', 'python'), 'frameworks', json_array('react', 'fastapi')),
        'testing', json_object('count', 1, 'specialization', 'test_generation', 'languages', json_array('typescript', 'python'), 'frameworks', json_array('jest', 'pytest')),
        'documentation', json_object('count', 1, 'specialization', 'documentation', 'languages', json_array('markdown'), 'frameworks', json_array())
    )
);

-- Insert system metadata
INSERT INTO system_metadata (key, value) VALUES ('schema_version', '1.0.0');
INSERT INTO system_metadata (key, value) VALUES ('bropilot_version', '0.1.0');
INSERT INTO system_metadata (key, value) VALUES ('created_at', julianday('now'));