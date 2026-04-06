import { z } from "zod";

// ─── Common response wrappers ──────────────────────────────────────────────
// All API responses follow {ok: true, data: ...} or {ok: false, error: "..."}

/** Wraps any data schema in the standard success envelope */
export function okResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
  });
}

/** Standard error response */
export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Creates a union of success and error response for an endpoint */
export function apiResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("ok", [
    okResponse(dataSchema),
    ErrorResponseSchema,
  ]);
}

// ─── Shared field schemas ──────────────────────────────────────────────────

/** The 5 space identifiers */
export const SpaceIdSchema = z.enum([
  "problem",
  "solution",
  "work",
  "measurement",
  "knowledge",
]);

export type SpaceId = z.infer<typeof SpaceIdSchema>;

/** The 11 spec categories */
export const SpecCategorySchema = z.enum([
  "api",
  "behaviours",
  "constraints",
  "entities",
  "modules",
  "events",
  "externals",
  "views",
  "components",
  "streams",
  "infra",
]);

export type SpecCategory = z.infer<typeof SpecCategorySchema>;
