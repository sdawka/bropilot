// find-contradictions: two stub checks over the whole graph — (a) two nodes of the same kind with
// the same (normalized) title, (b) two rules governing the same thing whose condition lines
// disagree ("never"/"must not" vs. "always"/"must" on ≥2 shared words). v4.2 (plan: "Agent B — AI
// functions"). Each hit becomes a `raise` cue (the same vocabulary raise-question.ts uses) so it
// surfaces through the normal follow-up/blocking machinery — never auto-repaired.
//
// v4.3: `decision` (AGENT-RUNTIME.md §9, threshold 'find-contradictions') turns the deterministic
// pre-filter's near-misses into one batch of nouls for Jev — exact-title duplicates stay certain
// in code (never asked). Each question's `instructions` embeds only the two literal titles/lines
// it's about, so Jev never has to search a shared blob for the pair it's judging.
import { state, nodeById } from '../../store.ts';
import { conditionsOf } from '../../checks.ts';
import { answerConfidence } from '../decisionConfig.ts';
import type { Node } from '../../types.ts';
import type { Cue } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers, S1Question, S1Request } from '../types.ts';

export interface FindContradictionsOut {
  contradictions: { subjects: string[]; prompt: string; produces: string }[];
}

const NEGATIVE_RE = /\b(never|must not)\b/i;
// "must not" also matches \b(must)\b, so a positive test must exclude it explicitly (fixed in v4.3
// — it used to false-positive-match "must not" lines as positive claims).
const POSITIVE_RE = /\b(always|must)\b/i;
const isPositive = (s: string) => POSITIVE_RE.test(s) && !NEGATIVE_RE.test(s);

const normTitle = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const wordsOf = (s: string) => new Set(normTitle(s).replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean));
function sharedWordCount(a: string, b: string): number {
  const wa = wordsOf(a);
  let n = 0;
  for (const w of wordsOf(b)) if (wa.has(w)) n++;
  return n;
}

/** (a) two-or-more nodes of the same kind sharing a normalized title — certain, never asked. */
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

interface RulePairCand {
  id: string; aId: string; aTitle: string; bId: string; bTitle: string;
  condA: string; condB: string; targetId: string; targetTitle: string; shared: number;
}

/** (b) pre-filter: two rules `governs`-ing the same thing whose conditions disagree — one
 * candidate per rule pair (first qualifying condition-line pair wins), for the decision to judge. */
function opposingRuleCandidates(): RulePairCand[] {
  const rulesByTarget = new Map<string, string[]>();
  for (const e of state.graph.edges) {
    if (e.type !== 'governs') continue;
    const src = nodeById(e.src);
    if (src?.kind !== 'rule') continue;
    const list = rulesByTarget.get(e.dst);
    if (list) list.push(e.src); else rulesByTarget.set(e.dst, [e.src]);
  }
  const out: RulePairCand[] = [];
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
            if (!isPositive(condB) || sharedWordCount(condA, condB) < 2) continue;
            const dedupKey = [a.id, b.id].sort().join('+');
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);
            out.push({
              id: `pair-${[a.id, b.id].sort().join('-')}`,
              aId: a.id, aTitle: a.title, bId: b.id, bTitle: b.title,
              condA, condB, targetId, targetTitle: target?.title ?? targetId,
              shared: sharedWordCount(condA, condB),
            });
          }
        }
      }
    }
  }
  return out;
}

function ruleCandidateToContradiction(c: RulePairCand): FindContradictionsOut['contradictions'][number] {
  return {
    subjects: [c.aId, c.bId, c.targetId],
    prompt: `"${c.aTitle}" says "${c.condA}" but "${c.bTitle}" says "${c.condB}" — both govern "${c.targetTitle}". Which holds?`,
    produces: 'rule',
  };
}

interface DupPairCand { id: string; aId: string; aTitle: string; bId: string; bTitle: string; kind: string; shared: number }

/** Near-miss duplicate pre-filter: same kind, titles not equal after normalization, sharing ≥2
 * words (exact-title duplicates are handled — with certainty — by duplicateTitleContradictions). */
function nearMissDuplicateCandidates(): DupPairCand[] {
  const byKind = new Map<string, Node[]>();
  for (const n of state.graph.nodes) {
    const list = byKind.get(n.kind);
    if (list) list.push(n); else byKind.set(n.kind, [n]);
  }
  const out: DupPairCand[] = [];
  for (const [kind, nodes] of byKind) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (normTitle(a.title) === normTitle(b.title)) continue;
        const shared = sharedWordCount(a.title, b.title);
        if (shared < 2) continue;
        out.push({ id: `dup-${[a.id, b.id].sort().join('-')}`, aId: a.id, aTitle: a.title, bId: b.id, bTitle: b.title, kind, shared });
      }
    }
  }
  return out;
}

function dupCandidateToContradiction(c: DupPairCand): FindContradictionsOut['contradictions'][number] {
  return {
    subjects: [c.aId, c.bId],
    prompt: `These two ${c.kind} nodes, "${c.aTitle}" and "${c.bTitle}", look like duplicates — merge them, or are they meant to differ?`,
    produces: c.kind,
  };
}

function stub(): FindContradictionsOut {
  return { contradictions: [...duplicateTitleContradictions(), ...opposingRuleCandidates().map(ruleCandidateToContradiction)] };
}

function toCues(out: FindContradictionsOut, callId: string): Cue[] {
  if (!out.contradictions.length) return [{ t: 'say', id: `${callId}-s1`, text: 'No contradictions found.' }];
  const cues: Cue[] = out.contradictions.map((c) => ({
    t: 'raise', prompt: c.prompt, produces: c.produces, subjects: c.subjects, source: 'contradiction',
  }));
  cues.push({ t: 'say', id: `${callId}-s1`, text: `Found ${out.contradictions.length} contradiction${out.contradictions.length === 1 ? '' : 's'}.` });
  return cues;
}

const BATCH_CAP = 40;

/** 'find-contradictions': one batch covering both near-miss checks. Capped at 40 questions,
 * highest shared-word-count pairs first (a real graph can have far more candidate pairs than are
 * worth a model call). Null when the pre-filter found nothing to ask about — the stub (exact
 * duplicates only) is already right. */
function questions(): S1Request | null {
  const rulePairs = opposingRuleCandidates().map((c) => ({ ...c, tag: 'rule' as const }));
  const dupPairs = nearMissDuplicateCandidates().map((c) => ({ ...c, tag: 'dup' as const }));
  const batch = [...rulePairs, ...dupPairs].sort((x, y) => y.shared - x.shared).slice(0, BATCH_CAP);
  if (!batch.length) return null;

  const questions: Record<string, S1Question> = {};
  const statePairs: unknown[] = [];
  for (const c of batch) {
    if (c.tag === 'rule') {
      questions[c.id] = {
        type: 'noul',
        instructions: `Do these two rule lines contradict each other, i.e. one forbids what the other requires?\nRule "${c.aTitle}": "${c.condA}"\nRule "${c.bTitle}": "${c.condB}"`,
        criteria: { true: 'They contradict', false: 'They do not contradict' },
      };
      statePairs.push({ id: c.id, kind: 'rule', ruleA: c.aTitle, ruleB: c.bTitle, condA: c.condA, condB: c.condB });
    } else {
      questions[c.id] = {
        type: 'noul',
        instructions: `Do these two titles name the same thing?\n${c.kind} "${c.aTitle}" vs. ${c.kind} "${c.bTitle}"`,
        criteria: { true: 'Same thing', false: 'Different things' },
      };
      statePairs.push({ id: c.id, kind: c.kind, titleA: c.aTitle, titleB: c.bTitle });
    }
  }
  return { state: { pairs: statePairs }, questions };
}

/** Note (per the brief): `minConfidence` would let one uncertain pair among many fail the whole
 * batch. Use the MEAN confidence instead — a batch this size is only ever as useful as most of its
 * answers, not its single worst one. */
function meanConfidence(answers: S1Answers): number {
  const vals = Object.values(answers).map(answerConfidence);
  return vals.length ? vals.reduce((sum, v) => sum + v, 0) / vals.length : 0;
}

function decide(answers: S1Answers): FindContradictionsOut {
  const contradictions = [...duplicateTitleContradictions()];
  for (const c of opposingRuleCandidates()) {
    const a = answers[c.id];
    if (a && a.type === 'noul' && a.noul >= 0.5) contradictions.push(ruleCandidateToContradiction(c));
  }
  for (const c of nearMissDuplicateCandidates()) {
    const a = answers[c.id];
    if (a && a.type === 'noul' && a.noul >= 0.5) contradictions.push(dupCandidateToContradiction(c));
  }
  return { contradictions };
}

const decision: DecisionSpec<undefined, FindContradictionsOut> = { id: 'find-contradictions', questions, decide, confidence: meanConfidence };

export const findContradictions: AIFunctionImpl<undefined, FindContradictionsOut> = {
  context: { digest: (ctx) => `nodes=${ctx.graph.nodes} edges=${ctx.graph.edges}` },
  stub,
  toCues,
  decision,
};
