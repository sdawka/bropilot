export interface KnowledgeNode {
  id: string;
  label: string;
  node_type: 'application' | 'feature' | 'task' | 'requirement';
  content?: string;
  metadata?: any;
  created_at: number;
  updated_at: number;
}

export interface KnowledgeEdge {
  id: string;
  from_id: string;
  to_id: string;
  relationship: 'contains' | 'implements' | 'requires' | 'depends_on';
  created_at: number;
}

export interface Application {
  id: string;
  name: string;
  purpose?: string;
  current_version: string;
  created_at: number;
  updated_at: number;
}

export interface Feature {
  id: string;
  name: string;
  description?: string;
  application_id: string;
  status: 'planned' | 'in_progress' | 'completed';
  created_at: number;
  updated_at: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  feature_id?: string;
  task_type: 'implementation' | 'test' | 'docs' | 'config';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  file_path?: string;
  generated_content?: string;
  created_at: number;
  updated_at: number;
}

export interface ChatSession {
  id: string;
  session_name?: string;
  started_at: number;
  status: 'active' | 'completed' | 'archived';
  total_messages: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  message_order: number;
}

export interface ProcessingPrompt {
  id: string;
  step_name: string;
  prompt_template: string;
  variables?: string[];
  description?: string;
  active: boolean;
  created_at: number;
  updated_at: number;
}
