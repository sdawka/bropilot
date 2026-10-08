// persp=derived: System One picks the next column's hop from the legal edges of the selected kind
// (SPEC §3, §6 `next-hop`). WP1's Traversal calls this.
import type { Band, Hop, PickNextHop } from '../types';
import { decide } from './client';
import { answerConfidence, bandFor, thresholdFor } from './decisionConfig';

export const hopKey = (h: Hop) => `${h.edge}:${h.dir}`;

export const pickNextHop: PickNextHop = async ({ kind, pathTitles, options }) => {
  if (!options.length) throw new Error('pickNextHop: no options');
  if (options.length === 1) return { hop: options[0], confidence: 1, band: 'act', fake: false };
  const criteria = Object.fromEntries(options.map((h) => [hopKey(h),
    h.dir === 'out' ? `${kind} ${h.edge} → something` : `something ${h.edge} → ${kind}`]));
  const res = await decide({
    fn: 'next-hop',
    state: { kind, path: pathTitles },
    questions: { hop: { type: 'choice', instructions: `The user walked ${pathTitles.join(' › ') || 'nothing yet'} and is on a ${kind}. Which relation is the most useful next step to show?`, criteria } },
  });
  const a = res.answers.hop;
  const chosen = a && a.type === 'choice' ? options.find((h) => hopKey(h) === a.choice) : undefined;
  const confidence = a ? answerConfidence(a) : 0;
  const band: Band = chosen ? bandFor(confidence, thresholdFor('next-hop')) : 'ask';
  return { hop: chosen ?? options[0], confidence: chosen ? confidence : 0.5, band, fake: res.fake };
};
