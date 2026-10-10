import type { ChangeImpactReport, ImpactPatchOperation, ImpactProperty, ImpactWitness, ModelObject, WorldSnapshot } from '@bropilot/contracts';

export type ImpactSelection = {
  title: string;
  witness: ImpactWitness;
  baseline: WorldSnapshot;
  proposed: WorldSnapshot;
};
const drafts = new Map<string, ImpactPatchOperation[]>();
export function draftKey(worldId: string, baselineHash: string) { return `${worldId}/${baselineHash}`; }
export function readImpactDraft(key: string): ImpactPatchOperation[] { return (drafts.get(key) ?? []).map(operation => ({ ...operation })); }
export function writeImpactDraft(key: string, operations: ImpactPatchOperation[]) { drafts.set(key, operations.map(operation => ({ ...operation }))); }

/** Tokens bind a response to both its pinned baseline and its edited inputs. */
export function createImpactFence() {
  let version = 0;
  let controller: AbortController | undefined;
  return {
    invalidate() { version++; controller?.abort(); controller = undefined; },
    begin(baselineHash: string) {
      controller?.abort(); controller = new AbortController();
      return { version: ++version, baselineHash, signal: controller.signal };
    },
    current(token: { version: number; baselineHash: string }, baselineHash: string) { return token.version === version && token.baselineHash === baselineHash; },
  };
}

export function impactObjectName(id: string, baseline: WorldSnapshot, proposed?: WorldSnapshot) {
  return proposed?.objects.find(object => object.id === id)?.title ?? baseline.objects.find(object => object.id === id)?.title
    ?? proposed?.things.find(thing => thing.id === id)?.title ?? baseline.things.find(thing => thing.id === id)?.title ?? 'Unresolved model object';
}
export function semanticProperties(object: ModelObject): readonly ImpactProperty[] {
  if (!['declared', 'observation'].includes(object.source.kind)) return [];
  if (object.kind === 'planItem') return ['status', 'plannedAt', 'taskId'] as const;
  if (object.kind === 'completionObservation') return ['completedAt', 'taskId'] as const;
  if (object.kind === 'metric') return ['windowStart', 'windowEnd'] as const;
  if (['task', 'goal', 'outcome', 'indicator', 'capability', 'operation', 'interface', 'adapter', 'service', 'store', 'calendarBlock', 'acceptanceCriterion'].includes(object.kind)) return ['statement'] as const;
  return [];
}
export function reportSummary(report: ChangeImpactReport) {
  return report.complete ? 'Complete within declared model scopes' : 'Incomplete: review diagnostics and scope declarations';
}
