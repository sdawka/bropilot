/**
 * Placeholder interfaces for module generation
 */
export interface ModuleGenerationOptions {
  domains?: string[];
  force?: boolean;
  interactive?: boolean;
  explain?: boolean;
}

export interface KnowledgeGraph {
  getDomainsByNames(names: string[]): Promise<Domain[]>;
  getAllDomains(): Promise<Domain[]>;
  getModuleByDomain(domainId: string): Promise<Module | null>;
  getFeaturesByDomain(domainId: string): Promise<Feature[]>;
}

export interface Domain {
  id: string;
  name: string;
  description: string;
  responsibilities: string[];
}

export interface Module {
  name: string;
  type: 'core' | 'ui';
  description: string;
  domain_id: string;
  interface: ModuleInterface;
  state: ModuleState;
  things: Thing[];
  behaviors: Behavior[];
  flows: Flow[];
  components?: Component[];
  screens?: Screen[];
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

export interface Thing {
  type: 'thing';
  name: string;
  description: string;
  schema: JsonSchema;
  invariants: string[];
  relationships: any[];
}

export interface Behavior {
  type: 'behavior';
  name: string;
  description: string;
  trigger: string;
  preconditions: string[];
  rules: string[];
  effects: string[];
}

export interface Flow {
  type: 'flow';
  name: string;
  description: string;
  steps: any[];
}

export interface Component {
  type: 'component';
  name: string;
  description: string;
  componentType: string; // renamed from 'type' to avoid conflict
  props: any;
}

export interface Screen {
  name: string;
  description: string;
  components: string[];
}

export interface Feature {
  id: string;
  name: string;
  purpose: string;
  requirements: string[];
}

export interface ExtractedEntity {
  name: string;
  description: string;
  suggestedFields: {
    name: string;
    type: string;
    constraints?: any;
    required?: boolean;
  }[];
  relationships: any[];
}

export interface JsonSchema {
  type: string;
  properties: { [key: string]: any };
  required: string[];
}

// --- Additional types for code generation ---

export interface Task {
  id: string;
  name: string;
  description: string;
  // Add more fields as needed
}

export interface CodeDependency {
  name: string;
  version?: string;
  path?: string;
  // Add more fields as needed
}

export interface ProjectConfig {
  language: string;
  methodology?: string;
  ui_framework?: string;
  styling?: string;
  test_components?: boolean;
  // Add more fields as needed
}

export interface Import {
  name: string;
  path: string;
  // Add more fields as needed
}

export interface Export {
  name: string;
  type: string;
  // Add more fields as needed
}

export interface GeneratedTest {
  filePath: string;
  content: string;
  // Add more fields as needed
}
