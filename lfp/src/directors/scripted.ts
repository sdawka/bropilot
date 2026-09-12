// A scripted Director: canned tours built from the live graph, plus a keyword fallback for free talk.
// It proves pointing, sequencing, asking and data edits end to end; a Flue/LLM director replaces it later.
import { state, nodeById, uniqueId, kebab, type Node } from '../store';
import { kindById, edgeTypeById, STATEMENTS } from '../kernel';
import { contextFor } from '../brief';
import type { Cue, Director, UserTurn, View } from '../director';
import type { Effect } from '../store';

const say = (text: string): Cue => ({ t: 'say', text });
const nav = (view: View, params?: { level?: 0 | 1 | 2 | 3; module?: string; question?: string }): Cue => ({ t: 'navigate', view, params });
const point = (nodes: string[], edges: string[] = [], focus?: string): Cue => ({ t: 'point', nodes, edges, focus });
const byKind = (k: string) => state.graph.nodes.filter((n) => n.kind === k);
const edgesOf = (id: string) => state.graph.edges.filter((e) => e.src === id || e.dst === id);
const other = (e: { src: string; dst: string }, id: string) => (e.src === id ? e.dst : e.src);
const title = (id: string) => nodeById(id)?.title ?? id;
const quote = (n?: Node) => {
  const s = n?.source; if (!s || s.kind !== 'said') return '';
  const c = contextFor(s.statements[0]); return c ? ` You said: “${c.hit.trim()}”` : ` (S${s.statements[0]}: “${STATEMENTS[s.statements[0]]}”)`;
};

export class ScriptedDirector implements Director {
  private pendingAsk: { id: string; kind: 'term-title' | 'term-desc' | 'bet-edit'; data?: Record<string, string> } | null = null;

  topics() {
    return [
      { id: 'map', label: 'Walk the Map' },
      { id: 'bet', label: 'Explain a bet' },
      { id: 'unrealised', label: "What's not realised?" },
      { id: 'term', label: 'Add a glossary term' },
    ];
  }

  start(topic: string): Cue[] {
    switch (topic) {
      case 'map': return [this.tourMap()];
      case 'bet': return [this.tourBet()];
      case 'unrealised': return this.unrealised();
      case 'term': this.pendingAsk = { id: `ask-${Date.now()}`, kind: 'term-title' }; return [{ t: 'ask', id: this.pendingAsk.id, text: 'What term should I add to the glossary? Just the word or phrase.' }];
      default: return [say(`I don't know the tour “${topic}”.`)];
    }
  }

  onUser(turn: UserTurn): Cue[] {
    if ('choice' in turn) return this.answer(turn.choice);
    if ('text' in turn) return this.pendingAsk ? this.answer(turn.text) : this.freeTalk(turn.text);
    return [];
  }

  // ── tours ──
  private tourMap(): Cue {
    const bets = byKind('hypothesis'); const tests = byKind('test');
    const results = byKind('test-result'); const missing = results.filter((r) => r.props?.status !== 'pass').length;
    const problems = byKind('problem'); const root = problems.find((p) => edgesOf(p.id).some((e) => e.type === 'has' && e.src === p.id && nodeById(e.dst)?.kind === 'problem')) ?? problems[0];
    const caps = byKind('capability');
    return {
      t: 'sequence', dwellMs: 0, steps: [
        [nav('domain', { level: 0 }), { t: 'clear' }, say('This is the Map. Everything you describe lives on the left, in the representation. Everything that actually runs lives on the right, in reality. The two only touch through tests.')],
        [nav('overview'), point([root.id], [], root.id), say(`It starts with the main problem: ${root.title}.${quote(root)}`)],
        [point(bets.map((b) => b.id), [], bets[0]?.id), say(`Then ${bets.length} bets. A bet links what we build to an outcome we want; some are testable, some are just bets.`)],
        [point(caps.map((c) => c.id), state.graph.edges.filter((e) => e.type === 'satisfies' && caps.some((c) => c.id === e.src)).map((e) => e.id), caps[0]?.id), say(`The solution is ${caps.length} capabilities. The lines show which problems each one satisfies.`)],
        [nav('domain', { level: 0 }), { t: 'clear' }, say(`On the reality side: ${tests.length} tests bridge the two. ${missing} ${missing === 1 ? 'is' : 'are'} not fulfilled, so planned changes are needed. That is the whole loop.`)],
      ],
    };
  }

  private tourBet(): Cue {
    const bets = byKind('hypothesis');
    const bet = (state.selectedId && nodeById(state.selectedId)?.kind === 'hypothesis' ? nodeById(state.selectedId) : undefined) ?? bets.find((b) => b.title.startsWith('H6')) ?? bets[0];
    const es = edgesOf(bet.id);
    const problems = es.filter((e) => nodeById(other(e, bet.id))?.kind === 'problem'); const caps = es.filter((e) => nodeById(other(e, bet.id))?.kind === 'capability');
    const evidence = es.filter((e) => nodeById(other(e, bet.id))?.kind === 'evidence'); const outcomes = es.filter((e) => nodeById(other(e, bet.id))?.kind === 'outcome');
    const steps: Cue[][] = [[nav('overview'), point([bet.id], [], bet.id), say(`${bet.title}.${quote(bet)}`)]];
    if (problems.length) steps.push([point([bet.id, ...problems.map((e) => other(e, bet.id))], problems.map((e) => e.id), bet.id), say(`It exists because of ${problems.map((e) => title(other(e, bet.id))).join(' and ')}.`)]);
    if (caps.length) steps.push([point([bet.id, ...caps.map((e) => other(e, bet.id))], caps.map((e) => e.id), bet.id), say(`${caps.map((e) => title(other(e, bet.id))).join(' and ')} ${caps.length === 1 ? 'is' : 'are'} how we act on it.`)]);
    if (outcomes.length) steps.push([point([bet.id, ...outcomes.map((e) => other(e, bet.id))], outcomes.map((e) => e.id), bet.id), say(`If it holds, the outcome is: ${outcomes.map((e) => title(other(e, bet.id))).join('; ')}.`)]);
    steps.push(evidence.length
      ? [point([bet.id, ...evidence.map((e) => other(e, bet.id))], evidence.map((e) => e.id), bet.id), say(`Evidence so far: ${evidence.map((e) => title(other(e, bet.id))).join('; ')}. Verdict: ${bet.props?.verdict ?? 'open'}.`)]
      : [say(`No evidence yet. Verdict: ${bet.props?.verdict ?? 'open'}. Want me to change its wording? Say “edit bet: …”.`)]);
    return { t: 'sequence', dwellMs: 0, steps };
  }

  private unrealised(): Cue[] {
    const protocols = byKind('protocol'); const realised = new Set(state.graph.edges.filter((e) => e.type === 'realises').map((e) => e.dst));
    const missing = protocols.filter((p) => !realised.has(p.id));
    if (!missing.length) return [nav('domain', { level: 3, module: 'module-automation' }), say('Every protocol is realised by a practice. Nothing to plan.')];
    const taken = new Set(state.graph.nodes.map((n) => n.id));
    const epicId = uniqueId('epic-realise-protocols', taken);
    const aid = 'director';
    const effects: Effect[] = [
      { id: 'ef-0', op: 'add-node', node: { id: epicId, kind: 'epic', title: `Realise ${missing.length} unrealised protocol${missing.length === 1 ? '' : 's'}`, description: 'Proposed by the director from the Automation module.', status: 'draft', source: { kind: 'inferred', reason: 'Derived from protocols without a realising practice.' } }, answerId: aid },
    ];
    missing.forEach((p, i) => {
      const tid = uniqueId(`task-${kebab(p.title).slice(0, 30)}`, taken);
      effects.push({ id: `ef-${i * 2 + 1}`, op: 'add-node', node: { id: tid, kind: 'task', title: `Put “${p.title}” into practice`, props: { status: 'queued' }, status: 'draft', source: { kind: 'inferred', reason: 'One task per unrealised protocol.' } }, answerId: aid });
      effects.push({ id: `ef-${i * 2 + 2}`, op: 'add-edge', edge: { id: `e-${epicId}-${tid}`, src: epicId, dst: tid, type: 'contains', status: 'draft' }, answerId: aid });
    });
    return [
      nav('domain', { level: 3, module: 'module-automation' }),
      point(missing.map((m) => m.id), [], missing[0].id),
      { t: 'stage', effects, note: `Epic + ${missing.length} tasks to realise: ${missing.map((m) => m.title).join('; ')}` },
      say(`${missing.length} protocol${missing.length === 1 ? ' is' : 's are'} not realised by any practice: ${missing.map((m) => m.title).join('; ')}. I staged an epic with one task each. Approve to commit, or discard.`),
    ];
  }

  // ── asks ──
  private answer(text: string): Cue[] {
    const a = this.pendingAsk; if (!a) return this.freeTalk(text);
    if (a.kind === 'term-title') {
      this.pendingAsk = { id: `ask-${Date.now()}`, kind: 'term-desc', data: { title: text.trim() } };
      return [{ t: 'ask', id: this.pendingAsk.id, text: `And how would you define “${text.trim()}” in one sentence?` }];
    }
    if (a.kind === 'term-desc') {
      const t = a.data!.title; this.pendingAsk = null;
      const existing = byKind('term').find((n) => n.title.toLowerCase() === t.toLowerCase());
      return [{ t: 'glossary', op: 'upsert', title: t, description: text.trim(), id: existing?.id }, nav('overview'), say(`Added “${t}” to the glossary. It committed straight away; you can undo it from Definition.`)];
    }
    if (a.kind === 'bet-edit') {
      const bet = nodeById(a.data!.id); this.pendingAsk = null; if (!bet) return [say('That bet is gone.')];
      return [
        { t: 'stage', effects: [{ id: 'ef-0', op: 'update-node', nodeId: bet.id, patch: { title: text.trim() }, answerId: 'director' }], note: `Reword bet: ${bet.title}` },
        point([bet.id], [], bet.id),
        say(`Staged the new wording for that bet. Approve to commit, or discard.`),
      ];
    }
    return [];
  }

  // ── free talk: keyword lookup ──
  private freeTalk(text: string): Cue[] {
    const q = text.trim(); const lower = q.toLowerCase();
    const m = lower.match(/^edit bet[:\s]+(.+)$/);
    if (m) {
      const bet = byKind('hypothesis').find((b) => b.title.toLowerCase().includes(m[1].toLowerCase())) ?? (state.selectedId ? nodeById(state.selectedId) : undefined);
      if (bet && bet.kind === 'hypothesis') { this.pendingAsk = { id: `ask-${Date.now()}`, kind: 'bet-edit', data: { id: bet.id } }; return [point([bet.id], [], bet.id), { t: 'ask', id: this.pendingAsk.id, text: `New wording for “${bet.title}”?` }]; }
      return [say('Which bet? Select it on the main screen or name it.')];
    }
    if (/^(next|back|stop)$/.test(lower)) return [];
    const hits = state.graph.nodes.filter((n) => n.title.toLowerCase().includes(lower) || lower.includes(n.title.toLowerCase())).sort((a, b) => b.title.length - a.title.length);
    const hit = hits[0];
    if (hit) {
      const es = edgesOf(hit.id).slice(0, 6); const kind = kindById[hit.kind];
      const view = kind?.level ? 'domain' : kind?.space === 'basics' || ['problem', 'hypothesis', 'solution'].includes(kind?.space ?? '') ? 'overview' : 'domain';
      const rel = es.map((e) => `${e.src === hit.id ? '' : title(e.src) + ' '}${edgeTypeById[e.type]?.label ?? e.type}${e.src === hit.id ? ' ' + title(e.dst) : ''}`).join('; ');
      return [
        view === 'domain' ? nav('domain', { level: kind?.level ?? 0 }) : nav('overview'),
        point([hit.id, ...es.map((e) => other(e, hit.id))], es.map((e) => e.id), hit.id),
        say(`${kind?.label ?? hit.kind}: ${hit.title}.${hit.description ? ' ' + hit.description : ''}${quote(hit)}${rel ? ` Related: ${rel}.` : ''}`),
      ];
    }
    return [say(`I couldn't find “${q}” in the graph. Try a node's name, “edit bet: …”, or pick a tour.`)];
  }
}
