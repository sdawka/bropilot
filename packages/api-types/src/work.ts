import { z } from "zod";
import { apiResponse } from "./common.js";

// ─── POST /api/snapshot ────────────────────────────────────────────────────

export const SnapshotDataSchema = z.object({
  version: z.number(),
  version_id: z.string(),
});

export const SnapshotResponseSchema = apiResponse(SnapshotDataSchema);

export type SnapshotData = z.infer<typeof SnapshotDataSchema>;
export type SnapshotResponse = z.infer<typeof SnapshotResponseSchema>;

// ─── POST /api/plan ────────────────────────────────────────────────────────

export const PlanSummarySchema = z.object({
  added: z.number(),
  modified: z.number(),
  removed: z.number(),
  by_space: z.record(z.string(), z.unknown()),
});

export const PlanDataSchema = z.object({
  version: z.number(),
  changes: z.number(),
  summary: PlanSummarySchema,
});

export const PlanResponseSchema = apiResponse(PlanDataSchema);

export type PlanSummary = z.infer<typeof PlanSummarySchema>;
export type PlanData = z.infer<typeof PlanDataSchema>;
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

// ─── POST /api/tasks ───────────────────────────────────────────────────────

export const TaskSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.string(),
  status: z.string(),
});

export const TasksDataSchema = z.object({
  version: z.number(),
  tasks: z.array(TaskSummarySchema),
  count: z.number(),
});

export const TasksResponseSchema = apiResponse(TasksDataSchema);

export type TaskSummary = z.infer<typeof TaskSummarySchema>;
export type TasksData = z.infer<typeof TasksDataSchema>;
export type TasksResponse = z.infer<typeof TasksResponseSchema>;

// ─── POST /api/build ───────────────────────────────────────────────────────

export const BuildRequestSchema = z.object({
  mode: z.enum(["prompt_only", "pi", "llm"]).optional(),
});

export const BuildDataSchema = z.object({
  version: z.number(),
  tasks_count: z.number(),
  summary: z.unknown(),
  files_written: z.array(z.string()),
});

export const BuildResponseSchema = apiResponse(BuildDataSchema);

export type BuildRequest = z.infer<typeof BuildRequestSchema>;
export type BuildData = z.infer<typeof BuildDataSchema>;
export type BuildResponse = z.infer<typeof BuildResponseSchema>;

// ─── GET /api/versions ─────────────────────────────────────────────────────

export const VersionEntrySchema = z.object({
  number: z.number(),
  id: z.string(),
});

export const VersionsDataSchema = z.object({
  versions: z.array(VersionEntrySchema),
});

export const VersionsResponseSchema = apiResponse(VersionsDataSchema);

export type VersionEntry = z.infer<typeof VersionEntrySchema>;
export type VersionsData = z.infer<typeof VersionsDataSchema>;
export type VersionsResponse = z.infer<typeof VersionsResponseSchema>;

// ─── GET /api/versions/:v ──────────────────────────────────────────────────

export const VersionDetailDataSchema = z.object({
  version: z.number(),
  version_id: z.string(),
  snapshot: z.unknown().nullable(),
  changes: z.unknown().nullable(),
  tasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        priority: z.string(),
        status: z.string(),
        related_specs: z.array(z.string()),
      })
    )
    .nullable(),
});

export const VersionDetailResponseSchema = apiResponse(VersionDetailDataSchema);

export type VersionDetailData = z.infer<typeof VersionDetailDataSchema>;
export type VersionDetailResponse = z.infer<typeof VersionDetailResponseSchema>;
