import { z } from "zod";
import { apiResponse } from "./common.js";

// ─── GET /api/recipe ───────────────────────────────────────────────────────

export const RecipeStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  space: z.string(),
  space_slots: z.array(z.string()),
  knowledge_contributes: z.array(z.string()),
  measurement_contributes: z.array(z.string()),
});

export const RecipeDataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  steps: z.array(RecipeStepSchema),
  acts: z.record(z.string(), z.unknown()),
});

export const RecipeResponseSchema = apiResponse(RecipeDataSchema);

export type RecipeStep = z.infer<typeof RecipeStepSchema>;
export type RecipeData = z.infer<typeof RecipeDataSchema>;
export type RecipeResponse = z.infer<typeof RecipeResponseSchema>;

// ─── GET /api/recipe/schemas ───────────────────────────────────────────────

export const SchemaEntrySchema = z.object({
  path: z.string(),
  schema: z.unknown().nullable(),
});

export const SchemasDataSchema = z.object({
  schemas: z.array(SchemaEntrySchema),
});

export const SchemasResponseSchema = apiResponse(SchemasDataSchema);

export type SchemaEntry = z.infer<typeof SchemaEntrySchema>;
export type SchemasData = z.infer<typeof SchemasDataSchema>;
export type SchemasResponse = z.infer<typeof SchemasResponseSchema>;
