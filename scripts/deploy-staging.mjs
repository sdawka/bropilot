import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Provision the named storage resources and registered OAuth client before release.
const names = ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'CF_OAUTH_CLIENT_ID',
  'CF_OAUTH_CLIENT_SECRET', 'CF_OAUTH_REDIRECT_URI', 'CF_OAUTH_SCOPES',
  'CONNECTION_ENCRYPTION_KEY', 'TRUSTED_VERIFIER_SUBS'];
const missing = ['CLOUDFLARE_ACCOUNT_ID', ...names].filter(name => !process.env[name]?.trim());
if (missing.length) throw new Error(`Staging configuration missing: ${missing.join(', ')}`);
if (!/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('Invalid platform account ID');
const redirect = new URL(process.env.CF_OAUTH_REDIRECT_URI);
if (redirect.protocol !== 'https:' || redirect.pathname !== '/api/v1/cloudflare/connections/callback'
  || redirect.search || redirect.hash || redirect.username || redirect.password) throw new Error('Register the exact HTTPS OAuth callback');
if (!/^[A-Za-z0-9_-]{43}=?$/.test(process.env.CONNECTION_ENCRYPTION_KEY)
  || Buffer.from(process.env.CONNECTION_ENCRYPTION_KEY, 'base64url').byteLength !== 32) throw new Error('Encryption key must be 32 bytes encoded as base64url');
const dryRun = process.argv.includes('--dry-run');
if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported');
const directory = await mkdtemp(join(tmpdir(), 'bropilot-release-'));
try {
  const secrets = join(directory, 'secrets.json');
  await writeFile(secrets, JSON.stringify(Object.fromEntries(names.map(name => [name, process.env[name]]))), { mode: 0o600 });
  const cwd = fileURLToPath(new URL('../apps/worker/', import.meta.url));
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const args = [wrangler, 'deploy', '--env', 'staging', '--secrets-file', secrets, '--strict'];
  if (dryRun) args.push('--dry-run');
  else args.push('--domains', redirect.hostname);
  const result = spawnSync(process.execPath, args, { cwd, env: process.env, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(directory, { recursive: true, force: true }); }
