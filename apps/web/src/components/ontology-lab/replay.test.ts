import { describe, expect, it } from 'vitest';
import { cancelledTraceEvent, isStoredTrace, nextTraceIndex, parseNdjson, replayCheckpoint } from './replay';

const targets = { messageIds: ['m1'], objectIds: [], relationIds: [], findingIds: [] };
const events = [
  { id: 'input', seq: 1, snapshot: null, evaluation: null, targets },
  { id: 'mapped', seq: 2, snapshot: { objects: ['world'] }, evaluation: null, targets },
  { id: 'checked', seq: 3, snapshot: { objects: ['world', 'outcome'] }, evaluation: { status: 'blocked' }, targets },
];
const storedEvent = { id: 'one', seq: 1, time: '2026-01-01T00:00:00Z', kind: 'run.completed', actor: 'feedback', title: 'Done', detail: '', targets, snapshot: { objects: [{ id: 'world', kind: 'world', title: 'World', source: { kind: 'declared', reference: 'test' } }], relations: [] }, evaluation: { status: 'blocked', findings: [] }, questions: [] };

describe('ontology trace replay', () => {
  it('keeps the last recorded checkpoint when selecting an earlier event', () => {
    expect(replayCheckpoint(events, 0).snapshot).toBeNull();
    expect(replayCheckpoint(events, 2)).toMatchObject({ snapshot: { objects: ['world', 'outcome'] }, evaluation: { status: 'blocked' } });
  });

  it('clamps trace navigation at each end', () => {
    expect(nextTraceIndex(0, events.length, -1)).toBe(0);
    expect(nextTraceIndex(1, events.length, 1)).toBe(2);
    expect(nextTraceIndex(2, events.length, 1)).toBe(2);
  });

  it('keeps partial stream data until a terminating newline arrives', () => {
    expect(parseNdjson<{ id: string }>('{"id":"one"}\n{"id":"two"}')).toEqual({ values: [{ id: 'one' }], trailing: '{"id":"two"}' });
  });

  it('rejects malformed retained trace data before replaying it', () => {
    expect(isStoredTrace({ id: 'one', savedAt: 'now', messages: [{ id: 'm', role: 'user', text: 'Hello' }], events: [storedEvent] })).toBe(true);
    expect(isStoredTrace({ id: 'one', messages: [], events: [{}] })).toBe(false);
    expect(isStoredTrace({ id: 'one', savedAt: 'now', messages: [], events: [{ ...storedEvent, targets: { ...targets, objectIds: 'world' } }] })).toBe(false);
    expect(isStoredTrace({ id: 'one', savedAt: 'now', messages: [], events: [{ ...storedEvent, snapshot: { objects: 'bad', relations: [] } }] })).toBe(false);
  });

  it('records cancellation as a terminal non-success state', () => {
    const cancelled = cancelledTraceEvent(4, { objects: ['draft'] }, null);
    expect(cancelled).toMatchObject({ seq: 4, kind: 'run.cancelled', actor: 'feedback', title: 'Run stopped' });
    expect(cancelled.detail).toContain('no completed extraction');
  });
});
