// Pure layout functions for the Vue Flow architecture diagrams (Domain level 1 Deployment, level 3 Cell).
// No store/global-state imports: callers pass the graph slice in, get plain Vue Flow node/edge shapes back.
// All nodes get explicit width/height (both as a top-level field, for Vue Flow's own sizing, and mirrored
// into `style`) so rows/columns computed from those sizes never overlap regardless of content length.
import type { Graph, Node as GNode } from '../../store';

export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  parentNode?: string;
  extent?: 'parent';
  style?: Record<string, string>;
  width?: number;
  height?: number;
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

function sized(n: FlowNode, w: number, h: number): FlowNode {
  return { ...n, width: w, height: h, style: { ...n.style, width: `${w}px`, height: `${h}px` } };
}

// ── Deployment (level 1) ─────────────────────────────────────────────────────
const CARD_W = 200;
const CARD_H = 56;
const CHIP_ROW_H = 22;
const GAP_X = 48; // ≥ 40px between columns
const GAP_Y = 24;
const COLS = ['audience', 'client', 'mid', 'store', 'external'] as const;
const COL_X: Record<string, number> = Object.fromEntries(COLS.map((c, i) => [c, i * (CARD_W + GAP_X)]));

export function deploymentLayout(g: Graph) {
  const nodes = g.nodes;
  const edges = g.edges;
  const flowNodes: FlowNode[] = [];
  const flowEdges: FlowEdge[] = [];
  const yAt: Record<string, number> = {};
  const placeAt = (col: string, h: number) => { const y = yAt[col] ?? 8; yAt[col] = y + h + GAP_Y; return y; };

  const hostsOf = (infraId: string) =>
    edges.filter((e) => e.type === 'hosts' && e.src === infraId).map((e) => byId(g)[e.dst]?.title ?? e.dst);

  for (const a of nodes.filter((n) => n.kind === 'audience')) {
    flowNodes.push(sized({ id: a.id, type: 'card', position: { x: COL_X.audience, y: placeAt('audience', CARD_H) }, data: { label: a.title, kind: 'audience', role: 'audience' } }, CARD_W, CARD_H));
  }
  for (const inf of nodes.filter((n) => n.kind === 'infra')) {
    const role = (inf.props?.role ?? 'server') as string;
    const col = role === 'client' ? 'client' : role === 'store' ? 'store' : 'mid';
    const hosted = hostsOf(inf.id);
    const h = CARD_H + (hosted.length ? Math.ceil(hosted.length / 2) * CHIP_ROW_H + 8 : 0);
    flowNodes.push(sized({ id: inf.id, type: 'card', position: { x: COL_X[col], y: placeAt(col, h) }, data: { label: inf.title, kind: 'infra', role, hosted } }, CARD_W, h));
  }
  for (const ext of nodes.filter((n) => n.kind === 'external')) {
    flowNodes.push(sized({ id: ext.id, type: 'card', position: { x: COL_X.external, y: placeAt('external', CARD_H) }, data: { label: ext.title, kind: 'external', role: 'external' } }, CARD_W, CARD_H));
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

// grid-pack `count` fixed-size cells starting at (originX, originY), wrapping after `cols` columns.
function gridCells(count: number, cols: number, cellW: number, cellH: number, gap: number, originX: number, originY: number) {
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({ x: originX + col * (cellW + gap), y: originY + row * (cellH + gap) });
  }
  const rows = Math.ceil(count / cols) || 1;
  return { positions, width: cols * cellW + (cols - 1) * gap, height: rows * cellH + (rows - 1) * gap, rows };
}

const RULE_W = 180, RULE_H = 44;
const THING_W = 170, THING_H = 40;
const EVENT_W = 150, EVENT_H = 36;
const IFACE_W = 160, IFACE_H = 40;
const CELL_GAP = 16;
const RULE_COLS = 3;
const THING_COLS = 4;

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

  // interface ports: only-in / only-out → handle on the membrane itself (rendered by Cell.vue's membrane template).
  // both in+out → a distinct child "iface" node on the left, plus an out-port handle on the membrane's right edge.
  const bothIfaces = interfaces.filter((i) => i.props?.in && i.props?.out);
  const inOnly = interfaces.filter((i) => i.props?.in && !i.props?.out);
  const outOnly = interfaces.filter((i) => !i.props?.in && i.props?.out);

  const MARGIN = 40;
  const ifaceColW = bothIfaces.length ? IFACE_W + CELL_GAP * 2 : MARGIN;
  const eventColW = events.length ? EVENT_W + CELL_GAP * 2 : MARGIN;

  const rulesTop = MARGIN + 30; // room for the membrane title
  const rulesGrid = gridCells(rules.length, RULE_COLS, RULE_W, RULE_H, CELL_GAP, ifaceColW, rulesTop);
  const thingsTop = rulesTop + rulesGrid.height + CELL_GAP * 2;
  const thingsGrid = gridCells(things.length, THING_COLS, THING_W, THING_H, CELL_GAP, ifaceColW, thingsTop);

  const bandWidth = Math.max(rulesGrid.width, thingsGrid.width, 1);
  const W = ifaceColW + bandWidth + eventColW;
  const H = thingsTop + thingsGrid.height + MARGIN;

  const nodes: FlowNode[] = [
    sized({ id: membraneId, type: 'membrane', position: { x: 0, y: 0 }, data: { label: mod?.title ?? moduleId, moduleId }, draggable: false }, W, H),
  ];

  bothIfaces.forEach((i, n) => {
    nodes.push(sized({ id: `iface-${i.id}`, type: 'iface', parentNode: membraneId, extent: 'parent', position: { x: MARGIN - 20, y: rulesTop + n * (IFACE_H + CELL_GAP) }, data: { label: i.title, ifaceId: i.id, side: 'in' } }, IFACE_W, IFACE_H));
  });

  if (stores.length) {
    nodes.push(sized({ id: `store-${moduleId}`, type: 'store', parentNode: membraneId, extent: 'parent', position: { x: ifaceColW - CELL_GAP, y: thingsTop - CELL_GAP }, data: { label: stores.map((s) => s.title).join(', ') }, draggable: false }, bandWidth + CELL_GAP * 2, thingsGrid.height + CELL_GAP * 2));
  }

  rules.forEach((r, n) => {
    nodes.push(sized({ id: r.id, type: 'rule', parentNode: membraneId, extent: 'parent', position: rulesGrid.positions[n], data: { label: r.title, nodeId: r.id } }, RULE_W, RULE_H));
  });
  things.forEach((t, n) => {
    nodes.push(sized({ id: t.id, type: 'thing', parentNode: membraneId, extent: 'parent', position: thingsGrid.positions[n], data: { label: t.title, nodeId: t.id } }, THING_W, THING_H));
  });
  events.forEach((e, n) => {
    nodes.push(sized({ id: e.id, type: 'event', parentNode: membraneId, extent: 'parent', position: { x: W - eventColW + CELL_GAP, y: rulesTop + n * (EVENT_H + CELL_GAP) }, data: { label: e.title, nodeId: e.id } }, EVENT_W, EVENT_H));
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
      for (const tid of c.thingIds.filter((tid) => governsOf(g, rid).includes(tid))) {
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
