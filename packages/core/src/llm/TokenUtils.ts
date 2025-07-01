import { encoding_for_model, TiktokenModel } from 'tiktoken';

const SUPPORTED_MODELS: TiktokenModel[] = [
  'gpt-4',
  'gpt-4-32k',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k',
];

function toTiktokenModel(model: string): TiktokenModel {
  if (SUPPORTED_MODELS.includes(model as TiktokenModel)) {
    return model as TiktokenModel;
  }
  return 'gpt-4';
}

export class TokenUtils {
  static countTokens(text: string, model: string = 'gpt-4'): number {
    try {
      const enc = encoding_for_model(toTiktokenModel(model));
      const tokens = enc.encode(text);
      enc.free();
      return tokens.length;
    } catch {
      // Fallback: rough estimate (1 token ≈ 4 chars)
      return Math.ceil(text.length / 4);
    }
  }

  static estimateCost(tokens: number, model: string = 'gpt-4'): number {
    // Example pricing (USD per 1K tokens, update as needed)
    const pricing: Record<string, number> = {
      'gpt-4': 0.03, // input
      'gpt-4-turbo': 0.01,
      'gpt-3.5-turbo': 0.002,
    };
    const pricePer1K = pricing[model] ?? 0.03;
    return (tokens / 1000) * pricePer1K;
  }
}
