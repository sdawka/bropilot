import { SyncHistory } from '../sync/SyncHistory.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const HISTORY_FILE = path.resolve(process.cwd(), '.bro-sync-history.json');

describe('SyncHistory', () => {
  let syncHistory: SyncHistory;

  beforeEach(async () => {
    syncHistory = new SyncHistory();
    // Clean up history file before each test
    try {
      await fs.unlink(HISTORY_FILE);
    } catch {
      // Ignore error if file does not exist
    }
  });

  it('removes later history entries after rollback', async () => {
    // Record two sync points
    await syncHistory.recordSync('sync1', { foo: 1 }, 'commit1');
    await syncHistory.recordSync('sync2', { bar: 2 }, 'commit2');
    const history = await syncHistory.getHistory();
    expect(history.length).toBe(2);

    // Rollback to the first entry
    const rollbackTo = history[0].timestamp;
    await syncHistory.rollback(rollbackTo);

    // After rollback, only the first entry should remain
    const newHistory = await syncHistory.getHistory();
    expect(newHistory.length).toBe(1);
    expect(newHistory[0].timestamp).toBe(rollbackTo);
    expect(newHistory[0].action).toBe('sync1');
  });
});
