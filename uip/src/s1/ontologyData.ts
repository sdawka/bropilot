// The browser's ontology: WP1's committed src/data/ontology.json, typed for System One.
import raw from '../data/ontology.json';
import type { Ontology } from './onto';
export const ontology = raw as unknown as Ontology;
