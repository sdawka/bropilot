// Autosaved workshop draft — stickies, deck answers, pasted doc text — under a
// key separate from the graph. SSR-safe hydrate guard, same shape as store.ts.
import { reactive, watch } from 'vue';

const KEY = 'bropilot:workshop:v1';

export type StormCol = 'actor' | 'command' | 'aggregate' | 'event' | 'hotspot';

export interface Sticky {
  id: string;
  col: StormCol;
  title: string;
  note?: string;
  links: { toId: string }[];
}

export interface WorkshopDraft {
  stickies: Sticky[];
  deckAnswers: Record<string, unknown>;
  docText: string;
}

export const draft = reactive<WorkshopDraft>({ stickies: [], deckAnswers: {}, docText: '' });

let hydrated = false;

export function hydrateWorkshop(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.stickies)) draft.stickies = parsed.stickies;
        if (parsed.deckAnswers && typeof parsed.deckAnswers === 'object') draft.deckAnswers = parsed.deckAnswers;
        if (typeof parsed.docText === 'string') draft.docText = parsed.docText;
      }
    } catch {
      /* ignore malformed draft */
    }
  }
  watch(
    draft,
    (d) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(d));
      } catch {
        /* quota / unavailable */
      }
    },
    { deep: true, flush: 'sync' },
  );
}

export function resetStorm(): void {
  draft.stickies = [];
}
export function resetDoc(): void {
  draft.docText = '';
}
export function resetDeck(deckId: string): void {
  const next = { ...draft.deckAnswers };
  delete next[deckId];
  draft.deckAnswers = next;
}
