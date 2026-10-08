// Tokenising shared by fake.ts (choices by overlap) and turn.ts (candidate pre-filter). Pure.
const STOP = new Set(('a an the of to for in on at by and or is are was be it its this that these those me my i you we our ' +
  'with from as do does did can could should would will shall what which who how why where when there here show go open ' +
  'tell about any all some please give get let us one ones thing things').split(' '));
// note: "thing"/"things" are stopwords only for overlap scoring; kind labels are matched by exact phrase first.

export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
export const words = (s: string): string[] => s.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim().split(/\s+/).filter(Boolean);
/** Content tokens, stemmed, stopwords removed. */
export const tokens = (s: string): string[] => words(s).filter((w) => w.length > 1 && !STOP.has(w) && !w.startsWith('#')).map(stem);
/** Stemmed word sequence with stopwords kept (for phrase matching). */
const seq = (s: string): string[] => words(s).filter((w) => !w.startsWith('#')).map(stem);

/** Does `phrase` occur as a contiguous run of whole (stemmed) words in `text`? */
export function containsPhrase(text: string, phrase: string): boolean {
  const t = seq(text), p = seq(phrase);
  if (!p.length || p.join('').length < 3) return false;
  outer: for (let i = 0; i + p.length <= t.length; i++) {
    for (let j = 0; j < p.length; j++) if (t[i + j] !== p[j]) continue outer;
    return true;
  }
  return false;
}
/** Distinct shared tokens; a shared prefix of ≥5 letters ("reviewer" / "review") counts too. */
export function overlap(a: string[], b: string[]): number {
  const sb = new Set(b); let n = 0;
  for (const x of new Set(a)) {
    if (sb.has(x)) { n++; continue; }
    if (x.length >= 5 && [...sb].some((y) => y.length >= 5 && (x.startsWith(y) || y.startsWith(x)))) n++;
  }
  return n;
}
/** The label part of a choice criterion: before ": ", " (", " — " or " e.g.". */
export function labelPart(crit: string): string {
  const cut = [': ', ' (', ' — ', ' e.g.'].map((m) => crit.indexOf(m)).filter((i) => i > 0);
  return (cut.length ? crit.slice(0, Math.min(...cut)) : crit).trim();
}
export const FORCE_LOW = '#s1low';
export const FORCE_NO = '#s1no';
export function forced(text: string): 'low' | 'no' | null {
  const t = text.toLowerCase();
  return t.includes(FORCE_NO) ? 'no' : t.includes(FORCE_LOW) ? 'low' : null;
}
export const stripTokens = (text: string): string => text.replace(/#s1(low|no)\b/gi, ' ').replace(/\s+/g, ' ').trim();
