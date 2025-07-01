import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { FlowSchema } from '../database/schema';

export class FlowRepository extends BaseRepository<FlowSchema> {
  constructor(db: Database.Database) {
    super(db, 'flows');
  }
}
