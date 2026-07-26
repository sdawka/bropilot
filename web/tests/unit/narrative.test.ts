import { describe, it, expect, beforeEach } from 'vitest';
import { importGraph, hydrate } from '../../src/lib/store';
import { narrativeFor } from '../../src/lib/narrative';
import type { Sentence } from '../../src/lib/narrative';

// Narrative sentences must tell both directions of a relationship: a node
// that is only ever a *target* (requirements, terms, designs) still reads as
// connected, with the source rendered as a clickable segment.

const GRAPH = {
  nodes: [
    { id: 'capability-collect', kind: 'capability', title: 'Guided collection', description: 'Forms.', props: {} },
    { id: 'requirement-three-parts', kind: 'requirement', title: 'Three-part model', description: 'Each part first-class', props: {} },
    { id: 'persona-architect', kind: 'persona', title: 'System architect', description: '', props: {} },
  ],
  edges: [
    { id: 'e1', srcId: 'capability-collect', dstId: 'requirement-three-parts', type: 'satisfies' },
    { id: 'e2', srcId: 'persona-architect', dstId: 'capability-collect', type: 'uses' },
  ],
};

function sentenceById(id: string): Sentence {
  const groups = narrativeFor(['foundations']);
  const s = groups.flatMap((g) => g.sentences).find((s) => s.id === id);
  expect(s, `sentence for ${id}`).toBeDefined();
  return s!;
}

function fullText(s: Sentence): string {
  return s.segments.map((seg) => seg.text).join('');
}

beforeEach(() => {
  hydrate();
  const res = importGraph(JSON.stringify(GRAPH));
  expect(res.ok).toBe(true);
});

describe('narrative incoming clauses', () => {
  it('renders an incoming-only node with a linked source and a "<label> it" clause', () => {
    const s = sentenceById('requirement-three-parts');
    expect(fullText(s)).toBe(
      'Three-part model — Each part first-class. Guided collection satisfies it.',
    );
    const link = s.segments.find((seg) => seg.nodeId === 'capability-collect');
    expect(link?.text).toBe('Guided collection');
    expect(s.nodeIds).toContain('capability-collect');
  });

  it('joins outgoing and incoming clauses with "In turn"', () => {
    const s = sentenceById('capability-collect');
    expect(fullText(s)).toBe(
      'Guided collection — Forms. It satisfies Three-part model. In turn, System architect uses it.',
    );
    expect(s.segments.some((seg) => seg.nodeId === 'persona-architect')).toBe(true);
  });

  it('keeps a node with no edges as a bare sentence', () => {
    importGraph(JSON.stringify({ ...GRAPH, edges: [] }));
    const s = sentenceById('requirement-three-parts');
    expect(fullText(s)).toBe('Three-part model — Each part first-class.');
  });
});
