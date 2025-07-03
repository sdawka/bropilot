import { z } from 'zod';
import { WorkPlanDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import { WorkPlan } from '../repositories/index.js';

export class WorkPlanYAMLGenerator implements DocumentGenerator {
  documentType = 'work-plan';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const workPlans = await kg.getWorkPlans();
    // Assuming we only generate one work plan document, or aggregate them
    const workPlan = workPlans.length > 0 ? workPlans[0] : null;

    if (!workPlan) {
      return {
        work_plan: {
          name: 'Default Work Plan',
          description: 'No active work plan found in the knowledge graph.',
          status: 'draft',
          tasks: [],
        },
      };
    }

    return {
      work_plan: {
        name: workPlan.name,
        description: workPlan.description,
        status: workPlan.status,
        start_date: workPlan.start_date,
        end_date: workPlan.end_date,
        tasks: workPlan.tasks ? JSON.parse(workPlan.tasks) : undefined,
      },
    };
  }

  validate(document: YAMLDocument): ValidationResult {
    const result = WorkPlanDocumentSchema.safeParse(document);
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
