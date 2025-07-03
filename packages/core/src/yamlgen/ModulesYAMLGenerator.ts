import { z } from 'zod';
import { ModulesDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import {
  Module,
  Thing,
  Behavior,
  Flow,
  Component,
  Screen,
  Domain,
} from '../repositories/index.js';

export class ModulesYAMLGenerator implements DocumentGenerator {
  documentType = 'modules';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const modules = await kg.getModules();
    const result: { modules: { [key: string]: any } } = { modules: {} };

    for (const module of modules) {
      const domain = await kg.getDomainById(module.domain_id); // Assuming getDomainById is available
      const things = await kg.getThingsByModule(module.id);
      const behaviors = await kg.getBehaviorsByModule(module.id);
      const flows = await kg.getFlowsByModule(module.id);

      const moduleEntry: any = {
        type: module.type,
        description: module.description,
        domain: domain?.name,
        interface: JSON.parse(module.interface),
        state: JSON.parse(module.state),
        things: this.formatThings(things),
        behaviors: this.formatBehaviors(behaviors),
        flows: this.formatFlows(flows),
      };

      // Add UI-specific fields
      if (module.type === 'ui') {
        const components = await kg.getComponentsByModule(module.id);
        const screens = await kg.getScreensByModule(module.id);

        moduleEntry.components = this.formatComponents(components);
        moduleEntry.screens = this.formatScreens(screens);
      }
      result.modules[module.name] = moduleEntry;
    }

    return result;
  }

  private formatThings(things: Thing[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const thing of things) {
      result[thing.name] = {
        schema: thing.schema ? JSON.parse(thing.schema) : undefined,
        invariants: thing.invariants ? JSON.parse(thing.invariants) : undefined,
        relationships: thing.relationships
          ? JSON.parse(thing.relationships)
          : undefined,
      };
    }
    return result;
  }

  private formatBehaviors(behaviors: Behavior[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const behavior of behaviors) {
      result[behavior.name] = {
        description: behavior.description,
        trigger: behavior.trigger, // Added trigger
        input_schema: behavior.input_schema
          ? JSON.parse(behavior.input_schema)
          : undefined,
        output_schema: behavior.output_schema
          ? JSON.parse(behavior.output_schema)
          : undefined,
        actions: behavior.actions ? JSON.parse(behavior.actions) : undefined,
      };
    }
    return result;
  }

  private formatFlows(flows: Flow[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const flow of flows) {
      result[flow.name] = {
        description: flow.description,
        steps: flow.steps ? JSON.parse(flow.steps) : undefined,
      };
    }
    return result;
  }

  private formatComponents(components: Component[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const component of components) {
      result[component.name] = {
        description: component.description,
        props_schema: component.props_schema
          ? JSON.parse(component.props_schema)
          : undefined,
        events_schema: component.events_schema
          ? JSON.parse(component.events_schema)
          : undefined,
      };
    }
    return result;
  }

  private formatScreens(screens: Screen[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const screen of screens) {
      result[screen.name] = {
        description: screen.description,
        route: screen.route,
        components: screen.components
          ? JSON.parse(screen.components)
          : undefined,
      };
    }
    return result;
  }

  validate(document: YAMLDocument): ValidationResult {
    const result = ModulesDocumentSchema.safeParse(document);
    if (result.success) {
      return { valid: true };
    } else {
      return {
        valid: false,
        errors: result.error.errors.map((e) => e.message),
      };
    }
  }
}
