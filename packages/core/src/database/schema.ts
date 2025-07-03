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
  application_id: string; // Added
  name: string;
  description: string;
  responsibilities: string; // JSON array of strings
  created_at: number;
  updated_at: number;
}

export interface FeatureSchema {
  id: string;
  application_id: string;
  name: string;
  purpose: string;
  requirements: string; // JSON array of strings
  metrics: string; // JSON array
  created_at: number;
  updated_at: number;
}

export interface ModuleSchema {
  id: string;
  domain_id: string;
  name: string;
  description: string;
  type: 'core' | 'ui';
  interface: string; // JSON string of ModuleInterface
  state: string; // JSON string of ModuleState
  things: string; // JSON string of Thing[]
  behaviors: string; // JSON string of Behavior[]
  flows: string; // JSON string of Flow[]
  components: string; // JSON string of Component[]
  screens: string; // JSON string of Screen[]
  created_at: number;
  updated_at: number;
}

export interface ModuleInterface {
  type: 'web_app' | 'rpc_api';
  description: string;
}

export interface ModuleState {
  type: 'nanostores' | 'postgresql';
  stores?: any[];
  schema?: string;
}

export interface ThingSchema {
  id: string;
  module_id: string;
  name: string;
  description: string;
  schema: string; // JSON
  invariants: string; // JSON array of strings
  relationships: string; // JSON array of any
  created_at: number;
  updated_at: number;
}

export interface BehaviorSchema {
  id: string;
  module_id: string;
  name: string;
  description: string;
  input_schema: string; // JSON
  output_schema: string; // JSON
  actions: string; // JSON
  trigger: string; // New field
  created_at: number;
  updated_at: number;
}

export interface FlowSchema {
  id: string;
  application_id: string;
  module_id: string;
  name: string;
  description: string;
  steps: string; // JSON
  created_at: number;
  updated_at: number;
}

export interface ComponentSchema {
  id: string;
  module_id: string;
  name: string;
  description: string;
  props_schema: string; // JSON
  events_schema: string; // JSON
  created_at: number;
  updated_at: number;
}

export interface ScreenSchema {
  id: string;
  module_id: string;
  name: string;
  description: string;
  route: string;
  components: string; // JSON
  created_at: number;
  updated_at: number;
}

export interface InfrastructureSchema {
  id: string;
  name: string;
  description: string;
  type: string;
  configuration: string; // JSON
  created_at: number;
  updated_at: number;
}

export interface ContractSchema {
  id: string;
  name: string;
  description: string;
  type: string;
  schema: string; // JSON
  endpoints: string; // JSON
  created_at: number;
  updated_at: number;
}

export interface ReleaseSchema {
  id: string;
  name: string;
  description: string;
  version: string;
  release_date: number; // Unix timestamp
  features_included: string; // JSON
  created_at: number;
  updated_at: number;
}

export interface WorkPlanSchema {
  id: string;
  name: string;
  description: string;
  status: string;
  start_date: number; // Unix timestamp
  end_date: number; // Unix timestamp
  tasks: string; // JSON
  created_at: number;
  updated_at: number;
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
  components: ComponentSchema;
  screens: ScreenSchema;
  infrastructure: InfrastructureSchema;
  contracts: ContractSchema;
  releases: ReleaseSchema;
  work_plans: WorkPlanSchema;
  chat_sessions: ChatSessionSchema;
  chat_messages: ChatMessageSchema;
}

export interface ChatSessionSchema {
  id: string; // UUID
  application_id: string; // Link to the application this session belongs to
  name: string;
  created_at: number;
  updated_at: number;
  last_processed_message_id: string | null; // ID of the last message processed in this session
}

export interface ChatMessageSchema {
  id: string; // UUID
  session_id: string; // Foreign key to chat_sessions
  role: 'user' | 'assistant';
  content: string;
  timestamp: number; // Unix timestamp
  processed: boolean; // Flag to indicate if the message has been processed by the pipeline
}
