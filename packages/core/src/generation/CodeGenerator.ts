// CodeGenerator.ts
// Core code generation system for Bropilot
// Implements template-based, multi-language, modification-preserving code generation with knowledge graph sync

import { KnowledgeGraph } from '../knowledgeGraph/KnowledgeGraph.js';
import { AppDatabase } from '../database/Database.js';
import type {
  Task,
  Module,
  Thing,
  Behavior,
  Flow,
  Component,
  CodeDependency,
  ProjectConfig,
  Import,
  Export,
  GeneratedTest,
} from '../types/module-generation.js';
// TODO: Import AST, formatting, and template libraries as needed
// Prettier-based formatter for TypeScript
import prettier from 'prettier';

export class PrettierTypeScriptFormatter implements CodeFormatter {
  async format(code: string): Promise<string> {
    return prettier.format(code, { parser: 'typescript' });
  }
}

export interface CodeGenerationContext {
  task: Task;
  module: Module;
  entity: Thing | Behavior | Flow | Component;
  existingCode?: string;
  dependencies: CodeDependency[];
  templates: TemplateRegistry;
  projectConfig: ProjectConfig;
}

export interface GeneratedCode {
  filePath: string;
  content: string;
  language: string;
  imports: Import[];
  exports: Export[];
  tests?: GeneratedTest[];
}

export class CodeGenerator {
  private templates: TemplateRegistry;
  private analyzers: Map<string, CodeAnalyzer>;
  private formatters: Map<string, CodeFormatter>;
  private preserver: CodePreserver;
  private tracker: ImplementationTracker;
  constructor(
    templates: TemplateRegistry,
    analyzers: Map<string, CodeAnalyzer>,
    formatters?: Map<string, CodeFormatter>,
    preserver?: CodePreserver,
    tracker?: ImplementationTracker,
  ) {
    this.templates = templates;
    this.analyzers = analyzers;
    // Register default formatters if not provided
    if (formatters) {
      this.formatters = formatters;
    } else {
      this.formatters = new Map();
      this.formatters.set('typescript', new PrettierTypeScriptFormatter());
    }
    this.preserver = preserver ?? new CodePreserver();
    if (tracker) {
      this.tracker = tracker;
    } else {
      const db = new AppDatabase();
      this.tracker = new ImplementationTracker(new KnowledgeGraph(db));
    }
  }

  async generateCode(context: CodeGenerationContext): Promise<GeneratedCode[]> {
    const results: GeneratedCode[] = [];
    switch (context.entity.type) {
      case 'thing':
        results.push(...(await this.generateThing(context)));
        break;
      case 'behavior':
        results.push(...(await this.generateBehavior(context)));
        break;
      case 'flow':
        results.push(...(await this.generateFlow(context)));
        break;
      case 'component':
        results.push(...(await this.generateComponent(context)));
        break;
    }
    for (const generated of results) {
      await this.postProcess(generated, context);
    }
    return results;
  }

  private async generateThing(
    context: CodeGenerationContext,
  ): Promise<GeneratedCode[]> {
    const thing = context.entity as Thing;
    const results: GeneratedCode[] = [];

    // 1. Get the entity template
    const entityTemplate = await context.templates.get(
      'thing.entity',
      context.projectConfig.language,
    );

    // 2. Render the template with context
    // Helper to map JSON schema types to Zod and TS types
    function zodType(prop: any): string {
      switch (prop.type) {
        case 'string':
          if (prop.format === 'email') return 'z.string().email()';
          if (prop.format === 'uuid') return 'z.string().uuid()';
          if (prop.format === 'date-time') return 'z.string().datetime()';
          return 'z.string()';
        case 'number':
          return 'z.number()';
        case 'integer':
          return 'z.number().int()';
        case 'boolean':
          return 'z.boolean()';
        case 'array':
          return `z.array(${zodType(prop.items || { type: 'string' })})`;
        case 'object':
          return 'z.object({})';
        default:
          return 'z.any()';
      }
    }
    function tsType(prop: any): string {
      switch (prop.type) {
        case 'string':
          return 'string';
        case 'number':
          return 'number';
        case 'integer':
          return 'number';
        case 'boolean':
          return 'boolean';
        case 'array':
          return `${tsType(prop.items || { type: 'string' })}[]`;
        case 'object':
          return 'Record<string, any>';
        default:
          return 'any';
      }
    }
    // Render the template with helpers
    const entityCode = entityTemplate.render({
      thing,
      module: context.module,
      imports: [],
      zodType,
      tsType,
    });

    // 3. Generate file path
    const filePath = `src/modules/${context.module.name}/entities/${thing.name}.ts`;

    // 4. Extract imports/exports (stub)
    const imports: Import[] = [];
    const exports: Export[] = [{ name: thing.name, type: 'class' }];

    // 5. Add to results
    results.push({
      filePath,
      content: entityCode,
      language: 'typescript',
      imports,
      exports,
    });

    // 6. Generate test file (stub)
    // Generate tests for each invariant
    // Generate a valid data object based on the schema
    function defaultValue(type: string) {
      switch (type) {
        case 'string':
          return "'example'";
        case 'number':
          return 42;
        case 'boolean':
          return true;
        case 'array':
          return '[]';
        case 'object':
          return '{}';
        default:
          return 'null';
      }
    }
    const schemaProps = thing.schema?.properties || {};
    const validData =
      '{\n' +
      Object.entries(schemaProps)
        .map(([k, v]) => {
          if (typeof v === 'object' && v.type) {
            return `  ${k}: ${defaultValue(v.type)},`;
          }
          return `  ${k}: null,`;
        })
        .join('\n') +
      '\n}';

    const invariantTests = (thing.invariants || [])
      .map(
        (inv, idx) => `
  it('should satisfy invariant: ${inv.replace(/'/g, "\\'")}', () => {
    const instance = new ${thing.name}(${validData});
    expect(() => instance['assert${idx}']()).not.toThrow();
  });
`,
      )
      .join('\n');

    const testTemplate = `
import { ${thing.name} } from './${thing.name}';

describe('${thing.name}', () => {
  it('should construct and validate', () => {
    // TODO: Add test logic
  });
${invariantTests}
});
`;
    results.push({
      filePath: `src/modules/${context.module.name}/entities/${thing.name}.test.ts`,
      content: testTemplate,
      language: 'typescript',
      imports: [],
      exports: [],
    });

    return results;
  }

  private async generateBehavior(
    context: CodeGenerationContext,
  ): Promise<GeneratedCode[]> {
    const behavior = context.entity as Behavior;
    const results: GeneratedCode[] = [];

    // 1. Get the behavior template (stub: use a simple string template for now)
    const behaviorTemplate = `
import { z } from 'zod';
// TODO: Add imports

export async function ${behavior.name}(input: any): Promise<any> {
  // TODO: Implement behavior logic
  return {};
}
`;

    // 2. Render the template (stub: no real rendering yet)
    const behaviorCode = behaviorTemplate;

    // 3. Generate file path
    const filePath = `src/modules/${context.module.name}/behaviors/${behavior.name}.ts`;

    // 4. Extract imports/exports (stub)
    const imports: Import[] = [];
    const exports: Export[] = [{ name: behavior.name, type: 'function' }];

    // 5. Add to results
    results.push({
      filePath,
      content: behaviorCode,
      language: 'typescript',
      imports,
      exports,
    });

    // 6. Generate test file (stub)
    const testTemplate = `
import { ${behavior.name} } from './${behavior.name}';

describe('${behavior.name}', () => {
  it('should execute behavior', async () => {
    // TODO: Add test logic
  });
});
`;
    results.push({
      filePath: `src/modules/${context.module.name}/behaviors/${behavior.name}.test.ts`,
      content: testTemplate,
      language: 'typescript',
      imports: [],
      exports: [],
    });

    return results;
  }

  private async generateFlow(
    context: CodeGenerationContext,
  ): Promise<GeneratedCode[]> {
    const flow = context.entity as Flow;
    const results: GeneratedCode[] = [];

    // 1. Get the flow template (stub: use a simple string template for now)
    const flowTemplate = `
export function ${flow.name}Flow(context: any): void {
  // TODO: Implement flow logic
}
`;

    // 2. Render the template (stub: no real rendering yet)
    const flowCode = flowTemplate;

    // 3. Generate file path
    const filePath = `src/modules/${context.module.name}/flows/${flow.name}.ts`;

    // 4. Extract imports/exports (stub)
    const imports: Import[] = [];
    const exports: Export[] = [{ name: `${flow.name}Flow`, type: 'function' }];

    // 5. Add to results
    results.push({
      filePath,
      content: flowCode,
      language: 'typescript',
      imports,
      exports,
    });

    // 6. Generate test file (stub)
    const testTemplate = `
import { ${flow.name}Flow } from './${flow.name}';

describe('${flow.name}Flow', () => {
  it('should execute flow', () => {
    // TODO: Add test logic
  });
});
`;
    results.push({
      filePath: `src/modules/${context.module.name}/flows/${flow.name}.test.ts`,
      content: testTemplate,
      language: 'typescript',
      imports: [],
      exports: [],
    });

    return results;
  }

  private async generateComponent(
    context: CodeGenerationContext,
  ): Promise<GeneratedCode[]> {
    const component = context.entity as Component;
    const results: GeneratedCode[] = [];

    // 1. Get the component template (stub: use a simple string template for now)
    const componentTemplate = `
<template>
  <div class="${component.name}">
    <!-- TODO: Implement component template -->
  </div>
</template>

<script setup lang="ts">
// TODO: Add imports and props
</script>

<style scoped>
.${component.name} {
  /* TODO: Add component styles */
}
</style>
`;

    // 2. Render the template (stub: no real rendering yet)
    const componentCode = componentTemplate;

    // 3. Generate file path
    const filePath = `src/modules/${context.module.name}/components/${component.name}.vue`;

    // 4. Extract imports/exports (stub)
    const imports: Import[] = [];
    const exports: Export[] = [{ name: component.name, type: 'component' }];

    // 5. Add to results
    results.push({
      filePath,
      content: componentCode,
      language: 'vue',
      imports,
      exports,
    });

    // 6. Generate test file (stub)
    const testTemplate = `
import { mount } from '@vue/test-utils';
import ${component.name} from './${component.name}.vue';

describe('${component.name}', () => {
  it('renders correctly', () => {
    const wrapper = mount(${component.name});
    expect(wrapper.exists()).toBe(true);
  });
});
`;
    results.push({
      filePath: `src/modules/${context.module.name}/components/${component.name}.test.ts`,
      content: testTemplate,
      language: 'typescript',
      imports: [],
      exports: [],
    });

    return results;
  }

  private async postProcess(
    generated: GeneratedCode,
    context: CodeGenerationContext,
  ): Promise<void> {
    // Format code if formatter exists for language
    const formatter = this.formatters.get(generated.language);
    if (formatter) {
      generated.content = await formatter.format(generated.content);
    }
    // Track in knowledge graph
    await this.tracker.trackImplementation(generated);
    // TODO: update imports, update exports, audit log, etc.
  }
}

// Template management
export class TemplateRegistry {
  private templates: Map<string, Template>;
  private customTemplates: Map<string, Template>;

  constructor() {
    this.templates = new Map();
    this.customTemplates = new Map();
    // Register built-in templates
    this.registerBuiltinTemplates();
  }

  private registerBuiltinTemplates() {
    // Add built-in thing.entity.typescript template (from spec)
    const thingEntityTs = `
import { z } from 'zod';
{{#imports}}
import { {{name}} } from '{{path}}';
{{/imports}}

// Schema validation
const {{thing.name}}Schema = z.object({
{{#thing.schema.properties}}
  {{name}}: {{type}},
{{/thing.schema.properties}}
});

export class {{thing.name}} {
{{#thing.schema.properties}}
  {{name}}: {{type}};
{{/thing.schema.properties}}
  
  constructor(data: unknown) {
    const validated = {{thing.name}}Schema.parse(data);
    Object.assign(this, validated);
  }
  
  // Invariant validation
  validate(): void {
    {{#thing.invariants}}
    this.assert{{@index}}();
    {{/thing.invariants}}
  }
  
  {{#thing.invariants}}
  private assert{{@index}}(): void {
    // {{.}}
    // TODO: Implement invariant
  }
  {{/thing.invariants}}
}
`;
    this.templates.set('thing.entity.typescript', new Template(thingEntityTs));
    // TODO: Add more built-in templates as needed
  }

  async get(templateName: string, language: string): Promise<Template> {
    const customKey = `${templateName}.${language}`;
    if (this.customTemplates.has(customKey)) {
      return this.customTemplates.get(customKey)!;
    }
    // Built-in
    const builtinKey = `${templateName}.${language}`;
    if (this.templates.has(builtinKey)) {
      return this.templates.get(builtinKey)!;
    }
    throw new Error(`No template found for ${templateName} in ${language}`);
  }

  registerCustom(name: string, language: string, template: string): void {
    const key = `${name}.${language}`;
    this.customTemplates.set(key, new Template(template));
  }
}

// Code preservation
export class CodePreserver {
  async preserveModifications(
    existingCode: string,
    newCode: string,
    language: string,
  ): Promise<string> {
    // TODO: Implement AST-based code preservation
    return newCode;
  }
}

// Knowledge graph synchronization
export class ImplementationTracker {
  private kg: KnowledgeGraph;
  constructor(kg: KnowledgeGraph) {
    this.kg = kg;
  }

  async trackImplementation(generated: GeneratedCode): Promise<void> {
    // TODO: Implement knowledge graph tracking
  }
}

// Template, CodeAnalyzer, CodeFormatter, etc. stubs
export class Template {
  constructor(private template: string) {}
  render(context: any): string {
    // TODO: Implement template rendering
    return '';
  }
}

export interface CodeAnalyzer {
  parse(code: string): any;
  generate(ast: any): string;
}

export interface CodeFormatter {
  format(code: string): Promise<string>;
}
