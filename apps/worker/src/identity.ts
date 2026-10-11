import { DurableObject } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type HostedRole = 'owner' | 'implementer' | 'verifier';

export type HostedPrincipal = {
  principalId: string;
  kind: 'human' | 'service';
  role?: HostedRole;
  worldId?: string;
  moveId?: string;
  operations?: string[];
  expiresAtMs?: number;
  runnerHash?: string;
  tokenId?: string;
  version?: number;
};

export interface HostedIdentityEnv {
  AUTH_MODE?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  IDENTITY_STORE?: DurableObjectNamespace<IdentityStore>;
}
export type ServiceTokenIssue = {
  principalId: string;
  role: HostedRole;
  worldId: string;
  moveId?: string;
  operations: string[];
  expiresAtMs: number;
  runnerHash?: string;
};

export type ServiceTokenMetadata = ServiceTokenIssue & {
  tokenId: string;
  version: number;
  createdAtMs: number;
  revokedAtMs?: number;
};

type StoredServiceToken = ServiceTokenMetadata & { tokenHash: string };
const SERVICE_TOKEN_PREFIX = 'bpst_v1';
const MAX_SERVICE_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const SERVICE_OPERATIONS: Record<HostedRole, ReadonlySet<string>> = {
  owner: new Set([
    'createMove', 'submitHostedCandidate', 'startVerification', 'promote',
    'registerDeploymentTarget', 'requestDeployment', 'requestRollback',
  ]),
  implementer: new Set(['submitHostedCandidate']),
  verifier: new Set(['claimRun', 'completeHostedRun']),
};

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomValue(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

function parseToken(token: string): { tokenId: string } | null {
  const match = /^bpst_v1_([A-Za-z0-9_-]{24})_([A-Za-z0-9_-]{43})$/.exec(token);
  return match ? { tokenId: match[1] } : null;
}

function publicMetadata(stored: StoredServiceToken): ServiceTokenMetadata {
  const { tokenHash: _tokenHash, ...metadata } = stored;
  return structuredClone(metadata);
}

function validateIssue(input: ServiceTokenIssue, nowMs: number): void {
  if (!input.principalId.trim()) throw new Error('principalId is required');
  if (!['owner', 'implementer', 'verifier'].includes(input.role)) throw new Error('invalid service role');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.worldId)) throw new Error('a valid world scope is required');
  if (input.moveId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.moveId)) throw new Error('invalid move scope');
  if (!Array.isArray(input.operations) || input.operations.length === 0 || input.operations.length > 32
    || input.operations.some((operation) => !SERVICE_OPERATIONS[input.role].has(operation))) {
    throw new Error(`service token contains an operation outside the ${input.role} scope`);
  }
  if (!Number.isSafeInteger(input.expiresAtMs) || input.expiresAtMs <= nowMs) throw new Error('expiresAtMs must be in the future');
  if (input.expiresAtMs - nowMs > MAX_SERVICE_TOKEN_LIFETIME_MS) throw new Error('service tokens may live for at most 24 hours');
  if (input.role === 'verifier' && !input.runnerHash) throw new Error('verifier service tokens require runnerHash');
  if (input.role !== 'verifier' && input.runnerHash !== undefined) throw new Error('runnerHash is only valid for verifier service tokens');
}

export class IdentityStore extends DurableObject<Record<string, never>> {
  async issue(input: ServiceTokenIssue): Promise<ServiceTokenMetadata & { token: string }> {
    const nowMs = Date.now();
    validateIssue(input, nowMs);
    const tokenId = randomValue(18);
    const token = `${SERVICE_TOKEN_PREFIX}_${tokenId}_${randomValue(32)}`;
    const stored: StoredServiceToken = {
      ...structuredClone(input),
      operations: [...new Set(input.operations)].sort(),
      tokenId,
      version: 1,
      createdAtMs: nowMs,
      tokenHash: await sha256(token),
    };
    await this.ctx.storage.put(`service:${tokenId}`, stored);
    return { ...publicMetadata(stored), token };
  }

  async read(tokenId: string): Promise<ServiceTokenMetadata | null> {
    const stored = await this.ctx.storage.get<StoredServiceToken>(`service:${tokenId}`);
    return stored ? publicMetadata(stored) : null;
  }

  async authenticate(clearToken: string, nowMs = Date.now()): Promise<HostedPrincipal | null> {
    const parsed = parseToken(clearToken);
    if (!parsed) return null;
    const stored = await this.ctx.storage.get<StoredServiceToken>(`service:${parsed.tokenId}`);
    if (!stored || stored.revokedAtMs !== undefined || stored.expiresAtMs <= nowMs) return null;
    const [provided, expected] = await Promise.all([sha256(clearToken), Promise.resolve(stored.tokenHash)]);
    const left = new TextEncoder().encode(provided);
    const right = new TextEncoder().encode(expected);
    if (left.byteLength !== right.byteLength) return null;
    let difference = 0;
    for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
    if (difference !== 0) return null;
    return {
      principalId: stored.principalId,
      kind: 'service',
      role: stored.role,
      worldId: stored.worldId,
      moveId: stored.moveId,
      operations: [...stored.operations],
      expiresAtMs: stored.expiresAtMs,
      runnerHash: stored.runnerHash,
      tokenId: stored.tokenId,
      version: stored.version,
    };
  }

  async revoke(tokenId: string, expectedVersion?: number): Promise<ServiceTokenMetadata | null> {
    const key = `service:${tokenId}`;
    const stored = await this.ctx.storage.get<StoredServiceToken>(key);
    if (!stored) return null;
    if (expectedVersion !== undefined && expectedVersion !== stored.version) throw new Error('service token version is stale');
    if (stored.revokedAtMs === undefined) {
      stored.revokedAtMs = Date.now();
      stored.version += 1;
      await this.ctx.storage.put(key, stored);
    }
    return publicMetadata(stored);
  }
}

function normalizedTeamDomain(value: string): string | null {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function authenticateHosted(request: Request, env: HostedIdentityEnv): Promise<HostedPrincipal | null> {
  if (env.AUTH_MODE !== 'hosted') return null;
  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (assertion) {
    const issuer = env.ACCESS_TEAM_DOMAIN ? normalizedTeamDomain(env.ACCESS_TEAM_DOMAIN) : null;
    if (!issuer || !env.ACCESS_AUD) return null;
    try {
      const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      const { payload } = await jwtVerify(assertion, jwks, {
        algorithms: ['RS256'], issuer, audience: env.ACCESS_AUD,
      });
      if (typeof payload.sub !== 'string' || payload.sub.length === 0 || typeof payload.exp !== 'number') return null;
      return { principalId: payload.sub, kind: 'human', expiresAtMs: payload.exp * 1_000 };
    } catch {
      return null;
    }
  }
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || !env.IDENTITY_STORE) return null;
  const token = authorization.slice('Bearer '.length);
  if (!token.startsWith(`${SERVICE_TOKEN_PREFIX}_`)) return null;
  return env.IDENTITY_STORE.getByName('service-identities-v1').authenticate(token);
}
