export class PromptTemplate {
  id: string;
  name: string;
  version: number;
  template: string;
  variables: string[]; // e.g., ['chat_content', 'entities']
  system_prompt?: string;
  output_format?: 'text' | 'json';
  created_at: number;

  constructor(
    id: string,
    name: string,
    version: number,
    template: string,
    variables: string[],
    system_prompt?: string,
    output_format?: 'text' | 'json',
    created_at?: number,
  ) {
    this.id = id;
    this.name = name;
    this.version = version;
    this.template = template;
    this.variables = variables;
    this.system_prompt = system_prompt;
    this.output_format = output_format;
    this.created_at = created_at || Date.now();
  }

  render(variables: Record<string, string>): string {
    let renderedTemplate = this.template;
    for (const key of this.variables) {
      const value = variables[key] || '';
      renderedTemplate = renderedTemplate.replace(
        new RegExp(`{{${key}}}`, 'g'),
        value,
      );
    }
    return renderedTemplate;
  }
}
