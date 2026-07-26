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

  it('emits an edge for a legal linked pair', () => {
    const stickies: Sticky[] = [
      sticky({ id: 's1', col: 'actor', title: 'Rep', links: [{ toId: 's2' }] }),
      sticky({ id: 's2', col: 'command', title: 'Place order' }),
    ];
    const raw = buildRawFromStickies(stickies);
    expect(raw.edges).toEqual([{ src: 'Rep', dst: 'Place order', type: 'uses' }]);
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
});
