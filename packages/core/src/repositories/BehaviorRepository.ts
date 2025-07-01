import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { BehaviorSchema } from '../database/schema';

export class BehaviorRepository extends BaseRepository<BehaviorSchema> {
  constructor(db: Database.Database) {
    super(db, 'behaviors');
  }
}
