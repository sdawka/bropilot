import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { KnowledgeGraph } from 'bropilot-core/knowledgeGraph/KnowledgeGraph';
import { AppDatabase } from 'bropilot-core/database/Database';
import { ModuleGenerator } from 'bropilot-core/generation/ModuleGenerator';
import {
  ModuleSchema,
  ThingSchema,
  BehaviorSchema,
  FlowSchema,
  ComponentSchema,
  ScreenSchema,
} from 'bropilot-core/database/schema';

interface GenerateOptions {
  domains?: string[];
  force?: boolean;
  interactive?: boolean;
  explain?: boolean;
}

export class GenerateCommand {
  private kg: KnowledgeGraph;
  private db: AppDatabase;

  constructor(db: AppDatabase, kg: KnowledgeGraph) {
    this.db = db;
    this.kg = kg;
  }

  public register(program: Command) {
    program
      .command('generate')
      .description('Generates module structures from domain definitions.')
      .option(
        '-d, --domains <domains...>',
        'Specify domains to generate modules for (comma-separated).',
      )
      .option(
        '-f, --force',
        'Force generation even if modules already exist.',
        false,
      )
      .option(
        '-i, --interactive',
        'Enable interactive customization of generated modules.',
        false,
      )
      .option(
        '-e, --explain',
        'Show explanations for generated structures.',
        false,
      )
      .action(async (options: GenerateOptions) => {
        await this.execute(options);
      });
  }

  async execute(options: GenerateOptions): Promise<void> {
    console.log(chalk.blue('Starting module generation...'));
    const moduleGenerator = new ModuleGenerator();

    try {
      const generatedModules = await moduleGenerator.generateFromDomains(
        this.kg,
        options,
      );

      if (generatedModules.length > 0) {
        console.log(
          chalk.green(
            `Successfully generated ${generatedModules.length} modules.`,
          ),
        );
        // Save generated modules to the database
        // Instantiate repositories
        const dbInstance = this.db.getDB();
        // Use dynamic import to avoid circular dependency issues if any
        const { ModuleRepository } = await import(
          '../../../core/src/repositories/ModuleRepository.js'
        );
        const { ThingRepository } = await import(
          '../../../core/src/repositories/ThingRepository.js'
        );
        const { BehaviorRepository } = await import(
          '../../../core/src/repositories/BehaviorRepository.js'
        );
        const { FlowRepository } = await import(
          '../../../core/src/repositories/FlowRepository.js'
        );
        const { ComponentRepository } = await import(
          '../../../core/src/repositories/ComponentRepository.js'
        );
        const { ScreenRepository } = await import(
          '../../../core/src/repositories/ScreenRepository.js'
        );

        const moduleRepo = new ModuleRepository(dbInstance);
        const thingRepo = new ThingRepository(dbInstance);
        const behaviorRepo = new BehaviorRepository(dbInstance);
        const flowRepo = new FlowRepository(dbInstance);
        const componentRepo = new ComponentRepository(dbInstance);
        const screenRepo = new ScreenRepository(dbInstance);

        for (const module of generatedModules) {
          // Need to ensure module.id is set before saving
          if (!module.id) {
            module.id = this.db.generateId();
          }
          // Save module
          await moduleRepo.create(module);
          // Save nested entities
          if (Array.isArray(module.things)) {
            for (const thing of module.things) {
              await thingRepo.create(thing);
            }
          }
          if (Array.isArray(module.behaviors)) {
            for (const behavior of module.behaviors) {
              await behaviorRepo.create(behavior);
            }
          }
          if (Array.isArray(module.flows)) {
            for (const flow of module.flows) {
              await flowRepo.create(flow);
            }
          }
          if (Array.isArray(module.components)) {
            for (const component of module.components) {
              await componentRepo.create(component);
            }
          }
          if (Array.isArray(module.screens)) {
            for (const screen of module.screens) {
              await screenRepo.create(screen);
            }
          }
          console.log(
            chalk.green(
              `Generated module: ${module.name} (Type: ${module.type})`,
            ),
          );
        }
      } else {
        console.log(chalk.yellow('No new modules generated.'));
      }
    } catch (error: any) {
      console.error(
        chalk.red(`Error during module generation: ${error.message}`),
      );
    }
  }
}

// Module customization interface (from prompt)
class ModuleCustomizer {
  async customize(module: ModuleSchema): Promise<ModuleSchema> {
    console.log(chalk.blue(`\nCustomizing module: ${module.name}`));

    // Show current structure
    this.displayModule(module);

    // Interactive customization menu
    const choices = [
      'Add Thing',
      'Add Behavior',
      'Add Flow',
      'Modify Interface',
      'Modify State',
      'Done',
    ];

    while (true) {
      const { action } = await inquirer.prompt({
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices,
      });

      if (action === 'Done') break;

      switch (action) {
        case 'Add Thing':
          // module.things.push(await this.createThing()); // createThing not defined
          break;
        case 'Add Behavior':
          // module.behaviors.push(await this.createBehavior()); // createBehavior not defined
          break;
        // ... other actions
      }
    }

    return module;
  }

  private displayModule(module: ModuleSchema): void {
    console.log(JSON.stringify(module, null, 2));
  }
}
