import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { FeatureSchema } from '../database/schema';

export class FeatureRepository extends BaseRepository<FeatureSchema> {
  constructor(db: Database.Database) {
    super(db, 'features');
  }
}
