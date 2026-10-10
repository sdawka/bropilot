import type { ModelObject, ModelRelation, Source } from '@bropilot/contracts';
import type { ImpactSelection } from './impact-state';

export type MapLink = {
  kind: string;
  direction: 'inbound' | 'outbound';
  source: Source;
};

export type MapPeer = {
  object: ModelObject;
  links: MapLink[];
};

const byTitle = (left: ModelObject, right: ModelObject) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id);

export function buildFocusMap(focus: ModelObject, objects: ModelObject[], relations: ModelRelation[]) {
  const byId = new Map(objects.map(object => [object.id, object]));
  const peers = new Map<string, MapPeer>();
  const add = (objectId: string, link: MapLink) => {
    if (objectId === focus.id) return;
    const object = byId.get(objectId);
    if (!object) return;
    const peer = peers.get(objectId) ?? { object, links: [] };
    peer.links.push(link);
    peers.set(objectId, peer);
  };

  for (const object of objects) {
    if (object.parentId === focus.id) add(object.id, { kind: 'contains', direction: 'outbound', source: object.source });
  }
  for (const relation of relations) {
    if (relation.fromId === focus.id) add(relation.toId, { kind: relation.kind, direction: 'outbound', source: relation.source });
    if (relation.toId === focus.id) add(relation.fromId, { kind: relation.kind, direction: 'inbound', source: relation.source });
  }

  return { peers: [...peers.values()].sort((left, right) => byTitle(left.object, right.object)) };
}

export function searchMapObjects(objects: ModelObject[], search: string) {
  const term = search.trim().toLocaleLowerCase();
  return term ? objects.filter(object => `${object.title} ${object.kind}`.toLocaleLowerCase().includes(term)).sort(byTitle) : [];
}

export function pageMapPeers(peers: MapPeer[], page: number, size = 8) {
  return peers.slice(page * size, page * size + size);
}

/** Render the complete selected witness, including objects beyond the focus neighbourhood. */
export function buildImpactProof(selection: ImpactSelection) {
  const { baseline, proposed, witness } = selection;
  const sides = witness.side === 'baseline' ? [baseline] : witness.side === 'proposed' ? [proposed] : [baseline, proposed];
  const relationIds = new Set(witness.relationIds);
  const relations = [...new Map(sides.flatMap(snapshot => snapshot.relations.filter(relation => relationIds.has(relation.id)))
    .map(relation => [`${relation.id}/${relation.fromId}/${relation.toId}`, relation])).values()];
  const objectIds = [...new Set([...witness.objectIds, ...relations.flatMap(relation => [relation.fromId, relation.toId])])];
  const objects = objectIds.map(id => {
    const object = sides.slice().reverse().flatMap(snapshot => snapshot.objects).find(item => item.id === id);
    return object ?? { id, kind: 'unresolved', title: 'Unresolved model object', properties: {}, source: { kind: 'derived' as const, reference: 'Impact witness' } };
  });
  const baselineOnlyObjects = new Set(objects.filter(object => !proposed.objects.some(item => item.id === object.id)).map(object => object.id));
  const baselineOnlyRelations = new Set(relations.filter(relation => !proposed.relations.some(item => item.id === relation.id && item.fromId === relation.fromId && item.toId === relation.toId)).map(relation => relation.id));
  return { objects, relations, baselineOnlyObjects, baselineOnlyRelations };
}
