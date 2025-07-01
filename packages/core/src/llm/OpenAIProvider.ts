import {
  LLMProvider,
  CompletionOptions,
  CompletionResult,
} from './LLMProvider';
import { TokenUtils } from './TokenUtils';
import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
  }

  async complete(
    prompt: string,
    options?: CompletionOptions,
  ): Promise<CompletionResult> {
    const model = options?.model || DEFAULT_MODEL;
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 1024;
    const systemPrompt = options?.systemPrompt;
    const responseFormat = options?.responseFormat || 'text';

    let retries = 0;
    const maxRetries = 3;
    let lastError: any = null;

    while (retries < maxRetries) {
      try {
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await this.client.chat.completions.create({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format:
            responseFormat === 'json' ? { type: 'json_object' } : undefined,
        });

        const content = response.choices[0]?.message?.content ?? '';
        const promptTokens =
          response.usage?.prompt_tokens ??
          TokenUtils.countTokens(prompt, model);
        const completionTokens =
          response.usage?.completion_tokens ??
          TokenUtils.countTokens(content, model);
        const totalTokens =
          response.usage?.total_tokens ?? promptTokens + completionTokens;
        const cost = TokenUtils.estimateCost(totalTokens, model);

        return {
          content,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
          cost,
          model,
        };
      } catch (err: any) {
        lastError = err;
        // Handle rate limit and retryable errors
        if (err.status === 429 || (err.code && err.code === 'ETIMEDOUT')) {
          const backoff = Math.pow(2, retries) * 1000;
          await new Promise((res) => setTimeout(res, backoff));
          retries++;
        } else {
          throw err;
        }
      }
    }
    throw lastError || new Error('OpenAI completion failed after retries');
  }

  countTokens(text: string, model: string = DEFAULT_MODEL): number {
    return TokenUtils.countTokens(text, model);
  }

  estimateCost(tokens: number, model: string = DEFAULT_MODEL): number {
    return TokenUtils.estimateCost(tokens, model);
  }
}
