import { z } from 'zod';

// Application Document Schema
export const ApplicationDocumentSchema = z.object({
  application: z.object({
    name: z.string(),
    purpose: z.string(),
    current_phase: z.number().min(1).max(5),
    current_version: z.string().regex(/^\d+\.\d+\.\d+$/),
    constraints: z.array(z.string()).optional(),
    success_metrics: z.array(z.string()).optional(),
  }),
});

// Domains Document Schema
export const DomainsDocumentSchema = z.object({
  domains: z.record(
    z.string(), // Domain name as key
    z.object({
      description: z.string().optional(),
      responsibilities: z.array(z.string()).optional(),
    }),
  ),
});

// Features Document Schema
export const FeaturesDocumentSchema = z.object({
  features: z.record(
    z.string(), // Feature name as key
    z.object({
      description: z.string().optional(),
      purpose: z.string().optional(),
      requirements: z.array(z.string()).optional(),
      metrics: z.array(z.string()).optional(),
      domains: z.array(z.string()).optional(), // Related domains
    }),
  ),
});

// Modules Document Schema
export const ModulesDocumentSchema = z.object({
  modules: z.record(
    z.string(), // Module name as key
    z.object({
      type: z.enum(['api', 'ui', 'data', 'logic', 'integration']),
      description: z.string().optional(),
      domain: z.string(), // Domain name
      interface: z
        .object({
          type: z.string(),
          description: z.string().optional(),
        })
        .optional(),
      state: z
        .object({
          type: z.string(),
          schema: z.record(z.string(), z.any()).optional(), // JSON schema
          stores: z.array(z.string()).optional(), // List of store names
        })
        .optional(),
      things: z
        .record(
          z.string(), // Thing name
          z.object({
            schema: z.record(z.string(), z.any()).optional(), // JSON schema
            invariants: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      behaviors: z
        .record(
          z.string(), // Behavior name
          z.object({
            description: z.string().optional(),
            input_schema: z.record(z.string(), z.any()).optional(),
            output_schema: z.record(z.string(), z.any()).optional(),
            actions: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      flows: z
        .record(
          z.string(), // Flow name
          z.object({
            description: z.string().optional(),
            steps: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      components: z
        .record(
          z.string(), // Component name
          z.object({
            description: z.string().optional(),
            props_schema: z.record(z.string(), z.any()).optional(),
            events_schema: z.record(z.string(), z.any()).optional(),
          }),
        )
        .optional(),
      screens: z
        .record(
          z.string(), // Screen name
          z.object({
            description: z.string().optional(),
            route: z.string().optional(),
            components: z.array(z.string()).optional(), // List of component names
          }),
        )
        .optional(),
    }),
  ),
});

// Components Document Schema (for UI modules)
export const ComponentsDocumentSchema = z.object({
  components: z.record(
    z.string(), // Component name
    z.object({
      description: z.string().optional(),
      module: z.string(), // Module name
      props_schema: z.record(z.string(), z.any()).optional(),
      events_schema: z.record(z.string(), z.any()).optional(),
    }),
  ),
});

// Infrastructure Document Schema
export const InfrastructureDocumentSchema = z.object({
  infrastructure: z.record(
    z.string(), // Infrastructure name
    z.object({
      type: z.string(),
      description: z.string().optional(),
      configuration: z.record(z.string(), z.any()).optional(),
    }),
  ),
});

// Contracts Document Schema
export const ContractsDocumentSchema = z.object({
  contracts: z.record(
    z.string(), // Contract name
    z.object({
      type: z.string(),
      description: z.string().optional(),
      schema: z.record(z.string(), z.any()).optional(),
      endpoints: z
        .record(
          z.string(), // Endpoint path
          z.object({
            method: z.string(),
            description: z.string().optional(),
            request_schema: z.record(z.string(), z.any()).optional(),
            response_schema: z.record(z.string(), z.any()).optional(),
          }),
        )
        .optional(),
    }),
  ),
});

// Releases Document Schema
export const ReleasesDocumentSchema = z.object({
  releases: z.record(
    z.string(), // Release version
    z.object({
      description: z.string().optional(),
      release_date: z.number().optional(), // Unix timestamp
      features_included: z.array(z.string()).optional(), // List of feature names
    }),
  ),
});

// Work Plan Document Schema
export const WorkPlanDocumentSchema = z.object({
  work_plan: z.object({
    name: z.string(),
    description: z.string().optional(),
    status: z.enum(['draft', 'active', 'completed', 'archived']),
    start_date: z.number().optional(), // Unix timestamp
    end_date: z.number().optional(), // Unix timestamp
    tasks: z
      .array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
          assigned_to: z.string().optional(),
          due_date: z.number().optional(), // Unix timestamp
        }),
      )
      .optional(),
  }),
});
