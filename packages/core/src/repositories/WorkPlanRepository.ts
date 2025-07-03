import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { WorkPlanSchema } from '../database/schema.js';

export type { WorkPlanSchema as WorkPlan };

export class WorkPlanRepository extends BaseRepository<WorkPlanSchema> {
  constructor(db: Database.Database) {
    super(db, 'work_plans');
  }
}
