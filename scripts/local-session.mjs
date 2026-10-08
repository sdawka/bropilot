import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Secrets live beside a generated local config, never in the deployable config.
export async function startLocalSession({ port = 8791, directory = resolve(root, '.local-session'), output = process.stdout, verifier = true } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const keys = { owner: randomBytes(32).toString('hex'), implementer: randomBytes(32).toString('hex'), verifier: randomBytes(32).toString('hex') };
  const config = JSON.parse(await readFile(resolve(root, 'apps/worker/wrangler.jsonc'), 'utf8'));
  config.main = resolve(root, 'apps/worker/src/index.ts');
  config.assets.directory = resolve(root, 'apps/web/dist');
  delete config.$schema;
  const configFile = resolve(directory, 'wrangler.json');
  await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  await writeFile(resolve(directory, '.dev.vars'), `LOCAL_WORKSPACE="enabled"\nLOCAL_OWNER_TOKEN="${keys.owner}"\nLOCAL_IMPLEMENTER_TOKEN="${keys.implementer}"\nLOCAL_VERIFIER_TOKEN="${keys.verifier}"\n`, { mode: 0o600 });
  const verifierTokenFile = resolve(directory, 'verifier-token');
  await writeFile(verifierTokenFile, keys.verifier, { mode: 0o600 });
  const origin = `http://127.0.0.1:${port}`;
  const children = [];
  const launch = args => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    children.push(child);
    return child;
  };
  const stop = async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited; clearTimeout(timer);
    }));
  };
  try {
    const server = launch([resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', configFile, '--ip', '127.0.0.1', '--port', String(port), '--local', '--persist-to', resolve(directory, 'state')]);
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Local Worker exited (${server.exitCode})`);
      try {
        const response = await fetch(`${origin}/api/v1/local/session`);
        if (response.ok && (await response.json()).enabled) { ready = true; break; }
      } catch { /* Startup is bounded and supervised. */ }
      await sleep(250);
    }
    if (!ready) throw new Error('Local Worker startup timeout');
    const runner = verifier ? launch([resolve(root, 'packages/local-verifier/src/cli.mjs'), '--origin', origin, '--token-file', verifierTokenFile, '--watch']) : null;
    return { origin, keys, stop, server, runner };
  } catch (error) { await stop(); throw error; }
}
