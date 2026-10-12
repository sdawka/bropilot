import { DurableObject } from 'cloudflare:workers';

const AUTHORIZATION_ENDPOINT = 'https://dash.cloudflare.com/oauth2/auth';
const TOKEN_ENDPOINT = 'https://dash.cloudflare.com/oauth2/token';
const REVOKE_ENDPOINT = 'https://dash.cloudflare.com/oauth2/revoke';
const USERINFO_ENDPOINT = 'https://dash.cloudflare.com/oauth2/userinfo';
const API_BASE = 'https://api.cloudflare.com/client/v4';
const STATE_LIFETIME_MS = 10 * 60 * 1_000;

export interface OAuthFetchPort { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }

export interface CloudflareOAuthEnv {
  CF_OAUTH_CLIENT_ID: string;
  CF_OAUTH_CLIENT_SECRET?: string;
  CF_OAUTH_REDIRECT_URI: string;
  CF_OAUTH_SCOPES: string;
  CONNECTION_ENCRYPTION_KEY: string;
  CLOUDFLARE_FETCH?: OAuthFetchPort;
}
type PendingAuthorization = {
  principalId: string;
  origin: string;
  redirectUri: string;
  verifier: string;
  expiresAtMs: number;
};

type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAtMs: number;
};

type EncryptedTokens = { iv: string; ciphertext: string };

type StoredConnection = {
  connectionId: string;
  principalId: string;
  providerSubject?: string;
  connectedAtMs: number;
  tokens: EncryptedTokens;
  accountId?: string;
  workersSubdomain?: string;
};

type ConnectionBinding = {
  connectionId: string;
  principalId: string;
  providerSubject: string;
  accountId?: string;
  workersSubdomain?: string;
};

export type CloudflareConnectionMetadata = {
  connectionId: string;
  provider: 'cloudflare';
  providerSubject?: string;
  connectedAtMs: number;
  accountId?: string;
  workersSubdomain?: string;
  expiresAtMs: number;
  reconnectRequired: boolean;
  accountConfirmationRequired: boolean;
};

function encode(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value: string): Uint8Array {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomString(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return encode(bytes);
}

async function challenge(verifier: string): Promise<string> {
  return encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

function fetchPort(env: CloudflareOAuthEnv): OAuthFetchPort {
  return env.CLOUDFLARE_FETCH ?? { fetch: (input, init) => fetch(input, init) };
}

function checkedConfiguration(env: CloudflareOAuthEnv): { redirect: URL; scopes: string[] } {
  if (!env.CF_OAUTH_CLIENT_ID) throw new Error('Cloudflare OAuth client ID is unavailable');
  const redirect = new URL(env.CF_OAUTH_REDIRECT_URI);
  if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.search) {
    throw new Error('Cloudflare OAuth redirect URI must be an exact HTTPS URL without query or fragment');
  }
  const scopes = env.CF_OAUTH_SCOPES.split(/\s+/).filter(Boolean);
  if (scopes.length === 0) throw new Error('Cloudflare OAuth scopes are unavailable');
  const key = decode(env.CONNECTION_ENCRYPTION_KEY);
  if (key.byteLength !== 32) throw new Error('connection encryption key must be 32 bytes');
  return { redirect, scopes };
}

async function encryptionKey(env: CloudflareOAuthEnv): Promise<CryptoKey> {
  checkedConfiguration(env);
  return crypto.subtle.importKey('raw', decode(env.CONNECTION_ENCRYPTION_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptTokens(env: CloudflareOAuthEnv, principalId: string, tokens: OAuthTokens): Promise<EncryptedTokens> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`bropilot-cloudflare:${principalId}`) },
    await encryptionKey(env),
    new TextEncoder().encode(JSON.stringify(tokens)),
  );
  return { iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}

async function decryptTokens(env: CloudflareOAuthEnv, principalId: string, encrypted: EncryptedTokens): Promise<OAuthTokens> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(encrypted.iv), additionalData: new TextEncoder().encode(`bropilot-cloudflare:${principalId}`) },
    await encryptionKey(env),
    decode(encrypted.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as OAuthTokens;
}

async function providerJson<T>(env: CloudflareOAuthEnv, input: RequestInfo | URL, init: RequestInit): Promise<T> {
  const response = await fetchPort(env).fetch(input, init);
  const body = await response.json().catch(() => null) as T | { errors?: Array<{ message?: string }> } | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'errors' in body ? body.errors?.[0]?.message : undefined;
    throw new Error(message || `Cloudflare request failed with status ${response.status}`);
  }
  return body as T;
}

function tokenPayload(value: unknown, nowMs: number, existingRefreshToken?: string): OAuthTokens {
  if (!value || typeof value !== 'object') throw new Error('Cloudflare token response is malformed');
  const token = value as Record<string, unknown>;
  if (typeof token.access_token !== 'string' || token.access_token.length === 0
    || typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) {
    throw new Error('Cloudflare token response is malformed');
  }
  if (token.refresh_token !== undefined && typeof token.refresh_token !== 'string') throw new Error('Cloudflare token response is malformed');
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? existingRefreshToken,
    tokenType: typeof token.token_type === 'string' ? token.token_type : 'Bearer',
    expiresAtMs: nowMs + Math.floor(token.expires_in * 1_000),
  };
}

async function revokeTokens(env: CloudflareOAuthEnv, tokens: OAuthTokens): Promise<void> {
  for (const token of [tokens.refreshToken, tokens.accessToken].filter((value): value is string => Boolean(value))) {
    const form = new URLSearchParams({ token, client_id: env.CF_OAUTH_CLIENT_ID });
    if (env.CF_OAUTH_CLIENT_SECRET) form.set('client_secret', env.CF_OAUTH_CLIENT_SECRET);
    const response = await fetchPort(env).fetch(REVOKE_ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form,
    });
    if (!response.ok) throw new Error(`Cloudflare token revocation failed with status ${response.status}`);
  }
}

function callbackMatches(callback: URL, redirect: URL): boolean {
  return callback.origin === redirect.origin && callback.pathname === redirect.pathname
    && callback.username === redirect.username && callback.password === redirect.password
    && callback.hash === '';
}

export class CloudflareConnectionStore extends DurableObject<CloudflareOAuthEnv> {
  private refreshInFlight?: Promise<{ connection: StoredConnection; tokens: OAuthTokens }>;

  async startConnection(principalId: string, requestOrigin: string, nowMs = Date.now()): Promise<{ authorizationUrl: string; state: string }> {
    const { redirect, scopes } = checkedConfiguration(this.env);
    if (!principalId.trim()) throw new Error('principalId is required');
    if (new URL(requestOrigin).origin !== redirect.origin || requestOrigin !== redirect.origin) throw new Error('request origin does not match OAuth redirect origin');
    const state = randomString(24);
    const verifier = randomString(48);
    const pending: PendingAuthorization = { principalId, origin: requestOrigin, redirectUri: redirect.toString(), verifier, expiresAtMs: nowMs + STATE_LIFETIME_MS };
    await this.ctx.storage.put(`oauth-state:${state}`, pending);
    const authorizationUrl = new URL(AUTHORIZATION_ENDPOINT);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', this.env.CF_OAUTH_CLIENT_ID);
    authorizationUrl.searchParams.set('redirect_uri', redirect.toString());
    authorizationUrl.searchParams.set('scope', scopes.join(' '));
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('code_challenge', await challenge(verifier));
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    return { authorizationUrl: authorizationUrl.toString(), state };
  }

  async completeConnection(principalId: string, requestOrigin: string, callbackUrl: string, nowMs = Date.now()): Promise<CloudflareConnectionMetadata> {
    const { redirect } = checkedConfiguration(this.env);
    if (requestOrigin !== redirect.origin) throw new Error('callback origin does not match OAuth redirect origin');
    const callback = new URL(callbackUrl);
    if (!callbackMatches(callback, redirect)) throw new Error('callback does not match the registered redirect URI');
    const allowed = new Set(['code', 'state']);
    if ([...callback.searchParams.keys()].some((key) => !allowed.has(key))) throw new Error('callback contains unexpected parameters');
    const state = callback.searchParams.get('state');
    const code = callback.searchParams.get('code');
    if (!state || !code || callback.searchParams.getAll('state').length !== 1 || callback.searchParams.getAll('code').length !== 1) {
      throw new Error('callback requires exactly one code and state');
    }
    const key = `oauth-state:${state}`;
    const pending = await this.ctx.storage.get<PendingAuthorization>(key);
    if (!pending || pending.principalId !== principalId || pending.origin !== requestOrigin
      || pending.redirectUri !== redirect.toString() || pending.expiresAtMs < nowMs) {
      throw new Error('OAuth state is invalid or expired');
    }
    await this.ctx.storage.delete(key);
    if (await this.ctx.storage.get<StoredConnection>('connection')) throw new Error('Cloudflare connection already exists; disconnect it before reconnecting');
    const form = new URLSearchParams({
      grant_type: 'authorization_code', code, client_id: this.env.CF_OAUTH_CLIENT_ID,
      redirect_uri: redirect.toString(), code_verifier: pending.verifier,
    });
    if (this.env.CF_OAUTH_CLIENT_SECRET) form.set('client_secret', this.env.CF_OAUTH_CLIENT_SECRET);
    const rawTokens = await providerJson<unknown>(this.env, TOKEN_ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form,
    });
    const tokens = tokenPayload(rawTokens, nowMs);
    const userinfo = await providerJson<Record<string, unknown>>(this.env, USERINFO_ENDPOINT, {
      method: 'GET', headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    if (typeof userinfo.sub !== 'string' || userinfo.sub.length === 0) {
      await revokeTokens(this.env, tokens);
      throw new Error('Cloudflare user info did not provide a stable subject');
    }
    const providerSubject = userinfo.sub;
    const encrypted = await encryptTokens(this.env, principalId, tokens);
    let connection: StoredConnection | undefined;
    let conflict: 'active' | 'identity' | undefined;
    await this.ctx.storage.transaction(async (transaction) => {
      if (await transaction.get<StoredConnection>('connection')) {
        conflict = 'active';
        return;
      }
      const existingBinding = await transaction.get<ConnectionBinding>('connection-binding');
      if (existingBinding && (existingBinding.principalId !== principalId || existingBinding.providerSubject !== providerSubject)) {
        conflict = 'identity';
        return;
      }
      const binding: ConnectionBinding = existingBinding ?? {
        connectionId: crypto.randomUUID(), principalId, providerSubject,
      };
      connection = {
        connectionId: binding.connectionId, principalId, providerSubject,
        connectedAtMs: nowMs, tokens: encrypted,
      };
      if (!existingBinding) await transaction.put('connection-binding', binding);
      await transaction.put('connection', connection);
    });
    if (conflict || !connection) {
      await revokeTokens(this.env, tokens);
      if (conflict === 'identity') throw new Error('Cloudflare subject does not match the identity bound to this connection');
      throw new Error('Cloudflare connection already exists; disconnect it before reconnecting');
    }
    return this.metadata(connection, tokens, nowMs);
  }

  async revokePendingAuthorization(principalId: string, state: string): Promise<boolean> {
    const key = `oauth-state:${state}`;
    const pending = await this.ctx.storage.get<PendingAuthorization>(key);
    if (!pending || pending.principalId !== principalId) return false;
    return this.ctx.storage.delete(key);
  }

  private async owned(principalId: string, expectedConnectionId?: string): Promise<{ connection: StoredConnection; tokens: OAuthTokens }> {
    const connection = await this.ctx.storage.get<StoredConnection>('connection');
    if (!connection || connection.principalId !== principalId) throw new Error('Cloudflare connection not found');
    if (expectedConnectionId !== undefined && connection.connectionId !== expectedConnectionId) throw new Error('Cloudflare connection identity changed');
    return { connection, tokens: await decryptTokens(this.env, principalId, connection.tokens) };
  }

  private metadata(connection: StoredConnection, tokens: OAuthTokens, nowMs: number): CloudflareConnectionMetadata {
    return {
      connectionId: connection.connectionId, provider: 'cloudflare', providerSubject: connection.providerSubject,
      connectedAtMs: connection.connectedAtMs, accountId: connection.accountId,
      workersSubdomain: connection.workersSubdomain, expiresAtMs: tokens.expiresAtMs,
      reconnectRequired: tokens.expiresAtMs <= nowMs && !tokens.refreshToken,
      accountConfirmationRequired: connection.accountId === undefined,
    };
  }

  async confirmAccount(principalId: string, accountId: string): Promise<CloudflareConnectionMetadata> {
    if (!/^[0-9a-f]{32}$/i.test(accountId)) throw new Error('account ID must be a 32-character hexadecimal value');
    const { connection } = await this.owned(principalId);
    const binding = await this.ctx.storage.get<ConnectionBinding>('connection-binding');
    if (!binding || binding.connectionId !== connection.connectionId || binding.providerSubject !== connection.providerSubject) {
      throw new Error('Cloudflare connection identity binding is unavailable');
    }
    if (binding.accountId && binding.accountId !== accountId.toLowerCase()) {
      throw new Error('Cloudflare connection bound account differs from the requested account');
    }
    const accessToken = await this.getAccessToken(principalId, connection.connectionId, Date.now(), false);
    const response = await providerJson<{ success: boolean; result?: { subdomain?: string } }>(
      this.env, `${API_BASE}/accounts/${accountId}/workers/subdomain`,
      { method: 'GET', headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!response.success || !response.result?.subdomain) throw new Error('account does not have a configured workers.dev subdomain');
    const current = await this.owned(principalId, connection.connectionId);
    current.connection.accountId = accountId.toLowerCase();
    current.connection.workersSubdomain = response.result.subdomain;
    binding.accountId = current.connection.accountId;
    binding.workersSubdomain = current.connection.workersSubdomain;
    await this.ctx.storage.put('connection-binding', binding);
    await this.ctx.storage.put('connection', current.connection);
    return this.metadata(current.connection, current.tokens, Date.now());
  }

  async listMetadata(principalId: string): Promise<CloudflareConnectionMetadata[]> {
    try {
      const { connection, tokens } = await this.owned(principalId);
      return [this.metadata(connection, tokens, Date.now())];
    } catch {
      return [];
    }
  }

  async getAccessToken(
    principalId: string,
    expectedConnectionId: string,
    nowMs = Date.now(),
    requireConfirmedAccount = true,
  ): Promise<string> {
    const current = await this.owned(principalId, expectedConnectionId);
    if (requireConfirmedAccount && current.connection.accountId === undefined) {
      throw new Error('Cloudflare account confirmation is required for this grant');
    }
    if (current.tokens.expiresAtMs > nowMs + 60_000) return current.tokens.accessToken;
    if (!current.tokens.refreshToken) throw new Error('Cloudflare connection must be reconnected');
    if (!this.refreshInFlight) {
      this.refreshInFlight = (async () => {
        const priorCiphertext = current.connection.tokens.ciphertext;
        const form = new URLSearchParams({
          grant_type: 'refresh_token', refresh_token: current.tokens.refreshToken!, client_id: this.env.CF_OAUTH_CLIENT_ID,
        });
        if (this.env.CF_OAUTH_CLIENT_SECRET) form.set('client_secret', this.env.CF_OAUTH_CLIENT_SECRET);
        const raw = await providerJson<unknown>(this.env, TOKEN_ENDPOINT, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form,
        });
        const tokens = tokenPayload(raw, nowMs, current.tokens.refreshToken);
        const encrypted = await encryptTokens(this.env, principalId, tokens);
        let persisted = false;
        await this.ctx.storage.transaction(async (transaction) => {
          const active = await transaction.get<StoredConnection>('connection');
          if (!active || active.principalId !== principalId || active.connectionId !== expectedConnectionId
            || active.tokens.ciphertext !== priorCiphertext) return;
          active.tokens = encrypted;
          current.connection = active;
          await transaction.put('connection', active);
          persisted = true;
        });
        if (!persisted) {
          await revokeTokens(this.env, tokens);
          throw new Error('Cloudflare connection changed while its grant was refreshing');
        }
        return { connection: current.connection, tokens };
      })().finally(() => { this.refreshInFlight = undefined; });
    }
    const refreshed = await this.refreshInFlight;
    if (refreshed.connection.connectionId !== expectedConnectionId) throw new Error('Cloudflare connection identity changed');
    return refreshed.tokens.accessToken;
  }

  async disconnect(principalId: string, expectedConnectionId: string): Promise<boolean> {
    const { connection, tokens } = await this.owned(principalId, expectedConnectionId);
    await revokeTokens(this.env, tokens);
    await this.ctx.storage.delete('connection');
    return connection.connectionId === expectedConnectionId;
  }
}
