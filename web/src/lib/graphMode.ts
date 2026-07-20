// Shared graph-view mode state — lives outside GraphView so the Inspector can
// deep-link into ontology mode before navigating. Not routed, not persisted.
import { ref } from 'vue';

export type GraphMode = 'instance' | 'ontology';

export const graphMode = ref<GraphMode>('instance');
export const focusedKind = ref<string | null>(null);

export function openOntology(kind: string | null = null) {
  graphMode.value = 'ontology';
  focusedKind.value = kind;
}
