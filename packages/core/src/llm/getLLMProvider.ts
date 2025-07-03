import { loadLLMConfig } from './llmConfig.js';
import { LLMProvider } from './LLMProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { OpenRouterProvider } from './OpenRouterProvider.js';

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
