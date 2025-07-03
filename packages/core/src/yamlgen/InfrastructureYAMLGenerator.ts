import { z } from 'zod';
import { InfrastructureDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import { Infrastructure } from '../repositories/index.js';

export class InfrastructureYAMLGenerator implements DocumentGenerator {
  documentType = 'infrastructure';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const infrastructure = await kg.getInfrastructure();
    const result: { infrastructure: { [key: string]: any } } = {
      infrastructure: {},
    };

    for (const infra of infrastructure) {
      result.infrastructure[infra.name] = {
        type: infra.type,
        description: infra.description,
        configuration: infra.configuration
          ? JSON.parse(infra.configuration)
          : undefined,
      };
    }

    return result;
  }

  validate(document: YAMLDocument): ValidationResult {
    const result = InfrastructureDocumentSchema.safeParse(document);
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
