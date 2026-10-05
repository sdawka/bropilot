// Resolution in code (SPEC §6): answers → TurnResolution. Target = uses-context (confident) → the
// selected node; else a confident `cand`; else space → kind-<space> → node-<kind>. Chain confidence
// is the min of its answers. Repair = the same function with overrides, re-reading the answers
// already held (0 round trips). Pure.
import type { Band, Decision, DecideRequest, DecideResponse, Intent, Node, Option, PerspId, S1Answer, TurnResolution } from '../types';
import { answerConfidence, bandFor, thresholdFor } from './decisionConfig';
import { labelPart } from './text';
import { kindKey, nodeKey, NONE } from './turn';

export type RepairKey = Decision['key'];
export type Overrides = Partial<Record<RepairKey, string>>;

/** Everything a turn needs to be re-resolved later without another request. */
export interface Held { request: DecideRequest; response: DecideResponse; contextNode?: string | null; persp: PerspId }

export interface ResolveEnv {
  byId(id: string): Node | undefined;
  resolvePath(persp: PerspId, id: string): string[] | null;
  nodesOfKind(kind: string): Node[];
  perspIds: PerspId[];
}

interface Pick { value: string; confidence: number; alternatives: Option[]; label: string; overridden: boolean }

function criteriaOf(req: DecideRequest, key: string): Record<string, string> {
  const q = req.questions[key];
  return q && q.type === 'choice' ? q.criteria : {};
}
function alternatives(a: S1Answer | undefined, crit: Record<string, string>, except: string, labelFor?: (v: string) => string): Option[] {
  if (!a || a.type !== 'choice') return [];
  return Object.entries(a.probabilities)
    .filter(([v]) => v !== except && v !== NONE && v in crit)
    .sort((x, y) => y[1] - x[1])
    .map(([v, p]) => ({ value: v, label: labelFor ? labelFor(v) : labelPart(crit[v] ?? v), confidence: p }));
}
function pick(req: DecideRequest, answers: Record<string, S1Answer>, key: string, override?: string, labelFor?: (v: string) => string): Pick | null {
  const a = answers[key];
  const crit = criteriaOf(req, key);
  const lab = (v: string) => (labelFor ? labelFor(v) : labelPart(crit[v] ?? v));
  if (override) {
    const alts = alternatives(a, crit, override, labelFor);
    if (a && a.type === 'choice' && a.choice !== override && a.choice !== NONE) {
      alts.unshift({ value: a.choice, label: lab(a.choice), confidence: a.confidence });
    }
    return { value: override, confidence: 1, alternatives: alts, label: lab(override), overridden: true };
  }
  if (!a || a.type !== 'choice') return null;
  return { value: a.choice, confidence: answerConfidence(a), alternatives: alternatives(a, crit, a.choice, labelFor), label: lab(a.choice), overridden: false };
}
const decision = (key: RepairKey, p: Pick): Decision => ({ key, value: p.value, label: p.label, confidence: p.confidence, alternatives: p.alternatives });

export function resolveTurn(held: Held, env: ResolveEnv, overrides: Overrides = {}): TurnResolution {
  const { request: req, response } = held;
  const A = response.answers;
  const decisions: Decision[] = [];
  const titleOf = (id: string) => env.byId(id)?.title ?? id;

  // intent
  const ip = pick(req, A, 'intent', overrides.intent, (v) => v);
  const intent = (ip?.value ?? NONE) as Intent;
  const intentConf = ip?.confidence ?? 0;
  if (ip) decisions.push(decision('intent', ip));

  // perspective: a confident pick, else keep the current one
  const pp = pick(req, A, 'persp', overrides.persp);
  let persp: PerspId = held.persp;
  if (pp) {
    const ok = pp.overridden || (pp.value !== 'keep' && pp.confidence >= thresholdFor('lens-pick'));
    if (ok && pp.value !== 'keep') persp = pp.value as PerspId;
    decisions.push(decision('persp', { ...pp, value: ok ? pp.value : 'keep', label: ok && pp.value !== 'keep' ? pp.label : `keep ${held.persp}` }));
  }

  // space → kind (always read: it names the kind asked about, even when the node comes from context)
  let space: string | null = null, kind: string | null = null, kindConf = 0, spaceConf = 0;
  if (overrides.kind) {
    kind = overrides.kind; kindConf = 1;
    space = Object.keys(req.questions).filter((k) => k.startsWith('kind-')).map((k) => k.slice(5))
      .find((s) => kind! in criteriaOf(req, kindKey(s))) ?? null;
    spaceConf = 1;
    const sp = pick(req, A, 'space', space ?? undefined);
    if (sp) decisions.push(decision('space', sp));
    const kp = pick(req, A, space ? kindKey(space) : '', kind);
    decisions.push(decision('kind', kp ?? { value: kind, confidence: 1, alternatives: [], label: kind, overridden: true }));
  } else {
    const sp = pick(req, A, 'space', overrides.space);
    if (sp) {
      decisions.push(decision('space', sp));
      spaceConf = sp.confidence;
      if (sp.value !== NONE) {
        space = sp.value;
        const kp = pick(req, A, kindKey(space));
        if (kp) {
          decisions.push(decision('kind', kp));
          kindConf = Math.min(spaceConf, kp.confidence);
          if (kp.value !== NONE) kind = kp.value;
        }
      }
    }
  }

  // node: context → candidate → chain
  let node: string | null = null;
  let chainConf = 0;
  let chainThreshold = thresholdFor('find-by-title');
  let usesContext = false;
  let nodeSet: string[] | undefined;
  const structural = !!(overrides.space || overrides.kind);
  const ctxAns = A['uses-context'];
  if (overrides.node) {
    node = overrides.node; chainConf = 1;
  } else if (held.contextNode && ctxAns?.type === 'noul' && ctxAns.noul >= 0.5 && !(structural && intent !== 'ask')
             && answerConfidence(ctxAns) >= thresholdFor('uses-context')) {
    node = held.contextNode; chainConf = answerConfidence(ctxAns); usesContext = true;
    chainThreshold = thresholdFor('uses-context');
  }
  let np: Pick | null = null;
  if (!node && !structural) {
    const cp = pick(req, A, 'cand', undefined, titleOf);
    if (cp && cp.value !== NONE && cp.confidence >= thresholdFor('find-by-title')) { node = cp.value; chainConf = cp.confidence; np = cp; }
  }
  if (!node && kind) {
    const branch = pick(req, A, nodeKey(kind), undefined, titleOf);
    if (branch && branch.value !== NONE) {
      node = branch.value; np = branch;
      chainConf = Math.min(kindConf, branch.confidence);
    } else {
      nodeSet = env.nodesOfKind(kind).map((n) => n.id);
      chainConf = kindConf;
      if (branch) np = branch;
    }
  } else if (!node) {
    chainConf = Math.min(spaceConf, kindConf);
  }
  if (!node && !structural && !nodeSet && intent !== 'propose' && intent !== 'check') {
    // the chain found nothing: an unconfident candidate is still the best offer
    const cp = pick(req, A, 'cand', undefined, titleOf);
    if (cp && cp.value !== NONE) { node = cp.value; chainConf = cp.confidence; np = cp; }
  }
  if (node) {
    const alts = np?.alternatives ?? (A.cand ? alternatives(A.cand, criteriaOf(req, 'cand'), node, titleOf) : []);
    decisions.push({ key: 'node', value: node, label: titleOf(node), confidence: chainConf, alternatives: alts });
  } else if (np) {
    decisions.push({ key: 'node', value: NONE, label: kind ? `any ${kind}` : 'none', confidence: np.confidence, alternatives: np.alternatives });
  }

  // band
  let band: Band; let confidence: number;
  const needsTarget = intent === 'navigate' || intent === 'ask' || intent === 'explain';
  if (intent === NONE) { band = 'ask'; confidence = Math.min(intentConf, 0.39); }
  else if (needsTarget && !node && !nodeSet?.length) { band = 'ask'; confidence = Math.min(intentConf, chainConf); }
  else {
    const iThr = thresholdFor('route-utterance');
    // propose names a kind to add; the node (if any) is only its anchor
    // check with no target is a project-wide check: only the intent has to be sure (CHECKS-SPEC §6)
    const projectCheck = intent === 'check' && !node && !nodeSet?.length;
    const cConf = intent === 'propose' ? kindConf : projectCheck ? intentConf : chainConf;
    const cThr = intent === 'propose' ? thresholdFor('find-by-title') : projectCheck ? iThr : chainThreshold;
    confidence = Math.min(intentConf, cConf);
    band = intentConf >= iThr && cConf >= cThr ? 'act' : bandFor(confidence, Infinity);
  }

  // target path in the chosen perspective; fall back to the current one, any other, then raw
  let target: TurnResolution['target'];
  if (node) {
    const order = [persp, held.persp, ...env.perspIds.filter((p) => p !== persp && p !== held.persp && p !== 'raw')];
    for (const p of order) {
      if (p === 'raw') continue;
      const path = env.resolvePath(p, node);
      if (path && path.length) { target = { persp: p, path }; break; }
    }
    target ??= { persp: 'raw', path: [node] };
  }

  return { intent, band, confidence: +confidence.toFixed(3), decisions, usesContext, target, nodeSet, fake: response.fake };
}

/** Runners-up for offer chips: the weakest decision's top value plus two alternatives. */
export function offerChips(r: TurnResolution, max = 3): Option[] {
  const d = r.decisions.find((x) => x.key === 'node') ?? r.decisions.find((x) => x.key === 'kind') ?? r.decisions.find((x) => x.key === 'intent');
  if (!d) return [];
  const top: Option[] = d.value !== NONE ? [{ value: d.value, label: d.label, confidence: d.confidence }] : [];
  return [...top, ...d.alternatives].slice(0, max);
}
export const offerKey = (r: TurnResolution): RepairKey =>
  (r.decisions.find((x) => x.key === 'node') ?? r.decisions.find((x) => x.key === 'kind') ?? { key: 'intent' as RepairKey }).key;
