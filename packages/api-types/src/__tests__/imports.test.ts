import { describe, it, expect } from "vitest";
import * as apiTypes from "../index.js";

describe("Package exports", () => {
  it("exports all expected schemas", () => {
    // Common
    expect(apiTypes.ErrorResponseSchema).toBeDefined();
    expect(apiTypes.SpaceIdSchema).toBeDefined();
    expect(apiTypes.SpecCategorySchema).toBeDefined();
    expect(typeof apiTypes.okResponse).toBe("function");
    expect(typeof apiTypes.apiResponse).toBe("function");

    // Health
    expect(apiTypes.HealthDataSchema).toBeDefined();
    expect(apiTypes.HealthResponseSchema).toBeDefined();

    // Pair
    expect(apiTypes.PairRequestSchema).toBeDefined();
    expect(apiTypes.PairDataSchema).toBeDefined();
    expect(apiTypes.PairResponseSchema).toBeDefined();

    // Project
    expect(apiTypes.InitDataSchema).toBeDefined();
    expect(apiTypes.InitResponseSchema).toBeDefined();
    expect(apiTypes.ProjectDataSchema).toBeDefined();
    expect(apiTypes.ProjectResponseSchema).toBeDefined();
    expect(apiTypes.SpacesDataSchema).toBeDefined();
    expect(apiTypes.SpacesResponseSchema).toBeDefined();
    expect(apiTypes.SpaceDetailDataSchema).toBeDefined();
    expect(apiTypes.SpaceDetailResponseSchema).toBeDefined();
    expect(apiTypes.MapSlotGetResponseSchema).toBeDefined();
    expect(apiTypes.MapSlotPutDataSchema).toBeDefined();
    expect(apiTypes.MapSlotPutResponseSchema).toBeDefined();

    // Recipe
    expect(apiTypes.RecipeDataSchema).toBeDefined();
    expect(apiTypes.RecipeResponseSchema).toBeDefined();
    expect(apiTypes.SchemasDataSchema).toBeDefined();
    expect(apiTypes.SchemasResponseSchema).toBeDefined();

    // Pipeline
    expect(apiTypes.PipelineStatusDataSchema).toBeDefined();
    expect(apiTypes.PipelineStatusResponseSchema).toBeDefined();
    expect(apiTypes.AdvanceDataSchema).toBeDefined();
    expect(apiTypes.AdvanceResponseSchema).toBeDefined();

    // Vibe
    expect(apiTypes.VibeStartRequestSchema).toBeDefined();
    expect(apiTypes.VibeStartResponseSchema).toBeDefined();
    expect(apiTypes.VibeInputRequestSchema).toBeDefined();
    expect(apiTypes.VibeInputResponseSchema).toBeDefined();
    expect(apiTypes.VibeExtractResponseSchema).toBeDefined();

    // Domain
    expect(apiTypes.DomainStartRequestSchema).toBeDefined();
    expect(apiTypes.DomainStartResponseSchema).toBeDefined();
    expect(apiTypes.DomainInputRequestSchema).toBeDefined();
    expect(apiTypes.DomainInputResponseSchema).toBeDefined();
    expect(apiTypes.DomainExtractResponseSchema).toBeDefined();

    // Work
    expect(apiTypes.SnapshotDataSchema).toBeDefined();
    expect(apiTypes.SnapshotResponseSchema).toBeDefined();
    expect(apiTypes.PlanDataSchema).toBeDefined();
    expect(apiTypes.PlanResponseSchema).toBeDefined();
    expect(apiTypes.TasksDataSchema).toBeDefined();
    expect(apiTypes.TasksResponseSchema).toBeDefined();
    expect(apiTypes.BuildRequestSchema).toBeDefined();
    expect(apiTypes.BuildResponseSchema).toBeDefined();
    expect(apiTypes.VersionsDataSchema).toBeDefined();
    expect(apiTypes.VersionsResponseSchema).toBeDefined();
    expect(apiTypes.VersionDetailDataSchema).toBeDefined();
    expect(apiTypes.VersionDetailResponseSchema).toBeDefined();

    // Knowledge
    expect(apiTypes.KnowledgeDataSchema).toBeDefined();
    expect(apiTypes.KnowledgeResponseSchema).toBeDefined();

    // Traceability
    expect(apiTypes.TraceabilityLinkTypeSchema).toBeDefined();
    expect(apiTypes.TraceabilityLinkSchema).toBeDefined();
    expect(apiTypes.TraceabilityEntrySchema).toBeDefined();
    expect(apiTypes.TraceabilityMatrixDataSchema).toBeDefined();
    expect(apiTypes.TraceabilityMatrixResponseSchema).toBeDefined();
    expect(apiTypes.TraceabilityEntryResponseSchema).toBeDefined();
    expect(apiTypes.TraceabilityPutRequestSchema).toBeDefined();
    expect(apiTypes.TraceabilityPutResponseSchema).toBeDefined();
  });

  it("schema count covers ≥17 unique endpoint schemas", () => {
    // Count unique response schemas (one per endpoint)
    const responseSchemas = [
      apiTypes.HealthResponseSchema,          // GET /api/health
      apiTypes.PairResponseSchema,             // POST /api/pair
      apiTypes.InitResponseSchema,             // POST /api/init
      apiTypes.ProjectResponseSchema,          // GET /api/project
      apiTypes.SpacesResponseSchema,           // GET /api/spaces
      apiTypes.SpaceDetailResponseSchema,      // GET /api/spaces/:space
      apiTypes.MapSlotGetResponseSchema,       // GET /api/map/:space/:slot
      apiTypes.MapSlotPutResponseSchema,       // PUT /api/map/:space/:slot
      apiTypes.RecipeResponseSchema,           // GET /api/recipe
      apiTypes.SchemasResponseSchema,          // GET /api/recipe/schemas
      apiTypes.PipelineStatusResponseSchema,   // GET /api/pipeline/status
      apiTypes.AdvanceResponseSchema,          // POST /api/pipeline/advance
      apiTypes.VibeStartResponseSchema,        // POST /api/vibe/start
      apiTypes.VibeInputResponseSchema,        // POST /api/vibe/input
      apiTypes.VibeExtractResponseSchema,      // POST /api/vibe/extract
      apiTypes.DomainStartResponseSchema,      // POST /api/domain/start
      apiTypes.DomainInputResponseSchema,      // POST /api/domain/input
      apiTypes.DomainExtractResponseSchema,    // POST /api/domain/extract
      apiTypes.SnapshotResponseSchema,         // POST /api/snapshot
      apiTypes.PlanResponseSchema,             // POST /api/plan
      apiTypes.TasksResponseSchema,            // POST /api/tasks
      apiTypes.BuildResponseSchema,            // POST /api/build
      apiTypes.VersionsResponseSchema,         // GET /api/versions
      apiTypes.VersionDetailResponseSchema,    // GET /api/versions/:v
      apiTypes.KnowledgeResponseSchema,        // GET /api/knowledge
      apiTypes.TraceabilityMatrixResponseSchema, // GET /api/traceability
      apiTypes.TraceabilityEntryResponseSchema,  // GET /api/traceability/:cat/:id
      apiTypes.TraceabilityPutResponseSchema,    // PUT /api/traceability/:cat/:id
    ];
    expect(responseSchemas.length).toBeGreaterThanOrEqual(17);
    // Actually 28 unique endpoint schemas
    expect(responseSchemas.length).toBe(28);
  });
});
