// The chat: one System One request per turn, resolved in code, rendered as typed replies. Repair
// re-resolves from the held answers (0 requests). The `s1` flag decides what the act band does.
import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import type { Author, Node, PerspId, TurnResolution } from '../types';
import { flags } from '../flags';
import { ontology } from '../s1/ontologyData';
import { buildTurn } from '../s1/turn';
import { decide } from '../s1/client';
import { resolveTurn, offerKey, type Held, type Overrides, type RepairKey } from '../s1/resolve';
import { logCorrection } from '../s1/corrections';
import { useGraphApi } from './graphApi';
import { gapChangeset, makeEnv, payloadFor, proposeChangeset, type ReplyPayload } from './engine';
import { ME, S1, uid, useTimeline } from '../agents/timeline';
import { chatCollapsed } from '../store/ui';

export interface Frozen { node?: { id: string; title: string; kind: string }; persp: PerspId; level?: number; path: string[] }
export interface Gap { kind: string; parentId: string | null; question: string }
export interface ChatMsg {
  id: string; at: string; thread: string; author: Author;
  kind: 'human' | 'reply' | 'stub';
  text?: string;
  frozen?: Frozen;
  /** reply */
  held?: Held; overrides?: Overrides; resolution?: TurnResolution; payload?: ReplyPayload;
  changesetId?: string; repaired?: string; moved?: boolean; pendingPreview?: boolean; srcText?: string;
  /** stub */
  gap?: Gap; answered?: boolean;
}
const ORDER: RepairKey[] = ['intent', 'persp', 'space', 'kind', 'node'];

export const useChat = defineStore('uip-chat', () => {
  const g = useGraphApi();
  const tl = useTimeline();
  const msgs = ref<ChatMsg[]>([]);
  const busy = ref(false);
  /** Context pills switched off for the next turn (× on the pill). */
  const excluded = reactive({ node: false, persp: false, level: false });
  /** thread=node: show the project thread ("Inbox") instead of the node's. */
  const inbox = ref(false);
  /** Shared with WP1's shell (App.vue sizes the column, ChatToggle flips it, it persists itself). */
  const collapsed = chatCollapsed;

  const selection = computed<Node | null>(() => g.selection.value);
  const level = computed(() => {
    const k = selection.value && ontology.KINDS.find((x) => x.id === selection.value!.kind);
    return (k?.level ?? undefined) as 0 | 1 | 2 | 3 | undefined;
  });
  const threadId = computed(() => (flags.thread === 'node' && !inbox.value && selection.value ? `node:${selection.value.id}` : 'project'));
  const thread = computed(() => msgs.value.filter((m) => m.thread === threadId.value));
  const last = (pred: (m: ChatMsg) => boolean) => [...thread.value].reverse().find(pred);
  const pendingPreview = computed(() => last((m) => m.kind === 'reply')?.pendingPreview ? last((m) => m.kind === 'reply') : undefined);
  const pendingOffer = computed(() => {
    const m = last((x) => x.kind === 'reply');
    return m && m.resolution && !m.moved && (m.resolution.band === 'offer' || (m.resolution.band === 'act' && flags.s1 === 'ask'))
      && m.resolution.intent !== 'propose' ? m : undefined;
  });
  const openStubs = computed(() => msgs.value.filter((m) => m.kind === 'stub' && !m.answered).length);

  function freeze(): Frozen {
    const v = g.view.value; const s = selection.value;
    return { node: s ? { id: s.id, title: s.title, kind: s.kind } : undefined, persp: v.persp, level: level.value, path: [...v.path] };
  }

  async function send(raw: string, opts: { mention?: string | null } = {}) {
    const text = raw.trim(); if (!text || busy.value) return;
    const frozen = freeze();
    const ctxNode = opts.mention ? g.byId(opts.mention) ?? null : excluded.node ? null : selection.value;
    const persp = excluded.persp || g.view.value.persp === 'raw' ? 'domain' : g.view.value.persp;
    const lvl = excluded.level ? undefined : level.value;
    const human: ChatMsg = { id: uid('m'), at: new Date().toISOString(), thread: threadId.value, author: ME, kind: 'human', text,
      frozen: { ...frozen, node: ctxNode ? { id: ctxNode.id, title: ctxNode.title, kind: ctxNode.kind } : undefined, level: lvl } };
    msgs.value.push(human);
    Object.assign(excluded, { node: false, persp: false, level: false });
    busy.value = true;
    try {
      const built = buildTurn({ text, context: { node: ctxNode, persp, level: lvl },
        graph: g.graph.value, ontology, perspectives: g.perspectives });
      const response = await decide(built.request);
      const held: Held = { request: built.request, response, contextNode: ctxNode?.id ?? null, persp: g.view.value.persp };
      const reply: ChatMsg = { id: uid('m'), at: new Date().toISOString(), thread: human.thread, author: S1, kind: 'reply',
        held, overrides: {}, srcText: text };
      msgs.value.push(reply);
      apply(msgs.value[msgs.value.length - 1], false);
      return msgs.value[msgs.value.length - 1];
    } finally { busy.value = false; }
  }

  /** (Re)resolve a reply from its held answers and run its act/offer/ask behaviour. */
  function apply(m: ChatMsg, explicit: boolean) {
    if (!m.held) return;
    const r = resolveTurn(m.held, makeEnv(g), m.overrides);
    // the user picked the node themselves: that is a confirmation, whatever the model said
    if (explicit && m.overrides?.node && r.band !== 'act') r.band = 'act';
    m.resolution = r;
    m.pendingPreview = false;
    if (r.intent === 'propose') {
      if (m.changesetId) tl.discard(m.changesetId);
      const ctx = m.held.contextNode ? g.byId(m.held.contextNode) ?? null : null;
      const cs = proposeChangeset(m.srcText ?? '', r, g, ontology, ctx, tl.nextNumber());
      if (cs) { tl.stage(cs, cs.effects.flatMap((e) => (e.node ? [e.node.id] : []))); m.changesetId = cs.id; m.payload = { type: 'changeset', changesetId: cs.id }; }
      else m.payload = { type: 'askback', kind: null, question: 'What kind of item should I add?' };
      return;
    }
    m.payload = payloadFor(m.srcText ?? '', r, g, ontology, m.held);
    if (r.band === 'act' || explicit) act(m, explicit);
  }

  function act(m: ChatMsg, explicit: boolean) {
    const r = m.resolution!;
    if (r.intent !== 'navigate') return;
    const mode = explicit ? 'act' : flags.s1;
    if (mode === 'ask') return;
    if (r.target) {
      const id = r.target.path.at(-1)!;
      if (mode === 'preview') { g.dispatch({ verb: 'preview', id }); m.pendingPreview = true; return; }
      move(m);
    } else if (r.nodeSet?.length) {
      g.dispatch({ verb: 'filter', ids: r.nodeSet }); m.moved = true;
    }
  }
  function move(m: ChatMsg) {
    const r = m.resolution!; if (!r.target) return;
    g.dispatch({ verb: 'trail', persp: r.target.persp, path: r.target.path });
    m.moved = true; m.pendingPreview = false;
    // WP1's trail handler raises the "Moved to …" vue-sonner toast with Undo → undo()
  }
  function confirmPreview() { const m = pendingPreview.value; if (m) move(m); }

  /** GuessStrip repair: re-resolve the levels below `key` from held answers, log the correction. */
  function repair(m: ChatMsg, key: RepairKey, value: string, label?: string) {
    if (!m.held || !m.resolution) return;
    const before = m.resolution.decisions.find((d) => d.key === key);
    const o: Overrides = { ...m.overrides };
    for (const k of ORDER.slice(ORDER.indexOf(key) + 1)) if (k !== 'persp' && key !== 'intent' && key !== 'persp') delete o[k];
    o[key] = value;
    m.overrides = o;
    const space = m.resolution.decisions.find((d) => d.key === 'space')?.value;
    const kind = m.resolution.decisions.find((d) => d.key === 'kind')?.value;
    const question = key === 'kind' ? `kind-${space}` : key === 'node' ? (kind && kind !== 'none' ? `node-${kind}` : 'cand') : key;
    logCorrection({ text: m.srcText ?? '', state: m.held.request.state, question, wrong: before?.value ?? 'none', right: value });
    m.repaired = label ?? value;
    m.moved = false;
    apply(m, true);
  }
  /** Offer chip / ask-back pick: the user's choice is explicit, so it acts. */
  function choose(m: ChatMsg, value: string, label: string) {
    const key = m.payload?.type === 'askback' ? 'node' : offerKey(m.resolution!);
    if (key === 'node' && m.resolution?.intent === 'none') m.overrides = { ...m.overrides, intent: 'navigate' };
    repair(m, key, value, label);
  }

  function openStub(gap: Gap) {
    collapsed.value = false;
    msgs.value.push({ id: uid('m'), at: new Date().toISOString(), thread: threadId.value, author: S1, kind: 'stub', gap });
  }
  function answerStub(m: ChatMsg, answer: string) {
    if (!m.gap || !answer.trim()) return;
    const cs = gapChangeset(m.gap, answer, g, ontology, tl.nextNumber());
    tl.stage(cs, m.gap.parentId ? [m.gap.parentId] : []);
    m.answered = true; m.changesetId = cs.id;
  }
  /** A composer prefill request (node pane "Ask about this"); Composer watches `seq`. */
  const draft = reactive({ seq: 0, used: 0, text: '', mention: null as string | null });
  function askAbout(nodeId: string) {
    const n = g.byId(nodeId); if (!n) return;
    Object.assign(draft, { seq: draft.seq + 1, text: `about ${n.title}: `, mention: nodeId });
  }
  function restore(f: Frozen) { g.dispatch({ verb: 'trail', persp: f.persp, path: f.path }); }
  function setCollapsed(v: boolean) { collapsed.value = v; }

  return { msgs, busy, excluded, inbox, collapsed, selection, level, threadId, thread, pendingPreview, pendingOffer, openStubs,
    send, repair, choose, confirmPreview, move, openStub, answerStub, restore, setCollapsed, draft, askAbout };
});

