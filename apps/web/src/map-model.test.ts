import { expect, it } from 'vitest';
import type { ModelObject, ModelRelation } from '@bropilot/contracts';
import { buildFocusMap, pageMapPeers, searchMapObjects } from './map-model';

const declared = { kind: 'declared' as const, reference: 'model' };
const objects = [
  { id: 'world', kind: 'world', title: 'World', properties: {}, source: declared },
  { id: 'child', kind: 'thing', title: 'Child', parentId: 'world', properties: {}, source: declared },
  { id: 'peer', kind: 'goal', title: 'Peer', properties: {}, source: declared },
  { id: 'remote', kind: 'operation', title: 'Remote', properties: {}, source: declared },
] satisfies ModelObject[];
const relations = [
  { id: 'a', kind: 'supports', fromId: 'world', toId: 'peer', source: declared },
  { id: 'b', kind: 'informs', fromId: 'peer', toId: 'world', source: { kind: 'hypothesis' as const, reference: 'research' } },
  { id: 'c', kind: 'supports', fromId: 'child', toId: 'remote', source: declared },
] satisfies ModelRelation[];

it('keeps containment separate and preserves every directional incident relation for a deduplicated peer', () => {
  const map = buildFocusMap(objects[0], objects, relations);

  expect(map.peers.map(peer => peer.object.id)).toEqual(['child', 'peer']);
  expect(map.peers[0].links).toEqual([{ kind: 'contains', direction: 'outbound', source: declared }]);
  expect(map.peers[1].links.map(link => [link.kind, link.direction, link.source.kind])).toEqual([
    ['supports', 'outbound', 'declared'],
    ['informs', 'inbound', 'hypothesis'],
  ]);
});

it('searches every object and labels disconnected matches without inventing an edge', () => {
  expect(searchMapObjects(objects, 'remote').map(object => object.id)).toEqual(['remote']);
  expect(buildFocusMap(objects[0], objects, relations).peers.some(peer => peer.object.id === 'remote')).toBe(false);
});

it('uses deterministic pages of eight peers', () => {
  const peers = Array.from({ length: 10 }, (_, index) => ({ object: { ...objects[0], id: String(index) }, links: [] }));
  expect(pageMapPeers(peers, 1).map(peer => peer.object.id)).toEqual(['8', '9']);
});

it('keeps observation and derived provenance separate from declared connections', () => {
  const typed = relations.slice(0, 2).map((relation, index) => ({ ...relation, source: { kind: index ? 'derived' as const : 'observation' as const, reference: 'evidence' } }));
  const peer = buildFocusMap(objects[0], objects, typed).peers.find(item => item.object.id === 'peer');
  expect(peer?.links.map(link => link.source)).toEqual(typed.map(relation => relation.source));
});
