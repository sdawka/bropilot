// picker=ask: one choice over project names + none (SPEC §6 `project-pick`).
import type { Band, ProjectSummary } from '../types';
import { decide } from './client';
import { answerConfidence, bandFor, thresholdFor } from './decisionConfig';

export async function pickProject(text: string, projects: ProjectSummary[]): Promise<{ id: string | null; confidence: number; band: Band; fake: boolean }> {
  const res = await decide({
    fn: 'project-pick',
    state: { text },
    questions: {
      project: {
        type: 'choice',
        instructions: 'Which of these projects does the text refer to? Pick none if it is none of them.',
        criteria: { ...Object.fromEntries(projects.map((p) => [p.id, `${p.name}: ${p.purpose}`])), none: 'None of these' },
      },
    },
  });
  const a = res.answers.project;
  if (!a || a.type !== 'choice') return { id: null, confidence: 0, band: 'ask', fake: res.fake };
  const confidence = answerConfidence(a);
  const id = a.choice === 'none' ? null : a.choice;
  return { id, confidence, band: id ? bandFor(confidence, thresholdFor('project-pick')) : 'ask', fake: res.fake };
}
