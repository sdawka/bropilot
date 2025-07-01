import { PromptManager } from '../PromptManager';
import { PromptTemplateRepository } from '../PromptTemplateRepository';
import { PromptTemplate } from '../PromptTemplate';
import { LLMProvider, CompletionResult } from '../LLMProvider';
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
  async insert(template: Omit<PromptTemplate, 'id' | 'created_at'>) {
    const t: PromptTemplate = {
      ...template,
      id: Math.random().toString(),
      created_at: Date.now(),
    };
    this.templates.push(t);
    return t.id;
  }
}

describe('PromptManager', () => {
  const repo = new InMemoryPromptTemplateRepository();
  const manager = new PromptManager(repo);

  beforeEach(async () => {
    repo['templates'] = [];
    await repo.insert({
      name: 'test',
      version: 1,
      template: 'Hello, {{name}}!',
      variables: ['name'],
      output_format: 'text',
    });
    await repo.insert({
      name: 'json_test',
      version: 1,
      template: 'Data: {{data}}',
      variables: ['data'],
      output_format: 'json',
    });
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
