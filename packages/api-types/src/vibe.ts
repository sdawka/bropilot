import { z } from "zod";
import { apiResponse } from "./common.js";

// ─── POST /api/vibe/start ──────────────────────────────────────────────────

export const VibeStartRequestSchema = z.object({
  mode: z.enum(["mock", "llm"]).optional(),
});

export const VibeStartDataSchema = z.object({
  prompt: z.string(),
  step: z.literal("step1"),
});

export const VibeStartResponseSchema = apiResponse(VibeStartDataSchema);

export type VibeStartRequest = z.infer<typeof VibeStartRequestSchema>;
export type VibeStartData = z.infer<typeof VibeStartDataSchema>;
export type VibeStartResponse = z.infer<typeof VibeStartResponseSchema>;

// ─── POST /api/vibe/input ──────────────────────────────────────────────────

export const VibeInputRequestSchema = z.object({
  text: z.string(),
});

export const VibeInputDataSchema = z.union([
  z.object({ status: z.literal("input_received") }),
  z.object({ status: z.literal("no_more_questions") }),
  z.object({ next_question: z.string() }),
]);

export const VibeInputResponseSchema = apiResponse(VibeInputDataSchema);

export type VibeInputRequest = z.infer<typeof VibeInputRequestSchema>;
export type VibeInputData = z.infer<typeof VibeInputDataSchema>;
export type VibeInputResponse = z.infer<typeof VibeInputResponseSchema>;

// ─── POST /api/vibe/extract ────────────────────────────────────────────────

export const VibeExtractDataSchema = z.object({
  extracted: z.unknown(),
  status: z.string(),
  next: z.string().optional(),
  first_question: z.string().optional(),
  step2_error: z.string().optional(),
});

export const VibeExtractResponseSchema = apiResponse(VibeExtractDataSchema);

export type VibeExtractData = z.infer<typeof VibeExtractDataSchema>;
export type VibeExtractResponse = z.infer<typeof VibeExtractResponseSchema>;
