export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  responseFormat?: 'text' | 'json';
}

export interface CompletionResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
  model: string;
}

export interface LLMProvider {
  name: string;
  complete(
    prompt: string,
    options?: CompletionOptions,
  ): Promise<CompletionResult>;
  countTokens(text: string): number;
  estimateCost(tokens: number, model: string): number;
}
