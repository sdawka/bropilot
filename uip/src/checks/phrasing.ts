// CHECKS-SPEC §2.1: the literal phrasing helpers every check entry uses. Pure (no Vue, no JSON import):
// kind and field labels come from the CheckOntology the caller passes, so node tests and the Worker can run it.
import type { Node } from '../types';
import type { CheckOntology } from './types';

export const CHECKS_VERSION = 1;
export const CHECK_STATE = 'Items from one product description. Every question carries the items it is about.';
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, ' / ').trim();
export const clip = (s: string, n: number) => (s = oneLine(s), s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const SEMANTIC = ['motivates', 'serves', 'satisfies', 'has', 'implements', 'realises', 'governs', 'defines', 'references',
  'triggers', 'verifies', 'monitors', 'measures', 'supports', 'refutes', 'carries', 'emits', 'combines'] as const;
/** Never asked about (code only). */
export const CODE_ONLY = ['contains', 'exposes', 'uses', 'hosts', 'targets', 'reports'] as const;
export const isSemantic = (type: string) => (SEMANTIC as readonly string[]).includes(type);

/** lfp checks.ts: description lines, else [title]. */
export function conditionsOf(rule: Node): string[] {
  const lines = (rule.description ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines : [rule.title];
}
/** `https://x/a/b/c/d.ts` → `c/d.ts`. */
export function lastTwoPathSegments(ref: string): string {
  const parts = ref.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}

/** One-line yes/no examples per edge type; neutral clinic domain, never a seed title (§2.2 table). */
export const EX: Record<string, { yes: string; no: string }> = {
  motivates: { yes: 'Problem "Patients forget appointments" motivates outcome "Fewer missed appointments".', no: 'Problem "Patients forget appointments" does not motivate outcome "Faster checkout at the desk".' },
  serves: { yes: 'Capability "Online booking" serves audience "Clinic patients".', no: 'Capability "Payroll export" does not serve audience "Clinic patients".' },
  has: { yes: 'Audience "Clinic patients" has problem "Patients forget appointments".', no: 'Audience "Clinic receptionist" does not have problem "Patients forget their medication".' },
  implements: { yes: 'Flow "Book a slot" implements task "Add slot picker".', no: 'Flow "Book a slot" does not implement task "Rotate API keys".' },
  governs: { yes: 'Rule "A slot has at most one appointment" governs thing "Appointment".', no: 'Rule "A slot has at most one appointment" does not govern thing "Invoice".' },
  defines: { yes: 'Term "No-show" defines event "Appointment missed".', no: 'Term "Copay" does not define thing "Appointment".' },
  references: { yes: 'Assumption "Patients read SMS within an hour" references bet "Reminders cut no-shows".', no: 'Assumption "Doctors like dark mode" does not reference bet "Reminders cut no-shows".' },
  triggers: { yes: 'Event "Appointment booked" triggers module "Reminder scheduler".', no: 'Event "Invoice paid" does not trigger module "Reminder scheduler".' },
  measures: { yes: 'Metric reading "No-show rate: 7% in May" measures metric "No-show rate".', no: 'Usage event "Opened pricing page" does not measure flow "Book a slot".' },
  carries: { yes: 'Interface "Bookings API" carries thing "Appointment".', no: 'Interface "Bookings API" does not carry thing "Payroll run".' },
  emits: { yes: 'Interface "Bookings API" emits event "Appointment booked".', no: 'Interface "Bookings API" does not emit event "Invoice paid".' },
  combines: { yes: 'Goal "No-shows under 5% and NPS over 40" combines metric "No-show rate".', no: 'Goal "No-shows under 5%" does not combine metric "Signup conversion".' },
};

export const STAGE_WORDS: Record<string, string[]> = {
  awareness: ['landing', 'blog', 'post', 'launch', 'ad', 'seo'], acquisition: ['signup', 'sign', 'trial', 'pricing', 'lead', 'demo'],
  onboarding: ['onboard', 'first', 'setup', 'import', 'connect', 'welcome'], use: [], support: ['help', 'support', 'ticket', 'faq', 'doc'],
  retention: ['remind', 'digest', 'weekly', 'renew', 'return'], advocacy: ['share', 'invite', 'refer', 'review'],
  'end-of-life': ['export', 'delete', 'cancel', 'archive'],
};

export interface Phrasing {
  kindLabel(kind: string): string;
  fieldLabel(kind: string, key: string): string;
  l(kind: string): string;
  T(n: Node): string;
  D(n: Node): string;
  F(n: Node, key: string): string;
  hintOf(type: string): string;
  label(type: string): string;
  conds(rule: Node): string;
}
const memo = new WeakMap<CheckOntology, Phrasing>();
/** The §2.1 helpers bound to one ontology (memoised per ontology object). */
export function phr(onto: CheckOntology): Phrasing {
  const hit = memo.get(onto);
  if (hit) return hit;
  const kinds = new Map(onto.KINDS.map((k) => [k.id, k]));
  const edges = new Map(onto.EDGE_TYPES.map((e) => [e.id, e]));
  const kindLabel = (kind: string) => kinds.get(kind)?.label ?? kind;
  const fieldLabel = (kind: string, key: string) => kinds.get(kind)?.fields?.find((f) => f.key === key)?.label ?? key;
  const l = (kind: string) => kindLabel(kind).toLowerCase();
  const p: Phrasing = {
    kindLabel, fieldLabel, l,
    T: (n) => `the ${l(n.kind)} "${clip(n.title, 120)}"`,
    D: (n) => n.description ? `\n  ${kindLabel(n.kind)} description: "${clip(n.description, 240)}"` : '',
    F: (n, key) => n.props?.[key] ? `\n  ${fieldLabel(n.kind, key)}: "${clip(n.props[key], 120)}"` : '',
    hintOf: (type) => (edges.get(type)?.hint ?? '').replace(/\s*STUB\.\s*$/, ''),
    label: (type) => edges.get(type)?.label ?? type,
    conds: (rule) => conditionsOf(rule).length ? `\n    conditions: "${conditionsOf(rule).join(' / ')}"` : '',
  };
  memo.set(onto, p);
  return p;
}
