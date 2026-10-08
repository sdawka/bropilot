// CHECKS-SPEC §1 / §4: a repair is an Effect list that goes through the commit gate; checks never change
// the graph themselves. Pure: same repair + same graph → same effects (ids derived from content).
import type { Edge, Effect, Graph, Node } from '../types';
import type { Repair } from './types';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const fx = (op: Effect['op'], tail: string, extra: Partial<Effect>): Effect => ({ id: `fx-chk-${op}-${tail}`, op, verdict: 'pending', ...extra });
const newEdge = (src: string, dst: string, type: string): Edge => ({ id: `e-${type}-${src}--${dst}`, src, dst, type, status: 'draft' });

export function repairToEffects(r: Repair, graph: Graph): Effect[] {
  const edge = (id: string) => graph.edges.find((e) => e.id === id);
  const node = (id: string) => graph.nodes.find((n) => n.id === id);
  switch (r.op) {
    case 'remove-edge': {
      const e = edge(r.edgeId);
      return e ? [fx('remove-edge', e.id, { edge: e })] : [];
    }
    case 'retype-edge': {
      const e = edge(r.edgeId);
      if (!e) return [];
      const n = newEdge(e.src, e.dst, r.to);
      return [fx('remove-edge', e.id, { edge: e }), fx('add-edge', n.id, { edge: n })];
    }
    case 'add-edge': {
      const n = newEdge(r.src, r.dst, r.type);
      return graph.edges.some((e) => e.src === r.src && e.dst === r.dst && e.type === r.type) ? [] : [fx('add-edge', n.id, { edge: n })];
    }
    case 'add-node': {
      const id = `${r.node.kind}-${slug(r.node.title)}-draft`;
      const n: Node = { id, kind: r.node.kind, title: r.node.title, status: 'draft', ...(r.node.props ? { props: r.node.props } : {}) };
      const out = [fx('add-node', id, { node: n })];
      if (r.link) {
        const e = r.link.dir === 'out' ? newEdge(id, r.link.other, r.link.type) : newEdge(r.link.other, id, r.link.type);
        out.push(fx('add-edge', e.id, { edge: e }));
      }
      return out;
    }
    case 'update-node': {
      const n = node(r.nodeId);
      if (!n) return [];
      return [fx('update-node', n.id, { node: { ...n, props: { ...(n.props ?? {}), ...r.props } }, before: { props: n.props } })];
    }
    case 'merge-nodes': {
      const keep = node(r.keep), drop = node(r.drop);
      if (!keep || !drop) return [];
      const out: Effect[] = [];
      const has = (src: string, dst: string, type: string) => graph.edges.some((e) => e.src === src && e.dst === dst && e.type === type && e.src !== drop.id && e.dst !== drop.id);
      for (const e of graph.edges.filter((x) => x.src === drop.id || x.dst === drop.id)) {
        out.push(fx('remove-edge', e.id, { edge: e }));
        const src = e.src === drop.id ? keep.id : e.src, dst = e.dst === drop.id ? keep.id : e.dst;
        if (src !== dst && !has(src, dst, e.type)) { const n = newEdge(src, dst, e.type); out.push(fx('add-edge', n.id, { edge: n })); }
      }
      out.push(fx('remove-node', drop.id, { node: drop }));
      return out;
    }
    case 'question':
    case 'mark-reviewed':
      return [];
  }
}
