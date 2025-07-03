import { Database } from 'better-sqlite3';

export interface ProcessingRun {
  id: string;
  session_id: string;
  status: 'in_progress' | 'completed' | 'failed';
  last_processed_message_id: string | null;
  started_at: number;
  finished_at: number | null;
  error_message: string | null;
}

export class ProcessingRunRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  create(run: ProcessingRun) {
    this.db
      .prepare(
        `INSERT INTO processing_runs (id, session_id, status, last_processed_message_id, started_at, finished_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.id,
        run.session_id,
        run.status,
        run.last_processed_message_id,
        run.started_at,
        run.finished_at,
        run.error_message,
      );
  }

  findLatestBySession(session_id: string): ProcessingRun | null {
    const row = this.db
      .prepare(
        `SELECT * FROM processing_runs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1`,
      )
      .get(session_id) as any;
    if (!row) return null;
    return {
      id: row.id,
      session_id: row.session_id,
      status: row.status,
      last_processed_message_id: row.last_processed_message_id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      error_message: row.error_message,
    } as ProcessingRun;
  }

  updateStatus(
    id: string,
    status: 'in_progress' | 'completed' | 'failed',
    last_processed_message_id: string | null,
    finished_at: number | null,
    error_message: string | null,
  ): void {
    this.db
      .prepare(
        `UPDATE processing_runs SET status = ?, last_processed_message_id = ?, finished_at = ?, error_message = ? WHERE id = ?`,
      )
      .run(status, last_processed_message_id, finished_at, error_message, id);
  }
}
