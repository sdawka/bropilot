import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { DomainSchema } from '../database/schema';

export class DomainRepository extends BaseRepository<DomainSchema> {
  constructor(db: Database.Database) {
    super(db, 'domains');
  }
}
