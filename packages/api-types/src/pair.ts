import { z } from "zod";
import { apiResponse } from "./common.js";

// ─── POST /api/pair ────────────────────────────────────────────────────────

export const PairRequestSchema = z.object({
  token: z.string(),
});

export const PairDataSchema = z.object({
  server_url: z.string(),
  project_name: z.string(),
  version: z.string(),
});

export const PairResponseSchema = apiResponse(PairDataSchema);

export type PairRequest = z.infer<typeof PairRequestSchema>;
export type PairData = z.infer<typeof PairDataSchema>;
export type PairResponse = z.infer<typeof PairResponseSchema>;
