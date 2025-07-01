import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository';
import { ThingSchema } from '../database/schema';

export class ThingRepository extends BaseRepository<ThingSchema> {
  constructor(db: Database.Database) {
    super(db, 'things');
  }
}
