import { startLocalSession } from './local-session.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

await import('./build-runner-manifest.mjs');
const temporaryDirectory = process.env.BROPILOT_EPHEMERAL_SESSION === '1'
  ? await mkdtemp(join(tmpdir(), 'bropilot-browser-')) : undefined;
const session = await startLocalSession({
  directory: temporaryDirectory ?? process.env.BROPILOT_LOCAL_SESSION_DIRECTORY ?? '.local-session/workspace',
  port: Number(process.env.BROPILOT_LOCAL_PORT ?? 8791),
});
console.log(`Local workspace and verifier ready: ${session.origin}`);
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  await session.stop();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of [session.server, session.runner]) {
  child.once('exit', async code => {
    if (!stopping) { console.error(`Local service exited (${code}); stopping session.`); process.exitCode = code || 1; await stop(); }
  });
}
