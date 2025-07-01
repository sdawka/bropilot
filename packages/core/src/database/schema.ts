export interface ApplicationSchema {
  id: string; // UUID
  name: string;
  purpose: string;
  current_phase: number; // 1-5
  current_version: string;
  created_at: number;
  updated_at: number;
}

export interface DomainSchema {
  id: string;
  application_id: string;
  name: string;
  description: string;
  responsibilities: string; // JSON array
}

export interface FeatureSchema {
  id: string;
  application_id: string;
  name: string;
  purpose: string;
  requirements: string; // JSON array
  metrics: string; // JSON array
}

export interface ModuleSchema {
  id: string;
  domain_id: string;
  name: string;
  description: string;
  type: string; // e.g., 'frontend', 'backend', 'shared'
}

export interface ThingSchema {
  id: string;
  module_id: string;
  name: string;
  description: string;
  type: string; // e.g., 'data_model', 'ui_component', 'service'
  properties: string; // JSON array of key-value pairs
}

export interface BehaviorSchema {
  id: string;
  thing_id: string;
  name: string;
  description: string;
  trigger_event: string;
  actions: string; // JSON array of actions
}

export interface FlowSchema {
  id: string;
  application_id: string;
  name: string;
  description: string;
  steps: string; // JSON array of flow steps
}

// Relationship tables
export interface FeatureDomainSchema {
  feature_id: string;
  domain_id: string;
}

export interface FlowBehaviorSchema {
  flow_id: string;
  behavior_id: string;
}

export interface FlowFeatureSchema {
  flow_id: string;
  feature_id: string;
}

export interface FlowModuleSchema {
  flow_id: string;
  module_id: string;
}

export interface FlowThingSchema {
  flow_id: string;
  thing_id: string;
}

export interface DatabaseSchema {
  applications: ApplicationSchema;
  domains: DomainSchema;
  features: FeatureSchema;
  modules: ModuleSchema;
  things: ThingSchema;
  behaviors: BehaviorSchema;
  flows: FlowSchema;
  feature_domains: FeatureDomainSchema;
  flow_behaviors: FlowBehaviorSchema;
  flow_features: FlowFeatureSchema;
  flow_modules: FlowModuleSchema;
  flow_things: FlowThingSchema;
}
