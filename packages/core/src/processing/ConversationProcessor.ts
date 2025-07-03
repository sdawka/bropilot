import { LLMProvider } from '../llm/LLMProvider.js';
import { PromptTemplate } from '../llm/PromptTemplate.js';
import {
  ChatMessage,
  ProcessingResult,
  ExtractedEntities,
  Conflict,
  ExtractedEntity,
  ExtractedDomain,
  ExtractedFeature,
  ExtractedRequirement,
} from './types.js';
import { TokenUtils } from '../llm/TokenUtils.js';

export class ConversationProcessor {
  private llm: LLMProvider;
  private promptTemplate: PromptTemplate;
  private maxTokensPerChunk: number;

  constructor(
    llm: LLMProvider,
    promptTemplate: PromptTemplate,
    maxTokensPerChunk: number = 4000,
  ) {
    this.llm = llm;
    this.promptTemplate = promptTemplate;
    this.maxTokensPerChunk = maxTokensPerChunk;
  }

  // TODO: Streaming processing for large conversations could be implemented here (yielding results as they are processed).
  async process(messages: ChatMessage[]): Promise<ProcessingResult> {
    const allEntities: ExtractedEntities = {
      domains: [],
      features: [],
      requirements: [],
    };
    let totalProcessedMessages = 0;
    const conflicts: Conflict[] = [];

    // Chunk messages if too long
    const chunks = this.chunkMessages(messages);

    for (const chunk of chunks) {
      // Format conversation for LLM
      const conversation = this.formatConversation(chunk);

      // Execute extraction prompt
      const response = await this.llm.complete(
        this.promptTemplate.render({ chat_content: conversation }),
        { responseFormat: 'json' },
      );

      // Parse and validate response
      let extracted: ExtractedEntities;
      try {
        extracted = this.parseResponse(response.content);
      } catch (error) {
        console.error('Error parsing LLM response:', error);
        // Handle parsing error, perhaps add a conflict or skip this chunk
        continue;
      }

      // Add source message references
      this.addSourceReferences(extracted, chunk);

      // Merge with existing entities and detect conflicts during merge
      this.mergeEntities(allEntities, extracted, conflicts);
      totalProcessedMessages += chunk.length;
    }

    return {
      processedMessages: totalProcessedMessages,
      extractedEntities: allEntities,
      conflicts: conflicts,
      confidence: this.calculateConfidence(allEntities),
    };
  }

  private chunkMessages(messages: ChatMessage[]): ChatMessage[][] {
    const chunks: ChatMessage[][] = [];
    let currentChunk: ChatMessage[] = [];
    let currentTokenCount = 0;

    for (const message of messages) {
      const messageTokens = TokenUtils.countTokens(message.content);
      if (
        currentTokenCount + messageTokens > this.maxTokensPerChunk &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentTokenCount = 0;
      }
      currentChunk.push(message);
      currentTokenCount += messageTokens;
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    return chunks;
  }

  private formatConversation(messages: ChatMessage[]): string {
    return messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
  }

  private parseResponse(responseContent: string): ExtractedEntities {
    const parsed = JSON.parse(responseContent);
    // Basic validation to ensure it matches ExtractedEntities structure
    if (
      !parsed.domains ||
      !Array.isArray(parsed.domains) ||
      !parsed.features ||
      !Array.isArray(parsed.features) ||
      !parsed.requirements ||
      !Array.isArray(parsed.requirements)
    ) {
      throw new Error(
        'Invalid LLM response format. Expected domains, features, and requirements arrays.',
      );
    }
    return parsed;
  }

  private addSourceReferences(
    extracted: ExtractedEntities,
    messages: ChatMessage[],
  ): void {
    const messageIds = messages.map((msg) => msg.id);

    extracted.domains.forEach((d) => {
      if (!d.sourceMessages) d.sourceMessages = [];
      d.sourceMessages.push(...messageIds);
    });
    extracted.features.forEach((f) => {
      if (!f.sourceMessages) f.sourceMessages = [];
      f.sourceMessages.push(...messageIds);
    });
    extracted.requirements.forEach((r) => {
      if (!r.sourceMessages) r.sourceMessages = [];
      r.sourceMessages.push(...messageIds);
    });
  }

  private mergeEntities(
    target: ExtractedEntities,
    source: ExtractedEntities,
    conflicts: Conflict[],
  ): void {
    // Merge domains
    source.domains.forEach((newDomain) => {
      const existingDomain = target.domains.find(
        (d) => d.name === newDomain.name,
      );
      if (existingDomain) {
        // Update existing domain, handle conflicts
        if (existingDomain.description !== newDomain.description) {
          conflicts.push({
            type: 'domain_description_mismatch',
            entity1: existingDomain,
            entity2: newDomain,
            resolution: 'manual',
            message: `Domain '${newDomain.name}' has conflicting descriptions.`,
          });
        }
        existingDomain.sourceMessages.push(...newDomain.sourceMessages);
        existingDomain.confidence = Math.max(
          existingDomain.confidence,
          newDomain.confidence,
        );
        // Merge attributes if any
        Object.assign(existingDomain.attributes, newDomain.attributes);
      } else {
        target.domains.push(newDomain);
      }
    });

    // Merge features
    source.features.forEach((newFeature) => {
      const existingFeature = target.features.find(
        (f) => f.name === newFeature.name,
      );
      if (existingFeature) {
        // Update existing feature
        existingFeature.sourceMessages.push(...newFeature.sourceMessages);
        existingFeature.confidence = Math.max(
          existingFeature.confidence,
          newFeature.confidence,
        );
        // Merge domains (deduplicate)
        newFeature.domains.forEach((d) => {
          if (!existingFeature.domains.includes(d)) {
            existingFeature.domains.push(d);
          }
        });
        // Merge attributes if any
        Object.assign(existingFeature.attributes, newFeature.attributes);
      } else {
        target.features.push(newFeature);
      }
    });

    // Merge requirements
    source.requirements.forEach((newRequirement) => {
      const existingRequirement = target.requirements.find(
        (r) => r.name === newRequirement.name,
      );
      if (existingRequirement) {
        // Update existing requirement
        existingRequirement.sourceMessages.push(
          ...newRequirement.sourceMessages,
        );
        existingRequirement.confidence = Math.max(
          existingRequirement.confidence,
          newRequirement.confidence,
        );
        // If new requirement has a feature and existing doesn't, assign it
        if (newRequirement.feature && !existingRequirement.feature) {
          existingRequirement.feature = newRequirement.feature;
        } else if (
          newRequirement.feature &&
          existingRequirement.feature &&
          newRequirement.feature !== existingRequirement.feature
        ) {
          conflicts.push({
            type: 'requirement_feature_mismatch',
            entity1: existingRequirement,
            entity2: newRequirement,
            resolution: 'manual',
            message: `Requirement '${newRequirement.name}' has conflicting feature assignments.`,
          });
        }
        // Merge attributes if any
        Object.assign(
          existingRequirement.attributes,
          newRequirement.attributes,
        );
      } else {
        target.requirements.push(newRequirement);
      }
    });
  }

  private calculateConfidence(entities: ExtractedEntities): number {
    const allConfidences: number[] = [];
    entities.domains.forEach((d) => allConfidences.push(d.confidence));
    entities.features.forEach((f) => allConfidences.push(f.confidence));
    entities.requirements.forEach((r) => allConfidences.push(r.confidence));

    if (allConfidences.length === 0) {
      return 0;
    }

    const sum = allConfidences.reduce((acc, val) => acc + val, 0);
    return sum / allConfidences.length;
  }
}
