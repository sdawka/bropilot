import { describe, expect, it } from 'vitest';
import { deploymentEligibility, latestDeploymentObservation } from './deployment-state';

const target = { targetId: 'production', thingId: 'web-app', connectionId: 'connection-1', accountId: 'account-1', workerName: 'assistant-web', ownerPrincipalId: 'owner-1' };
const packageRef = { key: 'packages/revision-1.tar', packageDigest: 'digest' };

describe('deploymentEligibility', () => {
  it('only allows the promoted head with its retained package and a connected account', () => {
    expect(deploymentEligibility({
      revisionId: 'revision-1', headRevisionId: 'revision-1', packageRef, target, connectionStatus: 'connected', activeDeployment: undefined,
    })).toEqual({ eligible: true });
  });

  it('explains why a non-head or unretained revision cannot be deployed', () => {
    expect(deploymentEligibility({
      revisionId: 'revision-old', headRevisionId: 'revision-1', packageRef, target, connectionStatus: 'connected', activeDeployment: undefined,
    })).toEqual({ eligible: false, reason: 'Open the current canonical version before deploying.' });
    expect(deploymentEligibility({
      revisionId: 'revision-1', headRevisionId: 'revision-1', packageRef: undefined, target, connectionStatus: 'connected', activeDeployment: undefined,
    })).toEqual({ eligible: false, reason: 'This version has no retained verified package.' });
  });

  it('blocks a second action while a deployment outcome is uncertain', () => {
    expect(deploymentEligibility({
      revisionId: 'revision-1', headRevisionId: 'revision-1', packageRef, target, connectionStatus: 'connected', activeDeployment: { status: 'uncertain' },
    })).toEqual({ eligible: false, reason: 'A deployment outcome is uncertain. Refresh its status before trying again.' });
  });
});

describe('latestDeploymentObservation', () => {
  it('keeps an unhealthy observation visible instead of treating publication as ready', () => {
    expect(latestDeploymentObservation('deploy-1', [
      { deploymentId: 'deploy-1', observationId: 'observation-1', healthy: true, summary: 'old', observedAtMs: 1 },
      { deploymentId: 'deploy-1', observationId: 'observation-2', healthy: false, summary: 'health endpoint timed out', observedAtMs: 2 },
    ])).toMatchObject({ healthy: false, summary: 'health endpoint timed out' });
  });

  it('does not let a later passing API probe hide a failed health probe', () => {
    expect(latestDeploymentObservation('deploy-1', [
      { deploymentId: 'deploy-1', observationId: 'health-failed', healthy: false, summary: 'health: endpoint timed out', observedAtMs: 1 },
      { deploymentId: 'deploy-1', observationId: 'api-passed', healthy: true, summary: 'api: endpoint responded', observedAtMs: 2 },
    ])).toMatchObject({ observationId: 'health-failed', healthy: false });
  });

  it('accepts a later recovery for the same health surface', () => {
    expect(latestDeploymentObservation('deploy-1', [
      { deploymentId: 'deploy-1', observationId: 'health-failed', healthy: false, summary: 'health: endpoint timed out', observedAtMs: 1 },
      { deploymentId: 'deploy-1', observationId: 'api-passed', healthy: true, summary: 'api: endpoint responded', observedAtMs: 2 },
      { deploymentId: 'deploy-1', observationId: 'health-recovered', healthy: true, summary: 'health: endpoint responded', observedAtMs: 3 },
    ])).toMatchObject({ observationId: 'health-recovered', healthy: true });
  });
});
