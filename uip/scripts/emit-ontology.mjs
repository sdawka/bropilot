// Emits src/data/ontology.json from lfp's kernel. Run: npx tsx scripts/emit-ontology.mjs
// Also copies lfp/src/graph.json → public/projects/bropilot.graph.json (pass --no-graph to skip).
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const lfp = resolve(root, '../lfp');
const k = await import(resolve(lfp, 'src/kernel.ts'));

const SPACES = k.SPACES.map(({ id, label, layer, order, hue, blurb }) => ({ id, label, layer, order, hue, blurb }));
const KINDS = k.KINDS.map(({ id, label, plural, space, icon, level, singular, needs, fields, blurb }) => ({
  id, label, plural, space, icon, level, singular: !!singular,
  fields: (fields ?? []).map(({ key, label, options }) => ({ key, label, options })),
  needs: (needs ?? []).map(({ edge, dir, min, ask, produces }) => ({ edge, dir, min, ask, produces })), blurb,
}));
const EDGE_TYPES = k.EDGE_TYPES.map(({ id, label, category, from, to, hint }) => ({ id, label, category, from, to, hint }));
const RELATIONS = k.RELATIONS.map(({ src, edge, dst, many, at, need }) => ({ src, edge, dst, ...(many ? { many } : {}), at, ...(need ? { need } : {}) }));
const LIFECYCLE_STAGES = [...k.LIFECYCLE_STAGES];
const out = resolve(root, 'src/data/ontology.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ SPACES, KINDS, EDGE_TYPES, RELATIONS, LIFECYCLE_STAGES }, null, 1) + '\n');
console.log(`ontology: ${SPACES.length} spaces, ${KINDS.length} kinds, ${EDGE_TYPES.length} edge types, ${RELATIONS.length} relations, ${LIFECYCLE_STAGES.length} stages → ${out}`);

if (!process.argv.includes('--no-graph')) {
  const graph = JSON.parse(readFileSync(resolve(lfp, 'src/graph.json'), 'utf8'));
  const dst = resolve(root, 'public/projects/bropilot.graph.json');
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, JSON.stringify({ nodes: graph.nodes, edges: graph.edges }, null, 1) + '\n');
  console.log(`graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges → ${dst}`);
}
