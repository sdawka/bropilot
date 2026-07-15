import { EDGE_TYPE_LABELS, PARTS, kindsForPart, type Part, type GraphNode } from './schema';
import { state } from './store';

// Generated prose for a part: one sentence per node, composed from its
// description and outgoing edges. Segments carry nodeId so mentions render
// as interactive, hue-coloured links and sentences know their relevance.

export interface Segment {
  text: string;
  nodeId?: string;
}

export interface Sentence {
  id: string; // subject node id
  nodeIds: string[]; // subject + every node mentioned
  segments: Segment[];
}

export interface NarrativeGroup {
  part: Part;
  label: string;
  sentences: Sentence[];
}

export function narrativeFor(parts: Part[]): NarrativeGroup[] {
  return parts.map((part) => {
    const def = PARTS.find((p) => p.id === part)!;
    const sentences: Sentence[] = [];
    for (const k of kindsForPart(part)) {
      for (const n of state.graph.nodes.filter((nn) => nn.kind === k.kind)) {
        sentences.push(sentenceFor(n));
      }
    }
    return { part, label: def.label, sentences };
  });
}

function sentenceFor(n: GraphNode): Sentence {
  const segments: Segment[] = [{ text: n.title || 'Untitled', nodeId: n.id }];
  const nodeIds = [n.id];

  const desc = (n.description ?? '').trim().replace(/\.+$/, '');
  if (desc) segments.push({ text: ` — ${desc}` });

  // group outgoing edges by type: "It has X and Y, uses Z, and triggers W."
  const byType: [string, GraphNode[]][] = [];
  for (const e of state.graph.edges) {
    if (e.srcId !== n.id) continue;
    const target = state.graph.nodes.find((x) => x.id === e.dstId);
    if (!target) continue;
    nodeIds.push(target.id);
    const entry = byType.find(([t]) => t === e.type);
    if (entry) entry[1].push(target);
    else byType.push([e.type, [target]]);
  }

  if (byType.length) {
    segments.push({ text: '. It ' });
    byType.forEach(([type, targets], ti) => {
      if (ti > 0) segments.push({ text: ti === byType.length - 1 ? ' and ' : ', ' });
      segments.push({ text: `${EDGE_TYPE_LABELS[type] ?? type} ` });
      targets.forEach((t, i) => {
        if (i > 0) segments.push({ text: i === targets.length - 1 ? ' and ' : ', ' });
        segments.push({ text: t.title || 'Untitled', nodeId: t.id });
      });
    });
  }

  segments.push({ text: '.' });
  return { id: n.id, nodeIds, segments };
}
