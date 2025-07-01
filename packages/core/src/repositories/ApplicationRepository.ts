import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { ApplicationSchema } from '../database/schema';

export class ApplicationRepository extends BaseRepository<ApplicationSchema> {
  constructor(db: Database.Database) {
    super(db, 'applications');
  }
}
