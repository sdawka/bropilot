import { z } from 'zod';
import { ContractsDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import { Contract } from '../repositories/index.js';

export class ContractsYAMLGenerator implements DocumentGenerator {
  documentType = 'contracts';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const contracts = await kg.getContracts();
    const result: { contracts: { [key: string]: any } } = { contracts: {} };

    for (const contract of contracts) {
      result.contracts[contract.name] = {
        type: contract.type,
        description: contract.description,
        schema: contract.schema ? JSON.parse(contract.schema) : undefined,
        endpoints: contract.endpoints
          ? JSON.parse(contract.endpoints)
          : undefined,
      };
    }

    return result;
  }

  validate(document: YAMLDocument): ValidationResult {
    const result = ContractsDocumentSchema.safeParse(document);
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
