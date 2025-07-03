// ReleaseManager: Core release management logic for Bropilot

import * as path from 'path';
import * as fs from 'fs-extra';
import * as semver from 'semver';
import deepEqual from 'deep-equal';
import * as yaml from 'js-yaml';

import { KnowledgeGraph } from './knowledgeGraph/KnowledgeGraph.js';
import { ReleaseRepository } from './repositories/ReleaseRepository.js';
import { ApplicationRepository } from './repositories/ApplicationRepository.js';
import { DomainRepository } from './repositories/DomainRepository.js';
import { FeatureRepository } from './repositories/FeatureRepository.js';
import { ModuleRepository } from './repositories/ModuleRepository.js';
import { ContractRepository } from './repositories/ContractRepository.js';
import { InfrastructureRepository } from './repositories/InfrastructureRepository.js';
import { WorkPlanRepository } from './repositories/WorkPlanRepository.js';

export interface ReleaseManagerOptions {
  force?: boolean;
  tag?: boolean;
  with?: string; // for compare
}

export class ReleaseManager {
  kg: KnowledgeGraph;
  releaseRepo: ReleaseRepository;
  baseDir: string;

  constructor(
    kg: KnowledgeGraph,
    releaseRepo: ReleaseRepository,
    baseDir: string = process.cwd(),
  ) {
    this.kg = kg;
    this.releaseRepo = releaseRepo;
    this.baseDir = baseDir;
  }

  async createRelease(
    version: string,
    options: ReleaseManagerOptions = {},
  ): Promise<void> {
    // Version validation
    if (!semver.valid(version)) {
      throw new Error(
        `Invalid version: ${version}. Must be a valid semantic version.`,
      );
    }

    // Create snapshot
    const snapshot = await this.createSnapshot();

    // Generate changelog (no previous snapshot for initial release)
    const changelog = await this.generateChangelog(null, snapshot);

    // Detect breaking changes (none for initial release)
    const breakingChanges = await this.detectBreakingChanges(null, snapshot);

    // Write release files
    await this.writeReleaseFiles(version, snapshot, changelog, breakingChanges);

    // Save release metadata to the database
    await this.releaseRepo.create({
      id: `${version}`,
      name: `Release ${version}`,
      description: `Release created by ReleaseManager`,
      version,
      release_date: Date.now(),
      features_included: JSON.stringify(snapshot.features || []),
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }

  private async writeReleaseFiles(
    version: string,
    snapshot: any,
    changelog: any,
    breakingChanges: any[],
  ): Promise<void> {
    // Write YAML, changelog, release notes, metadata to .bro/releases/<version>/
    const releaseDir = path.join(this.baseDir, '.bro', 'releases', version);
    await fs.ensureDir(releaseDir);

    // Write JSON files (for backward compatibility)
    await fs.writeJson(path.join(releaseDir, 'snapshot.json'), snapshot, {
      spaces: 2,
    });
    await fs.writeJson(path.join(releaseDir, 'changelog.json'), changelog, {
      spaces: 2,
    });
    await fs.writeJson(
      path.join(releaseDir, 'breaking-changes.json'),
      breakingChanges,
      { spaces: 2 },
    );

    // Write YAML files
    await fs.writeFile(
      path.join(releaseDir, 'snapshot.yaml'),
      yaml.dump(snapshot),
    );
    await fs.writeFile(
      path.join(releaseDir, 'changelog.yaml'),
      yaml.dump(changelog),
    );
    await fs.writeFile(
      path.join(releaseDir, 'breaking-changes.yaml'),
      yaml.dump(breakingChanges),
    );
  }

  private async detectBreakingChanges(
    prevSnapshot: any,
    currSnapshot: any,
  ): Promise<any[]> {
    // Detect breaking changes between snapshots
    if (!prevSnapshot || !currSnapshot) return [];

    const breaking: any[] = [];

    // Check for removed modules
    const prevModules = (prevSnapshot.modules || []).map(
      (m: any) => m.id || m.name,
    );
    const currModules = (currSnapshot.modules || []).map(
      (m: any) => m.id || m.name,
    );
    for (const mod of prevModules) {
      if (!currModules.includes(mod)) {
        breaking.push({ type: 'module', id: mod, reason: 'Module removed' });
      }
    }

    // Check for removed features
    const prevFeatures = (prevSnapshot.features || []).map(
      (f: any) => f.id || f.name,
    );
    const currFeatures = (currSnapshot.features || []).map(
      (f: any) => f.id || f.name,
    );
    for (const feat of prevFeatures) {
      if (!currFeatures.includes(feat)) {
        breaking.push({ type: 'feature', id: feat, reason: 'Feature removed' });
      }
    }

    // Check for removed domains
    const prevDomains = (prevSnapshot.domains || []).map(
      (d: any) => d.id || d.name,
    );
    const currDomains = (currSnapshot.domains || []).map(
      (d: any) => d.id || d.name,
    );
    for (const dom of prevDomains) {
      if (!currDomains.includes(dom)) {
        breaking.push({ type: 'domain', id: dom, reason: 'Domain removed' });
      }
    }

    return breaking;
  }

  private async generateChangelog(
    prevSnapshot: any,
    currSnapshot: any,
  ): Promise<any> {
    // Compare snapshots and generate changelog
    if (!prevSnapshot) {
      return {
        generatedAt: new Date().toISOString(),
        changes: 'Initial release - no previous snapshot',
      };
    }

    function diffEntities(prevArr: any[], currArr: any[], key: string) {
      const prevIds = new Set(
        (prevArr || []).map((e: any) => e[key] || e.id || e.name),
      );
      const currIds = new Set(
        (currArr || []).map((e: any) => e[key] || e.id || e.name),
      );
      const added = [...currIds].filter((x) => !prevIds.has(x));
      const removed = [...prevIds].filter((x) => !currIds.has(x));
      return { added, removed };
    }

    const moduleDiff = diffEntities(
      prevSnapshot.modules,
      currSnapshot.modules,
      'id',
    );
    const featureDiff = diffEntities(
      prevSnapshot.features,
      currSnapshot.features,
      'id',
    );
    const domainDiff = diffEntities(
      prevSnapshot.domains,
      currSnapshot.domains,
      'id',
    );

    return {
      generatedAt: new Date().toISOString(),
      modules: moduleDiff,
      features: featureDiff,
      domains: domainDiff,
    };
  }

  private async createSnapshot(): Promise<any> {
    // Use YAML generators to create a full spec snapshot (basic version)
    const modules = await this.kg.getModules();
    const features = await this.kg.getFeatures();
    const domains = await this.kg.getDomains();

    return {
      createdAt: new Date().toISOString(),
      moduleCount: modules.length,
      featureCount: features.length,
      domainCount: domains.length,
      modules,
      features,
      domains,
    };
  }

  async compareReleases(versionA: string, versionB: string): Promise<void> {
    // Load snapshots for both releases
    const releaseDirA = path.join(
      this.baseDir,
      '.bro',
      'releases',
      versionA,
      'snapshot.json',
    );
    const releaseDirB = path.join(
      this.baseDir,
      '.bro',
      'releases',
      versionB,
      'snapshot.json',
    );

    if (!fs.existsSync(releaseDirA)) {
      throw new Error(
        `Snapshot for release ${versionA} not found at ${releaseDirA}`,
      );
    }
    if (!fs.existsSync(releaseDirB)) {
      throw new Error(
        `Snapshot for release ${versionB} not found at ${releaseDirB}`,
      );
    }

    const snapshotA = await fs.readJson(releaseDirA);
    const snapshotB = await fs.readJson(releaseDirB);

    // Generate changelog/diff
    const changelog = await this.generateChangelog(snapshotA, snapshotB);

    // Output the diff to the console removed for production cleanliness
  }

  async finalizeRelease(version: string): Promise<void> {
    // TODO: Implement release status update to finalized
    throw new Error('Not implemented');
  }

  async rollbackRelease(version: string): Promise<void> {
    // TODO: Implement rollback to previous release
    throw new Error('Not implemented');
  }

  // --- Helpers (to be implemented) ---
}
