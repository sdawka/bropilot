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
}

/**
 * Low-level fetch wrapper. Throws on network errors but returns
 * `null` when the API is unreachable so callers can degrade gracefully.
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
      console.warn(`[api] ${res.status} from ${url}`);
      return null;
    }
    const json: ApiResponse<T> = await res.json();
    return json.ok ? json.data : null;
  } catch (err) {
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
