// Small UI state shared by the shell: theme, chat sidebar collapse, perspective menu requests.
import { ref, watch } from 'vue';

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

export const theme = ref<'light' | 'dark'>(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
watch(theme, (t) => { document.documentElement.classList.toggle('dark', t === 'dark'); write('uip.theme', t); });
export const toggleTheme = () => { theme.value = theme.value === 'dark' ? 'light' : 'dark'; };

/** Chat sidebar collapsed to its 44px rail. ChatSidebar gets it as the `collapsed` prop. */
export const chatCollapsed = ref(read('uip.chat.collapsed', '0') === '1');
watch(chatCollapsed, (c) => write('uip.chat.collapsed', c ? '1' : '0'));
/** ⌘K palette open (chat=palette). ChatPalette gets it as the `open` prop. */
export const paletteOpen = ref(false);
/** `L` opens the perspective menu in the top bar. */
export const perspMenuOpen = ref(false);
