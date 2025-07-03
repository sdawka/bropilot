import Database from 'better-sqlite3';
import { BaseRepository } from './BaseRepository.js';
import { ContractSchema } from '../database/schema.js';

export type { ContractSchema as Contract };

export class ContractRepository extends BaseRepository<ContractSchema> {
  constructor(db: Database.Database) {
    super(db, 'contracts');
  }
}
