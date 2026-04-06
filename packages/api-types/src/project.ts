import { z } from "zod";
import { apiResponse, SpaceIdSchema } from "./common.js";

// ─── POST /api/init ────────────────────────────────────────────────────────

export const InitDataSchema = z.object({
  status: z.enum(["initialized", "already_initialized"]),
  path: z.string(),
});

export const InitResponseSchema = apiResponse(InitDataSchema);

export type InitData = z.infer<typeof InitDataSchema>;
export type InitResponse = z.infer<typeof InitResponseSchema>;

// ─── GET /api/project ──────────────────────────────────────────────────────

export const RecipeInfoSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    description: z.string(),
  })
  .nullable();

export const ProjectDataSchema = z.object({
  project: z.record(z.string(), z.unknown()),
  recipe: RecipeInfoSchema,
});

export const ProjectResponseSchema = apiResponse(ProjectDataSchema);

export type ProjectData = z.infer<typeof ProjectDataSchema>;
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

// ─── GET /api/spaces ───────────────────────────────────────────────────────

export const SlotDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
});

export const SpaceDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  governs: z.string(),
  cross_cutting: z.boolean(),
  required_slots: z.array(SlotDefSchema),
});

export const SpacesDataSchema = z.object({
  spaces: z.array(SpaceDefSchema),
});

export const SpacesResponseSchema = apiResponse(SpacesDataSchema);

export type SpaceDef = z.infer<typeof SpaceDefSchema>;
export type SpacesData = z.infer<typeof SpacesDataSchema>;
export type SpacesResponse = z.infer<typeof SpacesResponseSchema>;

// ─── GET /api/spaces/:space ────────────────────────────────────────────────

export const SpaceSlotSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  filled: z.boolean(),
  data: z.unknown().nullable(),
});

export const SpaceDetailDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  governs: z.string(),
  cross_cutting: z.boolean(),
  slots: z.array(SpaceSlotSchema),
});

export const SpaceDetailResponseSchema = apiResponse(SpaceDetailDataSchema);

export type SpaceSlot = z.infer<typeof SpaceSlotSchema>;
export type SpaceDetailData = z.infer<typeof SpaceDetailDataSchema>;
export type SpaceDetailResponse = z.infer<typeof SpaceDetailResponseSchema>;

// ─── GET /api/map/:space/:slot ─────────────────────────────────────────────
// Data is the raw slot content — an arbitrary JSON object/array

export const MapSlotGetResponseSchema = apiResponse(z.unknown());

export type MapSlotGetResponse = z.infer<typeof MapSlotGetResponseSchema>;

// ─── PUT /api/map/:space/:slot ─────────────────────────────────────────────

export const MapSlotPutRequestSchema = z.record(z.string(), z.unknown());

export const MapSlotPutDataSchema = z.object({
  space: z.string(),
  slot: z.string(),
});

export const MapSlotPutResponseSchema = apiResponse(MapSlotPutDataSchema);

export type MapSlotPutRequest = z.infer<typeof MapSlotPutRequestSchema>;
export type MapSlotPutData = z.infer<typeof MapSlotPutDataSchema>;
export type MapSlotPutResponse = z.infer<typeof MapSlotPutResponseSchema>;
