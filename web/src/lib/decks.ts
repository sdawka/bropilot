// Guided-interview decks: static question data + a pure answers→RawGraph mapper.
// Each follow-up edge is OUTGOING from the answer node (answer —edgeType→ target).
import type { RawGraph } from './changeset';

export interface Followup {
  edgeType: string;
  targetKind: string;
  prompt: string;
}
export interface Question {
  id: string;
  prompt: string;
  kind: string;
  followups?: Followup[];
}
export interface Deck {
  id: string;
  label: string;
  questions: Question[];
}

export const DECKS: Deck[] = [
  {
    id: 'foundations',
    label: 'Foundations',
    questions: [
      { id: 'f-name', prompt: 'What is this system called?', kind: 'name' },
      { id: 'f-purpose', prompt: 'In one sentence, why does this system exist?', kind: 'purpose' },
      {
        id: 'f-capability',
        prompt: 'What can a user accomplish with this system? (one per answer)',
        kind: 'capability',
        followups: [{ edgeType: 'serves', targetKind: 'persona', prompt: 'Which persona does this serve?' }],
      },
      { id: 'f-persona', prompt: 'Who uses this system? Name each role or persona.', kind: 'persona' },
      {
        id: 'f-usecase',
        prompt: 'What is a concrete situation where someone uses it?',
        kind: 'usecase',
        followups: [{ edgeType: 'uses', targetKind: 'capability', prompt: 'Which capability does this use case rely on?' }],
      },
      { id: 'f-requirement', prompt: 'What must the system do, without compromise?', kind: 'requirement' },
      { id: 'f-constraint', prompt: 'What hard limit or invariant must always hold?', kind: 'constraint' },
      {
        id: 'f-goal',
        prompt: 'What outcome would tell you this system succeeded?',
        kind: 'goal',
        followups: [{ edgeType: 'motivates', targetKind: 'usecase', prompt: 'Which use case does this goal motivate?' }],
      },
      { id: 'f-hypothesis', prompt: 'What belief about value are you betting on but have not proven?', kind: 'hypothesis' },
      { id: 'f-assumption', prompt: 'What are you taking for granted (until proven otherwise)?', kind: 'assumption' },
    ],
  },
  {
    id: 'domain',
    label: 'Domain',
    questions: [
      { id: 'd-term', prompt: 'What is a word in this domain that deserves a shared definition?', kind: 'term' },
      {
        id: 'd-entity',
        prompt: 'What is a core object or model in the domain? (one per answer)',
        kind: 'entity',
        followups: [{ edgeType: 'has', targetKind: 'relationship', prompt: 'Does it own a relationship to another entity?' }],
      },
      { id: 'd-relationship', prompt: 'How do two of your entities relate?', kind: 'relationship' },
      {
        id: 'd-behaviour',
        prompt: 'What is a business rule that governs how the system behaves?',
        kind: 'behaviour',
        followups: [{ edgeType: 'emits', targetKind: 'event', prompt: 'What event does this behaviour emit?' }],
      },
      { id: 'd-event', prompt: 'What notable thing happens in the system worth recording?', kind: 'event' },
      { id: 'd-state', prompt: 'What data is tracked over time?', kind: 'state' },
      {
        id: 'd-flow',
        prompt: 'What is a step-by-step journey a user takes?',
        kind: 'flow',
        followups: [
          { edgeType: 'satisfies', targetKind: 'usecase', prompt: 'Which use case does this flow satisfy?' },
          { edgeType: 'uses', targetKind: 'screen', prompt: 'Which screen does it use?' },
        ],
      },
      { id: 'd-screen', prompt: 'What UI view or page does the user see?', kind: 'screen' },
    ],
  },
  {
    id: 'implementation',
    label: 'Implementation',
    questions: [
      {
        id: 'i-module',
        prompt: 'What is a logical grouping of code (a module)?',
        kind: 'module',
        followups: [
          { edgeType: 'implements', targetKind: 'capability', prompt: 'Which capability does this module implement?' },
          { edgeType: 'exposes', targetKind: 'api', prompt: 'Which API does it expose?' },
        ],
      },
      {
        id: 'i-component',
        prompt: 'What is a reusable UI component?',
        kind: 'component',
        followups: [{ edgeType: 'implements', targetKind: 'screen', prompt: 'Which screen does it implement?' }],
      },
      { id: 'i-interface', prompt: 'What is an important contract or type?', kind: 'interface' },
      {
        id: 'i-api',
        prompt: 'What is a backend endpoint the system exposes?',
        kind: 'api',
        followups: [{ edgeType: 'implements', targetKind: 'interface', prompt: 'Which interface does it implement?' }],
      },
      { id: 'i-logic', prompt: 'What is a non-trivial algorithm or computation?', kind: 'logic' },
      { id: 'i-repository', prompt: 'Where does the code or data live (a repository)?', kind: 'repository' },
      { id: 'i-external', prompt: 'What third-party service does the system depend on?', kind: 'external' },
      {
        id: 'i-tests',
        prompt: 'What testing strategy or suite guards the system?',
        kind: 'tests',
        followups: [{ edgeType: 'verifies', targetKind: 'module', prompt: 'Which module does it verify?' }],
      },
      { id: 'i-observability', prompt: 'How do you watch the system in production (logs, metrics, alerts)?', kind: 'observability' },
    ],
  },
];

export interface Answer {
  kind: string;
  title: string;
  links: { type: string; target: string }[];
}

export function answersToRaw(answers: Answer[]): RawGraph {
  const nodes = answers.filter((a) => a.title.trim()).map((a) => ({ kind: a.kind, title: a.title.trim() }));
  const edges: { src: string; dst: string; type: string }[] = [];
  for (const a of answers) {
    if (!a.title.trim()) continue;
    for (const l of a.links) {
      if (l.target.trim()) edges.push({ src: a.title.trim(), dst: l.target.trim(), type: l.type });
    }
  }
  return { nodes, edges };
}
