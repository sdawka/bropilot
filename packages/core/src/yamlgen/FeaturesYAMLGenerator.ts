import { z } from 'zod';
import { FeaturesDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import { Feature } from '../repositories/index.js';

export class FeaturesYAMLGenerator implements DocumentGenerator {
  documentType = 'features';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const features = await kg.getFeatures();
    const result: { features: { [key: string]: any } } = { features: {} };

    for (const feature of features) {
      result.features[feature.name] = {
        description: feature.purpose, // Assuming purpose maps to description in YAML
        purpose: feature.purpose,
        requirements: feature.requirements
          ? JSON.parse(feature.requirements)
          : undefined,
        metrics: feature.metrics ? JSON.parse(feature.metrics) : undefined,
        // TODO: Add domains relationship
      };
    }

    return result;
  }

  validate(document: YAMLDocument): ValidationResult {
    const result = FeaturesDocumentSchema.safeParse(document);
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
