/**
 * API client for the Bropilot HTTP API.
 * Replaces filesystem-based loader.ts for deployments where the
 * Astro frontend talks to a remote Elixir backend.
 */

import { getConnection } from './connection';

const PUBLIC_API_URL = import.meta.env.PUBLIC_API_URL || '';

/**
 * Resolve the base URL for API calls.
 * Priority: stored connection → PUBLIC_API_URL env → localhost fallback.
 */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const conn = getConnection();
    if (conn?.serverUrl) return conn.serverUrl.replace(/\/+$/, '');
  }
  if (PUBLIC_API_URL) return PUBLIC_API_URL.replace(/\/+$/, '');
  return 'http://localhost:4000';
}

/**
 * Build default headers, injecting the stored Bearer token when available.
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof window !== 'undefined') {
    const conn = getConnection();
    if (conn?.token) {
      headers['Authorization'] = `Bearer ${conn.token}`;
    }
  }
  return headers;
}

/** Shape returned by every API endpoint. */
interface ApiResponse<T = unknown> {
  ok: boolean;
  data: T;
  error?: string;
}

/**
 * Custom error class for API errors that carries the HTTP status code
 * and server-provided error message so the UI can display specific
 * error messages (e.g., "missing .bropilot" or "domain worker not started").
 */
export class ApiError extends Error {
  status: number;
  serverError: string;

  constructor(status: number, serverError: string) {
    super(serverError || `Server responded ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.serverError = serverError;
  }
}

/**
 * Low-level fetch wrapper.
 *
 * - On success (2xx with ok: true): returns `data` from the response.
 * - On non-2xx responses: throws `ApiError` with the server's error body
 *   so callers (especially UI components) can display specific error messages.
 * - On network errors (API unreachable): returns `null` for graceful degradation.
 */
export async function fetchApi<T = unknown>(
  path: string,
  opts?: RequestInit,
): Promise<T | null> {
  try {
    const base = getBaseUrl();
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...getAuthHeaders(),
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) {
      // Try to parse the server error body for specific error messages
      let serverError = '';
      try {
        const body = await res.json();
        serverError = body?.error || '';
      } catch {
        /* response wasn't JSON — ignore */
      }
      console.warn(`[api] ${res.status} from ${url}${serverError ? `: ${serverError}` : ''}`);
      throw new ApiError(res.status, serverError);
    }
    const json: ApiResponse<T> = await res.json();
    if (!json.ok) {
      throw new ApiError(400, json.error || 'Unknown error');
    }
    return json.data;
  } catch (err) {
    // Re-throw ApiError so callers can handle specific server errors
    if (err instanceof ApiError) throw err;
    console.warn(`[api] Failed to reach API at ${getBaseUrl()}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

export interface PairResult {
  project_name?: string;
  [key: string]: unknown;
}

/**
 * Call POST /api/pair on the given server to validate a pairing token.
 * Returns the server response data on success, or throws on failure.
 */
export async function pair(serverUrl: string, token: string): Promise<PairResult> {
  const base = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/api/pair`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(`Pairing failed (${res.status})`);
  }
  const json: ApiResponse<PairResult> = await res.json();
  if (!json.ok) {
    throw new Error('Invalid pairing response');
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// GET helpers
// ---------------------------------------------------------------------------

export async function getProject() {
  return fetchApi<Record<string, unknown>>('/api/project');
}

export async function getSpaces() {
  return fetchApi<Record<string, unknown>>('/api/spaces');
}

export async function getSpaceData(space: string) {
  return fetchApi<Record<string, unknown>>(`/api/spaces/${encodeURIComponent(space)}`);
}

export async function getMapSlot(space: string, slot: string) {
  return fetchApi<Record<string, unknown>>(
    `/api/map/${encodeURIComponent(space)}/${encodeURIComponent(slot)}`,
  );
}

export async function getPipelineStatus() {
  return fetchApi<Record<string, unknown>>('/api/pipeline/status');
}

export async function getRecipe() {
  return fetchApi<Record<string, unknown>>('/api/recipe');
}

export async function getVersions() {
  return fetchApi<Record<string, unknown>>('/api/versions');
}

export async function getKnowledge() {
  return fetchApi<Record<string, unknown>>('/api/knowledge');
}

// ---------------------------------------------------------------------------
// Traceability
// ---------------------------------------------------------------------------

/** Shape of a traceability link entry */
export interface TraceabilityLink {
  type: 'implementation' | 'test' | 'type' | 'migration';
  file_path: string;
  function_name?: string;
  line_range?: [number, number];
}

/** Shape of a traceability entry for a spec */
export interface TraceabilityEntry {
  spec_category: string;
  spec_id: string;
  links: TraceabilityLink[];
}

/** Coverage counts per category */
export interface CategoryCoverage {
  total: number;
  linked: number;
  unlinked: number;
}

/** Shape of the full traceability matrix response */
export interface TraceabilityMatrix {
  entries: TraceabilityEntry[];
  coverage: {
    total_specs: number;
    total_linked: number;
    total_unlinked: number;
    by_category: Record<string, CategoryCoverage>;
  };
}

/** Link type labels for display */
export const LINK_TYPES = ['implementation', 'test', 'type', 'migration'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export async function getTraceability() {
  return fetchApi<TraceabilityMatrix>('/api/traceability');
}

export async function getTraceabilityEntry(category: string, specId: string) {
  return fetchApi<TraceabilityEntry>(
    `/api/traceability/${encodeURIComponent(category)}/${encodeURIComponent(specId)}`,
  );
}

// ---------------------------------------------------------------------------
// POST helpers
// ---------------------------------------------------------------------------

function postJson<T = unknown>(path: string, body?: unknown) {
  return fetchApi<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function startVibe() {
  return postJson<Record<string, unknown>>('/api/vibe/start');
}

export async function submitVibeInput(text: string) {
  return postJson<Record<string, unknown>>('/api/vibe/input', { text });
}

export async function extractVibe() {
  return postJson<Record<string, unknown>>('/api/vibe/extract');
}

export async function startDomain(mode?: 'mock' | 'llm') {
  return postJson<Record<string, unknown>>('/api/domain/start', mode ? { mode } : undefined);
}

export async function submitDomainInput(text: string) {
  return postJson<Record<string, unknown>>('/api/domain/input', { text });
}

export async function extractDomain() {
  return postJson<Record<string, unknown>>('/api/domain/extract');
}

export async function createSnapshot() {
  return postJson<Record<string, unknown>>('/api/snapshot');
}

export async function generatePlan() {
  return postJson<Record<string, unknown>>('/api/plan');
}

export async function generateTasks() {
  return postJson<Record<string, unknown>>('/api/tasks');
}

export async function startBuild() {
  return postJson<Record<string, unknown>>('/api/build');
}

// ---------------------------------------------------------------------------
// Spec categories (single source of truth)
// ---------------------------------------------------------------------------

/** The 11 spec categories produced by Act 2 Step 4. */
export const SPEC_CATEGORIES = [
  'api',
  'behaviours',
  'constraints',
  'entities',
  'modules',
  'events',
  'externals',
  'views',
  'components',
  'streams',
  'infra',
] as const;

export type SpecCategory = (typeof SPEC_CATEGORIES)[number];

/**
 * Pretty-format a spec category name for display.
 */
export function formatSpecName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Client-side API helpers (for Alpine.js components)
// ---------------------------------------------------------------------------

/**
 * Resolve API config from localStorage connection or fallback URL.
 * Used by Alpine.js page scripts that need client-side fetch.
 */
export function getClientApiConfig(fallbackUrl: string): { url: string; token: string } {
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('bropilot_connection');
      if (raw) {
        const conn = JSON.parse(raw);
        if (conn?.serverUrl && conn?.token) {
          return { url: conn.serverUrl.replace(/\/+$/, ''), token: conn.token };
        }
      }
    }
  } catch { /* ignore */ }
  return { url: fallbackUrl.replace(/\/+$/, ''), token: '' };
}

/**
 * Build auth headers for client-side fetch calls.
 */
export function getClientHeaders(fallbackUrl: string): Record<string, string> {
  const cfg = getClientApiConfig(fallbackUrl);
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.token) h['Authorization'] = `Bearer ${cfg.token}`;
  return h;
}

/**
 * Client-side POST helper for Alpine.js components.
 * Throws ApiError with server-provided error message on non-2xx responses.
 */
export async function clientPost(fallbackUrl: string, path: string, body?: unknown): Promise<unknown> {
  const cfg = getClientApiConfig(fallbackUrl);
  const res = await fetch(`${cfg.url}${path}`, {
    method: 'POST',
    headers: getClientHeaders(fallbackUrl),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let serverError = '';
    try {
      const errBody = await res.json();
      serverError = errBody?.error || '';
    } catch { /* not JSON */ }
    throw new ApiError(res.status, serverError);
  }
  return res.json();
}

/**
 * Client-side GET helper for Alpine.js components.
 * Throws ApiError with server-provided error message on non-2xx responses.
 */
export async function clientGet(fallbackUrl: string, path: string): Promise<unknown> {
  const cfg = getClientApiConfig(fallbackUrl);
  const res = await fetch(`${cfg.url}${path}`, {
    headers: getClientHeaders(fallbackUrl),
  });
  if (!res.ok) {
    let serverError = '';
    try {
      const errBody = await res.json();
      serverError = errBody?.error || '';
    } catch { /* not JSON */ }
    throw new ApiError(res.status, serverError);
  }
  return res.json();
}
