import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { FlowSchema } from '../database/schema.js';

export type { FlowSchema as Flow };

export class FlowRepository extends BaseRepository<FlowSchema> {
  constructor(db: Database.Database) {
    super(db, 'flows');
  }
}
