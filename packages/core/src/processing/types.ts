export interface ProcessingResult {
  sessionId?: string; // Optional for overall report
  processedMessages: number;
  extractedEntities: ExtractedEntities;
  conflicts: Conflict[];
  confidence: number;
}

export interface ExtractedEntity {
  type: string;
  name: string;
  confidence: number;
  sourceMessages: string[]; // message IDs
  attributes: Record<string, any>;
  description?: string; // Added for module generation
  suggestedFields?: {
    name: string;
    type: string;
    constraints?: any;
    required?: boolean;
  }[]; // Added for module generation
  relationships?: any[]; // Added for module generation
}

export interface ExtractedDomain extends ExtractedEntity {
  type: 'domain';
  description: string;
}

export interface JsonSchema {
  type: string;
  properties: { [key: string]: any };
  required: string[];
}

export interface ExtractedFeature extends ExtractedEntity {
  type: 'feature';
  purpose: string;
  domains: string[]; // names of domains
}

export interface ExtractedRequirement extends ExtractedEntity {
  type: 'requirement';
  description: string;
  feature?: string; // name of feature
}

export interface ExtractedEntities {
  domains: ExtractedDomain[];
  features: ExtractedFeature[];
  requirements: ExtractedRequirement[];
}

export interface Conflict {
  type: string;
  entity1: ExtractedEntity;
  entity2?: ExtractedEntity;
  resolution: 'manual' | 'auto' | 'create_domain';
  message?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ChatSession {
  id: string;
  name: string;
  lastProcessedMessageId: string | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  processed: boolean;
}

export interface ProcessOptions {
  quiet: boolean;
  force: boolean;
  rollbackOnError: boolean;
}
