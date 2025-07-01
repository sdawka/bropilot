import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { ModuleSchema } from '../database/schema';

export class ModuleRepository extends BaseRepository<ModuleSchema> {
  constructor(db: Database.Database) {
    super(db, 'modules');
  }
}
