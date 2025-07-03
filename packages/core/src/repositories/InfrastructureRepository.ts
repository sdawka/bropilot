import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { InfrastructureSchema } from '../database/schema.js';

export type { InfrastructureSchema as Infrastructure };

export class InfrastructureRepository extends BaseRepository<InfrastructureSchema> {
  constructor(db: Database.Database) {
    super(db, 'infrastructure');
  }
}
