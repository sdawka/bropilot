import { describe, expect, it, beforeEach } from 'vitest';
import { draft, hydrateWorkshop, resetStorm } from '../../src/lib/workshopDraft';

describe('workshopDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    draft.stickies = [];
    draft.deckAnswers = {};
    draft.docText = '';
    hydrateWorkshop();
  });

  it('persists stickies to localStorage under bropilot:workshop:v1', () => {
    draft.stickies.push({ id: 's1', col: 'actor', title: 'Rep', links: [] });
    const stored = JSON.parse(localStorage.getItem('bropilot:workshop:v1') || '{}');
    expect(stored.stickies).toHaveLength(1);
  });

  it('resetStorm clears only the stickies, keeping doc text', () => {
    draft.docText = 'keep me';
    draft.stickies.push({ id: 's1', col: 'actor', title: 'Rep', links: [] });
    resetStorm();
    expect(draft.stickies).toHaveLength(0);
    expect(draft.docText).toBe('keep me');
  });
});
