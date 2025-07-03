import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { DomainSchema } from '../database/schema.js';

export type { DomainSchema as Domain }; // Exporting with an alias for consistency

export class DomainRepository extends BaseRepository<DomainSchema> {
  constructor(db: Database.Database) {
    super(db, 'domains');
  }
}
