// Kept for server.mjs: the Talk agent now lives in agent/agents/talk.ts and is built from
// src/agents.ts (docs/AGENT-RUNTIME.md). This file only re-exports.
export { Talk, setKernelDigest, setScreenLine } from './agents/talk.ts';
