import { z } from 'zod';
import { ComponentsDocumentSchema } from './schemas.js';
import {
  DocumentGenerator,
  YAMLDocument,
  ValidationResult,
  KnowledgeGraph,
} from './index.js';
import { Component, Module } from '../repositories/index.js';

export class ComponentsYAMLGenerator implements DocumentGenerator {
  documentType = 'components';

  async generate(kg: KnowledgeGraph): Promise<YAMLDocument> {
    const components = await kg.getComponents(); // Assuming getComponents is available
    const result: { components: { [key: string]: any } } = { components: {} };

    for (const component of components) {
      const module = await kg.getModuleById(component.module_id); // Assuming getModuleById is available
      result.components[component.name] = {
        description: component.description,
        module: module?.name,
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

  validate(document: YAMLDocument): ValidationResult {
    const result = ComponentsDocumentSchema.safeParse(document);
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
