import { PromptManager } from '../PromptManager.js';
import { PromptTemplateRepository } from '../PromptTemplateRepository.js';
import { PromptTemplate } from '../PromptTemplate.js';
import { LLMProvider, CompletionResult } from '../LLMProvider.js';
import { z } from 'zod';

class MockProvider implements LLMProvider {
  name = 'mock';
  private responses: string[];
  private failCount: number;
  private failTimes: number;

  constructor(responses: string[], failTimes = 0) {
    this.responses = responses;
    this.failCount = 0;
    this.failTimes = failTimes;
  }

  async complete(prompt: string): Promise<CompletionResult> {
    if (this.failCount < this.failTimes) {
      this.failCount++;
      const err: any = new Error('Rate limit');
      err.status = 429;
      throw err;
    }
    return {
      content: this.responses.shift() ?? '',
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      cost: 0.01,
      model: 'mock',
    };
  }

  countTokens(text: string): number {
    return 1;
  }
  estimateCost(tokens: number, model: string): number {
    return 0.01;
  }
}

class InMemoryPromptTemplateRepository extends PromptTemplateRepository {
  private templates: PromptTemplate[] = [];
  constructor() {
    super({} as any);
  }
  async getLatestByName(name: string) {
    return (
      this.templates
        .filter((t) => t.name === name)
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }
  async insert(template: {
    name: string;
    version: number;
    template: string;
    variables: string[];
    system_prompt?: string;
    output_format?: 'text' | 'json';
  }) {
    const t = new PromptTemplate(
      Math.random().toString(), // id
      template.name,
      template.version,
      template.template,
      template.variables,
      template.system_prompt,
      template.output_format,
      Date.now(), // created_at
    );
    this.templates.push(t);
    return t.id;
  }
}

describe('PromptManager', () => {
  const repo = new InMemoryPromptTemplateRepository();
  const manager = new PromptManager(repo);

  beforeEach(async () => {
    repo['templates'] = [];
    await repo.insert(
      new PromptTemplate(
        'test-id-1',
        'test',
        1,
        'Hello, {{name}}!',
        ['name'],
        undefined,
        'text',
      ),
    );
    await repo.insert(
      new PromptTemplate(
        'test-id-2',
        'json_test',
        1,
        'Data: {{data}}',
        ['data'],
        undefined,
        'json',
      ),
    );
  });

  it('executes a prompt and returns text', async () => {
    const provider = new MockProvider(['Hello, John!']);
    const result = await manager.executePrompt(
      'test',
      { name: 'John' },
      provider,
    );
    expect(result).toBe('Hello, John!');
  });

  it('throws on missing variable', async () => {
    const provider = new MockProvider(['']);
    await expect(manager.executePrompt('test', {}, provider)).rejects.toThrow(
      /Missing variable/,
    );
  });

  it('retries on rate limit and succeeds', async () => {
    const provider = new MockProvider(['Hello, Retry!'], 2);
    const result = await manager.executePrompt(
      'test',
      { name: 'Retry' },
      provider,
    );
    expect(result).toBe('Hello, Retry!');
  });

  it('parses and validates JSON response', async () => {
    const provider = new MockProvider(['{"foo": 123}']);
    const schema = z.object({ foo: z.number() });
    const result = await manager.executePrompt(
      'json_test',
      { data: 'bar' },
      provider,
      schema,
    );
    expect(result).toEqual({ foo: 123 });
  });

  it('throws on invalid JSON', async () => {
    const provider = new MockProvider(['not json']);
    const schema = z.object({ foo: z.number() });
    await expect(
      manager.executePrompt('json_test', { data: 'bar' }, provider, schema),
    ).rejects.toThrow(/parse or validate/);
  });
});
