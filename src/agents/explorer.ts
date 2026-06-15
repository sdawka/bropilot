import { createAgent, type AgentRouteHandler } from '@flue/runtime';
import { graphTools } from '../genome/tools.js';
import { SYSTEM_PROMPT } from '../genome/prompt.js';

export const route: AgentRouteHandler = async (_c, next) => next();

export default createAgent(() => ({
  model: 'openrouter/anthropic/claude-sonnet-4-6',
  instructions: SYSTEM_PROMPT,
  tools: graphTools,
}));
