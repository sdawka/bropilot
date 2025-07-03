import chalk from 'chalk';
import inquirer from 'inquirer';
import { KnowledgeGraph } from '../knowledgeGraph/KnowledgeGraph.js';
import {
  DomainSchema,
  ModuleSchema,
  ThingSchema,
  BehaviorSchema,
  FlowSchema,
  ComponentSchema,
  ScreenSchema,
  ModuleInterface,
  ModuleState,
} from '../database/schema.js';
import { ExtractedEntity, JsonSchema } from '../processing/types.js';
import { Domain } from '../repositories/DomainRepository.js';
import { Module } from '../repositories/ModuleRepository.js';
import { Feature } from '../repositories/FeatureRepository.js';
import { Thing } from '../repositories/ThingRepository.js';
import { Behavior } from '../repositories/BehaviorRepository.js';
import { Flow } from '../repositories/FlowRepository.js';
import { Component } from '../repositories/ComponentRepository.js';
import { Screen } from '../repositories/ScreenRepository.js';
import pluralize from 'pluralize'; // For naming conventions
import { ComponentGenerator } from './ComponentGenerator.js'; // Import ComponentGenerator

export interface ModuleGenerationOptions {
  domains?: string[];
  force?: boolean;
  interactive?: boolean;
  explain?: boolean;
}

export class ModuleGenerator {
  async generateFromDomains(
    kg: KnowledgeGraph,
    options: ModuleGenerationOptions,
  ): Promise<ModuleSchema[]> {
    // Changed return type to ModuleSchema[]
    // Get domains to process
    const domains = options.domains
      ? await kg.getDomainsByNames(options.domains)
      : await kg.getDomains(); // Changed to getDomains()

    const modules: ModuleSchema[] = []; // Changed type

    for (const domain of domains) {
      // Check if module already exists
      const existingModule = await kg.getModuleByDomain(domain.id);

      if (existingModule && !options.force) {
        continue;
      }

      // Analyze domain to determine module type
      const moduleType = await this.inferModuleType(domain, kg);

      // Generate module structure
      const module = await this.generateModule(domain, moduleType, kg);

      // Interactive mode for customization
      if (options.interactive) {
        // module = await this.customizeModule(module); // This method is not defined in the prompt
      }

      // Show explanation if requested
      if (options.explain) {
        this.explainGeneration(domain, module);
      }

      modules.push(module);
    }

    return modules;
  }

  private async inferModuleType(
    domain: DomainSchema, // Changed to DomainSchema
    kg: KnowledgeGraph,
  ): Promise<'core' | 'ui'> {
    // Get features for this domain
    const features = await kg.getFeaturesByDomain(domain.id);

    // Analyze feature descriptions for UI indicators
    const uiIndicators = [
      'display',
      'show',
      'view',
      'interface',
      'screen',
      'form',
      'dashboard',
      'page',
      'component',
      'user',
    ];

    let uiScore = 0;
    for (const feature of features) {
      // Parse requirements from JSON string
      const requirementsArray: string[] = JSON.parse(feature.requirements);
      const text = (
        feature.purpose +
        ' ' +
        requirementsArray.join(' ')
      ).toLowerCase();
      for (const indicator of uiIndicators) {
        if (text.includes(indicator)) {
          uiScore++;
        }
      }
    }

    // Check domain responsibilities
    const responsibilities: string[] = JSON.parse(domain.responsibilities); // Parse responsibilities from JSON string
    const responsibilitiesText = responsibilities.join(' ').toLowerCase();
    if (
      responsibilitiesText.includes('ui') ||
      responsibilitiesText.includes('interface')
    ) {
      uiScore += 5;
    }

    return uiScore >= 3 ? 'ui' : 'core';
  }

  private async generateModule(
    domain: DomainSchema, // Changed to DomainSchema
    type: 'core' | 'ui',
    kg: KnowledgeGraph,
  ): Promise<ModuleSchema> {
    // Changed return type to ModuleSchema
    const module: Partial<ModuleSchema> = {
      name: this.generateModuleName(domain.name),
      type,
      description: domain.description,
      domain_id: domain.id,
    };

    // Generate interface based on type
    const moduleInterface: ModuleInterface =
      type === 'ui'
        ? { type: 'web_app', description: `Web interface for ${domain.name}` }
        : { type: 'rpc_api', description: `API for ${domain.name} operations` };
    module.interface = JSON.stringify(moduleInterface); // Store as JSON string

    // Generate state management
    const moduleState: ModuleState =
      type === 'ui'
        ? { type: 'nanostores', stores: [] }
        : { type: 'postgresql', schema: `${module.name}_schema` };
    module.state = JSON.stringify(moduleState); // Store as JSON string

    // Generate Things from domain analysis
    const things = await this.generateThings(domain, kg);
    module.things = JSON.stringify(things); // Store as JSON string

    // Generate Behaviors from features
    const behaviors = await this.generateBehaviors(domain, kg);
    module.behaviors = JSON.stringify(behaviors); // Store as JSON string

    // Generate Flows
    const flows = await this.generateFlows(domain, behaviors, kg);
    module.flows = JSON.stringify(flows); // Store as JSON string

    // Generate UI components if applicable
    if (type === 'ui') {
      const components = await this.generateComponents(domain, flows);
      module.components = JSON.stringify(components); // Store as JSON string
      const screens = await this.generateScreens(domain, components);
      module.screens = JSON.stringify(screens); // Store as JSON string
    }

    return module as ModuleSchema; // Cast to ModuleSchema
  }

  private async generateThings(
    domain: DomainSchema, // Changed to DomainSchema
    kg: KnowledgeGraph,
  ): Promise<ThingSchema[]> {
    // Changed return type to ThingSchema[]
    const things: ThingSchema[] = []; // Changed type
    const features = await kg.getFeaturesByDomain(domain.id);

    // Extract entities from feature descriptions
    const entityExtractor = new EntityExtractor();
    const entities = entityExtractor.extract(features);

    for (const entity of entities) {
      const thing: ThingSchema = {
        // Changed type
        id: '', // Will be generated by repository
        module_id: '', // Will be set when saving to module
        name: entity.name,
        description: entity.description || `${entity.name} entity`, // Use optional description
        schema: JSON.stringify(this.generateSchema(entity)), // Store as JSON string
        invariants: JSON.stringify(this.generateInvariants(entity)), // Store as JSON string
        relationships: JSON.stringify(entity.relationships || []), // Store as JSON string
        created_at: Date.now(), // Added
        updated_at: Date.now(), // Added
      };

      things.push(thing);
    }

    // Add common things based on domain type
    const commonThings = this.getCommonThings(domain);
    things.push(...commonThings);

    return things;
  }

  private generateSchema(entity: ExtractedEntity): JsonSchema {
    const schema: JsonSchema = {
      type: 'object',
      properties: {},
      required: [],
    };

    // Always include ID
    schema.properties.id = {
      type: 'string',
      format: 'uuid',
    };
    schema.required.push('id');

    // Generate fields based on entity analysis
    if (entity.suggestedFields) {
      // Check if suggestedFields exists
      for (const field of entity.suggestedFields) {
        schema.properties[field.name] = {
          type: field.type,
          ...(field.constraints && { constraints: field.constraints }),
        };

        if (field.required) {
          schema.required.push(field.name);
        }
      }
    }

    // Add timestamps
    schema.properties.created_at = { type: 'string', format: 'date-time' };
    schema.properties.updated_at = { type: 'string', format: 'date-time' };

    return schema;
  }

  private async generateBehaviors(
    domain: DomainSchema, // Changed to DomainSchema
    kg: KnowledgeGraph,
  ): Promise<BehaviorSchema[]> {
    // Changed return type to BehaviorSchema[]
    const behaviors: BehaviorSchema[] = []; // Changed type
    const features = await kg.getFeaturesByDomain(domain.id);

    for (const feature of features) {
      // Analyze requirements to extract behaviors
      const extractedBehaviors = this.extractBehaviors(feature);

      for (const extracted of extractedBehaviors) {
        const behavior: BehaviorSchema = {
          // Changed type
          id: '', // Will be generated by repository
          module_id: '', // Will be set when saving to module
          name: this.generateBehaviorName(extracted.action),
          description: extracted.description,
          trigger: this.inferTrigger(extracted), // Added trigger
          input_schema: JSON.stringify({}), // Placeholder
          output_schema: JSON.stringify({}), // Placeholder
          actions: JSON.stringify(this.generateRules(extracted)), // Store as JSON string
          created_at: Date.now(), // Placeholder
          updated_at: Date.now(), // Placeholder
        };

        behaviors.push(behavior);
      }
    }

    return behaviors;
  }

  // Placeholder methods for now
  private generateModuleName(domainName: string): string {
    return pluralize.singular(domainName.toLowerCase().replace(/\s/g, '_'));
  }

  private generateBehaviorName(action: string): string {
    return pluralize.singular(action.toLowerCase().replace(/\s/g, '_'));
  }

  private explainGeneration(domain: DomainSchema, module: ModuleSchema): void {
    // Changed types
    // Explanation output removed for production cleanliness
    const moduleInterface: ModuleInterface = JSON.parse(module.interface);
    const moduleState: ModuleState = JSON.parse(module.state);
    // Module Type: ${module.type}
    // Interface: ${moduleInterface.description}
    // State Management: ${moduleState.type}
    // Add more details as needed
  }

  private generateInvariants(entity: ExtractedEntity): string[] {
    return []; // Placeholder
  }

  private getCommonThings(domain: DomainSchema): ThingSchema[] {
    // Changed type
    return []; // Placeholder
  }

  private extractBehaviors(feature: Feature): any[] {
    // Parse requirements from JSON string
    const requirementsArray: string[] = JSON.parse(feature.requirements);
    return [
      {
        action: feature.name,
        description: feature.purpose,
        preconditions: [],
        effects: [],
        rules: requirementsArray,
      },
    ]; // Placeholder
  }

  private inferTrigger(extractedBehavior: any): string {
    return 'rpc_call'; // Placeholder
  }

  private generateRules(extractedBehavior: any): string[] {
    return extractedBehavior.rules || []; // Placeholder
  }

  private async generateFlows(
    domain: DomainSchema,
    behaviors: BehaviorSchema[],
    kg: KnowledgeGraph,
  ): Promise<FlowSchema[]> {
    // Changed types
    return []; // Placeholder
  }

  private async generateComponents(
    domain: DomainSchema,
    flows: FlowSchema[],
  ): Promise<ComponentSchema[]> {
    const componentGenerator = new ComponentGenerator();
    return componentGenerator.generateComponents(domain, flows);
  }

  private async generateScreens(
    domain: DomainSchema,
    components: ComponentSchema[],
  ): Promise<ScreenSchema[]> {
    const componentGenerator = new ComponentGenerator();
    return componentGenerator.generateScreens(domain, components);
  }
}

// Entity extraction from natural language
class EntityExtractor {
  extract(features: Feature[]): ExtractedEntity[] {
    const entities = new Map<string, ExtractedEntity>();

    for (const feature of features) {
      // Parse requirements from JSON string
      const requirementsArray: string[] = JSON.parse(feature.requirements);
      const text = feature.purpose + ' ' + requirementsArray.join(' ');
      const extractedNouns = this.extractNouns(text);

      for (const noun of extractedNouns) {
        if (this.isLikelyEntity(noun)) {
          const entity: ExtractedEntity = entities.get(noun) || {
            // Explicitly type entity
            type: 'entity', // Default type
            name: noun,
            confidence: 1, // Default confidence
            sourceMessages: [], // Default source messages
            attributes: {}, // Default attributes
            description: `${noun} entity`,
            suggestedFields: [],
            relationships: [],
          };

          // Enhance entity with context
          this.enhanceEntity(entity, feature);

          entities.set(noun, entity);
        }
      }
    }

    return Array.from(entities.values());
  }

  // Placeholder methods for EntityExtractor
  private extractNouns(text: string): string[] {
    // This would typically use a natural language processing library
    // For now, a simple split and filter
    return text
      .split(/\s+/)
      .filter((word) => word.length > 2 && /^[a-zA-Z]+$/.test(word));
  }

  private isLikelyEntity(noun: string): boolean {
    // Simple heuristic: not a common verb or adjective
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'and',
      'or',
      'to',
      'be',
      'can',
      'will',
      'should',
      'would',
    ]);
    return !commonWords.has(noun.toLowerCase());
  }

  private enhanceEntity(entity: ExtractedEntity, feature: Feature): void {
    // Placeholder for adding fields and relationships based on feature context
    // For example, if feature is "User Registration", add "email", "password" fields to "User" entity
    if (
      entity.name.toLowerCase() === 'user' &&
      feature.name.toLowerCase().includes('register')
    ) {
      if (!entity.suggestedFields) {
        entity.suggestedFields = [];
      }
      entity.suggestedFields.push(
        { name: 'email', type: 'string', required: true },
        { name: 'password', type: 'string', required: true },
      );
    }
  }
}

// Module customization interface (from prompt, but not used in ModuleGenerator directly)
// Removed ModuleCustomizer from this file as it's a separate class
