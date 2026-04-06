import { z } from "zod";
import { apiResponse } from "./common.js";

// ─── GET /api/knowledge ────────────────────────────────────────────────────

export const KnowledgeDataSchema = z.object({
  glossary: z.array(z.unknown()),
  decisions: z.array(z.unknown()),
  changelog: z.array(z.unknown()),
  xrefs: z.array(z.unknown()),
});

export const KnowledgeResponseSchema = apiResponse(KnowledgeDataSchema);

export type KnowledgeData = z.infer<typeof KnowledgeDataSchema>;
export type KnowledgeResponse = z.infer<typeof KnowledgeResponseSchema>;
