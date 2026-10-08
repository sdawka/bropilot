// The slice of ontology.json (SPEC §8) that System One reads. Pure types, no JSON import, so turn.ts
// and fake.ts stay node/Worker-runnable; the browser passes `ontology` from ./ontologyData.ts.
export interface OntoSpace { id: string; label: string; layer?: string; order?: number; hue?: string | number; blurb?: string }
export interface OntoNeed { edge: string; dir: 'out' | 'in'; min: number; ask: string; produces?: string }
export interface OntoField { key: string; label: string; options?: string[] }
export interface OntoKind { id: string; label: string; plural: string; space: string; icon?: string; level?: number;
  singular?: boolean; needs?: OntoNeed[]; fields?: OntoField[]; blurb?: string }
export interface OntoEdgeType { id: string; label: string; category?: string; from: string[]; to: string[]; hint?: string }
export interface OntoRelation { src: string; edge: string; dst: string; many?: boolean; at: 'src' | 'dst' | 'both'; need?: string }
export interface Ontology { SPACES: OntoSpace[]; KINDS: OntoKind[]; EDGE_TYPES: OntoEdgeType[];
  RELATIONS?: OntoRelation[]; LIFECYCLE_STAGES?: string[] }

export const kindIndex = (o: Ontology): Record<string, OntoKind> => Object.fromEntries(o.KINDS.map((k) => [k.id, k]));
