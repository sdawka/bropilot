// Regenerates the ontology block in the bropilot skills from schema.ts.
// Run after any ONTOLOGY / EDGE_TYPES change: npm run sync-skills
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ONTOLOGY, EDGE_TYPES, EDGE_CATEGORIES } from '../src/lib/schema';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FILES = [
  '.claude/skills/bropilot-extract/SKILL.md',
  '.claude/skills/bropilot-generate/SKILL.md',
  '.claude/skills/bropilot-interview/SKILL.md',
];
const BEGIN = '<!-- ontology:begin -->';
const END = '<!-- ontology:end -->';

function render(): string {
  const lines: string[] = [];
  lines.push('', '**Edge types** (✱ = stock, always round-trips):', '');
  for (const cat of EDGE_CATEGORIES) {
    const types = EDGE_TYPES.filter((t) => t.category === cat.id);
    lines.push(`- *${cat.label}*: ${types.map((t) => `\`${t.type}\`${t.stock ? '✱' : ''}`).join(', ')}`);
  }
  lines.push('', '**Kind→kind ontology** (canonical and typical triples — prefer these when choosing edges):', '');
  lines.push('| src | edge | dst | strength |', '|---|---|---|---|');
  for (const t of ONTOLOGY) {
    if (t.strength === 'possible') continue;
    lines.push(`| ${t.src} | ${t.type} | ${t.dst} | ${t.strength} |`);
  }
  lines.push('');
  return lines.join('\n');
}

let failed = false;
const block = render();
for (const rel of FILES) {
  const path = resolve(repoRoot, rel);
  if (!existsSync(path)) {
    console.error(`ERROR: missing file: ${rel}`);
    failed = true;
    continue;
  }
  const text = readFileSync(path, 'utf8');
  const i = text.indexOf(BEGIN);
  const j = text.indexOf(END);
  if (i === -1 || j === -1 || j < i) {
    console.error(`ERROR: markers missing or malformed in ${rel}`);
    failed = true;
    continue;
  }
  const next = text.slice(0, i + BEGIN.length) + '\n' + block + text.slice(j);
  if (next !== text) {
    writeFileSync(path, next);
    console.log(`synced: ${rel}`);
  } else {
    console.log(`up to date: ${rel}`);
  }
}
process.exit(failed ? 1 : 0);
