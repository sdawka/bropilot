CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  current_phase INTEGER DEFAULT 1,
  current_version TEXT DEFAULT '0.0.0',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  responsibilities TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  UNIQUE(application_id, name)
);

CREATE TABLE features (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  requirements TEXT NOT NULL, -- JSON array
  metrics TEXT NOT NULL, -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  UNIQUE(application_id, name)
);

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL, -- 'core' or 'ui'
  interface TEXT NOT NULL, -- JSON string of ModuleInterface
  state TEXT NOT NULL, -- JSON string of ModuleState
  things TEXT, -- JSON string of Thing[]
  behaviors TEXT, -- JSON string of Behavior[]
  flows TEXT, -- JSON string of Flow[]
  components TEXT, -- JSON string of Component[]
  screens TEXT, -- JSON string of Screen[]
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (domain_id) REFERENCES domains(id),
  UNIQUE(domain_id, name)
);

CREATE TABLE things (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  schema TEXT NOT NULL, -- JSON
  invariants TEXT NOT NULL, -- JSON array of strings
  relationships TEXT NOT NULL, -- JSON array of any
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (module_id) REFERENCES modules(id),
  UNIQUE(module_id, name)
);

CREATE TABLE behaviors (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL, -- Changed from thing_id
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger TEXT NOT NULL, -- Changed from trigger_event
  input_schema TEXT NOT NULL, -- JSON
  output_schema TEXT NOT NULL, -- JSON
  actions TEXT NOT NULL, -- JSON array of actions
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (module_id) REFERENCES modules(id), -- Changed from thing_id
  UNIQUE(module_id, name) -- Changed from thing_id
);

CREATE TABLE flows (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL, -- JSON array of flow steps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (module_id) REFERENCES modules(id),
  UNIQUE(application_id, name)
);

-- Relationship tables
CREATE TABLE feature_domains (
  feature_id TEXT NOT NULL,
  domain_id TEXT NOT NULL,
  PRIMARY KEY (feature_id, domain_id),
  FOREIGN KEY (feature_id) REFERENCES features(id),
  FOREIGN KEY (domain_id) REFERENCES domains(id)
) WITHOUT ROWID;

CREATE TABLE flow_behaviors (
  flow_id TEXT NOT NULL,
  behavior_id TEXT NOT NULL,
  PRIMARY KEY (flow_id, behavior_id),
  FOREIGN KEY (flow_id) REFERENCES flows(id),
  FOREIGN KEY (behavior_id) REFERENCES behaviors(id)
) WITHOUT ROWID;

CREATE TABLE flow_features (
  flow_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  PRIMARY KEY (flow_id, feature_id),
  FOREIGN KEY (flow_id) REFERENCES flows(id),
  FOREIGN KEY (feature_id) REFERENCES features(id)
) WITHOUT ROWID;

CREATE TABLE flow_modules (
  flow_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  PRIMARY KEY (flow_id, module_id),
  FOREIGN KEY (flow_id) REFERENCES flows(id),
  FOREIGN KEY (module_id) REFERENCES modules(id)
) WITHOUT ROWID;

CREATE TABLE flow_things (
  flow_id TEXT NOT NULL,
  thing_id TEXT NOT NULL,
  PRIMARY KEY (flow_id, thing_id),
  FOREIGN KEY (flow_id) REFERENCES flows(id),
  FOREIGN KEY (thing_id) REFERENCES things(id)
) WITHOUT ROWID;
-- Prompt templates for LLM integration
CREATE TABLE IF NOT EXISTS prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  template TEXT NOT NULL,
  variables TEXT NOT NULL, -- JSON array of variable names
  system_prompt TEXT,
  output_format TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_name_version
  ON prompt_templates (name, version);

CREATE TABLE chat_sessions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_processed_message_id TEXT, -- NULL if no messages processed yet
  FOREIGN KEY (application_id) REFERENCES applications(id)
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT 0, -- 0 for false, 1 for true
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);