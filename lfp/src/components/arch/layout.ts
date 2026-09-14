// Pure layout functions for the Vue Flow architecture diagrams (Domain level 1 Deployment, level 3 Cell).
// No store/global-state imports: callers pass the graph slice in, get plain Vue Flow node/edge shapes back.
import type { Graph, Node as GNode } from '../../store';

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentNode?: string;
  extent?: 'parent';
  style?: Record<string, string>;
  draggable?: boolean;
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: Record<string, unknown>;
  label?: string;
}

const byId = (g: Graph) => Object.fromEntries(g.nodes.map((n) => [n.id, n])) as Record<string, GNode>;
const outEdges = (g: Graph, type: string, src: string) => g.edges.filter((e) => e.type === type && e.src === src);
const inEdges = (g: Graph, type: string, dst: string) => g.edges.filter((e) => e.type === type && e.dst === dst);

/** rules a given rule governs (rule → thing "governs" edges), moved here from Domain.vue so Cell.vue can share it. */
export const governsOf = (g: Graph, ruleId: string) => outEdges(g, 'governs', ruleId).map((e) => e.dst);
/** who emits a given event ("emits" edges into it). */
export const emitterOf = (g: Graph, eventId: string) => inEdges(g, 'emits', eventId).map((e) => e.src);

// ── Deployment (level 1) ─────────────────────────────────────────────────────
const COL_X: Record<string, number> = { audience: 0, client: 320, mid: 640, store: 960, external: 1280 };

export function deploymentLayout(g: Graph) {
  const nodes = g.nodes;
  const edges = g.edges;
  const flowNodes: FlowNode[] = [];
  const flowEdges: FlowEdge[] = [];
  const yAt: Record<string, number> = {};
  const nextY = (col: string) => { const y = yAt[col] ?? 20; yAt[col] = y + 150; return y; };

  const hostsOf = (infraId: string) =>
    edges.filter((e) => e.type === 'hosts' && e.src === infraId).map((e) => byId(g)[e.dst]?.title ?? e.dst);

  for (const a of nodes.filter((n) => n.kind === 'audience')) {
    flowNodes.push({ id: a.id, type: 'card', position: { x: COL_X.audience, y: nextY('audience') }, data: { label: a.title, kind: 'audience', role: 'audience' } });
  }
  for (const inf of nodes.filter((n) => n.kind === 'infra')) {
    const role = (inf.props?.role ?? 'server') as string;
    const col = role === 'client' ? 'client' : role === 'store' ? 'store' : 'mid';
    flowNodes.push({
      id: inf.id, type: 'card', position: { x: COL_X[col], y: nextY(col) },
      data: { label: inf.title, kind: 'infra', role, hosted: hostsOf(inf.id) },
    });
  }
  for (const ext of nodes.filter((n) => n.kind === 'external')) {
    flowNodes.push({ id: ext.id, type: 'card', position: { x: COL_X.external, y: nextY('external') }, data: { label: ext.title, kind: 'external', role: 'external' } });
  }

  const placed = new Set(flowNodes.map((n) => n.id));
  for (const e of edges.filter((e) => e.type === 'uses')) {
    if (!placed.has(e.src) || !placed.has(e.dst)) continue;
    flowEdges.push({ id: e.id, source: e.src, target: e.dst });
  }
  return { nodes: flowNodes, edges: flowEdges };
}

// ── Cell (level 3) ────────────────────────────────────────────────────────────
export function storeInfraFor(g: Graph, moduleId: string) {
  const hosts = g.edges.filter((e) => e.type === 'hosts' && e.dst === moduleId).map((e) => e.src);
  const stores = new Set<string>();
  for (const h of hosts) {
    for (const e of g.edges.filter((e) => e.type === 'uses' && e.src === h)) {
      const n = byId(g)[e.dst];
      if (n?.kind === 'infra' && n.props?.role === 'store') stores.add(n.id);
    }
  }
  return [...stores].map((id) => byId(g)[id]);
}

export interface Circuit { ifaceId: string; ruleIds: string[]; thingIds: string[]; eventIds: string[] }

export function circuitsFor(g: Graph, interfaces: GNode[], rules: GNode[], things: GNode[], events: GNode[]) {
  const ruleIds = new Set(rules.map((r) => r.id));
  const thingIds = new Set(things.map((t) => t.id));
  const eventIds = new Set(events.map((e) => e.id));
  const circuits: Circuit[] = [];
  for (const iface of interfaces) {
    const carried = g.edges.filter((e) => e.type === 'carries' && e.src === iface.id).map((e) => e.dst);
    const emitted = g.edges.filter((e) => e.type === 'emits' && e.src === iface.id).map((e) => e.dst).filter((id) => eventIds.has(id));
    const governing = g.edges
      .filter((e) => e.type === 'governs' && carried.includes(e.dst) && ruleIds.has(e.src))
      .map((e) => e.src);
    const touchedThings = carried.filter((id) => thingIds.has(id));
    if (!governing.length && !touchedThings.length && !emitted.length) continue;
    circuits.push({ ifaceId: iface.id, ruleIds: [...new Set(governing)], thingIds: [...new Set(touchedThings)], eventIds: emitted });
  }
  return circuits;
}

export function cellLayout(g: Graph, moduleId: string) {
  const idx = byId(g);
  const mod = idx[moduleId];
  const contains = (kind: string) => g.edges.filter((e) => e.type === 'contains' && e.src === moduleId && idx[e.dst]?.kind === kind).map((e) => idx[e.dst]);
  const interfaces = g.edges.filter((e) => e.type === 'exposes' && e.src === moduleId && idx[e.dst]?.kind === 'interface').map((e) => idx[e.dst]);
  const rules = contains('rule');
  let things = contains('thing');
  const events = [...new Set([...contains('event'), ...interfaces.flatMap((i) => g.edges.filter((e) => e.type === 'emits' && e.src === i.id).map((e) => idx[e.dst]))])].filter(Boolean);
  // pull in any thing carried by this module's interfaces even if it belongs to another module (S134-136 circuits still need it drawn)
  const carriedIds = new Set(interfaces.flatMap((i) => g.edges.filter((e) => e.type === 'carries' && e.src === i.id).map((e) => e.dst)));
  for (const id of carriedIds) if (!things.find((t) => t.id === id) && idx[id]) things = [...things, idx[id]];

  const stores = storeInfraFor(g, moduleId);
  const circuits = circuitsFor(g, interfaces, rules, things, events);

  const membraneId = `membrane-${moduleId}`;
  const ruleRows = Math.ceil(rules.length / 3) || 1;
  const thingRows = Math.ceil(things.length / 4) || 1;
  const RULES_TOP = 110;
  const RULES_H = ruleRows * 80;
  const THINGS_TOP = RULES_TOP + RULES_H + 60;
  const THINGS_H = thingRows * 70;
  const W = Math.max(1200, 260 * Math.max(3, events.length + 1));
  const H = THINGS_TOP + THINGS_H + 80;
  const nodes: FlowNode[] = [
    { id: membraneId, type: 'membrane', position: { x: 0, y: 0 }, data: { label: mod?.title ?? moduleId, moduleId }, style: { width: `${W}px`, height: `${H}px` }, draggable: false },
  ];

  // interface ports: only-in / only-out → handle on the membrane itself (rendered by Cell.vue's membrane template).
  // both in+out → a distinct child "iface" node on the left, plus an out-port handle on the membrane's right edge.
  const bothIfaces = interfaces.filter((i) => i.props?.in && i.props?.out);
  const inOnly = interfaces.filter((i) => i.props?.in && !i.props?.out);
  const outOnly = interfaces.filter((i) => !i.props?.in && i.props?.out);
  bothIfaces.forEach((i, n) => {
    nodes.push({ id: `iface-${i.id}`, type: 'iface', parentNode: membraneId, extent: 'parent', position: { x: 20, y: RULES_TOP + n * 80 }, data: { label: i.title, ifaceId: i.id, side: 'in' } });
  });
  const ifaceColStart = bothIfaces.length ? 220 : 60;

  if (stores.length) {
    nodes.push({ id: `store-${moduleId}`, type: 'store', parentNode: membraneId, extent: 'parent', position: { x: 40, y: THINGS_TOP - 20 }, style: { width: `${W - 120}px`, height: `${THINGS_H + 40}px` }, data: { label: stores.map((s) => s.title).join(', ') }, draggable: false });
  }

  rules.forEach((r, n) => {
    nodes.push({ id: r.id, type: 'rule', parentNode: membraneId, extent: 'parent', position: { x: ifaceColStart + (n % 3) * 280, y: RULES_TOP + Math.floor(n / 3) * 80 }, data: { label: r.title, nodeId: r.id } });
  });
  things.forEach((t, n) => {
    nodes.push({ id: t.id, type: 'thing', parentNode: membraneId, extent: 'parent', position: { x: 60 + (n % 4) * 220, y: THINGS_TOP + Math.floor(n / 4) * 70 }, data: { label: t.title, nodeId: t.id } });
  });
  events.forEach((e, n) => {
    nodes.push({ id: e.id, type: 'event', parentNode: membraneId, extent: 'parent', position: { x: W - 190, y: RULES_TOP + n * 80 }, data: { label: e.title, nodeId: e.id } });
  });

  const edges: FlowEdge[] = [];
  let ci = 0;
  for (const c of circuits) {
    const cls = `circuit-${ci % 8}`;
    const iface = idx[c.ifaceId];
    const hasBoth = iface?.props?.in && iface?.props?.out;
    const inSource = hasBoth ? `iface-${c.ifaceId}` : membraneId;
    const inHandle = `in-${c.ifaceId}`;
    const outTarget = membraneId;
    const outHandle = `out-${c.ifaceId}`;
    const chainStarts: string[] = c.ruleIds.length ? c.ruleIds : c.thingIds;
    for (const rid of c.ruleIds) {
      edges.push({ id: `circuit-${c.ifaceId}-port-${rid}`, source: inSource, sourceHandle: inHandle, target: rid, data: { circuit: c.ifaceId, class: cls } });
      for (const tid of c.thingIds.filter((tid) => governsOfIds(g, rid).includes(tid))) {
        edges.push({ id: `circuit-${c.ifaceId}-${rid}-${tid}`, source: rid, target: tid, data: { circuit: c.ifaceId, class: cls } });
      }
    }
    if (!c.ruleIds.length) {
      for (const tid of c.thingIds) edges.push({ id: `circuit-${c.ifaceId}-port-${tid}`, source: inSource, sourceHandle: inHandle, target: tid, data: { circuit: c.ifaceId, class: cls } });
    }
    const tail = c.thingIds.length ? c.thingIds : chainStarts;
    if (c.eventIds.length) {
      for (const eid of c.eventIds) {
        for (const tid of tail) edges.push({ id: `circuit-${c.ifaceId}-${tid}-${eid}`, source: tid, target: eid, data: { circuit: c.ifaceId, class: cls } });
        edges.push({ id: `circuit-${c.ifaceId}-${eid}-port`, source: eid, target: outTarget, targetHandle: outHandle, data: { circuit: c.ifaceId, class: cls } });
      }
    } else if (tail.length) {
      for (const tid of tail) edges.push({ id: `circuit-${c.ifaceId}-${tid}-port`, source: tid, target: outTarget, targetHandle: outHandle, data: { circuit: c.ifaceId, class: cls } });
    }
    ci++;
  }

  return { nodes, edges, interfaces, rules, things, events, stores, circuits, inOnly, outOnly, bothIfaces, membraneId, size: { W, H } };
}

function governsOfIds(g: Graph, ruleId: string) { return governsOf(g, ruleId); }
