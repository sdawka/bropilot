import { z } from "zod";
import { apiResponse, SpecCategorySchema } from "./common.js";

// ─── Shared traceability types ─────────────────────────────────────────────

export const TraceabilityLinkTypeSchema = z.enum([
  "implementation",
  "test",
  "type",
  "migration",
]);

export const TraceabilityLinkSchema = z.object({
  type: TraceabilityLinkTypeSchema,
  file_path: z.string(),
  function_name: z.string().optional(),
  line_range: z.tuple([z.number(), z.number()]).optional(),
});

export const TraceabilityEntrySchema = z.object({
  spec_category: z.string(),
  spec_id: z.string(),
  links: z.array(TraceabilityLinkSchema),
});

export type TraceabilityLinkType = z.infer<typeof TraceabilityLinkTypeSchema>;
export type TraceabilityLink = z.infer<typeof TraceabilityLinkSchema>;
export type TraceabilityEntry = z.infer<typeof TraceabilityEntrySchema>;

// ─── GET /api/traceability ─────────────────────────────────────────────────

export const CategoryCoverageSchema = z.object({
  total: z.number(),
  linked: z.number(),
  unlinked: z.number(),
});

export const CoverageSummarySchema = z.object({
  total_specs: z.number(),
  total_linked: z.number(),
  total_unlinked: z.number(),
  by_category: z.record(z.string(), CategoryCoverageSchema),
});

export const TraceabilityMatrixDataSchema = z.object({
  entries: z.array(TraceabilityEntrySchema),
  coverage: CoverageSummarySchema,
});

export const TraceabilityMatrixResponseSchema = apiResponse(
  TraceabilityMatrixDataSchema
);

export type CategoryCoverage = z.infer<typeof CategoryCoverageSchema>;
export type CoverageSummary = z.infer<typeof CoverageSummarySchema>;
export type TraceabilityMatrixData = z.infer<typeof TraceabilityMatrixDataSchema>;
export type TraceabilityMatrixResponse = z.infer<typeof TraceabilityMatrixResponseSchema>;

// ─── GET /api/traceability/:category/:spec_id ──────────────────────────────

export const TraceabilityEntryResponseSchema = apiResponse(
  TraceabilityEntrySchema
);

export type TraceabilityEntryResponse = z.infer<typeof TraceabilityEntryResponseSchema>;

// ─── PUT /api/traceability/:category/:spec_id ──────────────────────────────

export const TraceabilityPutRequestSchema = z.object({
  links: z.array(TraceabilityLinkSchema),
});

export const TraceabilityPutDataSchema = z.object({
  spec_category: z.string(),
  spec_id: z.string(),
});

export const TraceabilityPutResponseSchema = apiResponse(
  TraceabilityPutDataSchema
);

export type TraceabilityPutRequest = z.infer<typeof TraceabilityPutRequestSchema>;
export type TraceabilityPutData = z.infer<typeof TraceabilityPutDataSchema>;
export type TraceabilityPutResponse = z.infer<typeof TraceabilityPutResponseSchema>;
