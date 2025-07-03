import Database from 'better-sqlite3';
import { ChatSessionSchema } from '../database/schema.js';
import { BaseRepository } from './BaseRepository.js';

export type { ChatSessionSchema as ChatSession }; // Added export type
export class ChatSessionRepository extends BaseRepository<ChatSessionSchema> {
  constructor(db: Database.Database) {
    super(db, 'chat_sessions');
  }

  async findUnprocessedSessions(): Promise<ChatSessionSchema[]> {
    // This query finds sessions that have at least one unprocessed message
    // or sessions that have no messages (meaning they are new and need processing)
    const query = `
      SELECT DISTINCT cs.*
      FROM chat_sessions cs
      LEFT JOIN chat_messages cm ON cs.id = cm.session_id
      WHERE cm.processed = 0 OR cm.id IS NULL;
    `;
    return this.db.prepare(query).all() as ChatSessionSchema[];
  }

  async updateLastProcessedMessageId(
    sessionId: string,
    messageId: string | null,
  ): Promise<void> {
    await this.update(sessionId, { last_processed_message_id: messageId });
  }
}
