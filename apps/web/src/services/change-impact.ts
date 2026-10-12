import type { ChangeImpactApiRequest, ChangeImpactApiResponse } from '@bropilot/contracts';
import { WorldApiError } from './world-api';

/** Analysis is advisory: this endpoint never sends a World command. */
export async function analyzeChangeImpact(worldId: string, request: ChangeImpactApiRequest, signal?: AbortSignal): Promise<ChangeImpactApiResponse> {
  const response = await fetch(`/api/v1/worlds/${encodeURIComponent(worldId)}/analysis/change-impact`, {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
  });
  const body = await response.json() as ChangeImpactApiResponse & { status?: string; message?: string; code?: string };
  if (!response.ok || body.status === 'error') throw new WorldApiError(body.message ?? 'Change analysis could not be completed.', body.code, response.status);
  if (!body.report || !body.baselineSnapshot || !body.targetSnapshot) {
    throw new WorldApiError('The World service returned an unexpected analysis response.', undefined, response.status);
  }
  return body;
}
