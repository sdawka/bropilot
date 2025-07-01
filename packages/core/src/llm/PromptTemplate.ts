export interface PromptTemplate {
  id: string;
  name: string;
  version: number;
  template: string;
  variables: string[]; // e.g., ['chat_content', 'entities']
  system_prompt?: string;
  output_format?: 'text' | 'json';
  created_at: number;
}
