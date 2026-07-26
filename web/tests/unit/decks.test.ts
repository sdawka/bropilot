import { describe, expect, it } from 'vitest';
import { DECKS, answersToRaw } from '../../src/lib/decks';

describe('DECKS', () => {
  it('has three decks (Foundations, Domain, Implementation), 8–12 questions each', () => {
    expect(DECKS.map((d) => d.id).sort()).toEqual(['domain', 'foundations', 'implementation']);
    for (const d of DECKS) {
      expect(d.questions.length).toBeGreaterThanOrEqual(8);
      expect(d.questions.length).toBeLessThanOrEqual(12);
    }
  });

  it('every question kind and every follow-up target is a real string kind', () => {
    for (const d of DECKS) {
      for (const q of d.questions) {
        expect(typeof q.kind).toBe('string');
        for (const f of q.followups ?? []) {
          expect(typeof f.edgeType).toBe('string');
          expect(typeof f.targetKind).toBe('string');
        }
      }
    }
  });

  it('question ids are unique across all decks', () => {
    const ids = DECKS.flatMap((d) => d.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('answersToRaw', () => {
  it('maps answers to nodes and follow-up links to edges', () => {
    const raw = answersToRaw([
      { kind: 'capability', title: 'Build a quote', links: [{ type: 'serves', target: 'Sales rep' }] },
      { kind: 'persona', title: 'Sales rep', links: [] },
    ]);
    expect(raw.nodes).toHaveLength(2);
    expect(raw.edges).toEqual([{ src: 'Build a quote', dst: 'Sales rep', type: 'serves' }]);
  });

  it('drops links with an empty target', () => {
    const raw = answersToRaw([{ kind: 'goal', title: 'Grow', links: [{ type: 'motivates', target: '' }] }]);
    expect(raw.edges).toHaveLength(0);
  });
});
