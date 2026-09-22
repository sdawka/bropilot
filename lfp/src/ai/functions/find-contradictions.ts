// find-contradictions: two stub checks over the whole graph — (a) two nodes of the same kind with
// the same (normalized) title, (b) two rules governing the same thing whose condition lines
// disagree ("never"/"must not" vs. "always"/"must" on ≥2 shared words). v4.2 (plan: "Agent B — AI
// functions"). Each hit becomes a `raise` cue (the same vocabulary raise-question.ts uses) so it
// surfaces through the normal follow-up/blocking machinery — never auto-repaired.
import { state, nodeById } from '../../store.ts';
import { conditionsOf } from '../../checks.ts';
import type { Node } from '../../types.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface FindContradictionsOut {
  contradictions: { subjects: string[]; prompt: string; produces: string }[];
}

const NEGATIVE_RE = /\b(never|must not)\b/i;
const POSITIVE_RE = /\b(always|must)\b/i;

const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const wordsOf = (s: string) => new Set(normTitle(s).replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
function sharedWordCount(a: string, b: string): number {
  const wa = wordsOf(a);
  let n = 0;
  for (const w of wordsOf(b)) if (wa.has(w)) n++;
  return n;
}

/** (a) two-or-more nodes of the same kind sharing a normalized title. */
function duplicateTitleContradictions(): FindContradictionsOut['contradictions'] {
  const byKindTitle = new Map<string, { id: string; title: string }[]>();
  for (const n of state.graph.nodes) {
    const key = `${n.kind}::${normTitle(n.title)}`;
    const group = byKindTitle.get(key);
    if (group) group.push({ id: n.id, title: n.title });
    else byKindTitle.set(key, [{ id: n.id, title: n.title }]);
  }
  const out: FindContradictionsOut['contradictions'] = [];
  for (const [key, group] of byKindTitle) {
    if (group.length < 2) continue;
    const kind = key.split('::')[0];
    out.push({
      subjects: group.map((g) => g.id),
      prompt: `${group.length} ${kind} nodes share the title "${group[0].title}" — merge them, or are they meant to differ?`,
      produces: kind,
    });
  }
  return out;
}

/** (b) two rules `governs`-ing the same thing whose conditions disagree. */
function opposingRuleContradictions(): FindContradictionsOut['contradictions'] {
  const rulesByTarget = new Map<string, string[]>();
  for (const e of state.graph.edges) {
    if (e.type !== 'governs') continue;
    const src = nodeById(e.src);
    if (src?.kind !== 'rule') continue;
    const list = rulesByTarget.get(e.dst);
    if (list) list.push(e.src); else rulesByTarget.set(e.dst, [e.src]);
  }
  const out: FindContradictionsOut['contradictions'] = [];
  const seen = new Set<string>();
  for (const [targetId, ruleIds] of rulesByTarget) {
    const rules = [...new Set(ruleIds)].map((id) => nodeById(id)).filter((n): n is Node => !!n);
    if (rules.length < 2) continue;
    const target = nodeById(targetId);
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i], b = rules[j];
        for (const condA of conditionsOf(a)) {
          if (!NEGATIVE_RE.test(condA)) continue;
          for (const condB of conditionsOf(b)) {
            if (!POSITIVE_RE.test(condB) || sharedWordCount(condA, condB) < 2) continue;
            const dedupKey = [a.id, b.id].sort().join('+');
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);
            out.push({
              subjects: [a.id, b.id, targetId],
              prompt: `"${a.title}" says "${condA}" but "${b.title}" says "${condB}" — both govern "${target?.title ?? targetId}". Which holds?`,
              produces: 'rule',
            });
          }
        }
      }
    }
  }
  return out;
}

function stub(): FindContradictionsOut {
  return { contradictions: [...duplicateTitleContradictions(), ...opposingRuleContradictions()] };
}

function toCues(out: FindContradictionsOut, callId: string): Cue[] {
  if (!out.contradictions.length) return [{ t: 'say', id: `${callId}-s1`, text: 'No contradictions found.' }];
  const cues: Cue[] = out.contradictions.map((c) => ({
    t: 'raise', prompt: c.prompt, produces: c.produces, subjects: c.subjects, source: 'contradiction',
  }));
  cues.push({ t: 'say', id: `${callId}-s1`, text: `Found ${out.contradictions.length} contradiction${out.contradictions.length === 1 ? '' : 's'}.` });
  return cues;
}

export const findContradictions: AIFunctionImpl<undefined, FindContradictionsOut> = {
  context: { digest: (ctx) => `nodes=${ctx.graph.nodes} edges=${ctx.graph.edges}` },
  stub,
  toCues,
};
