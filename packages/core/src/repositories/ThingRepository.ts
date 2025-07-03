import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { ThingSchema } from '../database/schema.js';

export type { ThingSchema as Thing };

export class ThingRepository extends BaseRepository<ThingSchema> {
  constructor(db: Database.Database) {
    super(db, 'things');
  }
}
