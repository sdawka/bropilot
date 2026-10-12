import { expect, it } from 'vitest';
import type { ModelObject, ModelRelation } from '@bropilot/contracts';
import { buildFocusMap, buildImpactProof, pageMapPeers, searchMapObjects } from './map-model';
import type { WorldSnapshot } from '@bropilot/contracts';
import baselineFixture from '../../../packages/contracts/fixtures/assistant-impact-baseline.json';
import adapterFixture from '../../../packages/contracts/fixtures/assistant-impact-calendar-adapter.json';

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

it('renders exact proof paths beyond the selected focus and retains removed baseline edges', () => {
  const baseline = { objects, relations } as WorldSnapshot;
  const proposed = { objects: objects.filter(object => object.id !== 'remote'), relations: relations.filter(relation => relation.id !== 'c') } as WorldSnapshot;
  const proof = buildImpactProof({ title: 'Remote', baseline, proposed,
    witness: { seedId: 'seed', side: 'baseline', ruleId: 'impact.dependencies', objectIds: ['child', 'remote'], relationIds: ['c'] },
  });
  expect(proof.objects.map(object => object.id)).toEqual(['child', 'remote']);
  expect(proof.relations.map(relation => relation.id)).toEqual(['c']);
  expect(proof.baselineOnlyObjects.has('remote')).toBe(true);
  expect(proof.baselineOnlyRelations.has('c')).toBe(true);
});

it('anchors a Thing-owned seed to the actual revision change without inventing a dependency edge', () => {
  const proof = buildImpactProof({ title: 'Scheduling', baseline: baselineFixture as WorldSnapshot, proposed: adapterFixture as WorldSnapshot,
    changes: [{ id: 'thing-calendar-adapter', entityKind: 'thing', changeKind: 'modified', title: 'Managed calendar adapter', changedFields: ['revisionId'] }],
    witness: { seedId: 'thing-calendar-adapter', side: 'proposed', ruleId: 'assistant-impact.depends-on', objectIds: ['availability-calendar', 'scheduling'], relationIds: ['scheduling-availability'] },
  });
  expect(proof.trigger).toMatchObject({ id: 'thing-calendar-adapter', title: 'Managed calendar adapter', seedObjectId: 'availability-calendar', ownership: true });
  expect(proof.trigger?.details.join(' ')).toContain('calendar-adapter@1 → calendar-adapter@2');
  expect(proof.relations.map(relation => relation.id)).toEqual(['scheduling-availability']);
  expect(proof.objects.map(object => object.id)).toEqual(['availability-calendar', 'scheduling']);
});

it('shows exact removed relationship origins and uses the baseline side for removed facts', () => {
  const baseline = { objects, relations, things: [] } as unknown as WorldSnapshot;
  const proposed = { objects: objects.map(object => ({ ...object, title: `Proposed ${object.title}` })), relations: relations.filter(relation => relation.id !== 'c'), things: [] } as unknown as WorldSnapshot;
  const proof = buildImpactProof({ title: 'Remote', baseline, proposed,
    changes: [{ id: 'c', entityKind: 'relation', changeKind: 'removed', title: 'Supports connection', changedFields: ['existence'] }],
    witness: { seedId: 'c', side: 'baseline', ruleId: 'assistant-impact.relation-change', objectIds: ['remote', 'child'], relationIds: ['c'] },
  });
  expect(proof.trigger).toMatchObject({ id: 'c', changeKind: 'removed', ownership: false });
  expect(proof.trigger?.details.join(' ')).toContain('Child supports Remote');
  expect(proof.trigger?.details.join(' ')).not.toContain('Proposed');
  expect(proof.baselineOnlyRelations.has('c')).toBe(true);
});
