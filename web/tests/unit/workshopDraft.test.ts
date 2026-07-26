import { describe, expect, it, beforeEach, vi } from 'vitest';
import { effectScope } from 'vue';
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

// Regression: WorkshopView.vue calls hydrateWorkshop() from onMounted, so on the
// user's very first visit the autosave watch is registered while that
// component's effect scope is active. If the watch isn't detached, Vue ties it
// to that scope and stops it when the component unmounts (leaving Workshop) —
// the module-level `hydrated` guard then blocks re-registration on return, so
// autosave silently dies for the rest of the session (in-memory state is
// unaffected, so this only shows up after a reload).
describe('workshopDraft — autosave survives the first caller\'s effect scope stopping', () => {
  it('keeps persisting after the scope that first called hydrateWorkshop is stopped, simulating unmount', async () => {
    localStorage.clear();
    vi.resetModules(); // fresh module instance — its own `hydrated` guard, untouched by the tests above
    const mod = await import('../../src/lib/workshopDraft');
    const scope = effectScope();
    scope.run(() => {
      mod.hydrateWorkshop();
    });
    scope.stop(); // simulates WorkshopView.vue unmounting right after first mount

    mod.draft.stickies.push({ id: 's1', col: 'actor', title: 'Rep', links: [] });

    const stored = JSON.parse(localStorage.getItem('bropilot:workshop:v1') || '{}');
    expect(stored.stickies).toHaveLength(1);
  });
});
