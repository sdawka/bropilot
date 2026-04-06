import { z } from "zod";
import { apiResponse } from "./common.js";

// ─── GET /api/health ───────────────────────────────────────────────────────

export const HealthDataSchema = z.object({
  status: z.string(),
});

export const HealthResponseSchema = apiResponse(HealthDataSchema);

export type HealthData = z.infer<typeof HealthDataSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
