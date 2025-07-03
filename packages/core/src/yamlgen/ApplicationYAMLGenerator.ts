import { z } from 'zod';
import { ApplicationDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import { Application, Feature, Domain } from '../repositories/index.js'; // Assuming these are exported from index.ts

export class ApplicationYAMLGenerator implements DocumentGenerator {
  documentType = 'application';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const app = await kg.getApplication();
    const features = await kg.getFeatures(); // Assuming getFeatures is available
    const domains = await kg.getDomains(); // Assuming getDomains is available

    return {
      application: {
        name: app?.name || 'Unnamed Application',
        purpose: app?.purpose || 'No purpose defined',
        current_phase: app?.current_phase || 1,
        current_version: app?.current_version || '0.0.0',
        constraints: features
          .map((f) => f.requirements)
          .flat()
          .filter(Boolean), // Example: using feature requirements as constraints
        success_metrics: features
          .map((f) => f.metrics)
          .flat()
          .filter(Boolean), // Example: using feature metrics as success metrics
      },
    };
  }

  validate(document: YAMLDocument): ValidationResult {
    const result = ApplicationDocumentSchema.safeParse(document);
    if (result.success) {
      return { valid: true };
    } else {
      return {
        valid: false,
        errors: result.error.errors.map((e) => e.message),
      };
    }
  }
}
