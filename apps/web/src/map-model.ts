import type { ModelObject, ModelRelation, Source } from '@bropilot/contracts';

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
