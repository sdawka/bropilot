// YAML Generation Engine for Bropilot Spec Documents

import { z } from 'zod';
import yaml from 'js-yaml';
import {
  parse as parseCommentJson,
  stringify as stringifyCommentJson,
} from 'comment-json';
import { diffLines, Change } from 'diff';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// Import all document generators
import { ApplicationYAMLGenerator } from './ApplicationYAMLGenerator.js';
import { DomainsYAMLGenerator } from './DomainsYAMLGenerator.js';
import { FeaturesYAMLGenerator } from './FeaturesYAMLGenerator.js';
import { ModulesYAMLGenerator } from './ModulesYAMLGenerator.js';
import { ComponentsYAMLGenerator } from './ComponentsYAMLGenerator.js';
import { InfrastructureYAMLGenerator } from './InfrastructureYAMLGenerator.js';
import { ContractsYAMLGenerator } from './ContractsYAMLGenerator.js';
import { ReleasesYAMLGenerator } from './ReleasesYAMLGenerator.js';
import { WorkPlanYAMLGenerator } from './WorkPlanYAMLGenerator.js';

// --- Types and Interfaces ---

export interface YAMLDocument {
  [key: string]: unknown; // Use unknown instead of any
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface GenerationResult {
  results: Array<{
    type: string;
    status: 'success' | 'failed';
    errors?: string[];
  }>;
  timestamp: number;
}

import {
  Application,
  Domain,
  Feature,
  Module,
  Thing,
  Behavior,
  Flow,
  Component,
  Screen,
  Infrastructure,
  Contract,
  Release,
  WorkPlan,
} from '../repositories/index.js';

export interface KnowledgeGraph {
  getApplication(): Promise<Application | null>;
  getDomains(): Promise<Domain[]>;
  getDomainById(id: string): Promise<Domain | null>;
  getFeatures(): Promise<Feature[]>;
  getFeatureById(id: string): Promise<Feature | null>;
  getModules(): Promise<Module[]>;
  getModuleById(id: string): Promise<Module | null>;
  getThingsByModule(moduleId: string): Promise<Thing[]>;
  getBehaviorsByModule(moduleId: string): Promise<Behavior[]>;
  getFlowsByModule(moduleId: string): Promise<Flow[]>;
  getComponents(): Promise<Component[]>;
  getComponentsByModule(moduleId: string): Promise<Component[]>;
  getScreens(): Promise<Screen[]>;
  getScreensByModule(moduleId: string): Promise<Screen[]>;
  getInfrastructure(): Promise<Infrastructure[]>;
  getContracts(): Promise<Contract[]>;
  getReleases(): Promise<Release[]>;
  getWorkPlans(): Promise<WorkPlan[]>;
}

export interface DocumentGenerator {
  documentType: string;
  generate(knowledgeGraph: KnowledgeGraph): Promise<YAMLDocument>;
  validate(document: YAMLDocument): ValidationResult;
}

// --- Example Zod Schema ---

// --- YAML Generation Engine ---

export class DocsManager {
  private generators: Map<string, DocumentGenerator>;
  private docsDir: string;

  constructor(docsDir: string) {
    this.docsDir = docsDir;
    this.generators = new Map();
    this.registerDefaultGenerators();
  }

  /**
   * Get the status of all YAML documents: missing, unchanged, or changed.
   * Returns an array of { type, status: 'missing' | 'unchanged' | 'changed' }
   */
  async getStatus(
    kg: KnowledgeGraph,
  ): Promise<
    Array<{ type: string; status: 'missing' | 'unchanged' | 'changed' }>
  > {
    const statuses: Array<{
      type: string;
      status: 'missing' | 'unchanged' | 'changed';
    }> = [];
    for (const type of this.getAllDocumentTypes()) {
      const generator = this.generators.get(type);
      if (!generator) {
        statuses.push({ type, status: 'missing' });
        continue;
      }
      const filePath = this.getDocumentPath(type);
      let fileContent: string | null = null;
      let generatedYaml: string | null = null;
      try {
        fileContent = await fs.readFile(filePath, 'utf8');
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          statuses.push({ type, status: 'missing' });
          continue;
        } else {
          statuses.push({ type, status: 'missing' });
          continue;
        }
      }
      // Generate the current document and serialize to YAML
      const generatedDoc = await generator.generate(kg);
      generatedYaml = this.serializeDocument(generatedDoc);

      // Normalize line endings for comparison
      const normalize = (s: string) => s.replace(/\r\n/g, '\n');
      if (normalize(fileContent) === normalize(generatedYaml)) {
        statuses.push({ type, status: 'unchanged' });
      } else {
        statuses.push({ type, status: 'changed' });
      }
    }
    return statuses;
  }

  /**
   * Validate all YAML documents in the docs directory using the appropriate generator and schema.
   * Returns an array of { type, valid, errors } for each document type.
   */
  async validate(): Promise<
    Array<{
      type: string;
      valid: boolean;
      errors?: string[];
      missing?: boolean;
    }>
  > {
    const results: Array<{
      type: string;
      valid: boolean;
      errors?: string[];
      missing?: boolean;
    }> = [];
    for (const type of this.getAllDocumentTypes()) {
      const generator = this.generators.get(type);
      if (!generator) {
        results.push({
          type,
          valid: false,
          errors: [`No generator found for type: ${type}`],
        });
        continue;
      }
      const filePath = this.getDocumentPath(type);
      let fileContent: string | null = null;
      let parsed: YAMLDocument | null = null;
      try {
        fileContent = await fs.readFile(filePath, 'utf8');
        parsed = yaml.load(fileContent) as YAMLDocument;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          results.push({
            type,
            valid: false,
            missing: true,
            errors: [`File not found: ${filePath}`],
          });
        } else {
          results.push({
            type,
            valid: false,
            errors: [`Failed to read or parse: ${filePath}: ${err.message}`],
          });
        }
        continue;
      }
      const validation = generator.validate(parsed!);
      results.push({
        type,
        valid: validation.valid,
        errors: validation.errors,
      });
    }
    return results;
  }

  private registerDefaultGenerators() {
    this.registerGenerator(new ApplicationYAMLGenerator());
    this.registerGenerator(new DomainsYAMLGenerator());
    this.registerGenerator(new FeaturesYAMLGenerator());
    this.registerGenerator(new ModulesYAMLGenerator());
    this.registerGenerator(new ComponentsYAMLGenerator());
    this.registerGenerator(new InfrastructureYAMLGenerator());
    this.registerGenerator(new ContractsYAMLGenerator());
    this.registerGenerator(new ReleasesYAMLGenerator());
    this.registerGenerator(new WorkPlanYAMLGenerator());
  }

  registerGenerator(generator: DocumentGenerator) {
    this.generators.set(generator.documentType, generator);
  }

  getAllDocumentTypes(): string[] {
    return Array.from(this.generators.keys());
  }

  async generate(
    kg: KnowledgeGraph,
    options: GenerateOptions,
  ): Promise<GenerationResult> {
    const results: GenerationResult['results'] = [];
    const documentsToGenerate = options.only
      ? options.only
      : this.getAllDocumentTypes();

    for (const type of documentsToGenerate) {
      const generator = this.generators.get(type);
      if (!generator) {
        results.push({
          type,
          status: 'failed',
          errors: [`No generator found for type: ${type}`],
        });
        continue;
      }

      try {
        const document = await generator.generate(kg);
        const validation = generator.validate(document);

        if (!validation.valid) {
          results.push({
            type,
            status: 'failed',
            errors: validation.errors,
          });
          continue;
        }

        const outputPath = this.getDocumentPath(type);
        let existingContent: string | null = null;
        let existingParsed: YAMLDocument | null = null;

        if (
          await fs
            .access(outputPath)
            .then(() => true)
            .catch(() => false)
        ) {
          existingContent = await fs.readFile(outputPath, 'utf8');
          existingParsed = parseCommentJson(existingContent) as YAMLDocument;
        }

        let finalDocument = document;
        if (existingParsed) {
          finalDocument = this.preserveUserSections(existingParsed, document);
        }

        const generatedYaml = this.serializeDocument(finalDocument);

        if (options.diff && existingContent) {
          this.showDiff(existingContent, generatedYaml, type);
          // In a real CLI, you'd prompt for confirmation here.
          // For now, we'll assume confirmation or handle it at a higher level.
        }

        if (!options.dryRun) {
          if (options.backup && existingContent) {
            await this.backupDocument(outputPath);
          }
          await fs.writeFile(outputPath, generatedYaml, 'utf8');
        }

        results.push({ type, status: 'success' });
      } catch (error: any) {
        results.push({ type, status: 'failed', errors: [error.message] });
      }
    }

    return { results, timestamp: Date.now() };
  }

  private getDocumentPath(type: string): string {
    return path.join(this.docsDir, `${type}.yaml`);
  }

  private serializeDocument(doc: YAMLDocument): string {
    const version = 'Bropilot v1.0.0'; // Or get from config
    const timestamp = new Date().toISOString();
    const source = 'Knowledge Graph v3';

    const comments = [
      `# Generated by ${version}`,
      `# Generated at: ${timestamp}`,
      `# Source: ${source}`,
      '',
    ].join('\n');

    const yamlBody = stringifyCommentJson(doc, null, 2); // Use comment-json for stringify

    return `${comments}${yamlBody}`;
  }

  private preserveUserSections(
    existing: YAMLDocument,
    generated: YAMLDocument,
  ): YAMLDocument {
    const merged = { ...generated };
    for (const key in existing) {
      // Preserve sections not explicitly generated by the current generator
      // and not starting with '_' (which might be internal metadata)
      if (!(key in generated) && !key.startsWith('_')) {
        merged[key] = existing[key];
      }
    }
    return merged;
  }

  private showDiff(oldContent: string, newContent: string, type: string) {
    // Diff output removed for production cleanliness
    const differences = diffLines(oldContent, newContent);

    differences.forEach((part: Change) => {
      const color = part.added
        ? chalk.green
        : part.removed
          ? chalk.red
          : chalk.grey;
      process.stdout.write(color(part.value));
    });
    // End diff output removed
  }

  private async backupDocument(originalPath: string): Promise<void> {
    const backupPath = `${originalPath}.bak`;
    await fs.copyFile(originalPath, backupPath);
    // Backup log removed for production cleanliness
  }

  // Public: get the docs directory (for debugging)
  public getDocsDir(): string {
    return this.docsDir;
  }

  // Public: get all document paths (for debugging)
  public getAllDocumentPaths(): string[] {
    return this.getAllDocumentTypes().map((type) => this.getDocumentPath(type));
  }
}

export interface GenerateOptions {
  only?: string[];
  force?: boolean;
  dryRun?: boolean;
  diff?: boolean;
  backup?: boolean;
  parallel?: boolean;
}
