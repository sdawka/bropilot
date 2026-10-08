import { expect, it } from 'vitest';
import { hierarchyPath } from './hierarchy';
import type { ModelObject } from '@bropilot/contracts';
const source = { kind: 'declared' as const, reference: 'test' };
const objects = [{ id: 'world', kind: 'world', title: 'World', properties: {}, source }, { id: 'thing', kind: 'thing', title: 'Thing', parentId: 'world', properties: {}, source }, { id: 'operation', kind: 'operation', title: 'Operation', parentId: 'thing', properties: {}, source }] satisfies ModelObject[];
it('builds a path from the target ancestry', () => expect(hierarchyPath(objects, 'thing')).toBe('world/thing'));
it('stops circular parent links', () => expect(hierarchyPath([{ ...objects[0], parentId: 'world' }], 'world')).toBe('world'));
