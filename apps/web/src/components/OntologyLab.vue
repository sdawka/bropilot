<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ModelObject, ModelRelation, ReadinessEvaluation, WorldSnapshot } from '@bropilot/contracts';
import { EXAMPLE_MESSAGES, type LabEvent, type LabMessage, type LabQuestionCard } from '../../../../packages/ontology-lab/domain.mjs';
import { cancelledTraceEvent, isStoredTrace, nextTraceIndex, parseNdjson, replayCheckpoint, terminalTraceOutcome } from './ontology-lab/replay';
import '../ontology-lab.css';

type Capability = { available: boolean; provider: 'codex'; message?: string };
type RawCapability = { available?: boolean; provider?: 'codex'; message?: string; modes?: { live?: { available?: boolean } } };
type AuthoringStage = 'exploring' | 'defining' | 'realizing';
type TraceEvent = Omit<LabEvent, 'actor'> & { actor: LabEvent['actor'] | 'semantic' | 'questioner'; stage?: AuthoringStage; semanticReview?: unknown; questionSelection?: unknown; timings?: unknown };
type SavedRun = { id: string; savedAt: string; mode?: 'live' | 'example'; messages: LabMessage[]; events: TraceEvent[] };
type RecordValue = Record<string, unknown>;
const AUTHORING_STAGES: AuthoringStage[] = ['exploring', 'defining', 'realizing'];

const emptyCapability: Capability = { available: false, provider: 'codex', message: 'Checking local workspace…' };
const messages = ref<LabMessage[]>([]);
const draft = ref('');
const pendingQuestion = ref<LabQuestionCard>();
const composerInput = ref<HTMLTextAreaElement>();
const events = ref<TraceEvent[]>([]);
const selectedIndex = ref(-1);
const traceList = ref<HTMLOListElement>();
const selectedObjectId = ref<string>();
const view = ref<'visual' | 'text'>('visual');
const capability = ref<Capability>(emptyCapability);
const loadingCapability = ref(true);
const running = ref(false);
const following = ref(true);
const error = ref('');
const savedRuns = ref<SavedRun[]>([]);
const selectedSavedRun = ref('');
const runOrigin = ref<'live' | 'example' | 'saved' | undefined>();
const authoringStage = ref<AuthoringStage>('exploring');
let playbackTimer: number | undefined;
let activeController: AbortController | undefined;
let cancelled = false;

const selectedEvent = computed(() => selectedIndex.value >= 0 ? events.value[selectedIndex.value] : undefined);
const nextQuestion = computed(() => selectedEvent.value?.questionCards?.[0]);
const replay = computed(() => replayCheckpoint(events.value, selectedIndex.value));
const snapshot = computed<WorldSnapshot | null>(() => replay.value.snapshot as WorldSnapshot | null);
const evaluation = computed<ReadinessEvaluation | null>(() => replay.value.evaluation as ReadinessEvaluation | null);
const objects = computed(() => snapshot.value?.objects ?? []);
const relations = computed(() => snapshot.value?.relations ?? []);
const targets = computed(() => selectedEvent.value?.targets ?? { messageIds: [], objectIds: [], relationIds: [], findingIds: [] });
const highlightedObjects = computed(() => new Set(targets.value.objectIds ?? []));
const highlightedRelations = computed(() => new Set(targets.value.relationIds ?? []));
const highlightedMessages = computed(() => new Set(targets.value.messageIds ?? []));
const highlightedFindings = computed(() => new Set(targets.value.findingIds ?? []));
const treeObjects = computed(() => {
  const remaining = new Map(objects.value.map(object => [object.id, object]));
  const ordered: Array<{ object: ModelObject; depth: number }> = [];
  const walk = (parentId: string | undefined, depth: number) => {
    for (const object of objects.value.filter(item => item.parentId === parentId)) {
      if (!remaining.delete(object.id)) continue;
      ordered.push({ object, depth });
      walk(object.id, depth + 1);
    }
  };
  walk(undefined, 0);
  for (const object of remaining.values()) ordered.push({ object, depth: 0 });
  return ordered;
});
const mainObject = computed(() => objects.value.find(object => object.kind === 'world') ?? objects.value[0]);
const visualPeers = computed(() => {
  if (!mainObject.value) return [];
  const peers = objects.value.filter(object => object.id !== mainObject.value!.id);
  const important = new Set([selectedObjectId.value, ...highlightedObjects.value]);
  return [...peers.filter(object => important.has(object.id)), ...peers.filter(object => !important.has(object.id))]
    .filter((object, index, list) => list.findIndex(item => item.id === object.id) === index).slice(0, 8);
});
const hiddenVisualPeers = computed(() => Math.max(0, objects.value.length - 1 - visualPeers.value.length));
const selectedObject = computed(() => objects.value.find(object => object.id === selectedObjectId.value));
const latest = computed(() => selectedIndex.value === events.value.length - 1);
const progress = computed(() => events.value.length ? `${selectedIndex.value + 1} / ${events.value.length}` : 'No steps yet');
const criteriaFindings = computed(() => evaluation.value?.findings ?? []);
const savedTimestamp = computed(() => savedRuns.value.find(run => run.id === selectedSavedRun.value)?.savedAt);
const replayStage = computed(() => stageValue(replay.value.stage) ?? authoringStage.value);
const semanticReview = computed(() => asRecord(replay.value.semanticReview));
const semanticStatus = computed(() => semanticReview.value ? 'provisional' : 'not reviewed');
const semanticJudgments = computed(() => listValue(semanticReview.value?.judgments).map(asRecord).filter((judgment): judgment is RecordValue => !!judgment));
const questionSelection = computed(() => asRecord(replay.value.questionSelection));
const selectionPrimary = computed(() => asRecord(questionSelection.value?.primary) ?? asRecord(listValue(questionSelection.value?.selected)[0]));
const selectedQuestionReason = computed(() => textValue(selectionPrimary.value?.reason) ?? textValue(selectionPrimary.value?.why) ?? nextQuestion.value?.why);
const selectedQuestionId = computed(() => textValue(selectionPrimary.value?.id) ?? textValue(questionSelection.value?.selectedId));
const candidateQuestions = computed(() => listValue(questionSelection.value?.candidates).map(asRecord).filter((candidate): candidate is RecordValue => !!candidate));
const timingEntries = computed(() => Object.entries(asRecord(replay.value.timings) ?? {}).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)).map(([name, value]) => ({ name: name.replace(/([A-Z])/g, ' $1').replace(/Ms$/i, '').trim(), milliseconds: value as number })));

function messageId() { return `message-${crypto.randomUUID()}`; }
function runId() { return `run-${crypto.randomUUID()}`; }
function pausePlayback() { if (playbackTimer) window.clearInterval(playbackTimer); playbackTimer = undefined; }
function setStep(index: number) {
  selectedIndex.value = Math.min(Math.max(index, 0), Math.max(events.value.length - 1, 0));
}
function selectStep(index: number) {
  pausePlayback();
  following.value = false;
  setStep(index);
}
function step(direction: -1 | 1) { selectStep(nextTraceIndex(selectedIndex.value, events.value.length, direction)); }
function followLive() { pausePlayback(); following.value = true; setStep(events.value.length - 1); }
function play() {
  if (events.value.length < 2) return;
  pausePlayback();
  if (selectedIndex.value >= events.value.length - 1) selectedIndex.value = 0;
  playbackTimer = window.setInterval(() => {
    if (selectedIndex.value >= events.value.length - 1) { pausePlayback(); following.value = true; return; }
    setStep(selectedIndex.value + 1);
  }, 900);
}
function asRecord(value: unknown): RecordValue | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined; }
function listValue(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function textValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }
function stageValue(value: unknown): AuthoringStage | undefined { return value === 'exploring' || value === 'defining' || value === 'realizing' ? value : undefined; }
function eventTargetReferences(judgment: RecordValue) {
  return [...listValue(judgment.refs), ...listValue(judgment.inputRefs), ...listValue(judgment.evidenceRefs), ...listValue(judgment.nodeRefs), ...listValue(judgment.objectIds)]
    .filter((reference): reference is string => typeof reference === 'string').slice(0, 6);
}
function judgmentTitle(judgment: RecordValue) { return textValue(judgment.kind) ?? textValue(judgment.subject) ?? 'Semantic judgment'; }
function judgmentDisposition(judgment: RecordValue) { return textValue(judgment.disposition) ?? textValue(judgment.status) ?? 'unknown'; }
function candidateLabel(candidate: RecordValue) { return textValue(candidate.text) ?? textValue(candidate.question) ?? textValue(candidate.id) ?? 'Question candidate'; }
function addEvent(event: TraceEvent) {
  if (events.value.some(item => item.id === event.id)) return;
  events.value = [...events.value, event].sort((left, right) => left.seq - right.seq);
  if (following.value) setStep(events.value.length - 1);
}
function supportsStorage() { return typeof window !== 'undefined' && !!window.localStorage; }
function restoreRuns() {
  if (!supportsStorage()) return;
  try {
    const raw = window.localStorage.getItem('bropilot.ontology-lab.runs') ?? '[]';
    if (raw.length > 2 * 1024 * 1024) throw new Error('Stored trace is too large.');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    savedRuns.value = parsed.filter(isStoredTrace).slice(0, 8) as SavedRun[];
  } catch { window.localStorage.removeItem('bropilot.ontology-lab.runs'); }
}
function rememberRun(mode: 'live' | 'example') {
  if (!supportsStorage() || !events.value.length) return;
  const entry: SavedRun = { id: runId(), savedAt: new Date().toISOString(), mode, messages: messages.value, events: events.value };
  savedRuns.value = [entry, ...savedRuns.value].slice(0, 8);
  selectedSavedRun.value = entry.id;
  let retained = JSON.stringify(savedRuns.value);
  while (retained.length > 2 * 1024 * 1024 && savedRuns.value.length > 1) {
    savedRuns.value.pop(); retained = JSON.stringify(savedRuns.value);
  }
  if (retained.length > 2 * 1024 * 1024) return;
  try { window.localStorage.setItem('bropilot.ontology-lab.runs', retained); }
  catch { savedRuns.value = savedRuns.value.slice(0, 1); }
}
function loadRun() {
  const saved = savedRuns.value.find(item => item.id === selectedSavedRun.value);
  if (!saved) return;
  pausePlayback();
  pendingQuestion.value = undefined;
  messages.value = saved.messages;
  events.value = saved.events;
  setStep(saved.events.length - 1);
  following.value = false;
  runOrigin.value = 'saved';
  error.value = '';
}
function exportRun() {
  const data = JSON.stringify({ version: 1, messages: messages.value, events: events.value }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `ontology-lab-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
async function initialize() {
  loadingCapability.value = true;
  try {
    await fetch('/api/v1/local/session', { credentials: 'same-origin' });
    const response = await fetch('/api/v1/ontology-lab/capabilities', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('The local ontology lab is unavailable.');
    const reported = await response.json() as RawCapability;
    capability.value = { available: reported.available ?? !!reported.modes?.live?.available, provider: 'codex', message: reported.message ?? (reported.modes?.live?.available ? 'Codex CLI detected · sign-in is checked when a run starts.' : 'Codex is unavailable in this local workspace.') };
  } catch (cause) {
    capability.value = { available: false, provider: 'codex', message: cause instanceof Error ? cause.message : 'The local ontology lab is unavailable.' };
  } finally { loadingCapability.value = false; }
}
async function streamRun(mode: 'live' | 'example', nextMessages: LabMessage[]) {
  if (!nextMessages.length || running.value) return;
  error.value = '';
  pendingQuestion.value = undefined;
  running.value = true;
  pausePlayback();
  events.value = [];
  selectedIndex.value = -1;
  selectedObjectId.value = undefined;
  following.value = true;
  cancelled = false;
  runOrigin.value = mode;
  messages.value = nextMessages;
  activeController = new AbortController();
  try {
    const response = await fetch('/api/v1/ontology-lab/run', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify({ messages: nextMessages, mode, stage: authoringStage.value }), signal: activeController.signal,
    });
    if (!response.ok || !response.body) throw new Error((await response.text()) || 'The ontology run could not start.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let streamBytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      streamBytes += chunk.value.byteLength;
      if (streamBytes > 8 * 1024 * 1024 || events.value.length > 256) {
        await reader.cancel(); throw new Error('This trace exceeds the lab replay limit; try a smaller description.');
      }
      const parsed = parseNdjson<TraceEvent>(buffered + decoder.decode(chunk.value, { stream: true }));
      buffered = parsed.trailing;
      parsed.values.forEach(addEvent);
    }
    const tail = buffered.trim();
    if (tail) addEvent(JSON.parse(tail) as TraceEvent);
    const terminal = terminalTraceOutcome(events.value);
    if (terminal?.kind === 'run.completed') rememberRun(mode);
    else if (terminal?.kind === 'run.failed') error.value = terminal.detail || 'The ontology run failed.';
    else throw new Error('The ontology stream ended before reporting a result.');
  } catch (cause) {
    const terminal = terminalTraceOutcome(events.value);
    if (terminal?.kind === 'run.completed') {
      rememberRun(mode);
    } else if (terminal?.kind === 'run.failed') {
      error.value = terminal.detail || 'The ontology run failed.';
    } else if ((cause as DOMException)?.name === 'AbortError' && cancelled) {
      const last = events.value.at(-1);
      addEvent(cancelledTraceEvent((last?.seq ?? -1) + 1, snapshot.value, evaluation.value) as TraceEvent);
      error.value = 'Run stopped before a completed result was recorded.';
    } else {
      activeController?.abort();
      error.value = cause instanceof Error ? cause.message : 'The ontology run failed.';
    }
  } finally { running.value = false; activeController = undefined; }
}
function stopRun() { cancelled = true; activeController?.abort(); }
function submitLive() {
  const text = draft.value.trim();
  if (!text) return;
  const question = pendingQuestion.value;
  draft.value = '';
  pendingQuestion.value = undefined;
  void streamRun('live', [...messages.value, ...(question ? [{ id: messageId(), role: 'assistant' as const, text: question.text }] : []), { id: messageId(), role: 'user', text }]);
}
async function answerQuestion(question: LabQuestionCard) {
  pendingQuestion.value = question;
  await nextTick(); composerInput.value?.focus();
  composerInput.value?.scrollIntoView({ block: 'center', behavior: 'instant' });
}
function exploreExample() { void streamRun('example', structuredClone(EXAMPLE_MESSAGES) as LabMessage[]); }
async function startFresh() {
  pausePlayback(); messages.value = []; events.value = []; selectedIndex.value = -1;
  selectedObjectId.value = undefined; selectedSavedRun.value = ''; runOrigin.value = undefined;
  pendingQuestion.value = undefined; draft.value = ''; error.value = '';
  await nextTick(); composerInput.value?.focus();
}
function objectLabel(object: ModelObject) { return `${object.kind} · ${object.title}`; }
function relationLabel(relation: ModelRelation) {
  const from = objects.value.find(object => object.id === relation.fromId)?.title ?? relation.fromId;
  const to = objects.value.find(object => object.id === relation.toId)?.title ?? relation.toId;
  return `${from} ${relation.kind} ${to}`;
}
function findingId(finding: ReadinessEvaluation['findings'][number], index: number) { return `${finding.ruleId}:${index}`; }
function eventActorName(actor: TraceEvent['actor']) {
  return ({ input: 'Input', extractor: 'Codex extractor', mapper: 'Deterministic mapper', criteria: 'Rust criteria', feedback: 'Feedback from checks', semantic: 'System One review', questioner: 'Questions' } as Record<string, string>)[actor] ?? actor;
}
function selectActor(actor: TraceEvent['actor']) {
  const afterCurrent = events.value.findIndex(event => event.actor === actor && event.seq >= (selectedEvent.value?.seq ?? 0));
  const first = events.value.findIndex(event => event.actor === actor);
  if (afterCurrent >= 0) selectStep(afterCurrent);
  else if (first >= 0) selectStep(first);
}
watch(events, () => { if (selectedIndex.value >= events.value.length) selectedIndex.value = events.value.length - 1; });
watch(selectedIndex, async () => {
  await nextTick();
  const list = traceList.value;
  const item = list?.querySelector<HTMLElement>('button.selected');
  if (!list || !item) return;
  const container = list.getBoundingClientRect(), selected = item.getBoundingClientRect();
  if (selected.top < container.top) list.scrollTop += selected.top - container.top;
  else if (selected.bottom > container.bottom) list.scrollTop += selected.bottom - container.bottom;
});
onMounted(() => { restoreRuns(); void initialize(); });
onBeforeUnmount(() => { pausePlayback(); stopRun(); });
</script>

<template>
  <main class="ontology-lab shell">
    <header class="lab-header">
      <RouterLink class="lab-back" to="/">Worlds</RouterLink>
      <div>
        <p class="lab-eyebrow">Isolated authoring lab</p>
        <h1>From a rough thought to a testable World</h1>
      </div>
      <div class="lab-header-actions">
        <button class="secondary" type="button" :disabled="running" @click="startFresh">New description</button>
        <select v-if="savedRuns.length" v-model="selectedSavedRun" aria-label="Saved ontology runs" :disabled="running" @change="loadRun">
          <option value="">Saved runs</option>
          <option v-for="saved in savedRuns" :key="saved.id" :value="saved.id">{{ new Date(saved.savedAt).toLocaleString() }}</option>
        </select>
        <button class="secondary" type="button" :disabled="!events.length" @click="exportRun">Export run</button>
      </div>
    </header>

    <section class="lab-layout" aria-label="Ontology authoring flow">
      <section class="lab-stage" aria-label="Ontology workspace">
        <div class="lab-intro">
          <p class="lab-description">Describe a world in your own words. The lab records each transformation, then runs the same Rust readiness checks used by the platform.</p>
          <fieldset class="stage-picker" :disabled="running" aria-label="Authoring stage">
            <legend>Authoring stage</legend>
            <label v-for="stage in AUTHORING_STAGES" :key="stage">
              <input v-model="authoringStage" type="radio" name="authoring-stage" :value="stage"> {{ stage }}
            </label>
            <small>Changes question priority and completeness prompts; it does not grant permission.</small>
          </fieldset>
          <div class="lab-runtime">
            <p class="lab-status" :class="{ available: capability.available }">
              <span class="status-dot" :class="{ ready: capability.available }"></span>
              {{ loadingCapability ? 'Checking local Codex…' : capability.message }}
            </p>
            <p v-if="runOrigin" class="run-origin">{{ running ? 'Live run in progress' : runOrigin === 'example' ? 'Example extraction · real Rust checks' : runOrigin === 'saved' ? `Saved replay · ${savedTimestamp ? new Date(savedTimestamp).toLocaleString() : 'recorded run'}` : 'Recorded live run' }}</p>
          </div>
        </div>

        <div class="ontology-surface" :class="{ 'has-snapshot': snapshot }">
          <div class="ontology-toolbar">
            <div>
              <p class="lab-eyebrow">{{ snapshot ? 'Recorded ontology' : 'Ontology canvas' }}</p>
              <strong>{{ snapshot?.title ?? 'Nothing has been asserted yet' }}</strong>
              <span v-if="snapshot" class="stage-badge">{{ replayStage }}</span>
            </div>
            <div class="view-toggle" role="group" aria-label="Ontology representation">
              <button type="button" :aria-pressed="view === 'visual'" @click="view = 'visual'">Visual</button>
              <button type="button" :aria-pressed="view === 'text'" @click="view = 'text'">Text</button>
            </div>
          </div>

          <div v-if="!snapshot" class="blank-canvas">
            <span class="blank-mark">+</span>
            <p>Start with an imperfect description, or inspect the recorded example.</p>
          </div>

          <div v-else-if="view === 'visual'" class="visual-view">
            <div class="ontology-map" aria-label="Ontology map">
              <button v-if="mainObject" class="ontology-core-node" type="button" :class="{ highlighted: highlightedObjects.has(mainObject.id), selected: selectedObjectId === mainObject.id }" @click="selectedObjectId = mainObject.id">
                <small>{{ mainObject.kind }}</small><span>{{ mainObject.title }}</span>
              </button>
              <button v-for="(object, index) in visualPeers" :key="object.id" class="ontology-node" type="button"
                :class="[{ highlighted: highlightedObjects.has(object.id), selected: selectedObjectId === object.id }, `node-${index}`]" @click="selectedObjectId = object.id">
                <small>{{ object.kind }}</small><span>{{ object.title }}</span>
              </button>
              <p v-if="hiddenVisualPeers" class="map-remainder">+ {{ hiddenVisualPeers }} more nodes in Text view</p>
            </div>
          </div>

          <div v-else class="ontology-text-list">
            <button v-for="entry in treeObjects" :key="entry.object.id" class="ontology-text-row" type="button" :style="{ paddingLeft: `${18 + entry.depth * 20}px` }"
              :class="{ highlighted: highlightedObjects.has(entry.object.id), selected: selectedObjectId === entry.object.id }" @click="selectedObjectId = entry.object.id">
              <small>{{ entry.object.kind }}</small><span>{{ entry.object.title }}</span>
            </button>
            <p v-if="relations.length" class="relation-summary">{{ relations.length }} recorded relation{{ relations.length === 1 ? '' : 's' }}</p>
          </div>

          <div v-if="relations.length" class="relation-chips" aria-label="Typed relations">
            <button v-for="relation in relations" :key="relation.id" type="button" :class="{ highlighted: highlightedRelations.has(relation.id) }" @click="selectedObjectId = relation.fromId">{{ relationLabel(relation) }}</button>
          </div>

          <aside v-if="snapshot" class="agent-dock" aria-label="Flow agents">
            <p class="lab-eyebrow">{{ running && following ? 'Working now' : 'Recorded step' }}</p>
            <button v-for="actor in ['extractor', 'mapper', 'criteria', 'semantic', 'questioner', 'feedback'] as const" :key="actor" type="button" class="agent-card"
              :class="{ active: selectedEvent?.actor === actor }" @click="selectActor(actor)">
              <span class="agent-dot"></span>{{ eventActorName(actor) }}
            </button>
          </aside>

          <aside v-if="selectedObject" class="object-inspector">
            <button class="close-inspector" type="button" aria-label="Close object details" @click="selectedObjectId = undefined">×</button>
            <p class="lab-eyebrow">Selected node</p><strong>{{ selectedObject.title }}</strong><span>{{ selectedObject.kind }}</span>
            <p v-if="selectedObject.source.reference" class="evidence">Evidence: {{ selectedObject.source.reference }}</p>
          </aside>
        </div>

        <section v-if="evaluation" class="criteria-strip" aria-label="Criteria feedback">
          <div><p class="lab-eyebrow">Rust readiness</p><strong :class="`readiness-${evaluation.status}`">{{ evaluation.status }}</strong></div>
          <p v-if="!criteriaFindings.length">The recorded snapshot has no reported findings.</p>
          <details v-else :open="selectedEvent?.actor === 'criteria' || selectedEvent?.actor === 'feedback'"><summary>{{ criteriaFindings.length }} finding{{ criteriaFindings.length === 1 ? '' : 's' }} from the Rust check</summary><ul>
            <li v-for="(finding, index) in criteriaFindings" :key="findingId(finding, index)" :class="{ highlighted: highlightedFindings.has(findingId(finding, index)) }">{{ finding.message }}</li>
          </ul></details>
          <p class="criteria-scope">These checks assess the model. Runtime behavior and outcomes remain untested.</p>
        </section>
        <section v-if="semanticReview" class="semantic-strip" aria-label="Provisional semantic review">
          <div><p class="lab-eyebrow">Provisional semantic review</p><strong :class="`semantic-${semanticStatus}`">{{ semanticStatus }}</strong></div>
          <p>System One reviews the conversation and draft evidence. These are provisional model judgments. They do not change Rust readiness, grant permission, or prove runtime behavior.</p>
          <details v-if="semanticJudgments.length" :open="selectedEvent?.actor === 'semantic'"><summary>{{ semanticJudgments.length }} recorded judgment{{ semanticJudgments.length === 1 ? '' : 's' }}</summary><ul>
            <li v-for="(judgment, index) in semanticJudgments" :key="`${judgmentTitle(judgment)}-${index}`"><strong>{{ judgmentTitle(judgment) }} · {{ judgmentDisposition(judgment) }}</strong><span v-if="textValue(judgment.reason)"> {{ textValue(judgment.reason) }}</span><small v-if="eventTargetReferences(judgment).length">Inputs/nodes: {{ eventTargetReferences(judgment).join(', ') }}</small></li>
          </ul></details>
        </section>
        <section v-if="nextQuestion" class="next-question" aria-label="Next useful question">
          <p class="lab-eyebrow">A useful next question</p>
          <h2>{{ nextQuestion.text }}</h2>
          <p>{{ selectedQuestionReason }}</p>
          <button class="secondary" :disabled="running" @click="answerQuestion(nextQuestion)">Answer this</button>
          <details v-if="(selectedEvent?.questionCards?.length ?? 0) > 1"><summary>Other questions to explore</summary><ul><li v-for="question in selectedEvent?.questionCards?.slice(1)" :key="question.id"><strong>{{ question.text }}</strong><p>{{ question.why }}</p><button class="text-button" @click="answerQuestion(question)">Answer this question</button></li></ul></details>
        </section>
        <details v-else-if="selectedEvent?.questions.length" class="feedback-questions" :open="selectedEvent?.actor === 'feedback'" aria-label="Questions from this trace step">
          <summary>What the draft still needs · {{ selectedEvent.questions.length }} questions</summary>
          <ul><li v-for="question in selectedEvent.questions" :key="question">{{ question }}</li></ul>
        </details>

        <section class="composer" aria-label="Describe this world">
          <p v-if="pendingQuestion" class="reply-context">Replying to: {{ pendingQuestion.text }} <button class="text-button" @click="pendingQuestion = undefined">Write a new thought</button></p>
          <div class="message-history" v-if="messages.length">
            <article v-for="message in messages" :key="message.id" class="message-bubble" :class="{ highlighted: highlightedMessages.has(message.id) }">
              <span>{{ message.role === 'user' ? 'You' : message.role }}</span><p>{{ message.text }}</p>
            </article>
          </div>
          <textarea ref="composerInput" v-model="draft" aria-label="Description or follow-up" maxlength="4000" rows="3" placeholder="For example: I want a web app that helps me place focused work on my calendar, checks conflicts, and lets me review progress each Friday." :disabled="running" @keydown.meta.enter.prevent="submitLive" @keydown.ctrl.enter.prevent="submitLive"></textarea>
          <div class="composer-actions">
            <button class="secondary" type="button" :disabled="running" @click="exploreExample">Explore example</button>
            <span class="composer-hint">⌘↵ to run locally</span>
            <button v-if="running" class="secondary" type="button" @click="stopRun">Stop run</button>
            <button v-else class="primary" type="button" :disabled="!capability.available || !draft.trim()" @click="submitLive">Run with Codex</button>
          </div>
          <p v-if="error" class="lab-error" role="alert">{{ error }}</p>
        </section>
      </section>

      <aside class="trace-sidebar" aria-label="Information flow log">
        <header class="trace-header"><div><p class="lab-eyebrow">Information flow</p><strong>{{ progress }}</strong></div><button class="icon-button" type="button" :disabled="events.length < 2" aria-label="Play trace" @click="play">▶</button></header>
        <div class="trace-controls">
          <button type="button" :disabled="selectedIndex <= 0" @click="step(-1)">Previous</button>
          <button type="button" :disabled="selectedIndex >= events.length - 1" @click="step(1)">Next</button>
          <button v-if="!following && events.length" type="button" @click="followLive">Follow live</button>
        </div>
        <ol ref="traceList" class="trace-list">
          <li v-for="(event, index) in events" :key="event.id">
            <button type="button" :aria-current="index === selectedIndex ? 'step' : undefined" :class="{ selected: index === selectedIndex }" @click="selectStep(index)">
              <span class="trace-seq">{{ String(event.seq).padStart(2, '0') }}</span><span><small>{{ eventActorName(event.actor) }}</small><strong>{{ event.title }}</strong><em>{{ event.detail }}</em></span>
            </button>
          </li>
        </ol>
        <section v-if="questionSelection" class="selection-detail" aria-label="Question selection detail">
          <p class="lab-eyebrow">Question selection</p>
          <strong>{{ selectedQuestionId ?? 'No question selected' }}</strong>
          <p v-if="selectedQuestionReason">{{ selectedQuestionReason }}</p>
          <details v-if="candidateQuestions.length" :open="selectedEvent?.actor === 'questioner'"><summary>{{ candidateQuestions.length }} candidate{{ candidateQuestions.length === 1 ? '' : 's' }} considered</summary><ul><li v-for="(candidate, index) in candidateQuestions" :key="`${candidateLabel(candidate)}-${index}`" :class="{ selected: candidate.id === selectedQuestionId }">{{ candidateLabel(candidate) }}<small v-if="textValue(candidate.reason) || textValue(candidate.why)">{{ textValue(candidate.reason) ?? textValue(candidate.why) }}</small></li></ul></details>
        </section>
        <section v-if="timingEntries.length" class="timing-detail" aria-label="Recorded stage timings">
          <p class="lab-eyebrow">Recorded stage timings</p><ul><li v-for="entry in timingEntries" :key="entry.name"><span>{{ entry.name }}</span><strong>{{ entry.milliseconds }} ms</strong></li></ul>
        </section>
        <details v-if="selectedEvent" class="trace-json"><summary>Structured event</summary><pre>{{ JSON.stringify(selectedEvent, null, 2) }}</pre></details>
        <p v-else class="trace-empty">Each step here will point to the input, process, or ontology records it affected.</p>
      </aside>
    </section>
  </main>
</template>
