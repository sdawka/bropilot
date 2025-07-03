import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { BehaviorSchema } from '../database/schema.js';

export type { BehaviorSchema as Behavior };

export class BehaviorRepository extends BaseRepository<BehaviorSchema> {
  constructor(db: Database.Database) {
    super(db, 'behaviors');
  }
}
