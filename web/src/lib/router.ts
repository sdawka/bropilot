import { PARTS, type Part } from './schema';

export type View = 'overview' | Part | 'graph' | 'workshop';

const VALID_VIEWS = new Set<string>(['overview', 'graph', 'workshop', ...PARTS.map((p) => p.id)]);

/** Parse `#/{view}` or `#/{view}/{nodeId}` — invalid views fall back to overview. */
export function parseHash(hash: string): { view: View; nodeId: string | null } {
  const parts = hash.replace(/^#\/?/, '').split('/');
  const view = VALID_VIEWS.has(parts[0]) ? (parts[0] as View) : 'overview';
  const nodeId = parts[1] ? decodeURIComponent(parts[1]) : null;
  return { view, nodeId };
}

export function buildHash(view: View, nodeId: string | null): string {
  return nodeId ? `#/${view}/${encodeURIComponent(nodeId)}` : `#/${view}`;
}
