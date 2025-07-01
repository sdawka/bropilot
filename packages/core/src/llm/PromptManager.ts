import { LLMProvider, CompletionResult } from './LLMProvider';
import { PromptTemplateRepository } from './PromptTemplateRepository';
import { PromptTemplate } from './PromptTemplate';
import { z } from 'zod';

export class PromptManager {
  private templateRepo: PromptTemplateRepository;

  constructor(templateRepo: PromptTemplateRepository) {
    this.templateRepo = templateRepo;
  }

  async executePrompt(
    templateName: string,
    variables: Record<string, any>,
    provider: LLMProvider,
    responseSchema?: z.ZodTypeAny,
  ): Promise<any> {
    // 1. Load template
    const template: PromptTemplate | null =
      await this.templateRepo.getLatestByName(templateName);
    if (!template)
      throw new Error(`Prompt template "${templateName}" not found`);

    // 2. Substitute variables
    let prompt = template.template;
    for (const key of template.variables) {
      if (!(key in variables)) throw new Error(`Missing variable: ${key}`);
      prompt = prompt.replace(
        new RegExp(`{{\\s*${key}\\s*}}`, 'g'),
        variables[key],
      );
    }

    // 3. Execute prompt with provider
    let result: CompletionResult;
    try {
      result = await provider.complete(prompt, {
        systemPrompt: template.system_prompt,
        responseFormat: template.output_format as any,
      });
    } catch (err) {
      // TODO: Retry logic, error handling
      throw err;
    }

    // 4. Parse/validate response
    if (template.output_format === 'json' && responseSchema) {
      try {
        const json = JSON.parse(result.content);
        return responseSchema.parse(json);
      } catch (e) {
        throw new Error('Failed to parse or validate JSON response');
      }
    }

    return result.content;
  }
}
