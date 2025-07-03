import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { FeatureSchema } from '../database/schema.js';

export type { FeatureSchema as Feature };

export class FeatureRepository extends BaseRepository<FeatureSchema> {
  constructor(db: Database.Database) {
    super(db, 'features');
  }
}
