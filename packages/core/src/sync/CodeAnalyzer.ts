/**
 * CodeAnalyzer: Extracts entities and changes from code files.
 * Supports all entity types: things, behaviors, flows, features, etc.
 */

import type { Change } from './SyncManager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type { NodePath, Visitor } from '@babel/traverse';
import type * as t from '@babel/types';

type EntityType =
  | 'thing'
  | 'behavior'
  | 'flow'
  | 'feature'
  | 'component'
  | 'domain'
  | 'module'
  | 'contract'
  | 'screen'
  | 'infrastructure'
  | 'application'
  | 'release'
  | string;

interface ExtractedEntity {
  type: EntityType;
  name: string;
  module?: string;
  properties?: string[];
  methods?: string[];
  filePath: string;
}

export class CodeAnalyzer {
  /**
   * Analyze a TypeScript file and extract all exported entities.
   * Infers entity type from file path or naming conventions.
   */
  async analyzeFile(
    filePath: string,
    language: string,
  ): Promise<ExtractedEntity[] | null> {
    if (language !== 'typescript' && language !== 'ts') {
      // Only TypeScript supported for now
      return null;
    }

    let code: string;
    try {
      code = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      return null;
    }

    let ast;
    try {
      ast = parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'decorators-legacy', 'classProperties'],
      });
    } catch (err) {
      return null;
    }

    const entities: ExtractedEntity[] = [];
    const { entityType, moduleName } = inferEntityTypeAndModule(filePath);

    const visitor: Visitor = {
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
        const decl = path.node.declaration;
        if (!decl) return;

        if (decl.type === 'ClassDeclaration' && decl.id) {
          // Exported class
          const name = decl.id.name;
          const properties: string[] = [];
          const methods: string[] = [];

          if (decl.body && decl.body.body) {
            for (const member of decl.body.body) {
              if (
                member.type === 'ClassProperty' &&
                member.key.type === 'Identifier'
              ) {
                properties.push(member.key.name);
              }
              if (
                (member.type === 'ClassMethod' ||
                  member.type === 'TSDeclareMethod') &&
                member.key.type === 'Identifier'
              ) {
                methods.push(member.key.name);
              }
            }
          }

          entities.push({
            type: entityType,
            name,
            module: moduleName,
            properties,
            methods,
            filePath,
          });
        } else if (decl.type === 'FunctionDeclaration' && decl.id) {
          // Exported function (could be a behavior, flow, etc.)
          const name = decl.id.name;
          entities.push({
            type: entityType,
            name,
            module: moduleName,
            filePath,
          });
        }
      },
      ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
        // Handle default export class/function
        const decl = path.node.declaration;
        if (!decl) return;
        if (decl.type === 'ClassDeclaration' && decl.id) {
          const name = decl.id.name;
          entities.push({
            type: entityType,
            name,
            module: moduleName,
            filePath,
          });
        } else if (decl.type === 'FunctionDeclaration' && decl.id) {
          const name = decl.id.name;
          entities.push({
            type: entityType,
            name,
            module: moduleName,
            filePath,
          });
        }
      },
    };

    // FIX: Use traverse.default for correct callable
    (traverse as any).default(ast, visitor);

    return entities.length > 0 ? entities : null;
  }
}

/**
 * Infer entity type and module from file path.
 * Example: src/modules/user/things/User.ts => { entityType: 'thing', moduleName: 'user' }
 */
function inferEntityTypeAndModule(filePath: string): {
  entityType: EntityType;
  moduleName?: string;
} {
  // Normalize and split path
  const parts = filePath.split(path.sep);
  // Look for /modules/<module>/<entityType>/<name>.ts
  const modulesIdx = parts.lastIndexOf('modules');
  if (modulesIdx >= 0 && parts.length > modulesIdx + 2) {
    const moduleName = parts[modulesIdx + 1];
    const entityTypeRaw = parts[modulesIdx + 2];
    // crude plural-to-singular
    let entityType = entityTypeRaw.replace(/s$/, '');
    // fallback to file name if not recognized
    if (
      ![
        'thing',
        'behavior',
        'flow',
        'feature',
        'component',
        'domain',
        'module',
        'contract',
        'screen',
        'infrastructure',
        'application',
        'release',
      ].includes(entityType)
    ) {
      entityType = 'thing';
    }
    return { entityType, moduleName };
  }
  // fallback: use file name
  const base = path.basename(filePath, '.ts').toLowerCase();
  return { entityType: base, moduleName: undefined };
}
