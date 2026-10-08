import type { ModelObject } from '@bropilot/contracts';

export function ancestry(objects: ModelObject[], targetId?: string): ModelObject[] {
  if (!targetId) return [];
  const byId = new Map(objects.map((object) => [object.id, object]));
  const result: ModelObject[] = [];
  const visited = new Set<string>();
  let item = byId.get(targetId);
  while (item && !visited.has(item.id)) { result.unshift(item); visited.add(item.id); item = item.parentId ? byId.get(item.parentId) : undefined; }
  return result;
}

export function hierarchyPath(objects: ModelObject[], targetId?: string) { return ancestry(objects, targetId).map((item) => item.id).join('/'); }
