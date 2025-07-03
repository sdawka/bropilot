import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { ModuleSchema } from '../database/schema.js';

export type { ModuleSchema as Module };

export class ModuleRepository extends BaseRepository<ModuleSchema> {
  constructor(db: Database.Database) {
    super(db, 'modules');
  }
}
