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
  FOREIGN KEY (application_id) REFERENCES applications(id),
  UNIQUE(application_id, name)
);

CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL, -- e.g., 'frontend', 'backend', 'shared'
  FOREIGN KEY (domain_id) REFERENCES domains(id),
  UNIQUE(domain_id, name)
);

CREATE TABLE things (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL, -- e.g., 'data_model', 'ui_component', 'service'
  properties TEXT NOT NULL, -- JSON array of key-value pairs
  FOREIGN KEY (module_id) REFERENCES modules(id),
  UNIQUE(module_id, name)
);

CREATE TABLE behaviors (
  id TEXT PRIMARY KEY,
  thing_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  actions TEXT NOT NULL, -- JSON array of actions
  FOREIGN KEY (thing_id) REFERENCES things(id),
  UNIQUE(thing_id, name)
);

CREATE TABLE flows (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT NOT NULL, -- JSON array of flow steps
  FOREIGN KEY (application_id) REFERENCES applications(id),
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