// The one Flue agent for the whole server: `Talk`. Registered explicitly via `start({ agents: [Talk] })`
// in agent/server.mjs (a standalone Node script, so no build step and no 'use agent' directive —
// see docs/guide/building-agents.md#standalone-scripts in node_modules/@flue/runtime).
// One session id ('talk') is shared by the main screen and every mirror.
import { useModel, useTool } from '@flue/runtime';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cueTools } from './tools.ts';

// prompt.md is generated (Stage 1-E, from src/ai/registry.ts's AI_FUNCTIONS); a missing file
// (fresh checkout before the first `npm run docs`) should never crash the agent server.
let PROMPT = '';
try {
  PROMPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'prompt.md'), 'utf8');
} catch {
  PROMPT = '';
}

// Set by server.mjs whenever a `snapshot` / `context` bus message arrives. Read fresh on every
// render, per Flue's re-render-every-turn contract (see building-agents.md).
let kernelDigest = '(no kernel snapshot yet — the main screen has not connected)';
let screenLine = '(no context yet — waiting for the main screen)';

export function setKernelDigest(text: string) {
  kernelDigest = text;
}
export function setScreenLine(text: string) {
  screenLine = text;
}

export function Talk() {
  useModel('anthropic/claude-sonnet-4-6');
  for (const tool of cueTools) useTool(tool);
  return `${PROMPT}\n\n## Kernel\n${kernelDigest}\n\n## Current screen\n${screenLine}`;
}
