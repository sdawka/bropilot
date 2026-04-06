import { z } from "zod";
import { apiResponse } from "./common.js";

// ─── GET /api/pipeline/status ──────────────────────────────────────────────

export const PipelineStepInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  space: z.string(),
});

export const PipelineStatusDataSchema = z.object({
  current_step: PipelineStepInfoSchema.nullable(),
  step_statuses: z.record(z.string(), z.string()),
});

export const PipelineStatusResponseSchema = apiResponse(PipelineStatusDataSchema);

export type PipelineStepInfo = z.infer<typeof PipelineStepInfoSchema>;
export type PipelineStatusData = z.infer<typeof PipelineStatusDataSchema>;
export type PipelineStatusResponse = z.infer<typeof PipelineStatusResponseSchema>;

// ─── POST /api/pipeline/advance ────────────────────────────────────────────

export const AdvanceStepDataSchema = z.object({
  step: PipelineStepInfoSchema,
});

export const AdvanceCompleteDataSchema = z.object({
  status: z.literal("pipeline_complete"),
});

export const AdvanceDataSchema = z.union([
  AdvanceStepDataSchema,
  AdvanceCompleteDataSchema,
]);

export const AdvanceResponseSchema = apiResponse(AdvanceDataSchema);

export type AdvanceStepData = z.infer<typeof AdvanceStepDataSchema>;
export type AdvanceCompleteData = z.infer<typeof AdvanceCompleteDataSchema>;
export type AdvanceData = z.infer<typeof AdvanceDataSchema>;
export type AdvanceResponse = z.infer<typeof AdvanceResponseSchema>;
