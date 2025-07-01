-- Minimal Bropilot Bootstrap Schema (meta.db)
-- Language-agnostic SQLite database

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- =============================================================================
-- KNOWLEDGE GRAPH CORE
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    node_type TEXT NOT NULL, -- 'application', 'feature', 'task', 'requirement'
    content TEXT,
    metadata JSON,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    relationship TEXT NOT NULL, -- 'contains', 'implements', 'requires', 'depends_on'
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(from_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(to_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);

-- =============================================================================
-- CHAT SYSTEM
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    session_name TEXT,
    started_at INTEGER DEFAULT (unixepoch()),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
    total_messages INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    timestamp INTEGER DEFAULT (unixepoch()),
    message_order INTEGER,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- =============================================================================
-- PROCESSING SYSTEM
-- =============================================================================

CREATE TABLE IF NOT EXISTS processing_prompts (
    id TEXT PRIMARY KEY,
    step_name TEXT NOT NULL, -- 'chat_to_features', 'features_to_tasks', 'task_to_code'
    prompt_template TEXT NOT NULL,
    variables JSON, -- Array of variable names used in template
    description TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- =============================================================================
-- APPLICATION ENTITIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    purpose TEXT,
    current_version TEXT DEFAULT '0.1.0',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    application_id TEXT NOT NULL,
    status TEXT DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'completed')),
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    feature_id TEXT,
    task_type TEXT DEFAULT 'implementation' CHECK(task_type IN ('implementation', 'test', 'docs', 'config')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'blocked')),
    file_path TEXT, -- Target file for this task
    generated_content TEXT, -- AI-generated content
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY(feature_id) REFERENCES features(id) ON DELETE CASCADE
);

-- =============================================================================
-- CONFIGURATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER DEFAULT (unixepoch())
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_type ON knowledge_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_from ON knowledge_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_to ON knowledge_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_features_app ON features(application_id);
CREATE INDEX IF NOT EXISTS idx_tasks_feature ON tasks(feature_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS update_applications_timestamp;
CREATE TRIGGER update_applications_timestamp 
    AFTER UPDATE ON applications
    BEGIN
        UPDATE applications SET updated_at = unixepoch() WHERE id = NEW.id;
    END;

DROP TRIGGER IF EXISTS update_features_timestamp;
CREATE TRIGGER update_features_timestamp 
    AFTER UPDATE ON features
    BEGIN
        UPDATE features SET updated_at = unixepoch() WHERE id = NEW.id;
    END;

DROP TRIGGER IF EXISTS update_tasks_timestamp;
CREATE TRIGGER update_tasks_timestamp 
    AFTER UPDATE ON tasks
    BEGIN
        UPDATE tasks SET updated_at = unixepoch() WHERE id = NEW.id;
    END;

-- Sync to knowledge graph
DROP TRIGGER IF EXISTS sync_application_to_kg;
CREATE TRIGGER sync_application_to_kg
    AFTER INSERT ON applications
    BEGIN
        INSERT INTO knowledge_nodes (id, label, node_type, content, metadata)
        VALUES (
            NEW.id,
            NEW.name,
            'application',
            NEW.purpose,
            json_object('version', NEW.current_version)
        );
    END;

DROP TRIGGER IF EXISTS sync_feature_to_kg;
CREATE TRIGGER sync_feature_to_kg
    AFTER INSERT ON features
    BEGIN
        INSERT INTO knowledge_nodes (id, label, node_type, content, metadata)
        VALUES (
            NEW.id,
            NEW.name,
            'feature',
            NEW.description,
            json_object('status', NEW.status)
        );
        
        INSERT INTO knowledge_edges (id, from_id, to_id, relationship)
        VALUES (
            'edge_' || lower(hex(randomblob(16))),
            NEW.application_id,
            NEW.id,
            'contains'
        );
    END;

DROP TRIGGER IF EXISTS sync_task_to_kg;
CREATE TRIGGER sync_task_to_kg
    AFTER INSERT ON tasks
    BEGIN
        INSERT INTO knowledge_nodes (id, label, node_type, content, metadata)
        VALUES (
            NEW.id,
            NEW.title,
            'task',
            NEW.description,
            json_object('type', NEW.task_type, 'status', NEW.status, 'file_path', NEW.file_path)
        );
        
        INSERT INTO knowledge_edges (id, from_id, to_id, relationship)
        VALUES (
            'edge_' || lower(hex(randomblob(16))),
            NEW.feature_id,
            NEW.id,
            'implements'
        );
    END;

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

INSERT OR IGNORE INTO processing_prompts (id, step_name, prompt_template, variables, description) VALUES 
(
    'chat_to_features',
    'chat_to_features',
    'Analyze this conversation and extract concrete features that can be implemented.

Conversation:
{{chat_content}}

Extract features in this exact JSON format:
{
  "features": [
    {
      "name": "kebab-case-name",
      "description": "Clear description of what this feature does",
      "requirements": ["specific requirement 1", "specific requirement 2"]
    }
  ]
}

Focus on implementable features, not abstract concepts. Each feature should be something a developer can build.',
    '["chat_content"]',
    'Extract implementable features from chat conversations'
),
(
    'features_to_tasks',
    'features_to_tasks',
    'Break down this feature into specific implementation tasks.

Feature: {{feature_name}}
Description: {{feature_description}}

Create tasks in this exact JSON format:
{
  "tasks": [
    {
      "title": "Specific task title",
      "description": "Detailed description of what to implement",
      "type": "implementation|test|docs|config",
      "file_path": "relative/path/to/file.ext",
      "dependencies": []
    }
  ]
}

Make each task specific and actionable. Include appropriate tests and documentation tasks.',
    '["feature_name", "feature_description"]',
    'Break features into specific implementation tasks'
),
(
    'task_to_code',
    'task_to_code',
    'Generate code for this implementation task.

Task: {{task_title}}
Description: {{task_description}}
File Path: {{file_path}}
Existing Code: {{existing_code}}

Generate complete, working code that implements this task.
If existing code is provided, modify it appropriately.
Return ONLY the code content, no explanations or markdown formatting.',
    '["task_title", "task_description", "file_path", "existing_code"]',
    'Generate code from task specifications'
);

-- Default configuration
INSERT OR IGNORE INTO config (key, value) VALUES 
('agent_provider', 'openai'),
('agent_model', 'gpt-4'),
('schema_version', '0.1.0'),
('bropilot_version', '0.1.0');
