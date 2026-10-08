import type { Ref, ComputedRef } from 'vue';
export type Status = 'draft' | 'committed';
export interface Node { id: string; kind: string; title: string; description?: string;
  props?: Record<string, string>; status: Status; source?: unknown; answerId?: string }
export interface Edge { id: string; src: string; dst: string; type: string; status?: Status; trace?: 'valid' | 'suspect' }
export interface Graph { nodes: Node[]; edges: Edge[] }
export type SpaceId = 'basics' | 'problem' | 'hypothesis' | 'solution' | 'current' | 'planned' | 'effects';
export type PerspId = 'user' | 'domain' | 'intent' | 'delivery' | 'product' | 'raw';
export interface ProjectSummary { id: string; name: string; purpose: string; summary: string;
  counts: Record<SpaceId, number>; nodeCount: number; edgeCount: number; openCount: number;
  updatedAt: string; lastFocus?: { persp: PerspId; path: string[] } }
export interface Hop { from: string; edge: string; dir: 'out' | 'in' }
export interface PerspStep { kinds: string[]; via: Hop[]; waypoint?: boolean }
export interface Perspective { id: Exclude<PerspId, 'raw'>; label: string; blurb: string; steps: PerspStep[] }
export interface ViewState { project: string; persp: PerspId; path: string[]; across?: { edge: string; id: string } }
export type Band = 'act' | 'offer' | 'ask';
export type Intent = 'navigate' | 'ask' | 'propose' | 'explain' | 'check' | 'none';
// System One wire types: identical to lfp/src/ai/types.ts
export type S1Criterion = string | { definition: string; examples: string[] };
export type S1Question =
  | { type: 'noul'; instructions: string; criteria?: { true?: S1Criterion; false?: S1Criterion } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };
export type S1Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> };
export interface DecideRequest { fn: 'turn' | 'project-pick' | 'next-hop' | 'check'; state: unknown;
  questions: Record<string, S1Question>; model?: 'clef-flash' | 'clef' }
export interface DecideResponse { answers: Record<string, S1Answer>; model: string; ms: number; fake: boolean; error?: string }
export interface TurnContext { node?: string; persp: PerspId; level?: 0 | 1 | 2 | 3 }
export interface Option { value: string; label: string; confidence: number }
export interface Decision { key: 'intent' | 'persp' | 'space' | 'kind' | 'node'; value: string; label: string;
  confidence: number; alternatives: Option[] }
export interface TurnResolution { intent: Intent; band: Band; confidence: number; decisions: Decision[];
  usesContext: boolean; target?: { persp: PerspId; path: string[] }; nodeSet?: string[]; fake: boolean }
export type CanvasCommand =
  | { verb: 'focus'; id: string } | { verb: 'trail'; persp: PerspId; path: string[] }
  | { verb: 'filter'; ids: string[] } | { verb: 'ghost'; changesetId: string } | { verb: 'preview'; id: string }
  | { verb: 'highlight'; ids: string[] } | { verb: 'clear' };
export interface Author { kind: 'human' | 'agent' | 's1'; id: string; name: string }
export interface Effect { id: string; op: 'add-node' | 'add-edge' | 'update-node' | 'remove-edge' | 'remove-node';
  node?: Node; edge?: Edge; before?: Partial<Node>; verdict: 'pending' | 'accepted' | 'rejected'; reason?: string }
export interface Changeset { id: string; number: number; title: string; author: Author;
  status: 'open' | 'accepted' | 'partial' | 'rejected' | 'sent-back' | 'committed'; effects: Effect[];
  checks: { ok: number; warn: number; messages: string[] }; blast: string; createdAt: string }
export type TimelineEntry = { id: string; at: string; author: Author; nodeRefs?: string[] } & (
  | { type: 'message'; text: string; context?: TurnContext; resolution?: TurnResolution; thread?: string }
  | { type: 'changeset'; changeset: Changeset }
  | { type: 'commit'; summary: string; effects: string[] }
  | { type: 'test'; ok: boolean; testId: string; title: string }
  | { type: 'task'; taskId: string; status: string });
export interface Timeline { project: string; entries: TimelineEntry[] }
/** WP1's Pinia store `useGraph()` (src/store/graph.ts) implements this; WP2 only uses this surface. */
export interface GraphApi {
  project: Ref<ProjectSummary | null>; graph: Ref<Graph>; view: Ref<ViewState>;
  selection: ComputedRef<Node | null>; perspectives: Perspective[];
  byId(id: string): Node | undefined;
  neighbours(id: string): { edge: Edge; other: Node; dir: 'out' | 'in' }[];
  resolvePath(persp: PerspId, id: string): string[] | null;   // re-root resolver (§3)
  dispatch(cmd: CanvasCommand): void; undo(): void;
  ghost: Ref<Changeset | null>; applyEffects(effects: Effect[], status: Status): void;
  openGap(kind: string, parentId: string | null, question: string): void; // emits 'gap' for chat
  onGap(cb: (g: { kind: string; parentId: string | null; question: string }) => void): () => void;
}
/** WP2 implements in src/s1/hops.ts; WP1 calls it when persp=derived. */
export type PickNextHop = (a: { kind: string; pathTitles: string[]; options: Hop[] }) =>
  Promise<{ hop: Hop; confidence: number; band: Band; fake: boolean }>;
