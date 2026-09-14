// Screen awareness: the active view reports what it renders, so Context/the Talk panel knows what is on screen.
import { watchEffect, onScopeDispose } from 'vue';
import { state, type ScreenItem } from './store';

export function reportScreen(items: ScreenItem[]) { state.screen.items = items; }

/** Call from a view's setup(): keeps state.screen.items in sync with `fn()`, clears on unmount. */
export function useScreen(fn: () => ScreenItem[]) {
  watchEffect(() => reportScreen(fn()));
  onScopeDispose(() => reportScreen([]));
}
