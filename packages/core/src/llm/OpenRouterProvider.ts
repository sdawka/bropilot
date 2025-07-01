import { OpenAIProvider } from './OpenAIProvider';
import OpenAI from 'openai';

export class OpenRouterProvider extends OpenAIProvider {
  name = 'openrouter';

  constructor(apiKey?: string, baseURL?: string) {
    // OpenRouter uses OpenAI-compatible API, but with a different endpoint and API key
    // Docs: https://openrouter.ai/docs#api-endpoint
    super(apiKey || process.env.OPENROUTER_API_KEY);
    // @ts-ignore: OpenAI client type mismatch
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENROUTER_API_KEY,
      baseURL:
        baseURL ||
        process.env.OPENROUTER_BASE_URL ||
        'https://openrouter.ai/api/v1',
    });
  }
}
