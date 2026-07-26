// The copy-paste LLM bridge. buildPrompt renders a self-contained prompt the
// user pastes into any LLM chat; parseReply reads the reply back into a
// RawGraph for diffAgainstGraph. Pure and dependency-free — no network, no keys.
import {
  type Graph,
  KINDS,
  PARTS,
  EDGE_TYPES,
  EDGE_CATEGORIES,
  ONTOLOGY,
} from './schema';
import type { RawGraph } from './changeset';

export type Exercise = 'extract' | 'interview' | 'storm';

function ontologyDigest(): string {
  const lines: string[] = ['## Ontology', '', '### Node kinds (by part)'];
  for (const part of PARTS) {
    lines.push('', `**${part.label}** — ${part.tagline}`);
    for (const k of KINDS.filter((x) => x.part === part.id)) {
      lines.push(`- \`${k.kind}\`: ${k.blurb}`);
    }
  }
  lines.push('', '### Edge types');
  for (const cat of EDGE_CATEGORIES) {
    for (const t of EDGE_TYPES.filter((x) => x.category === cat.id)) {
      lines.push(`- \`${t.type}\`: ${t.hint}`);
    }
  }
  lines.push('', '### Example triples (prefer these shapes)');
  for (const t of ONTOLOGY.filter((x) => x.strength === 'canonical').slice(0, 20)) {
    lines.push(`- ${t.src} \`${t.type}\` ${t.dst}`);
  }
  return lines.join('\n');
}

function graphDigest(graph: Graph): string {
  if (!graph.nodes.length) return '## Current graph\n\n(empty)';
  const lines = ['## Current graph (link to these by id or title where relevant)', ''];
  for (const n of graph.nodes) lines.push(`- \`${n.id}\` — ${n.title} (${n.kind})`);
  return lines.join('\n');
}

const CONTRACT = [
  '## Output contract',
  '',
  'Reply with **exactly one** fenced JSON block and nothing else that matters:',
  '',
  '```json',
  '{',
  '  "nodes": [{ "kind": "<kind>", "title": "<short title>", "description": "<one or two sentences>", "excerpt": "<optional: the source phrase this came from>" }],',
  '  "edges": [{ "src": "<title or existing id>", "dst": "<title or existing id>", "type": "<edge type>" }]',
  '}',
  '```',
  '',
  '- Use the kinds and edge types above. If nothing fits, pick the closest kind and a `references` edge.',
  '- `src`/`dst` may be a title you just introduced or an existing node id/title from the current graph.',
  '- Do not invent ids; only titles for new nodes.',
].join('\n');

const INTRO: Record<Exercise, string> = {
  extract:
    'You are extracting a Bropilot knowledge graph from a document. Identify the system knowledge it contains and map it onto the ontology below. Include an `excerpt` (the source phrase) for each node when you can.',
  interview:
    'You are interviewing me to build a Bropilot knowledge graph. Ask me the questions below one at a time, then summarise my answers as the graph JSON in the output contract.',
  storm:
    'I ran an event-storming session. Refine and expand the stickies below into a Bropilot knowledge graph, keeping the ontology mapping tight.',
};

export function buildPrompt(opts: {
  exercise: Exercise;
  docText?: string;
  graph: Graph;
  questions?: string[];
}): string {
  const parts = [INTRO[opts.exercise], '', ontologyDigest(), '', graphDigest(opts.graph), ''];
  if (opts.exercise === 'interview' && opts.questions?.length) {
    parts.push('## Questions', '', ...opts.questions.map((q, i) => `${i + 1}. ${q}`), '');
  }
  if (opts.docText) {
    parts.push('## Document', '', '"""', opts.docText, '"""', '');
  }
  parts.push(CONTRACT);
  return parts.join('\n');
}

/** Extract the first balanced {...} JSON object from arbitrary text. */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseReply(text: string): { raw: RawGraph; warnings: string[] } | { error: string } {
  const slice = firstJsonObject(text);
  if (!slice) return { error: 'No JSON object found. Paste the LLM reply including its ```json block.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch (e) {
    return { error: `Could not parse JSON: ${(e as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object') return { error: 'The JSON was not an object with nodes/edges.' };
  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = [];
  const nodes = Array.isArray(obj.nodes) ? obj.nodes : (warnings.push('No "nodes" array — treated as empty.'), []);
  const edges = Array.isArray(obj.edges) ? obj.edges : (warnings.push('No "edges" array — treated as empty.'), []);
  return { raw: { nodes, edges }, warnings };
}
