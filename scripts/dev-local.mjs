import { startLocalSession } from './local-session.mjs';

await import('./build-runner-manifest.mjs');
const session = await startLocalSession();
console.log(`Local workspace and verifier ready: ${session.origin}`);
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await session.stop(); }
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of [session.server, session.runner]) {
  child.once('exit', async code => {
    if (!stopping) { console.error(`Local service exited (${code}); stopping session.`); process.exitCode = code || 1; await stop(); }
  });
}
