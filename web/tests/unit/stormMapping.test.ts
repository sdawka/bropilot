import { describe, expect, it } from 'vitest';
import { STORM_KIND_BY_COL, edgeForPair, buildRawFromStickies } from '../../src/lib/stormMapping';
import type { Sticky } from '../../src/lib/workshopDraft';

describe('STORM_KIND_BY_COL', () => {
  it('maps each storm column to its graph kind', () => {
    expect(STORM_KIND_BY_COL).toEqual({
      actor: 'persona',
      command: 'behaviour',
      aggregate: 'entity',
      event: 'event',
      hotspot: 'hypothesis',
    });
  });
});

describe('edgeForPair', () => {
  it('maps the four legal pairs to their edge type', () => {
    expect(edgeForPair('actor', 'command')).toBe('uses');
    expect(edgeForPair('command', 'aggregate')).toBe('has');
    expect(edgeForPair('command', 'event')).toBe('emits');
  });

  it('lets hotspot pair with anything via references', () => {
    expect(edgeForPair('hotspot', 'actor')).toBe('references');
    expect(edgeForPair('hotspot', 'command')).toBe('references');
    expect(edgeForPair('hotspot', 'aggregate')).toBe('references');
    expect(edgeForPair('hotspot', 'event')).toBe('references');
    expect(edgeForPair('hotspot', 'hotspot')).toBe('references');
  });

  it('returns null for illegal pairs', () => {
    expect(edgeForPair('command', 'actor')).toBeNull();
    expect(edgeForPair('actor', 'aggregate')).toBeNull();
    expect(edgeForPair('event', 'hotspot')).toBeNull();
    expect(edgeForPair('aggregate', 'event')).toBeNull();
  });
});

describe('buildRawFromStickies', () => {
  function sticky(partial: Partial<Sticky> & Pick<Sticky, 'id' | 'col' | 'title'>): Sticky {
    return { links: [], ...partial };
  }

  it('maps each titled sticky to a node with its column kind', () => {
    const stickies: Sticky[] = [
      sticky({ id: 's1', col: 'actor', title: 'Rep' }),
      sticky({ id: 's2', col: 'command', title: 'Place order', note: 'happy path' }),
    ];
    const raw = buildRawFromStickies(stickies);
    expect(raw.nodes).toEqual([
      { kind: 'persona', title: 'Rep', description: '' },
      { kind: 'behaviour', title: 'Place order', description: 'happy path' },
    ]);
  });

  it('drops untitled stickies from the node list', () => {
    const stickies: Sticky[] = [sticky({ id: 's1', col: 'actor', title: '   ' })];
    expect(buildRawFromStickies(stickies).nodes).toEqual([]);
  });

  it('drops a link with no legal pairing', () => {
    const stickies: Sticky[] = [
      sticky({ id: 's1', col: 'command', title: 'Place order', links: [{ toId: 's2' }] }),
      sticky({ id: 's2', col: 'actor', title: 'Rep' }),
    ];
    expect(buildRawFromStickies(stickies).edges).toEqual([]);
  });

  it('drops a link whose target sticky no longer exists', () => {
    const stickies: Sticky[] = [sticky({ id: 's1', col: 'actor', title: 'Rep', links: [{ toId: 'missing' }] })];
    expect(buildRawFromStickies(stickies).edges).toEqual([]);
  });

  it('drops a link where either endpoint has an empty title', () => {
    const stickies: Sticky[] = [
      sticky({ id: 's1', col: 'actor', title: 'Rep', links: [{ toId: 's2' }] }),
      sticky({ id: 's2', col: 'command', title: '  ' }),
    ];
    expect(buildRawFromStickies(stickies).edges).toEqual([]);
  });

  // ── direction-pinned: every legal pair asserts exact src AND dst titles,
  // so a swapped polarity fails even though the edge *type* would still match. ──

  it('actor -[uses]-> command: keeps the dragged actor as edge src', () => {
    const stickies: Sticky[] = [
      sticky({ id: 'a', col: 'actor', title: 'Sales rep', links: [{ toId: 'c' }] }),
      sticky({ id: 'c', col: 'command', title: 'Place order' }),
    ];
    expect(buildRawFromStickies(stickies).edges).toEqual([{ src: 'Sales rep', dst: 'Place order', type: 'uses' }]);
  });

  it('command dragged onto aggregate produces entity-has-behaviour: aggregate is edge src, command is edge dst', () => {
    // "has" is conceptual possession — the aggregate (entity) owns the command
    // (behaviour) as one of its capabilities — so the *edge* must read
    // aggregate--has-->command even though the drag went command->aggregate.
    const stickies: Sticky[] = [
      sticky({ id: 'cmd', col: 'command', title: 'Place order', links: [{ toId: 'agg' }] }),
      sticky({ id: 'agg', col: 'aggregate', title: 'Order' }),
    ];
    expect(buildRawFromStickies(stickies).edges).toEqual([{ src: 'Order', dst: 'Place order', type: 'has' }]);
  });

  it('command -[emits]-> event: keeps the dragged command as edge src', () => {
    const stickies: Sticky[] = [
      sticky({ id: 'cmd', col: 'command', title: 'Place order', links: [{ toId: 'evt' }] }),
      sticky({ id: 'evt', col: 'event', title: 'Order placed' }),
    ];
    expect(buildRawFromStickies(stickies).edges).toEqual([{ src: 'Place order', dst: 'Order placed', type: 'emits' }]);
  });

  it('hotspot -[references]-> anything: keeps the dragged hotspot as edge src, for every target column', () => {
    const targets: { col: Sticky['col']; title: string }[] = [
      { col: 'actor', title: 'Sales rep' },
      { col: 'command', title: 'Place order' },
      { col: 'aggregate', title: 'Order' },
      { col: 'event', title: 'Order placed' },
      { col: 'hotspot', title: 'Other hotspot' },
    ];
    for (const target of targets) {
      const stickies: Sticky[] = [
        sticky({ id: 'h', col: 'hotspot', title: 'Slow checkout', links: [{ toId: 't' }] }),
        sticky({ id: 't', col: target.col, title: target.title }),
      ];
      expect(buildRawFromStickies(stickies).edges).toEqual([
        { src: 'Slow checkout', dst: target.title, type: 'references' },
      ]);
    }
  });

  it('dedupes identical edges (same src/dst/type) even if produced by separate link entries', () => {
    const stickies: Sticky[] = [
      sticky({
        id: 'a',
        col: 'actor',
        title: 'Sales rep',
        links: [{ toId: 'c' }, { toId: 'c' }], // defensive: duplicate link entries shouldn't double the edge
      }),
      sticky({ id: 'c', col: 'command', title: 'Place order' }),
    ];
    expect(buildRawFromStickies(stickies).edges).toEqual([{ src: 'Sales rep', dst: 'Place order', type: 'uses' }]);
  });
});
