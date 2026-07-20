// Advisory graph-health checks against the ONTOLOGY (T-Box). Pure, never
// throws, never blocks — findings are suggestions, not errors.
import { type Graph, KIND_MAP, EDGE_TYPE_SET, ONTOLOGY, tripleFor } from './schema';

export interface Finding {
  severity: 'note' | 'hint';
  nodeId?: string;
  edgeId?: string;
  message: string;
  suggestion?: string;
}

const INTENT_TARGETS = new Set(['capability', 'usecase', 'goal']);
const INTENT_TYPES = new Set(['motivates', 'serves']);
const VERIFY_TARGETS = new Set(['module', 'api', 'behaviour']);

export function lintGraph(graph: Graph): Finding[] {
  const findings: Finding[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const linked = new Set<string>();
  const incomingTypes = new Map<string, Set<string>>();

  for (const e of graph.edges) {
    linked.add(e.srcId);
    linked.add(e.dstId);
    if (!incomingTypes.has(e.dstId)) incomingTypes.set(e.dstId, new Set());
    incomingTypes.get(e.dstId)!.add(e.type);
  }

  // 1 · off-ontology edges (skip unknown kinds/types — imported graphs may have them)
  for (const e of graph.edges) {
    const src = byId.get(e.srcId);
    const dst = byId.get(e.dstId);
    if (!src || !dst) continue;
    if (!KIND_MAP[src.kind] || !KIND_MAP[dst.kind] || !EDGE_TYPE_SET.has(e.type)) continue;
    if (tripleFor(src.kind, e.type, dst.kind)) continue;
    const alts = [...new Set(ONTOLOGY.filter((t) => t.src === src.kind && t.dst === dst.kind).map((t) => t.type))];
    findings.push({
      severity: 'note',
      edgeId: e.id,
      nodeId: e.srcId,
      message: `Unusual edge: "${src.title}" ${e.type} "${dst.title}" (${src.kind} → ${dst.kind}) — not in the ontology.`,
      suggestion: alts.length ? `The ontology suggests: ${alts.join(', ')}` : undefined,
    });
  }

  // 2 · orphans
  for (const n of graph.nodes) {
    if (!linked.has(n.id)) {
      findings.push({ severity: 'hint', nodeId: n.id, message: `"${n.title}" has no relationships yet.` });
    }
  }

  // 3 · why-chain gaps
  for (const n of graph.nodes) {
    if (!INTENT_TARGETS.has(n.kind)) continue;
    const inc = incomingTypes.get(n.id);
    if (inc && [...inc].some((t) => INTENT_TYPES.has(t))) continue;
    findings.push({
      severity: 'note',
      nodeId: n.id,
      message: `Nothing says why "${n.title}" exists — no incoming motivates/serves edge.`,
      suggestion: 'Link a purpose, goal, hypothesis or persona to it.',
    });
  }

  // 4 · unverified surfaces
  for (const n of graph.nodes) {
    if (!VERIFY_TARGETS.has(n.kind)) continue;
    if (incomingTypes.get(n.id)?.has('verifies')) continue;
    findings.push({
      severity: 'hint',
      nodeId: n.id,
      message: `No test evidence for "${n.title}" — nothing verifies it.`,
      suggestion: 'Add a tests node with a verifies edge.',
    });
  }

  return findings;
}
