import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createTypeSafeProvider } from './semantic-review.mjs';

export async function localSemanticProvider(path, { disabled = false } = {}) {
  if (disabled) return undefined;
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw new Error('Unable to read the local semantic configuration.'); }
  const key = parseEnv(text).TYPESAFE_API_KEY?.trim();
  if (!key || key === 'PASTE_YOUR_TYPESAFE_API_KEY_HERE') return undefined;
  return createTypeSafeProvider({ apiKey: key });
}
