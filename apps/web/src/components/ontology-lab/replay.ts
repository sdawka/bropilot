export type TraceTarget = {
  messageIds?: string[];
  objectIds?: string[];
  relationIds?: string[];
  findingIds?: string[];
};

export type ReplayEvent<TSnapshot = unknown, TEvaluation = unknown> = {
  id: string;
  seq: number;
  snapshot: TSnapshot | null;
  evaluation: TEvaluation | null;
  targets: TraceTarget;
  /** Optional provisional model assessment; it never changes structural readiness. */
  semanticReview?: unknown;
  questionSelection?: unknown;
  timings?: unknown;
  stage?: unknown;
};

/** The state visible at a trace point; later events cannot alter its past. */
export function replayCheckpoint<TSnapshot, TEvaluation>(events: ReplayEvent<TSnapshot, TEvaluation>[], selected: number) {
  const bounded = Math.min(Math.max(selected, 0), Math.max(events.length - 1, 0));
  let evaluation: TEvaluation | null = null;
  let semanticReview: unknown = undefined;
  let questionSelection: unknown = undefined;
  let timings: unknown = undefined;
  let stage: unknown = undefined;
  let snapshot: TSnapshot | null = null;
  for (let index = bounded; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) continue;
    if (evaluation === null && event.evaluation) evaluation = event.evaluation;
    if (semanticReview === undefined && Object.hasOwn(event, 'semanticReview')) semanticReview = event.semanticReview;
    if (questionSelection === undefined && Object.hasOwn(event, 'questionSelection')) questionSelection = event.questionSelection;
    if (timings === undefined && Object.hasOwn(event, 'timings')) timings = event.timings;
    if (stage === undefined && Object.hasOwn(event, 'stage')) stage = event.stage;
    if (snapshot === null && event.snapshot) snapshot = event.snapshot;
  }
  return { event: events[bounded], snapshot, evaluation, semanticReview, questionSelection, timings, stage };
}

export function nextTraceIndex(current: number, total: number, direction: -1 | 1) {
  return Math.min(Math.max(current + direction, 0), Math.max(total - 1, 0));
}

/** A received terminal event remains authoritative even if stream cleanup aborts afterward. */
export function terminalTraceOutcome(events: Array<{ kind?: unknown; detail?: unknown }>) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind === 'run.completed' || event?.kind === 'run.failed') {
      return { kind: event.kind, detail: typeof event.detail === 'string' ? event.detail : '' };
    }
  }
  return undefined;
}

export function parseNdjson<T>(buffer: string) {
  const lines = buffer.split(/\r?\n/);
  const trailing = lines.pop() ?? '';
  const values: T[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    values.push(JSON.parse(line) as T);
  }
  return { values, trailing };
}

export function isStoredTrace(value: unknown): value is { id: string; savedAt: string; messages: Array<{ id: string; role: string; text: string }>; events: ReplayEvent[] } {
  if (!value || typeof value !== 'object') return false;
  const trace = value as Record<string, unknown>;
  if (typeof trace.id !== 'string' || typeof trace.savedAt !== 'string' || !Array.isArray(trace.messages) || !Array.isArray(trace.events)) return false;
  if (trace.messages.length > 24 || trace.events.length > 256) return false;
  return trace.messages.every(message => !!message && typeof message === 'object' && typeof (message as Record<string, unknown>).id === 'string' && ['user', 'assistant'].includes((message as Record<string, unknown>).role as string) && typeof (message as Record<string, unknown>).text === 'string')
    && trace.events.every(isStoredEvent);
}

export function cancelledTraceEvent<TSnapshot, TEvaluation>(seq: number, snapshot: TSnapshot | null, evaluation: TEvaluation | null): ReplayEvent<TSnapshot, TEvaluation> & { kind: string; actor: 'feedback'; title: string; detail: string; time: string; questions: string[] } {
  return { id: `cancelled-${crypto.randomUUID()}`, seq, time: new Date().toISOString(), kind: 'run.cancelled', actor: 'feedback', title: 'Run stopped', detail: 'You stopped this run; no completed extraction or criteria check is claimed.', targets: { messageIds: [], objectIds: [], relationIds: [], findingIds: [] }, snapshot, evaluation, questions: [] };
}

function stringList(value: unknown) { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function source(value: unknown) { return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).kind === 'string' && typeof (value as Record<string, unknown>).reference === 'string'; }
function snapshot(value: unknown) {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.objects) || !Array.isArray(record.relations)) return false;
  if (record.objects.length > 128 || record.relations.length > 128) return false;
  return record.objects.every(object => !!object && typeof object === 'object' && typeof (object as Record<string, unknown>).id === 'string' && typeof (object as Record<string, unknown>).kind === 'string' && typeof (object as Record<string, unknown>).title === 'string' && source((object as Record<string, unknown>).source) && ((object as Record<string, unknown>).parentId === undefined || typeof (object as Record<string, unknown>).parentId === 'string'))
    && record.relations.every(relation => !!relation && typeof relation === 'object' && typeof (relation as Record<string, unknown>).id === 'string' && typeof (relation as Record<string, unknown>).kind === 'string' && typeof (relation as Record<string, unknown>).fromId === 'string' && typeof (relation as Record<string, unknown>).toId === 'string' && source((relation as Record<string, unknown>).source));
}
function evaluation(value: unknown) {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ['ready', 'blocked', 'unknown'].includes(record.status as string) && Array.isArray(record.findings) && record.findings.every(finding => !!finding && typeof finding === 'object' && typeof (finding as Record<string, unknown>).ruleId === 'string' && typeof (finding as Record<string, unknown>).message === 'string' && stringList((finding as Record<string, unknown>).objectIds));
}
function isStoredEvent(value: unknown): value is ReplayEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (typeof event.id !== 'string' || typeof event.seq !== 'number' || typeof event.time !== 'string' || typeof event.kind !== 'string' || typeof event.title !== 'string' || typeof event.detail !== 'string') return false;
  if (!['input', 'extractor', 'mapper', 'criteria', 'semantic', 'questioner', 'feedback'].includes(event.actor as string) || !stringList(event.questions)) return false;
  if (event.questionCards !== undefined && (!Array.isArray(event.questionCards) || event.questionCards.length > 3 || !event.questionCards.every(card => !!card && typeof card === 'object' && typeof card.id === 'string' && typeof card.text === 'string' && typeof card.why === 'string' && stringList(card.objectIds) && stringList(card.findingIds)))) return false;
  const targets = event.targets as Record<string, unknown> | null;
  return !!targets && typeof targets === 'object' && stringList(targets.messageIds) && stringList(targets.objectIds) && stringList(targets.relationIds) && stringList(targets.findingIds) && snapshot(event.snapshot) && evaluation(event.evaluation)
    && optionalRecord(event.semanticReview) && optionalRecord(event.questionSelection) && optionalRecord(event.timings)
    && (event.stage === undefined || event.stage === null || typeof event.stage === 'string');
}

function optionalRecord(value: unknown) { return value === undefined || value === null || (!!value && typeof value === 'object'); }
