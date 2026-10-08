// Every GuessStrip repair is a labelled example for the eval set (SPEC §6). localStorage
// `uip.s1.corrections`; the ⚑ popover's "Export corrections (JSON)" calls exportCorrections().
export interface Correction { at: string; text: string; state: unknown; question: string; wrong: string; right: string }
const KEY = 'uip.s1.corrections';

export function listCorrections(): Correction[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function logCorrection(c: Omit<Correction, 'at'>): Correction {
  const entry = { at: new Date().toISOString(), ...c };
  try { localStorage.setItem(KEY, JSON.stringify([...listCorrections(), entry])); } catch { /* storage blocked */ }
  return entry;
}
export function exportCorrections(): void {
  const blob = new Blob([JSON.stringify(listCorrections(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `uip-s1-corrections-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
