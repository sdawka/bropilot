/**
 * SyncHistory: Tracks sync operations, supports history and rollback.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const HISTORY_FILE = path.resolve(process.cwd(), '.bro-sync-history.json');

export interface SyncHistoryEntry {
  timestamp: string;
  action: string;
  details: any;
  gitCommit?: string;
}

export class SyncHistory {
  /**
   * Record a sync operation in the history file.
   */
  async recordSync(
    action: string,
    details: any,
    gitCommit?: string,
  ): Promise<void> {
    const entry: SyncHistoryEntry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      gitCommit,
    };
    let history: SyncHistoryEntry[] = [];
    try {
      const content = await fs.readFile(HISTORY_FILE, 'utf8');
      history = JSON.parse(content);
    } catch {
      // File does not exist or is invalid, start fresh
      history = [];
    }
    history.push(entry);
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
  }

  /**
   * Get the full sync history.
   */
  async getHistory(): Promise<SyncHistoryEntry[]> {
    try {
      const content = await fs.readFile(HISTORY_FILE, 'utf8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Rollback to a previous sync point.
   * @param to ISO timestamp or git commit hash
   */
  async rollback(to: string): Promise<void> {
    const content = await fs.readFile(HISTORY_FILE, 'utf8');
    const history: SyncHistoryEntry[] = JSON.parse(content);

    // Find the index of the rollback point (by timestamp or gitCommit)
    const idx = history.findIndex(
      (entry) => entry.timestamp === to || entry.gitCommit === to,
    );
    if (idx === -1) {
      throw new Error(`Rollback point not found: ${to}`);
    }

    // Truncate history to include only up to and including the rollback point
    const truncated = history.slice(0, idx + 1);
    await fs.writeFile(
      HISTORY_FILE,
      JSON.stringify(truncated, null, 2),
      'utf8',
    );
    console.log(
      `Rollback to sync point: ${to} (history truncated to ${idx + 1} entries)`,
    );
  }
}
