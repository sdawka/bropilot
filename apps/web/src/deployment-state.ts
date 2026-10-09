import type { DeploymentRecord, DeploymentTarget, RuntimeObservation } from '@bropilot/contracts';

export type DeploymentTargetView = DeploymentTarget;
export type DeploymentView = Pick<DeploymentRecord, 'deploymentId' | 'targetId' | 'revisionId' | 'packageRef' | 'status' | 'providerVersionId' | 'url' | 'failure' | 'rollbackOfDeploymentId'>;
export type RuntimeObservationView = RuntimeObservation;

type EligibilityInput = {
  revisionId: string;
  headRevisionId: string;
  packageRef?: unknown;
  target?: DeploymentTargetView;
  connectionStatus?: string;
  activeDeployment?: Pick<DeploymentView, 'status'>;
};

export function deploymentEligibility(input: EligibilityInput): { eligible: true } | { eligible: false; reason: string } {
  if (input.revisionId !== input.headRevisionId) return { eligible: false, reason: 'Open the current canonical version before deploying.' };
  if (!input.packageRef) return { eligible: false, reason: 'This version has no retained verified package.' };
  if (!input.target) return { eligible: false, reason: 'Connect Cloudflare before creating a deployment target.' };
  if (input.connectionStatus !== 'connected') return { eligible: false, reason: 'Reconnect Cloudflare before deploying.' };
  if (input.activeDeployment?.status === 'uncertain') return { eligible: false, reason: 'A deployment outcome is uncertain. Refresh its status before trying again.' };
  if (input.activeDeployment?.status === 'queued' || input.activeDeployment?.status === 'running') return { eligible: false, reason: 'A deployment is already in progress.' };
  return { eligible: true };
}

export function latestDeploymentObservation(deploymentId: string, observations: RuntimeObservationView[]) {
  const relevant = observations.filter(observation => observation.deploymentId === deploymentId);
  const surfaceObservations = new Map<string, RuntimeObservationView>();
  for (const observation of relevant) {
    const surface = /^(health|page|api):/i.exec(observation.summary)?.[1]?.toLowerCase();
    if (!surface) continue;
    const previous = surfaceObservations.get(surface);
    if (!previous || observation.observedAtMs > previous.observedAtMs) surfaceObservations.set(surface, observation);
  }
  const failedSurface = [...surfaceObservations.values()]
    .filter(observation => !observation.healthy)
    .sort((left, right) => right.observedAtMs - left.observedAtMs)[0];
  return failedSurface ?? relevant.sort((left, right) => right.observedAtMs - left.observedAtMs)[0];
}
