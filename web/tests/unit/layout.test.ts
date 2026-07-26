import { describe, expect, it, beforeEach, vi } from 'vitest';

const LAYOUT_KEY = 'bropilot:layout:v1';

// layout.ts caches its parsed store at module scope, so each test resets the
// module registry and re-imports a fresh copy after seeding localStorage.
async function freshLayout() {
  vi.resetModules();
  const store = await import('../../src/lib/store');
  const layout = await import('../../src/lib/layout');
  return { store, layout };
}

beforeEach(() => {
  localStorage.clear();
});

describe('layout namespacing', () => {
  it('keeps positions in separate namespaces', async () => {
    const { layout } = await freshLayout();
    layout.setPositions([['a', { x: 1, y: 2 }]], 'all');
    layout.setPositions([['a', { x: 9, y: 9 }]], 'foundations');
    expect(layout.getPos('a', 'all')).toEqual({ x: 1, y: 2 });
    expect(layout.getPos('a', 'foundations')).toEqual({ x: 9, y: 9 });
    expect(layout.getPos('a', 'domain')).toBeUndefined();
  });

  it('defaults to the "all" namespace', async () => {
    const { layout } = await freshLayout();
    layout.setPositions([['a', { x: 3, y: 4 }]]); // no namespace arg
    expect(layout.getPos('a')).toEqual({ x: 3, y: 4 });
    expect(layout.getPos('a', 'all')).toEqual({ x: 3, y: 4 });
  });

  it('clearLayout(namespace) clears only that namespace', async () => {
    const { store, layout } = await freshLayout();
    // flushPositions() prunes ids absent from the graph, so 'a' must exist
    // here or the write itself (not clearLayout) would drop it.
    store.state.graph = {
      nodes: [{ id: 'a', kind: 'name', title: 'A', description: '', props: {} }],
      edges: [],
    };
    layout.setPositions([['a', { x: 1, y: 1 }]], 'all');
    layout.setPositions([['a', { x: 2, y: 2 }]], 'foundations');
    layout.flushPositions();
    layout.clearLayout('foundations');
    expect(layout.getPos('a', 'foundations')).toBeUndefined();
    expect(layout.getPos('a', 'all')).toEqual({ x: 1, y: 1 });
  });
});

describe('layout migration', () => {
  it('migrates legacy un-namespaced data into the "all" namespace on first read', async () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ 'node-1': { x: 5, y: 6 } }));
    const { layout } = await freshLayout();
    expect(layout.getPos('node-1', 'all')).toEqual({ x: 5, y: 6 });
    expect(layout.getPos('node-1')).toEqual({ x: 5, y: 6 });
  });
});

describe('layout pruning', () => {
  it('drops ids absent from the graph across every namespace on write', async () => {
    const { store, layout } = await freshLayout();
    store.state.graph = {
      nodes: [{ id: 'keep', kind: 'name', title: 'Keep', description: '', props: {} }],
      edges: [],
    };
    layout.setPositions(
      [
        ['keep', { x: 1, y: 1 }],
        ['gone', { x: 2, y: 2 }],
      ],
      'foundations',
    );
    layout.flushPositions(); // prune happens on write
    expect(layout.getPos('keep', 'foundations')).toEqual({ x: 1, y: 1 });
    expect(layout.getPos('gone', 'foundations')).toBeUndefined();
  });
});
