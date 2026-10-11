import type { ChangeImpactApiRequest, ChangeImpactApiResponse, CoreResponse, EvidenceBinding, WorldSnapshot } from '@bropilot/contracts';

/** Only the revision resolver may supply saved facts and evidence provenance. */
export interface ChangeImpactDependencies {
  readBody(request: Request): Promise<unknown | Response>;
  resolveRevision(revisionId: string): Promise<WorldSnapshot | Response | null>;
  evidenceBindings?(baseline: WorldSnapshot): readonly EvidenceBinding[];
  query(input: string): string;
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const result = new Headers(headers);
  result.set('content-type', 'application/json; charset=utf-8');
  result.set('cache-control', 'no-store');
  result.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(value), { status, headers: result });
}
function error(code: string, message: string, status = 400): Response {
  return json({ status: 'error', apiVersion: 1, code, message }, status);
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}
function identity(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
function analysisRequest(value: unknown): ChangeImpactApiRequest | undefined {
  const body = record(value);
  if (!body || !keys(body, ['baselineRevisionId', 'target']) || !identity(body.baselineRevisionId)) return undefined;
  const target = record(body.target);
  if (!target) return undefined;
  if (target.kind === 'saved' && keys(target, ['kind', 'revisionId']) && identity(target.revisionId)) {
    return { baselineRevisionId: body.baselineRevisionId, target: { kind: 'saved', revisionId: target.revisionId } };
  }
  if (target.kind === 'hypothetical' && keys(target, ['kind', 'patch'])) {
    const patch = record(target.patch);
    if (patch && keys(patch, ['operations']) && Array.isArray(patch.operations)) {
      // Rust owns operation validation, typed references, limits, and application.
      return body as ChangeImpactApiRequest;
    }
  }
  return undefined;
}
function core(deps: ChangeImpactDependencies, snapshot: WorldSnapshot, query: unknown): CoreResponse | Response {
  const result: CoreResponse = JSON.parse(deps.query(JSON.stringify({ apiVersion: 1, snapshot, query })));
  return result.status === 'error' ? json(result, result.code === 'resource_limit' ? 413 : 400) : result;
}

/** A read-only analysis: no command execution, authority writes, or draft persistence. */
export async function handleChangeImpact(request: Request, worldId: string, deps: ChangeImpactDependencies): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ status: 'error', apiVersion: 1, code: 'method_not_allowed', message: 'Use POST for change impact analysis.' }, 405, { Allow: 'POST' });
  }
  if (!identity(worldId)) return error('invalid_identity', 'Invalid World identity.');
  const body = await deps.readBody(request);
  if (body instanceof Response) return body;
  const input = analysisRequest(body);
  if (!input) return error('invalid_input', 'Provide a baseline revision and one saved revision or typed hypothetical patch.');
  const baseline = await deps.resolveRevision(input.baselineRevisionId);
  if (baseline instanceof Response) return baseline;
  if (!baseline || baseline.worldId !== worldId || baseline.revisionId !== input.baselineRevisionId) {
    return error('revision_not_found', 'This pinned revision is unavailable.', 404);
  }
  let target: WorldSnapshot;
  if (input.target.kind === 'saved') {
    const saved = await deps.resolveRevision(input.target.revisionId);
    if (saved instanceof Response) return saved;
    if (!saved || saved.worldId !== worldId || saved.revisionId !== input.target.revisionId) {
      return error('revision_not_found', 'This pinned revision is unavailable.', 404);
    }
    target = saved;
  } else {
    const patched = core(deps, baseline, { kind: 'applyImpactPatch', patch: input.target.patch, draftRevisionId: `draft:${crypto.randomUUID()}` });
    if (patched instanceof Response) return patched;
    if (patched.status !== 'ok' || patched.result.kind !== 'impactPatched') return error('core_unavailable', 'The World service returned an unexpected patch response.', 500);
    target = patched.result.snapshot;
    if (target.worldId !== worldId || target.revisionId === baseline.revisionId || !target.revisionId.startsWith('draft:')) {
      return error('core_unavailable', 'The World service returned an invalid draft identity.', 500);
    }
  }
  const evaluated = core(deps, target, { kind: 'changeImpact', baseline, context: {
    origin: input.target.kind, evidenceBindings: deps.evidenceBindings?.(baseline) ?? [],
  } });
  if (evaluated instanceof Response) return evaluated;
  if (evaluated.status !== 'ok' || evaluated.result.kind !== 'changeImpact') return error('core_unavailable', 'The World service returned an unexpected analysis response.', 500);
  const response: ChangeImpactApiResponse = { report: evaluated.result.report, baselineSnapshot: baseline, targetSnapshot: target };
  return json(response);
}
