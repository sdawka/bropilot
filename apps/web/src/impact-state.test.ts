import { expect, it } from 'vitest';
import { reactive } from 'vue';
import { createImpactFence, draftKey, readImpactDraft, semanticProperties, writeImpactDraft } from './impact-state';

it('rejects responses from previous analyses, edits, and changed baselines', () => {
  const fence = createImpactFence();
  const first = fence.begin('baseline-a');
  const second = fence.begin('baseline-a');
  expect(first.signal.aborted).toBe(true);
  expect(fence.current(first, 'baseline-a')).toBe(false);
  expect(fence.current(second, 'baseline-b')).toBe(false);
  fence.invalidate();
  expect(second.signal.aborted).toBe(true);
  expect(fence.current(second, 'baseline-a')).toBe(false);
});

it('limits semantic editing to admitted kind/property pairs and factual source', () => {
  const object = { id: 'plan', kind: 'planItem', title: 'Planned task', properties: {}, source: { kind: 'declared' as const, reference: 'fixture' } };
  expect(semanticProperties(object)).toEqual(['status', 'plannedAt', 'taskId']);
  expect(semanticProperties({ ...object, kind: 'metric' })).toEqual(['windowStart', 'windowEnd']);
  expect(semanticProperties({ ...object, source: { kind: 'hypothesis', reference: 'idea' } })).toEqual([]);
  expect(semanticProperties({ ...object, kind: 'world' })).toEqual([]);
});

it('keeps drafts separately by baseline hash and returns independent editable copies', () => {
  const key = draftKey('world', 'hash-a');
  writeImpactDraft(key, [{ kind: 'setThingRevision', thingId: 'calendar', revisionId: 'v2' }]);
  const editable = readImpactDraft(key);
  editable.length = 0;
  expect(readImpactDraft(key)).toHaveLength(1);
  expect(readImpactDraft(draftKey('world', 'hash-b'))).toEqual([]);
});

it('accepts reactive draft operations without cloning browser proxies', () => {
  const operations = reactive([{ kind: 'setThingRevision' as const, thingId: 'calendar', revisionId: 'v2' }]);
  const key = draftKey('reactive-world', 'baseline');
  expect(() => writeImpactDraft(key, operations)).not.toThrow();
  operations[0].revisionId = 'v3';
  expect(readImpactDraft(key)[0]).toMatchObject({ revisionId: 'v2' });
});
