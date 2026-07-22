// Vitest setupFile (see vitest.config.ts `test.setupFiles`). Installs a tiny
// Map-backed localStorage on globalThis when one isn't already present, so
// the store's hydrate()/autosave path — and therefore its undo history —
// works under Vitest's `environment: 'node'` (no DOM, no real localStorage).
//
// This file has no imports of its own, so under both Vitest (setupFiles run
// before any test file) and a plain `tsx` script (as long as this file is
// imported/executed before the store module is first touched) the stub is in
// place before `store.ts` ever calls `localStorage.getItem/setItem`. The
// store itself only reaches for `localStorage` inside function bodies
// (`load`, `hydrate`, the autosave watch, `seedSample`) — never at
// module-evaluation time — so it's also safe even if import order can't be
// guaranteed.

class MemoryStorage implements globalThis.Storage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  get length(): number {
    return this.map.size;
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}
