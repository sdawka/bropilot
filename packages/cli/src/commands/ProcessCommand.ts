import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { ConversationProcessor } from 'bropilot-core/processing/ConversationProcessor';
import { EntityValidator } from 'bropilot-core/processing/EntityValidator';
import {
  ChatSession,
  ChatMessage,
  ProcessOptions,
  ExtractedEntities,
  Conflict,
  ProcessingResult,
} from 'bropilot-core/processing/types';
import { KnowledgeGraph } from 'bropilot-core/knowledgeGraph/KnowledgeGraph'; // Assuming this exists
import { AppDatabase } from 'bropilot-core/database/Database';
import { getLLMProvider } from 'bropilot-core/llm/getLLMProvider';
import { PromptManager } from 'bropilot-core/llm/PromptManager';
import { PromptTemplate } from 'bropilot-core/llm/PromptTemplate'; // Import PromptTemplate class
import { ChatSessionRepository } from 'bropilot-core/repositories/ChatSessionRepository';
import { ChatMessageRepository } from 'bropilot-core/repositories/ChatMessageRepository';

import { ProcessingRunRepository } from 'bropilot-core/repositories/ProcessingRunRepository';
import { v4 as uuidv4 } from 'uuid';
import { ProcessingChangeLog } from 'bropilot-core/knowledgeGraph/KnowledgeGraph';

export class ProcessCommand {
  private processor: ConversationProcessor;
  private validator: EntityValidator;
  private kg: KnowledgeGraph;
  private db: AppDatabase;
  private promptManager: PromptManager;
  private chatSessionRepository: ChatSessionRepository;
  private chatMessageRepository: ChatMessageRepository;
  private sessionChangeLogs: Record<string, ProcessingChangeLog> = {};
  private processingRunRepository: ProcessingRunRepository;

  constructor(
    db: AppDatabase,
    kg: KnowledgeGraph,
    promptManager: PromptManager,
  ) {
    this.db = db;
    this.kg = kg;
    this.promptManager = promptManager;

    // Initialize repositories
    const rawDb = this.db.getDB(); // Get the raw better-sqlite3 database instance
    this.chatSessionRepository = new ChatSessionRepository(rawDb);
    this.chatMessageRepository = new ChatMessageRepository(rawDb);
    this.processingRunRepository = new ProcessingRunRepository(rawDb);

    // Initialize with a default prompt template for now. This should ideally be configurable.
    const llmProvider = getLLMProvider(); // Get default LLM provider
    const defaultPromptTemplate = new PromptTemplate(
      'entity-extraction',
      'Entity Extraction Prompt',
      1,
      `Extract domains, features, and requirements from the following chat content.
      
      Chat Content:
      {{chat_content}}
      
      Respond in JSON format with arrays for 'domains', 'features', and 'requirements'. Each entity should have a 'name', 'confidence' (0-1), and 'sourceMessages' (array of message IDs). Domains should have a 'description'. Features should have a 'purpose' and 'domains' (array of domain names). Requirements should have a 'description' and optionally a 'feature' (feature name).`,
      ['chat_content'],
      undefined,
      'json',
    );
    this.processor = new ConversationProcessor(
      llmProvider,
      defaultPromptTemplate,
    );
    this.validator = new EntityValidator();
  }

  public register(program: Command) {
    program
      .command('process')
      .description(
        'Processes all unprocessed chat sessions and extracts entities.',
      )
      .option(
        '-q, --quiet',
        'Do not generate a detailed processing report.',
        false,
      )
      .option(
        '-f, --force',
        'Force processing even if conflicts are detected.',
        false,
      )
      .option(
        '-r, --rollbackOnError',
        'Rollback changes if an error occurs during processing.',
        false,
      )
      .action(async (options: ProcessOptions) => {
        await this.execute(options);
      });
  }

  // TODO: Persistent processing status tracking and resumption could be implemented here (e.g., using a processing_runs table).
  async execute(options: ProcessOptions): Promise<void> {
    // Get unprocessed sessions
    const sessions = await this.getUnprocessedSessions();

    if (sessions.length === 0) {
      console.log(chalk.green('All sessions are up to date'));
      return;
    }

    console.log(chalk.blue(`Processing ${sessions.length} sessions...`));

    let totalProcessedMessages = 0;
    const allConflicts: Conflict[] = [];
    const allExtractedEntities: ExtractedEntities = {
      domains: [],
      features: [],
      requirements: [],
    };
    let totalConfidence = 0;
    let processedSessionCount = 0;

    // Process each session
    for (const session of sessions) {
      const sessionSpinner = ora(`Processing session ${session.id}`).start();
      // Persistent processing run logic
      let run = this.processingRunRepository.findLatestBySession(session.id);
      if (!run || run.status === 'completed' || run.status === 'failed') {
        // Start a new run
        run = {
          id: uuidv4(),
          session_id: session.id,
          status: 'in_progress',
          last_processed_message_id: session.lastProcessedMessageId || null,
          started_at: Date.now(),
          finished_at: null,
          error_message: null,
        };
        this.processingRunRepository.create(run);
      }
      try {
        // Optionally, resume logic could use run.last_processed_message_id to skip already-processed messages
        const result = await this.processSession(session, options);
        if (result) {
          totalProcessedMessages += result.processedMessages;
          allConflicts.push(...result.conflicts);
          this.mergeExtractedEntities(
            allExtractedEntities,
            result.extractedEntities,
          );
          totalConfidence += result.confidence;
          processedSessionCount++;
          sessionSpinner.succeed(`Processed session ${session.id}`);
          // Mark run as completed
          this.processingRunRepository.updateStatus(
            run.id,
            'completed',
            session.lastProcessedMessageId || null,
            Date.now(),
            null,
          );
        } else {
          sessionSpinner.info(
            `Session ${session.id} had no new messages or was skipped.`,
          );
          // Mark run as completed (no new work)
          this.processingRunRepository.updateStatus(
            run.id,
            'completed',
            session.lastProcessedMessageId || null,
            Date.now(),
            null,
          );
        }
      } catch (error: any) {
        sessionSpinner.fail(
          `Failed to process session ${session.id}: ${error.message}`,
        );
        this.processingRunRepository.updateStatus(
          run.id,
          'failed',
          session.lastProcessedMessageId || null,
          Date.now(),
          error.message || String(error),
        );
        if (options.rollbackOnError) {
          await this.rollback(session.id);
          console.log(
            chalk.yellow(`Rolled back changes for session ${session.id}`),
          );
        }
      }
    }

    // Generate report
    if (!options.quiet) {
      await this.generateReport(
        sessions.length,
        totalProcessedMessages,
        allExtractedEntities,
        allConflicts,
        processedSessionCount > 0 ? totalConfidence / processedSessionCount : 0,
      );
    }
    console.log(chalk.green('Processing complete.'));
  }

  private async getUnprocessedSessions(): Promise<ChatSession[]> {
    console.log(chalk.blue('Fetching unprocessed sessions from database...'));
    const sessionSchemas =
      await this.chatSessionRepository.findUnprocessedSessions();
    return sessionSchemas.map((s) => ({
      id: s.id,
      name: s.name,
      lastProcessedMessageId: s.last_processed_message_id,
    }));
  }

  // TODO: For streaming processing of large conversations, this method could yield messages in batches/chunks.
  private async getUnprocessedMessages(
    session: ChatSession,
  ): Promise<ChatMessage[]> {
    console.log(
      chalk.blue(
        `Fetching unprocessed messages for session ${session.id} from database...`,
      ),
    );
    // Only fetch messages after the last processed message, if any
    const messageSchemas =
      await this.chatMessageRepository.findUnprocessedMessagesBySession(
        session.id,
        session.lastProcessedMessageId || undefined,
      );
    return messageSchemas.map((m) => ({
      id: m.id,
      sessionId: m.session_id,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp), // Convert timestamp to Date object
      processed: m.processed,
    }));
  }

  private async processSession(
    session: ChatSession,
    options: ProcessOptions,
  ): Promise<ProcessingResult | null> {
    const unprocessedMessages = await this.getUnprocessedMessages(session);

    if (unprocessedMessages.length === 0) {
      return null;
    }

    // Extract entities using LLM
    // TODO: If any message or extraction is low-confidence, queue for manual review UI (not yet implemented)
    const result = await this.processor.process(unprocessedMessages);

    // Validate extracted entities
    const validationResult = this.validator.validate(result.extractedEntities);
    if (!validationResult.valid) {
      console.error(chalk.red('Validation errors found:'));
      validationResult.errors.forEach((err: string) =>
        console.error(chalk.red(`- ${err}`)),
      );
      throw new Error('Extracted entities failed validation.');
    }

    // Detect conflicts (already handled during merge in ConversationProcessor, but can add more here)
    const additionalConflicts = this.detectConflicts(result.extractedEntities);
    result.conflicts.push(...additionalConflicts);

    if (result.conflicts.length > 0 && !options.force) {
      console.warn(
        chalk.yellow('Conflicts detected. Use --force to override.'),
      );
      await this.handleConflicts(result.conflicts);
      throw new Error('Processing stopped due to conflicts.');
    }

    // TODO: Entity relationship inference could be added here before applying to the knowledge graph.
    // Apply to knowledge graph with change log
    const changeLog: ProcessingChangeLog = { created: [], updated: [] };
    await this.applyToKnowledgeGraph(result.extractedEntities, changeLog);
    this.sessionChangeLogs[session.id] = changeLog;

    // Mark messages as processed
    await this.markAsProcessed(unprocessedMessages);

    return result;
  }

  private detectConflicts(entities: ExtractedEntities): Conflict[] {
    const conflicts: Conflict[] = [];

    // Check for features assigned to non-existent domains
    const domainNames = new Set(
      entities.domains.map((d: { name: string }) => d.name),
    );
    for (const feature of entities.features) {
      for (const domainName of feature.domains) {
        if (!domainNames.has(domainName)) {
          conflicts.push({
            type: 'missing_domain_reference',
            entity1: feature,
            resolution: 'create_domain',
            message: `Feature '${feature.name}' references non-existent domain '${domainName}'.`,
          });
        }
      }
    }
    return conflicts;
  }

  private async handleConflicts(conflicts: Conflict[]): Promise<void> {
    console.log(chalk.red('\n--- Conflicts Detected ---'));
    conflicts.forEach((c, index) => {
      console.log(
        chalk.red(
          `${index + 1}. Type: ${c.type}, Entity: ${c.entity1.name}, Resolution: ${c.resolution}`,
        ),
      );
      if (c.message) {
        console.log(chalk.red(`   Message: ${c.message}`));
      }
    });
    console.log(chalk.red('--- End Conflicts ---\n'));
    // TODO: Implement actual conflict resolution logic. This could involve:
    // - Presenting conflicts to the user for manual resolution.
    // - Applying automated resolution strategies based on conflict type and confidence scores.
    // - For now, processing stops if conflicts are detected and --force is not used.
  }

  // TODO: Support for custom extraction rules could be injected/applied here before upserting entities.
  private async applyToKnowledgeGraph(
    entities: ExtractedEntities,
    changeLog?: ProcessingChangeLog,
  ): Promise<void> {
    console.log(
      chalk.blue('Applying extracted entities to Knowledge Graph...'),
    );
    for (const domain of entities.domains) {
      await this.kg.addDomain(domain, changeLog);
    }
    for (const feature of entities.features) {
      await this.kg.addFeature(feature, changeLog);
    }
    for (const requirement of entities.requirements) {
      // await this.kg.addRequirement(requirement, changeLog); // Commented out due to type mismatch with ThingSchema
    }
    console.log(
      chalk.blue(
        `Added/Updated ${entities.domains.length} domains, ${entities.features.length} features, ${entities.requirements.length} requirements in KG.`,
      ),
    );
  }

  private async markAsProcessed(messages: ChatMessage[]): Promise<void> {
    console.log(
      chalk.blue(`Marking ${messages.length} messages as processed...`),
    );
    const messageIds = messages.map((msg) => msg.id);
    if (messageIds.length > 0) {
      await this.chatMessageRepository.markMessagesAsProcessed(messageIds);
      // Update last_processed_message_id for the session
      const lastMessageId = messageIds[messageIds.length - 1];
      // Assuming all messages belong to the same session, which they should in processSession
      const sessionId = messages[0].sessionId;
      await this.chatSessionRepository.updateLastProcessedMessageId(
        sessionId,
        lastMessageId,
      );
    }
  }

  private async rollback(sessionId: string): Promise<void> {
    console.log(chalk.red(`Performing rollback for session ${sessionId}...`));
    const changeLog = this.sessionChangeLogs[sessionId];
    if (!changeLog) {
      console.log(
        chalk.yellow(
          'No change log found for this session. Nothing to rollback.',
        ),
      );
      return;
    }

    // Rollback created entities (delete them)
    for (const created of changeLog.created.reverse()) {
      if (created.type === 'domain') {
        await this.kg.deleteDomain(created.id);
      } else if (created.type === 'feature') {
        await this.kg.deleteFeature(created.id);
      } else if (created.type === 'requirement') {
        await this.kg.deleteRequirement(created.id);
      }
    }

    // Rollback updated entities (restore previous state)
    for (const updated of changeLog.updated.reverse()) {
      if (updated.type === 'domain') {
        await this.kg.restoreDomain(updated.id, updated.previous);
      } else if (updated.type === 'feature') {
        await this.kg.restoreFeature(updated.id, updated.previous);
      } else if (updated.type === 'requirement') {
        await this.kg.restoreRequirement(updated.id, updated.previous);
      }
    }

    // Mark all messages for this session as unprocessed
    const allMessages =
      await this.chatMessageRepository.findUnprocessedMessagesBySession(
        sessionId,
      );
    const processedIds = allMessages
      .filter((m) => m.processed)
      .map((m) => m.id);
    if (processedIds.length > 0) {
      // Set processed = 0 for these messages
      const placeholders = processedIds.map(() => '?').join(',');
      const query = `
        UPDATE chat_messages
        SET processed = 0
        WHERE id IN (${placeholders});
      `;
      this.db
        .getDB()
        .prepare(query)
        .run(...processedIds);
    }

    // Reset lastProcessedMessageId for the session
    await this.chatSessionRepository.updateLastProcessedMessageId(
      sessionId,
      null,
    );

    console.log(chalk.red(`Rollback complete for session ${sessionId}.`));
  }

  private async generateReport(
    sessionsProcessed: number,
    totalMessages: number,
    extractedEntities: ExtractedEntities,
    conflicts: Conflict[],
    confidenceScore: number,
  ): Promise<void> {
    console.log(chalk.cyan('\n--- Processing Report ---'));
    console.log(chalk.cyan(`Sessions Processed: ${sessionsProcessed}`));
    console.log(chalk.cyan(`Total Messages Processed: ${totalMessages}`));
    console.log(chalk.cyan('\nExtracted Entities:'));
    console.log(chalk.cyan(`- Domains: ${extractedEntities.domains.length}`));
    console.log(chalk.cyan(`- Features: ${extractedEntities.features.length}`));
    console.log(
      chalk.cyan(`- Requirements: ${extractedEntities.requirements.length}`),
    );
    console.log(chalk.cyan('\nConflicts Detected:'));
    conflicts.forEach((c) => {
      console.log(
        chalk.cyan(`- ${c.type}: ${c.message || 'No specific message'}`),
      );
    });
    console.log(
      chalk.cyan(`\nOverall Confidence Score: ${confidenceScore.toFixed(2)}`),
    );
    console.log(chalk.cyan('--- End Report ---\n'));
  }

  private mergeExtractedEntities(
    target: ExtractedEntities,
    source: ExtractedEntities,
  ): void {
    // Simple merge for reporting purposes, without conflict resolution
    target.domains.push(...source.domains);
    target.features.push(...source.features);
    target.requirements.push(...source.requirements);
  }
}
