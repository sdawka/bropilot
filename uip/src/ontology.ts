// Typed accessors over src/data/ontology.json (emitted from lfp's kernel by scripts/emit-ontology.mjs).
import raw from './data/ontology.json';
import type { SpaceId } from './types';

export interface SpaceDef { id: SpaceId; label: string; layer: 'representation' | 'reality' | 'orchestration'; order: number; hue: string; blurb: string }
export interface NeedDef { edge: string; dir: 'out' | 'in'; min: number; ask: string; produces?: string }
export interface FieldDef { key: string; label: string; options?: string[] }
export interface KindDef { id: string; label: string; plural: string; space: SpaceId; icon: string; level?: 1 | 2 | 3;
  singular: boolean; needs: NeedDef[]; fields?: FieldDef[]; blurb: string }
export interface EdgeTypeDef { id: string; label: string; category: string; from: string[]; to: string[] }

const data = raw as unknown as { SPACES: SpaceDef[]; KINDS: KindDef[]; EDGE_TYPES: EdgeTypeDef[] };
export const SPACES: SpaceDef[] = [...data.SPACES].sort((a, b) => a.order - b.order);
export const KINDS: KindDef[] = data.KINDS;
export const EDGE_TYPES: EdgeTypeDef[] = data.EDGE_TYPES;
export const spaceById = Object.fromEntries(SPACES.map((s) => [s.id, s])) as Record<SpaceId, SpaceDef>;
export const kindById = Object.fromEntries(KINDS.map((k) => [k.id, k])) as Record<string, KindDef>;
export const edgeTypeById = Object.fromEntries(EDGE_TYPES.map((e) => [e.id, e])) as Record<string, EdgeTypeDef>;

const unknownKind = (id: string): KindDef => ({ id, label: id, plural: id, space: 'solution', icon: '•', singular: false, needs: [], fields: [], blurb: '' });
/** A node prop's label from its kind's declared fields; undeclared props keep their key. */
export const fieldLabel = (kindId: string, key: string) => kind(kindId).fields?.find((f) => f.key === key)?.label ?? key;
export const kind = (id: string): KindDef => kindById[id] ?? unknownKind(id);
export const kindLabel = (id: string, n = 1) => (n === 1 ? kind(id).label : kind(id).plural);
export const kindIcon = (id: string) => kind(id).icon;
export const spaceOf = (kindId: string): SpaceDef => spaceById[kind(kindId).space] ?? SPACES[0];
export const hueOf = (kindId: string) => `var(--space-${kind(kindId).space})`;
export const edgeLabel = (id: string) => edgeTypeById[id]?.label ?? id;
/** Edge verb phrased from one side: out "exposes", in "← exposes". */
export const phrase = (edge: string, dir: 'out' | 'in') => (dir === 'out' ? `${edgeLabel(edge)} →` : `← ${edgeLabel(edge)}`);
/** Every edge:dir a kind may legally take (EDGE_TYPES from/to). */
export function legalHops(kindId: string): { edge: string; dir: 'out' | 'in'; other: string[] }[] {
  const out: { edge: string; dir: 'out' | 'in'; other: string[] }[] = [];
  for (const e of EDGE_TYPES) {
    if (e.from.includes(kindId)) out.push({ edge: e.id, dir: 'out', other: e.to });
    if (e.to.includes(kindId)) out.push({ edge: e.id, dir: 'in', other: e.from });
  }
  return out;
}
export const LEVEL_LABEL: Record<number, string> = { 1: 'L1', 2: 'L2', 3: 'L3' };
/** Writes --space-<id> CSS variables from SPACES.hue once at boot. */
export function installSpaceHues(el: HTMLElement = document.documentElement) {
  for (const s of SPACES) el.style.setProperty(`--space-${s.id}`, s.hue);
}
