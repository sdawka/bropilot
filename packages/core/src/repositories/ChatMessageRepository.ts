import Database from 'better-sqlite3';
import { ChatMessageSchema } from '../database/schema.js';
import { BaseRepository } from './BaseRepository.js';

export type { ChatMessageSchema as ChatMessage }; // Added export type
export class ChatMessageRepository extends BaseRepository<ChatMessageSchema> {
  constructor(db: Database.Database) {
    super(db, 'chat_messages');
  }

  /**
   * Returns unprocessed messages for a session, optionally only those after a given message ID.
   */
  async findUnprocessedMessagesBySession(
    sessionId: string,
    afterMessageId?: string,
  ): Promise<ChatMessageSchema[]> {
    let query = `
      SELECT * FROM chat_messages
      WHERE session_id = ? AND processed = 0
    `;
    const params: any[] = [sessionId];

    if (afterMessageId) {
      // Get the timestamp of the afterMessageId
      const tsRow = this.db
        .prepare('SELECT timestamp FROM chat_messages WHERE id = ?')
        .get(afterMessageId) as { timestamp: number } | undefined;
      if (tsRow && tsRow.timestamp) {
        query += ' AND timestamp > ?';
        params.push(tsRow.timestamp);
      }
    }

    query += ' ORDER BY timestamp ASC;';
    return this.db.prepare(query).all(...params) as ChatMessageSchema[];
  }

  async markMessagesAsProcessed(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }
    const placeholders = messageIds.map(() => '?').join(',');
    const query = `
      UPDATE chat_messages
      SET processed = 1
      WHERE id IN (${placeholders});
    `;
    this.db.prepare(query).run(...messageIds);
  }
}
