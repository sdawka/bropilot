// One tool per Cue (src/director.ts's `Cue` union) plus `read_graph`. Each Cue tool's `run`
// publishes { kind:'cue', cue, msgId, from:'agent' } over the bus and awaits the main screen's
// matching `ack` (see busRef.publishCue in agent/server.mjs); read_graph inspects the last
// cached `snapshot` instead of round-tripping.
import { defineTool } from '@flue/runtime';
import * as v from 'valibot';
import { busRef, type Context } from './bus-ref.ts';

/** Compact context for the model: screen item titles, next question, staged effects, pointing. */
function compactCtx(ctx: Context | null | undefined) {
  if (!ctx) return { note: 'no context yet' };
  const c = ctx as Record<string, any>;
  const items = Array.isArray(c.screen?.items) ? c.screen.items.slice(0, 20).map((i: any) => `${i.kind}:${i.title}`) : [];
  return {
    view: c.view,
    params: c.params,
    screen: items,
    next: c.next ?? null,
    staged: c.staged ?? null,
    pointing: c.pointing ?? [],
    gaps: c.gaps ?? [],
    ask: c.ask ?? null,
    say: c.say ?? null,
  };
}

function cueTool<TInput extends v.GenericSchema | undefined>(
  name: string,
  description: string,
  input: TInput,
  build: (data: TInput extends v.GenericSchema ? v.InferOutput<TInput> : Record<string, never>) => unknown,
) {
  return defineTool({
    name,
    description,
    ...(input ? { input } : {}),
    async run({ data }: any) {
      const cue = build(data ?? {});
      const result = await busRef.publishCue(cue);
      if (!result) return { output: 'no main screen: nothing is listening on the bus right now' };
      return { output: compactCtx(result.ctx) };
    },
  });
}

const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const say = cueTool(
  'say',
  'Say exactly one thing to the user. Replaces the previous utterance. Use this or `ask`, never both in one turn.',
  v.object({ text: v.string(), id: v.optional(v.string()) }),
  (d) => ({ t: 'say', text: d.text, id: d.id }),
);

const navigate = cueTool(
  'navigate',
  'Change the main screen tab, and optionally a Domain level/module or a Definition question.',
  v.object({
    view: v.picklist(['overview', 'definition', 'domain', 'flows', 'kernel']),
    params: v.optional(
      v.object({
        level: v.optional(v.picklist([0, 1, 2, 3])),
        module: v.optional(v.string()),
        question: v.optional(v.string()),
      }),
    ),
  }),
  (d) => ({ t: 'navigate', view: d.view, params: d.params }),
);

const point = cueTool(
  'point',
  'Highlight nodes and/or edges on the main screen. `focus` scrolls to and selects one card. Point at things before talking about them.',
  v.object({ nodes: v.optional(v.array(v.string())), edges: v.optional(v.array(v.string())), focus: v.optional(v.string()) }),
  (d) => ({ t: 'point', nodes: d.nodes, edges: d.edges, focus: d.focus }),
);

const clear = cueTool('clear', 'Remove highlights and selection.', undefined, () => ({ t: 'clear' }));

const sequence = cueTool(
  'sequence',
  'Show several groups of cues in order, one per step, while talking. The user steps through with Next/Back.',
  v.object({ steps: v.array(v.array(v.any())), dwellMs: v.optional(v.number()) }),
  (d) => ({ t: 'sequence', steps: d.steps, dwellMs: d.dwellMs }),
);

const stage = cueTool(
  'stage',
  "Propose data changes (add/update/remove nodes, add edges). They land in the changeset for the user to approve via `commit`; nothing commits without approval. Quote the user's own words in staged titles.",
  v.object({ effects: v.array(v.any()), note: v.string() }),
  (d) => ({ t: 'stage', effects: d.effects, note: d.note }),
);

const glossary = cueTool(
  'glossary',
  'Add, edit, or remove a glossary term. Commits immediately (escape hatch, not subject to `stage`/`commit`); undoable.',
  v.object({ op: v.picklist(['upsert', 'remove']), title: v.string(), description: v.optional(v.string()), id: v.optional(v.string()) }),
  (d) => ({ t: 'glossary', op: d.op, title: d.title, description: d.description, id: d.id }),
);

const ask = cueTool(
  'ask',
  'Ask the user one question, optionally with options. Use this or `say`, never both in one turn.',
  v.object({ text: v.string(), options: v.optional(v.array(v.string())), id: v.optional(v.string()) }),
  (d) => ({ t: 'ask', text: d.text, options: d.options, id: d.id ?? genId('a') }),
);

const answer = cueTool(
  'answer',
  "Answer a root question (context.next.questionId) or one of its follow-ups with the user's content. Stages the resulting effects; say what was staged.",
  v.object({ questionId: v.string(), content: v.string() }),
  (d) => ({ t: 'answer', questionId: d.questionId, content: d.content }),
);

const followup = cueTool(
  'followup',
  'Add a project-specific sub-question or thread under a root question or another follow-up.',
  v.object({
    parentId: v.string(),
    prompt: v.string(),
    kind: v.picklist(['sub', 'thread']),
    produces: v.optional(v.string()),
  }),
  (d) => ({ t: 'followup', parentId: d.parentId, prompt: d.prompt, kind: d.kind, produces: d.produces }),
);

const commit = cueTool(
  'commit',
  'Approve staged effects (all of them, or a subset by id) so they land in the graph.',
  v.object({ accept: v.optional(v.array(v.string())) }),
  (d) => ({ t: 'commit', accept: d.accept }),
);

const discard = cueTool('discard', 'Discard the currently staged changeset. Nothing changes.', undefined, () => ({ t: 'discard' }));

const undo = cueTool('undo', 'Undo the last commit.', undefined, () => ({ t: 'undo' }));

const readGraph = defineTool({
  name: 'read_graph',
  description:
    'Look up nodes (and their edges) in the current graph snapshot by id, kind, or a title substring. Use this before claiming anything not already visible in context.screen.',
  input: v.object({ id: v.optional(v.string()), kind: v.optional(v.string()), title: v.optional(v.string()) }),
  async run({ data }) {
    const snap = busRef.getSnapshot();
    if (!snap) return { output: 'no snapshot yet: the main screen has not published one' };
    const needle = data.title?.toLowerCase();
    const nodes = snap.graph.nodes
      .filter((n) => (!data.id || n.id === data.id) && (!data.kind || n.kind === data.kind) && (!needle || n.title.toLowerCase().includes(needle)))
      .slice(0, 30);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = snap.graph.edges.filter((e) => ids.has(e.src) || ids.has(e.dst)).slice(0, 60);
    return { output: { nodes: nodes.map((n) => ({ id: n.id, kind: n.kind, title: n.title })), edges } };
  },
});

/** Built once at module load; every Cue tool closes over `busRef`, which server.mjs wires up later. */
export const cueTools = [say, navigate, point, clear, sequence, stage, glossary, ask, answer, followup, commit, discard, undo, readGraph];
