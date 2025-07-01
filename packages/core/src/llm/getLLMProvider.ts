import { loadLLMConfig } from './llmConfig';
import { LLMProvider } from './LLMProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { OpenRouterProvider } from './OpenRouterProvider';

export function getLLMProvider(): LLMProvider {
  const config = loadLLMConfig();
  if (config.provider === 'openrouter') {
    return new OpenRouterProvider(
      config.openrouterApiKey,
      config.openrouterBaseUrl,
    );
  }
  return new OpenAIProvider(config.openaiApiKey);
}
