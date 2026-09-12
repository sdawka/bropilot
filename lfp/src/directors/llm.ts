// LLM / Flue Director — adapter stub. The Director protocol (src/director.ts) IS the tool surface.
// Not wired to any provider: Flue (or any model runtime) plugs in at `send()`.
import { state } from '../store';
import { KINDS, EDGE_TYPES, INVARIANTS } from '../kernel';
import type { Cue, Context, Director, UserTurn } from '../director';

/** The Cue union as tool definitions, so an agent runtime can call them. */
export const DIRECTOR_TOOLS = [
  { name: 'say', description: 'Say exactly one thing to the user. Replaces the previous utterance on the mirror.', input: { text: 'string' } },
  { name: 'navigate', description: 'Change the main screen tab; optionally a Domain level/module or a Definition question.', input: { view: 'overview|definition|domain|flows|kernel', params: '{ level?: 0|1|2|3, module?: nodeId, question?: questionId }' } },
  { name: 'point', description: 'Highlight nodes and/or edges on the main screen; focus scrolls to and selects one card.', input: { nodes: 'nodeId[]', edges: 'edgeId[]', focus: 'nodeId?' } },
  { name: 'clear', description: 'Remove highlights and selection.', input: {} },
  { name: 'sequence', description: 'Show several things in order while talking: groups of cues the user steps through with Next/Back.', input: { steps: 'Cue[][]', dwellMs: 'number?' } },
  { name: 'stage', description: 'Propose data changes (add/update/remove nodes, add edges). They land in the changeset for the user to approve; nothing commits without approval.', input: { effects: 'Effect[]', note: 'string' } },
  { name: 'glossary', description: 'Add, edit or remove a glossary term. Commits immediately (escape hatch); undoable.', input: { op: 'upsert|remove', title: 'string', description: 'string?', id: 'nodeId?' } },
  { name: 'ask', description: 'Ask the user one question, optionally with options. The mirror shows it as the one thing on screen.', input: { text: 'string', options: 'string[]?', id: 'string' } },
] as const;

export function systemPrompt(ctx: Context): string {
  const kinds = KINDS.map((k) => `${k.id} (${k.space}${k.level ? `, L${k.level}` : ''}): ${k.blurb}`).join('\n');
  const edges = EDGE_TYPES.map((e) => `${e.id}: ${e.hint}`).join('\n');
  const invariants = INVARIANTS.map((i) => `- ${i.text}`).join('\n');
  const digest = state.graph.nodes.map((n) => `${n.id} [${n.kind}] ${n.title}`).join('\n');
  return `You are Bropilot's director. You talk to the user about what is on their main screen, one thing at a time, and you can point at it, walk through it, and propose changes.
Rules: say at most one thing per turn (use sequence for several). Every data change except glossary goes through 'stage' for approval. Quote the user's own words when explaining why something exists (nodes carry 'source' statements).
Kinds:\n${kinds}\nEdge types:\n${edges}\nInvariants:\n${invariants}\nOn screen now: view=${ctx.view} selected=${ctx.selectedId ?? 'none'} staged=${ctx.staged?.count ?? 0}\nGraph:\n${digest}`;
}

export class LLMDirector implements Director {
  private ctx: Context | null = null;
  topics() { return [{ id: 'chat', label: 'Talk to the agent' }]; }
  onContext(ctx: Context) { this.ctx = ctx; }
  start(): Cue[] { return [{ t: 'say', text: 'No model runtime is configured. This is where Flue plugs in: it receives systemPrompt(ctx) and DIRECTOR_TOOLS and returns cues.' }]; }
  onUser(_turn: UserTurn): Cue[] { return this.start(); }
  /** Flue / provider hook: given the conversation, return cues. Throws until an adapter is configured. */
  async send(_messages: { role: 'user' | 'assistant'; content: string }[]): Promise<Cue[]> {
    void this.ctx; throw new Error('LLMDirector: no adapter configured (Flue plugs in here).');
  }
}
