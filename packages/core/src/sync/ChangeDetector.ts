/**
 * ChangeDetector: Compares code and knowledge graph to detect changes.
 * Supports all entity types: things, behaviors, flows, features, etc.
 */

import type { Change } from './SyncManager.js';

export class ChangeDetector {
  /**
   * Compare code entities and KG entities for a given entity type.
   * Returns a list of changes: added, modified, deleted.
   * @param codeEntities Array of entities extracted from code (ExtractedEntity[])
   * @param kgEntities Array of entities from the knowledge graph (KGEntity[])
   */
  async compare(codeEntities: any[], kgEntities: any[]): Promise<Change[]> {
    const changes: Change[] = [];
    const now = new Date();

    // Build lookup maps
    const codeMap = new Map<string, any>();
    for (const ent of codeEntities) {
      codeMap.set(`${ent.module || ''}:${ent.type}:${ent.name}`, ent);
    }
    const kgMap = new Map<string, any>();
    for (const ent of kgEntities) {
      kgMap.set(`${ent.module || ''}:${ent.type}:${ent.name}`, ent);
    }

    // Detect added/modified in code
    for (const [key, codeEnt] of codeMap.entries()) {
      if (!kgMap.has(key)) {
        changes.push({
          type: 'added',
          entity: {
            type: codeEnt.type,
            id: key,
            name: codeEnt.name,
          },
          location: {
            source: 'code',
            path: codeEnt.filePath,
          },
          detected: now,
          details: 'Exists in code but not in KG',
        });
      } else {
        // Compare properties/methods for modification
        const kgEnt = kgMap.get(key);
        if (
          JSON.stringify(codeEnt.properties || []) !==
            JSON.stringify(kgEnt.properties || []) ||
          JSON.stringify(codeEnt.methods || []) !==
            JSON.stringify(kgEnt.methods || [])
        ) {
          changes.push({
            type: 'modified',
            entity: {
              type: codeEnt.type,
              id: key,
              name: codeEnt.name,
            },
            location: {
              source: 'code',
              path: codeEnt.filePath,
            },
            detected: now,
            details: 'Entity structure differs between code and KG',
          });
        }
      }
    }

    // Detect deleted in code (exists in KG but not in code)
    for (const [key, kgEnt] of kgMap.entries()) {
      if (!codeMap.has(key)) {
        changes.push({
          type: 'deleted',
          entity: {
            type: kgEnt.type,
            id: key,
            name: kgEnt.name,
          },
          location: {
            source: 'knowledge_graph',
          },
          detected: now,
          details: 'Exists in KG but not in code',
        });
      }
    }

    return changes;
  }
}
