import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { ReleaseSchema } from '../database/schema.js';

export type { ReleaseSchema as Release };

export class ReleaseRepository extends BaseRepository<ReleaseSchema> {
  constructor(db: Database.Database) {
    super(db, 'releases');
  }
}
