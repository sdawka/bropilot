import { jest } from '@jest/globals';
import { GenerateCommand } from '../commands/GenerateCommand.js';
import { AppDatabase } from 'bropilot-core/database/Database';
import { KnowledgeGraph } from 'bropilot-core/knowledgeGraph/KnowledgeGraph';
import { ModuleGenerator } from 'bropilot-core/generation/ModuleGenerator';
import { ModuleRepository } from 'bropilot-core/repositories/ModuleRepository';
import { ThingRepository } from 'bropilot-core/repositories/ThingRepository';
import { BehaviorRepository } from 'bropilot-core/repositories/BehaviorRepository';
import { FlowRepository } from 'bropilot-core/repositories/FlowRepository';
import { ComponentRepository } from 'bropilot-core/repositories/ComponentRepository';
import { ScreenRepository } from 'bropilot-core/repositories/ScreenRepository';
import {
  ModuleSchema,
  ThingSchema,
  BehaviorSchema,
  FlowSchema,
  ComponentSchema,
  ScreenSchema,
} from 'bropilot-core/database/schema';

jest.mock('../../../core/src/generation/ModuleGenerator.js');
jest.mock('../../../core/src/repositories/ModuleRepository.js');
jest.mock('../../../core/src/repositories/ThingRepository.js');
jest.mock('../../../core/src/repositories/BehaviorRepository.js');
jest.mock('../../../core/src/repositories/FlowRepository.js');
jest.mock('../../../core/src/repositories/ComponentRepository.js');
jest.mock('../../../core/src/repositories/ScreenRepository.js');

describe('GenerateCommand', () => {
  let db: AppDatabase;
  let kg: KnowledgeGraph;
  let moduleGenerator: jest.Mocked<ModuleGenerator>;
  let moduleRepo: jest.Mocked<ModuleRepository>;
  let thingRepo: jest.Mocked<ThingRepository>;
  let behaviorRepo: jest.Mocked<BehaviorRepository>;
  let flowRepo: jest.Mocked<FlowRepository>;
  let componentRepo: jest.Mocked<ComponentRepository>;
  let screenRepo: jest.Mocked<ScreenRepository>;
  let command: GenerateCommand;

  beforeEach(() => {
    db = {
      generateId: jest.fn(() => 'mod-1'),
      getDB: jest.fn(() => ({})),
    } as any;
    kg = {} as any;
    moduleGenerator = new (ModuleGenerator as any)();
    moduleRepo = new (ModuleRepository as any)();
    thingRepo = new (ThingRepository as any)();
    behaviorRepo = new (BehaviorRepository as any)();
    flowRepo = new (FlowRepository as any)();
    componentRepo = new (ComponentRepository as any)();
    screenRepo = new (ScreenRepository as any)();

    // Mock the methods on the prototype directly for ESM compatibility
    ModuleRepository.prototype.create = jest.fn(async (data) => data as any);
    ThingRepository.prototype.create = jest.fn(async (data) => data as any);
    BehaviorRepository.prototype.create = jest.fn(async (data) => data as any);
    FlowRepository.prototype.create = jest.fn(async (data) => data as any);
    ComponentRepository.prototype.create = jest.fn(async (data) => data as any);
    ScreenRepository.prototype.create = jest.fn(async (data) => data as any);

    command = new GenerateCommand(db, kg);
  });

  it('should save generated module and all nested entities', async () => {
    // Arrange: create a fake module with nested entities
    const fakeModule: ModuleSchema = {
      id: 'mod-1',
      name: 'TestModule',
      type: 'feature',
      things: [{ id: 'thing-1', name: 'Thing1' } as ThingSchema],
      behaviors: [{ id: 'beh-1', name: 'Behavior1' } as BehaviorSchema],
      flows: [{ id: 'flow-1', name: 'Flow1' } as FlowSchema],
      components: [{ id: 'comp-1', name: 'Component1' } as ComponentSchema],
      screens: [{ id: 'screen-1', name: 'Screen1' } as ScreenSchema],
    } as any;

    // Mock generateFromDomains to return the fakeModule
    ModuleGenerator.prototype.generateFromDomains = jest.fn(async () => [
      fakeModule,
    ]);

    // Act
    await command.execute({});

    // Assert: check that create methods are called for module and all nested entities
    expect(moduleRepo.create).toHaveBeenCalledWith(fakeModule);
    expect(thingRepo.create).toHaveBeenCalledWith(fakeModule.things[0]);
    expect(behaviorRepo.create).toHaveBeenCalledWith(fakeModule.behaviors[0]);
    expect(flowRepo.create).toHaveBeenCalledWith(fakeModule.flows[0]);
    expect(componentRepo.create).toHaveBeenCalledWith(fakeModule.components[0]);
    expect(screenRepo.create).toHaveBeenCalledWith(fakeModule.screens[0]);
  });
});
