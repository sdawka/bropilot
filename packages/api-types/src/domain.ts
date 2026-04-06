import { z } from "zod";
import { apiResponse } from "./common.js";

// ─── POST /api/domain/start ────────────────────────────────────────────────

export const DomainStartRequestSchema = z.object({
  mode: z.enum(["mock", "llm"]).optional(),
});

export const DomainStartDataSchema = z.object({
  prompt: z.string(),
  step: z.literal("step3"),
});

export const DomainStartResponseSchema = apiResponse(DomainStartDataSchema);

export type DomainStartRequest = z.infer<typeof DomainStartRequestSchema>;
export type DomainStartData = z.infer<typeof DomainStartDataSchema>;
export type DomainStartResponse = z.infer<typeof DomainStartResponseSchema>;

// ─── POST /api/domain/input ────────────────────────────────────────────────

export const DomainInputRequestSchema = z.object({
  text: z.string().min(1),
});

export const DomainInputDataSchema = z.object({
  status: z.literal("input_received"),
});

export const DomainInputResponseSchema = apiResponse(DomainInputDataSchema);

export type DomainInputRequest = z.infer<typeof DomainInputRequestSchema>;
export type DomainInputData = z.infer<typeof DomainInputDataSchema>;
export type DomainInputResponse = z.infer<typeof DomainInputResponseSchema>;

// ─── POST /api/domain/extract ──────────────────────────────────────────────

export const DomainExtractDataSchema = z.object({
  extracted: z.unknown(),
  status: z.string(),
  next: z.string().optional(),
  step4_prompt: z.string().optional(),
  step4_error: z.string().optional(),
});

export const DomainExtractResponseSchema = apiResponse(DomainExtractDataSchema);

export type DomainExtractData = z.infer<typeof DomainExtractDataSchema>;
export type DomainExtractResponse = z.infer<typeof DomainExtractResponseSchema>;
