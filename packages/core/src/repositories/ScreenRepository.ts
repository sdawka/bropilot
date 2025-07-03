import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { ScreenSchema } from '../database/schema.js';

export type { ScreenSchema as Screen };

export class ScreenRepository extends BaseRepository<ScreenSchema> {
  constructor(db: Database.Database) {
    super(db, 'screens');
  }
}
