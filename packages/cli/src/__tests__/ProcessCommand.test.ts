import { jest } from '@jest/globals';
import { AppDatabase } from 'bropilot-core/database/Database';
import { KnowledgeGraph } from 'bropilot-core/knowledgeGraph/KnowledgeGraph';
import { PromptManager } from 'bropilot-core/llm/PromptManager';
import { PromptTemplateRepository } from '../../../core/src/llm/PromptTemplateRepository.js';
import { ProcessCommand } from '../commands/ProcessCommand.js';
import { ChatSessionRepository } from 'bropilot-core/repositories/ChatSessionRepository';
import { ChatMessageRepository } from 'bropilot-core/repositories/ChatMessageRepository';

describe('ProcessCommand persistent status tracking', () => {
  let db: AppDatabase;
  let kg: KnowledgeGraph;
  let promptManager: PromptManager;
  let processCommand: ProcessCommand;
  let chatSessionRepository: ChatSessionRepository;
  let chatMessageRepository: ChatMessageRepository;

  beforeEach(async () => {
    // These would be replaced with test/mocked instances as appropriate
    db = new AppDatabase(':memory:');
    await db.migrate();
    // Insert required application for foreign key constraint
    const now = Date.now();
    await db
      .getDB()
      .prepare(
        `INSERT INTO applications (id, name, purpose, current_phase, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('test-app', 'Test App', 'Testing', 1, '1.0.0', now, now);
    kg = new KnowledgeGraph(db);
    const templateRepo = new PromptTemplateRepository(db);
    promptManager = new PromptManager(templateRepo);

    // Patch ConversationProcessor to mock LLM calls
    const { ConversationProcessor } = await import(
      'bropilot-core/processing/ConversationProcessor'
    );
    jest
      .spyOn(ConversationProcessor.prototype, 'process')
      .mockImplementation(async (messages: any[]) => {
        // Return a fake result with no conflicts and all messages processed
        return {
          processedMessages: messages.length,
          extractedEntities: { domains: [], features: [], requirements: [] },
          conflicts: [],
          confidence: 1,
        };
      });

    processCommand = new ProcessCommand(db, kg, promptManager);
    chatSessionRepository = new ChatSessionRepository(db.getDB());
    chatMessageRepository = new ChatMessageRepository(db.getDB());
  });

  it('should persist processing status and resume after interruption', async () => {
    // Setup: create a session and messages
    const sessionId = 'test-session';
    await chatSessionRepository.create({
      id: sessionId,
      application_id: 'test-app',
      name: 'Test Session',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_processed_message_id: null,
    });
    const ts1 = Date.now();
    await chatMessageRepository.create({
      id: 'msg1',
      session_id: sessionId,
      role: 'user',
      content: 'First message',
      timestamp: ts1,
      processed: 0 as any,
    });
    await chatMessageRepository.create({
      id: 'msg2',
      session_id: sessionId,
      role: 'user',
      content: 'Second message',
      timestamp: ts1 + 1,
      processed: 0 as any,
    });

    // Simulate running the process command and interrupting after first message
    // (In reality, this would require more sophisticated mocking or a real implementation)
    // For now, we simulate by marking only the first message as processed
    await chatMessageRepository.markMessagesAsProcessed(['msg1']);
    await chatSessionRepository.updateLastProcessedMessageId(sessionId, 'msg1');

    // Now, re-run the process command
    await processCommand.execute({
      quiet: true,
      force: true,
      rollbackOnError: false,
    });

    // Expect that only the second message is processed in the resumed run
    const msg1 = await chatMessageRepository.findById('msg1');
    const msg2 = await chatMessageRepository.findById('msg2');
    expect(Boolean(msg1 && msg1.processed)).toBe(true);
    expect(Boolean(msg2 && msg2.processed)).toBe(true);

    // Expect that the session's last_processed_message_id is updated to msg2
    const session = await chatSessionRepository.findById(sessionId);
    expect(session && session.last_processed_message_id).toBe('msg2');
  });
});
