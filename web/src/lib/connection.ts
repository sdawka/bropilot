/**
 * Connection state manager.
 * Stores connection info in localStorage so the Astro frontend
 * knows which Bropilot server to talk to and which token to send.
 */

const STORAGE_KEY = 'bropilot_connection';
const HISTORY_KEY = 'bropilot_connection_history';

export interface Connection {
  serverUrl: string;
  token: string;
  projectName?: string;
  connectedAt: string;
}

export interface ConnectionHistoryEntry {
  serverUrl: string;
  projectName?: string;
  connectedAt: string;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

export function getConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Connection;
  } catch {
    return null;
  }
}

export function saveConnection(conn: Connection): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
  addToHistory(conn);
}

export function clearConnection(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isConnected(): boolean {
  return getConnection() !== null;
}

// ---------------------------------------------------------------------------
// Connection history
// ---------------------------------------------------------------------------

export function getConnectionHistory(): ConnectionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConnectionHistoryEntry[];
  } catch {
    return [];
  }
}

function addToHistory(conn: Connection): void {
  const history = getConnectionHistory();
  // Remove duplicate entries for the same server
  const filtered = history.filter((h) => h.serverUrl !== conn.serverUrl);
  filtered.unshift({
    serverUrl: conn.serverUrl,
    projectName: conn.projectName,
    connectedAt: conn.connectedAt,
  });
  // Keep last 10 entries
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 10)));
}

// ---------------------------------------------------------------------------
// Localhost detection
// ---------------------------------------------------------------------------

export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}
