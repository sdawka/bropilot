import { describe, expect, it } from 'vitest';
import { buildPrompt, parseReply } from '../../src/lib/bridge';
import type { Graph } from '../../src/lib/schema';

const graph: Graph = {
  nodes: [{ id: 'persona-rep', kind: 'persona', title: 'Sales rep', description: 'On the road', props: {} }],
  edges: [],
};

describe('buildPrompt', () => {
  it('embeds an ontology digest (kinds + edge types) and the JSON contract', () => {
    const p = buildPrompt({ exercise: 'extract', docText: 'Our app helps reps.', graph });
    expect(p).toContain('persona'); // a kind
    expect(p).toContain('serves'); // an edge type
    expect(p).toContain('"nodes"'); // the contract shape
    expect(p).toContain('"edges"');
    expect(p).toContain('```json'); // fenced-block instruction
  });

  it('embeds a digest of the current graph (existing ids + titles) so the LLM can link', () => {
    const p = buildPrompt({ exercise: 'extract', docText: 'x', graph });
    expect(p).toContain('persona-rep');
    expect(p).toContain('Sales rep');
  });

  it('embeds the document text for the extract exercise', () => {
    const p = buildPrompt({ exercise: 'extract', docText: 'UNIQUE-DOC-MARKER', graph });
    expect(p).toContain('UNIQUE-DOC-MARKER');
  });

  it('embeds deck questions for the interview exercise', () => {
    const p = buildPrompt({ exercise: 'interview', graph, questions: ['What can a user accomplish?'] });
    expect(p).toContain('What can a user accomplish?');
  });

  it('mentions the optional per-node excerpt in the extract contract', () => {
    const p = buildPrompt({ exercise: 'extract', docText: 'x', graph });
    expect(p.toLowerCase()).toContain('excerpt');
  });
});

describe('parseReply', () => {
  it('parses a fenced JSON block', () => {
    const text = 'Sure!\n```json\n{ "nodes": [{ "kind": "goal", "title": "Grow" }], "edges": [] }\n```\nDone.';
    const res = parseReply(text);
    expect('raw' in res).toBe(true);
    if ('raw' in res) {
      expect(res.raw.nodes).toHaveLength(1);
      expect(res.raw.edges).toEqual([]);
    }
  });

  it('parses a raw (unfenced) JSON object', () => {
    const res = parseReply('{ "nodes": [], "edges": [{ "src": "A", "dst": "B", "type": "uses" }] }');
    expect('raw' in res).toBe(true);
    if ('raw' in res) expect(res.raw.edges).toHaveLength(1);
  });

  it('returns {error} on malformed JSON, never throws', () => {
    const res = parseReply('here is some prose with no json at all');
    expect('error' in res).toBe(true);
  });

  it('returns {error} for a truncated/broken object', () => {
    const res = parseReply('```json\n{ "nodes": [ { "kind": "goal", ');
    expect('error' in res).toBe(true);
  });

  it('warns (not errors) when nodes/edges arrays are missing, defaulting them to []', () => {
    const res = parseReply('{ "nodes": [{ "kind": "goal", "title": "G" }] }');
    expect('raw' in res).toBe(true);
    if ('raw' in res) {
      expect(res.raw.edges).toEqual([]);
      expect(res.warnings.length).toBeGreaterThan(0);
    }
  });
});
