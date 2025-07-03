import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { ApplicationSchema } from '../database/schema.js';

export type { ApplicationSchema as Application };

export class ApplicationRepository extends BaseRepository<ApplicationSchema> {
  constructor(db: Database.Database) {
    super(db, 'applications');
  }
}
