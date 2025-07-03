/**
 * SyncManager: Orchestrates bidirectional sync between code and knowledge graph.
 * Implements content-based sync for all entity types.
 */

import { KnowledgeGraph } from '../knowledgeGraph/KnowledgeGraph.js';
import * as fs from 'fs';
import * as path from 'path';
import { CodeAnalyzer } from './CodeAnalyzer.js';
import { ChangeDetector } from './ChangeDetector.js';
import { ConflictMerger } from './ConflictMerger.js';
import { SyncHistory, SyncHistoryEntry } from './SyncHistory.js';

export interface SyncStatus {
  lastSync: Date;
  pendingChanges: {
    inCode: Change[];
    inKnowledgeGraph: Change[];
  };
  conflicts: Conflict[];
  summary: {
    codeAhead: number;
    kgAhead: number;
    inSync: number;
    conflicted: number;
  };
}

export interface Change {
  type: 'added' | 'modified' | 'deleted';
  entity: {
    type: string;
    id: string;
    name: string;
  };
  location: {
    source: 'code' | 'knowledge_graph';
    path?: string;
  };
  detected: Date;
  details: string;
}

export interface Conflict {
  entity: {
    type: string;
    id: string;
    name: string;
  };
  description: string;
  codeChange?: Change;
  kgChange?: Change;
}

export interface SyncOptions {
  dryRun?: boolean;
  force?: boolean;
  modules?: string[];
  to?: string; // for rollback
  strategy?: 'use_code' | 'use_kg' | 'merge' | 'manual';
}

const ENTITY_TYPES = [
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
];

export class SyncManager {
  private kg: KnowledgeGraph;
  private analyzer: CodeAnalyzer;
  private differ: ChangeDetector;
  private conflictMerger: ConflictMerger;
  private history: SyncHistory;

  constructor(kg: KnowledgeGraph) {
    this.kg = kg;
    this.analyzer = new CodeAnalyzer();
    this.differ = new ChangeDetector();
    this.conflictMerger = new ConflictMerger();
    this.history = new SyncHistory();
    // TODO: instantiate optimizer
  }

  /**
   * Get sync status for all entity types and modules.
   */
  async getStatus(options: SyncOptions): Promise<SyncStatus> {
    const modulesDir = path.resolve(process.cwd(), 'src/modules');
    const codeEntities: any[] = [];
    const kgEntities: any[] = [];

    // 1. Scan codebase for all modules and entity types
    if (fs.existsSync(modulesDir)) {
      for (const moduleName of fs.readdirSync(modulesDir)) {
        const modulePath = path.join(modulesDir, moduleName);
        if (!fs.statSync(modulePath).isDirectory()) continue;
        for (const entityType of ENTITY_TYPES) {
          const entityDir = path.join(modulePath, entityType + 's');
          if (
            fs.existsSync(entityDir) &&
            fs.statSync(entityDir).isDirectory()
          ) {
            for (const file of fs.readdirSync(entityDir)) {
              if (file.endsWith('.ts')) {
                const filePath = path.join(entityDir, file);
                const entities = await this.analyzer.analyzeFile(
                  filePath,
                  'typescript',
                );
                if (entities) {
                  for (const ent of entities) {
                    if (
                      !options.modules ||
                      options.modules.includes(moduleName)
                    ) {
                      codeEntities.push(ent);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // 2. Get all entities from KG for all types and modules
    if (this.kg.getModules) {
      const modules = await this.kg.getModules();
      for (const mod of modules) {
        if (options.modules && !options.modules.includes(mod.name)) continue;
        for (const entityType of ENTITY_TYPES) {
          // Try to call get<EntityType>sByModule if exists
          const methodName = `get${capitalize(entityType)}sByModule`;
          if (typeof (this.kg as any)[methodName] === 'function') {
            const kgTypeEntities = await (this.kg as any)[methodName](mod.id);
            kgEntities.push(
              ...kgTypeEntities.map((t: any) => ({
                ...t,
                type: entityType,
                module: mod.name,
              })),
            );
          }
        }
      }
    }

    // 3. Compare code and KG entities for all types
    const changesInCode = await this.differ.compare(codeEntities, kgEntities);
    const changesInKG = await this.differ.compare(kgEntities, codeEntities);

    // 4. Detect conflicts (for now, mark as conflict if both code and KG have 'modified' for same entity)
    const conflicts: Conflict[] = [];
    const codeModified = new Map(
      changesInCode
        .filter((c) => c.type === 'modified')
        .map((c) => [c.entity.id, c]),
    );
    const kgModified = new Map(
      changesInKG
        .filter((c) => c.type === 'modified')
        .map((c) => [c.entity.id, c]),
    );
    for (const [id, codeChange] of codeModified.entries()) {
      if (kgModified.has(id)) {
        conflicts.push({
          entity: codeChange.entity,
          description: 'Both code and KG modified entity structure',
          codeChange,
          kgChange: kgModified.get(id),
        });
      }
    }

    // 5. Build summary
    const inSyncCount = codeEntities.length - changesInCode.length;
    const status: SyncStatus = {
      lastSync: new Date(), // TODO: load from history
      pendingChanges: {
        inCode: changesInCode,
        inKnowledgeGraph: changesInKG,
      },
      conflicts,
      summary: {
        codeAhead: changesInCode.length,
        kgAhead: changesInKG.length,
        inSync: inSyncCount,
        conflicted: conflicts.length,
      },
    };

    return status;
  }

  async pull(options: SyncOptions): Promise<void> {
    // Pulling changes from code to knowledge graph...
    // 1. Gather code entities
    const modulesDir = path.resolve(process.cwd(), 'src/modules');
    const codeEntities: any[] = [];
    if (fs.existsSync(modulesDir)) {
      for (const moduleName of fs.readdirSync(modulesDir)) {
        const modulePath = path.join(modulesDir, moduleName);
        if (!fs.statSync(modulePath).isDirectory()) continue;
        for (const entityType of ENTITY_TYPES) {
          const entityDir = path.join(modulePath, entityType + 's');
          if (
            fs.existsSync(entityDir) &&
            fs.statSync(entityDir).isDirectory()
          ) {
            for (const file of fs.readdirSync(entityDir)) {
              if (file.endsWith('.ts')) {
                const filePath = path.join(entityDir, file);
                const entities = await this.analyzer.analyzeFile(
                  filePath,
                  'typescript',
                );
                if (entities) {
                  for (const ent of entities) {
                    if (
                      !options.modules ||
                      options.modules.includes(moduleName)
                    ) {
                      codeEntities.push(ent);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // 2. Gather KG entities
    const kgEntities: any[] = [];
    if (this.kg.getModules) {
      const modules = await this.kg.getModules();
      for (const mod of modules) {
        if (options.modules && !options.modules.includes(mod.name)) continue;
        for (const entityType of ENTITY_TYPES) {
          const methodName = `get${capitalize(entityType)}sByModule`;
          if (typeof (this.kg as any)[methodName] === 'function') {
            const kgTypeEntities = await (this.kg as any)[methodName](mod.id);
            kgEntities.push(
              ...kgTypeEntities.map((t: any) => ({
                ...t,
                type: entityType,
                module: mod.name,
              })),
            );
          }
        }
      }
    }

    // 3. Detect changes in code (to be pulled into KG)
    const changes = await this.differ.compare(codeEntities, kgEntities);

    // 4. Detect conflicts
    const kgChanges = await this.differ.compare(kgEntities, codeEntities);
    const conflicts = await this.conflictMerger.detectConflicts(
      changes,
      kgChanges,
    );

    if (conflicts.length > 0) {
      // Conflicts detected
      // Prompt for resolution strategy if not provided
      for (const conflict of conflicts) {
        let strategy = options.strategy;
        if (!strategy) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const input = await new Promise<string>((resolve) => {
            rl.question(
              `Resolve conflict for ${conflict.entity.name} (use_code/use_kg/merge/manual)? `,
              resolve,
            );
          });
          rl.close();
          const allowed = ['use_code', 'use_kg', 'merge', 'manual'];
          if (allowed.includes(input.trim())) {
            strategy = input.trim() as unknown as typeof strategy;
          } else {
            strategy = 'manual';
          }
        }
        await this.conflictMerger.resolveConflict(
          conflict,
          strategy || 'manual',
        );
      }
      // After conflict resolution, return (do not apply changes until resolved)
      return;
    }

    if (changes.length === 0) {
      // No changes to pull.
      return;
    }

    // 5. Show what will be pulled
    // Found changes: ${changes.length}
    // Details omitted for production cleanliness

    // 6. Dry run mode
    if (options.dryRun) {
      // Dry run - no changes applied.
      return;
    }

    // 7. Confirm if not forced
    if (!options.force) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await new Promise<string>((resolve) => {
        rl.question(
          'Apply these changes to the knowledge graph? (y/N): ',
          resolve,
        );
      });
      rl.close();
      if (answer.trim().toLowerCase() !== 'y') {
        // Aborted.
        return;
      }
    }

    // 8. Apply changes to KG (stub: just print for now)
    let success = 0;
    let failed = 0;
    for (const change of changes) {
      try {
        // TODO: Implement actual KG update logic for each entity type
        // Example: this.kg.addThing(moduleId, entity) or this.kg.updateThing(...)
        success++;
      } catch (err) {
        // Failed to apply change
        failed++;
      }
    }

    // 9. Show results
    // Successfully pulled changes: ${success}
    // Failed to pull changes: ${failed}

    // 10. Update sync metadata (stub)
    await this.history.recordSync('pull', {
      modules: options.modules,
      dryRun: options.dryRun,
    });
  }

  async push(options: SyncOptions): Promise<void> {
    // Pushing changes from knowledge graph to code...
    // 1. Gather code entities
    const modulesDir = path.resolve(process.cwd(), 'src/modules');
    const codeEntities: any[] = [];
    if (fs.existsSync(modulesDir)) {
      for (const moduleName of fs.readdirSync(modulesDir)) {
        const modulePath = path.join(modulesDir, moduleName);
        if (!fs.statSync(modulePath).isDirectory()) continue;
        for (const entityType of ENTITY_TYPES) {
          const entityDir = path.join(modulePath, entityType + 's');
          if (
            fs.existsSync(entityDir) &&
            fs.statSync(entityDir).isDirectory()
          ) {
            for (const file of fs.readdirSync(entityDir)) {
              if (file.endsWith('.ts')) {
                const filePath = path.join(entityDir, file);
                const entities = await this.analyzer.analyzeFile(
                  filePath,
                  'typescript',
                );
                if (entities) {
                  for (const ent of entities) {
                    if (
                      !options.modules ||
                      options.modules.includes(moduleName)
                    ) {
                      codeEntities.push(ent);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // 2. Gather KG entities
    const kgEntities: any[] = [];
    if (this.kg.getModules) {
      const modules = await this.kg.getModules();
      for (const mod of modules) {
        if (options.modules && !options.modules.includes(mod.name)) continue;
        for (const entityType of ENTITY_TYPES) {
          const methodName = `get${capitalize(entityType)}sByModule`;
          if (typeof (this.kg as any)[methodName] === 'function') {
            const kgTypeEntities = await (this.kg as any)[methodName](mod.id);
            kgEntities.push(
              ...kgTypeEntities.map((t: any) => ({
                ...t,
                type: entityType,
                module: mod.name,
              })),
            );
          }
        }
      }
    }

    // 3. Detect changes in KG (to be pushed to code)
    const changes = await this.differ.compare(kgEntities, codeEntities);

    // 4. Detect conflicts
    const codeChanges = await this.differ.compare(codeEntities, kgEntities);
    const conflicts = await this.conflictMerger.detectConflicts(
      codeChanges,
      changes,
    );

    if (conflicts.length > 0) {
      // Conflicts detected
      // Prompt for resolution strategy if not provided
      for (const conflict of conflicts) {
        let strategy = options.strategy;
        if (!strategy) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          const input = await new Promise<string>((resolve) => {
            rl.question(
              `Resolve conflict for ${conflict.entity.name} (use_code/use_kg/merge/manual)? `,
              resolve,
            );
          });
          rl.close();
          const allowed = ['use_code', 'use_kg', 'merge', 'manual'];
          if (allowed.includes(input.trim())) {
            strategy = input.trim() as unknown as typeof strategy;
          } else {
            strategy = 'manual';
          }
        }
        await this.conflictMerger.resolveConflict(
          conflict,
          strategy || 'manual',
        );
      }
      // After conflict resolution, return (do not apply changes until resolved)
      return;
    }

    if (changes.length === 0) {
      // No changes to push.
      return;
    }

    // 5. Show what will be pushed
    // Found changes: ${changes.length}
    // Details omitted for production cleanliness

    // 6. Dry run mode
    if (options.dryRun) {
      // Dry run - no changes applied.
      return;
    }

    // 7. Confirm if not forced
    if (!options.force) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await new Promise<string>((resolve) => {
        rl.question('Apply these changes to the codebase? (y/N): ', resolve);
      });
      rl.close();
      if (answer.trim().toLowerCase() !== 'y') {
        // Aborted.
        return;
      }
    }

    // 8. Apply changes to code (stub: just print for now)
    let success = 0;
    let failed = 0;
    for (const change of changes) {
      try {
        // TODO: Implement actual code generation/update logic for each entity type
        // Example: this.generator.generateThing(moduleId, entity) or this.generator.updateThing(...)
        success++;
      } catch (err) {
        // Failed to apply change
        failed++;
      }
    }

    // 9. Show results
    // Successfully pushed changes: ${success}
    // Failed to push changes: ${failed}

    // 10. Update sync metadata (stub)
    await this.history.recordSync('push', {
      modules: options.modules,
      dryRun: options.dryRun,
    });
  }

  async showHistory(options: SyncOptions): Promise<void> {
    const history: SyncHistoryEntry[] = await this.history.getHistory();
    if (history.length === 0) {
      // No sync history found.
      return;
    }
    // Sync History output removed for production cleanliness
  }

  async rollback(to: string): Promise<void> {
    await this.history.rollback(to);
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
