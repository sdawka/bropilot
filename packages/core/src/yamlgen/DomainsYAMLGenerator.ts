import { z } from 'zod';
import { DomainsDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import { Domain } from '../repositories/index.js';

export class DomainsYAMLGenerator implements DocumentGenerator {
  documentType = 'domains';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const domains = await kg.getDomains();
    const result: { domains: { [key: string]: any } } = { domains: {} };

    for (const domain of domains) {
      result.domains[domain.name] = {
        description: domain.description,
      };
    }

    return result;
  }

  validate(document: YAMLDocument): ValidationResult {
    const result = DomainsDocumentSchema.safeParse(document);
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
