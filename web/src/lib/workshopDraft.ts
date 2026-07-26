// Autosaved workshop draft — stickies, deck answers, pasted doc text — under a
// key separate from the graph. SSR-safe hydrate guard, same shape as store.ts.
import { reactive, watch, effectScope } from 'vue';

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
  // WorkshopView.vue calls hydrateWorkshop() from onMounted, so the first
  // caller's component scope is active here. Registering the watch in a
  // detached scope keeps it alive after that component unmounts — otherwise
  // Vue ties the watch to the calling scope and stops it, and the `hydrated`
  // guard above blocks it from ever being re-registered.
  effectScope(true).run(() => {
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
  });
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
