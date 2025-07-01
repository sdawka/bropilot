export interface LLMConfig {
  provider: 'openai' | 'openrouter';
  openaiApiKey?: string;
  openrouterApiKey?: string;
  openrouterBaseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export function loadLLMConfig(): LLMConfig {
  return {
    provider: (process.env.LLM_PROVIDER as 'openai' | 'openrouter') || 'openai',
    openaiApiKey: process.env.OPENAI_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL,
    model: process.env.LLM_MODEL || 'gpt-4',
    maxTokens: process.env.LLM_MAX_TOKENS
      ? parseInt(process.env.LLM_MAX_TOKENS, 10)
      : 1024,
    temperature: process.env.LLM_TEMPERATURE
      ? parseFloat(process.env.LLM_TEMPERATURE)
      : 0.7,
  };
}
