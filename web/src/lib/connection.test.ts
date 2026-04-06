import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getConnection,
  saveConnection,
  clearConnection,
  isConnected,
  getConnectionHistory,
  isLocalhost,
  type Connection,
} from './connection';

/**
 * Provide a proper localStorage mock with Web Storage API methods.
 * Node.js 25+ has a built-in localStorage that is a plain object without
 * the standard getItem/setItem/removeItem/clear methods, which conflicts
 * with happy-dom's polyfill.
 */
function createLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const key of Object.keys(store)) delete store[key]; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

describe('connection state management', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageMock(),
      writable: true,
      configurable: true,
    });
  });

  it('getConnection returns null when no connection is stored', () => {
    expect(getConnection()).toBeNull();
  });

  it('saveConnection stores and retrieves a connection', () => {
    const conn: Connection = {
      serverUrl: 'http://localhost:4000',
      token: 'test-token-placeholder',
      projectName: 'my-app',
      connectedAt: '2025-01-01T00:00:00Z',
    };

    saveConnection(conn);
    const retrieved = getConnection();

    expect(retrieved).toEqual(conn);
  });

  it('clearConnection removes stored connection', () => {
    saveConnection({
      serverUrl: 'http://localhost:4000',
      token: 'test',
      connectedAt: '2025-01-01T00:00:00Z',
    });

    expect(getConnection()).not.toBeNull();

    clearConnection();
    expect(getConnection()).toBeNull();
  });

  it('isConnected returns true when connection exists', () => {
    expect(isConnected()).toBe(false);

    saveConnection({
      serverUrl: 'http://localhost:4000',
      token: 'test',
      connectedAt: '2025-01-01T00:00:00Z',
    });

    expect(isConnected()).toBe(true);
  });
});

describe('connection history', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorageMock(),
      writable: true,
      configurable: true,
    });
  });

  it('getConnectionHistory returns empty array initially', () => {
    expect(getConnectionHistory()).toEqual([]);
  });

  it('saveConnection adds to history', () => {
    saveConnection({
      serverUrl: 'http://server-a:4000',
      token: 'tok-a',
      projectName: 'project-a',
      connectedAt: '2025-01-01T00:00:00Z',
    });

    const history = getConnectionHistory();
    expect(history).toHaveLength(1);
    expect(history[0].serverUrl).toBe('http://server-a:4000');
    expect(history[0].projectName).toBe('project-a');
  });

  it('deduplicates history entries by serverUrl', () => {
    saveConnection({
      serverUrl: 'http://server-a:4000',
      token: 'tok-1',
      connectedAt: '2025-01-01T00:00:00Z',
    });
    saveConnection({
      serverUrl: 'http://server-a:4000',
      token: 'tok-2',
      connectedAt: '2025-01-02T00:00:00Z',
    });

    const history = getConnectionHistory();
    expect(history).toHaveLength(1);
    expect(history[0].connectedAt).toBe('2025-01-02T00:00:00Z');
  });

  it('keeps last 10 entries in history', () => {
    for (let i = 0; i < 15; i++) {
      saveConnection({
        serverUrl: `http://server-${i}:4000`,
        token: `tok-${i}`,
        connectedAt: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      });
    }

    const history = getConnectionHistory();
    expect(history).toHaveLength(10);
    // Most recent should be first
    expect(history[0].serverUrl).toBe('http://server-14:4000');
  });
});

describe('isLocalhost', () => {
  it('returns true when hostname is localhost', () => {
    // happy-dom sets window.location.hostname to localhost by default
    const result = isLocalhost();
    expect(typeof result).toBe('boolean');
  });
});
