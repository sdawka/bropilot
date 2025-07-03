import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { ComponentSchema } from '../database/schema.js';

export type { ComponentSchema as Component };

export class ComponentRepository extends BaseRepository<ComponentSchema> {
  constructor(db: Database.Database) {
    super(db, 'components');
  }
}
