// ─── Common ────────────────────────────────────────────────────────────────
export {
  okResponse,
  apiResponse,
  ErrorResponseSchema,
  SpaceIdSchema,
  SpecCategorySchema,
} from "./common.js";
export type { ErrorResponse, SpaceId, SpecCategory } from "./common.js";

// ─── Health ────────────────────────────────────────────────────────────────
export { HealthDataSchema, HealthResponseSchema } from "./health.js";
export type { HealthData, HealthResponse } from "./health.js";

// ─── Pair ──────────────────────────────────────────────────────────────────
export {
  PairRequestSchema,
  PairDataSchema,
  PairResponseSchema,
} from "./pair.js";
export type { PairRequest, PairData, PairResponse } from "./pair.js";

// ─── Project ───────────────────────────────────────────────────────────────
export {
  InitDataSchema,
  InitResponseSchema,
  RecipeInfoSchema,
  ProjectDataSchema,
  ProjectResponseSchema,
  SlotDefSchema,
  SpaceDefSchema,
  SpacesDataSchema,
  SpacesResponseSchema,
  SpaceSlotSchema,
  SpaceDetailDataSchema,
  SpaceDetailResponseSchema,
  MapSlotGetResponseSchema,
  MapSlotPutRequestSchema,
  MapSlotPutDataSchema,
  MapSlotPutResponseSchema,
} from "./project.js";
export type {
  InitData,
  InitResponse,
  ProjectData,
  ProjectResponse,
  SpaceDef,
  SpacesData,
  SpacesResponse,
  SpaceSlot,
  SpaceDetailData,
  SpaceDetailResponse,
  MapSlotGetResponse,
  MapSlotPutRequest,
  MapSlotPutData,
  MapSlotPutResponse,
} from "./project.js";

// ─── Recipe ────────────────────────────────────────────────────────────────
export {
  RecipeStepSchema,
  RecipeDataSchema,
  RecipeResponseSchema,
  SchemaEntrySchema,
  SchemasDataSchema,
  SchemasResponseSchema,
} from "./recipe.js";
export type {
  RecipeStep,
  RecipeData,
  RecipeResponse,
  SchemaEntry,
  SchemasData,
  SchemasResponse,
} from "./recipe.js";

// ─── Pipeline ──────────────────────────────────────────────────────────────
export {
  PipelineStepInfoSchema,
  PipelineStatusDataSchema,
  PipelineStatusResponseSchema,
  AdvanceStepDataSchema,
  AdvanceCompleteDataSchema,
  AdvanceDataSchema,
  AdvanceResponseSchema,
} from "./pipeline.js";
export type {
  PipelineStepInfo,
  PipelineStatusData,
  PipelineStatusResponse,
  AdvanceStepData,
  AdvanceCompleteData,
  AdvanceData,
  AdvanceResponse,
} from "./pipeline.js";

// ─── Vibe ──────────────────────────────────────────────────────────────────
export {
  VibeStartRequestSchema,
  VibeStartDataSchema,
  VibeStartResponseSchema,
  VibeInputRequestSchema,
  VibeInputDataSchema,
  VibeInputResponseSchema,
  VibeExtractDataSchema,
  VibeExtractResponseSchema,
} from "./vibe.js";
export type {
  VibeStartRequest,
  VibeStartData,
  VibeStartResponse,
  VibeInputRequest,
  VibeInputData,
  VibeInputResponse,
  VibeExtractData,
  VibeExtractResponse,
} from "./vibe.js";

// ─── Domain ────────────────────────────────────────────────────────────────
export {
  DomainStartRequestSchema,
  DomainStartDataSchema,
  DomainStartResponseSchema,
  DomainInputRequestSchema,
  DomainInputDataSchema,
  DomainInputResponseSchema,
  DomainExtractDataSchema,
  DomainExtractResponseSchema,
} from "./domain.js";
export type {
  DomainStartRequest,
  DomainStartData,
  DomainStartResponse,
  DomainInputRequest,
  DomainInputData,
  DomainInputResponse,
  DomainExtractData,
  DomainExtractResponse,
} from "./domain.js";

// ─── Work ──────────────────────────────────────────────────────────────────
export {
  SnapshotDataSchema,
  SnapshotResponseSchema,
  PlanSummarySchema,
  PlanDataSchema,
  PlanResponseSchema,
  TaskSummarySchema,
  TasksDataSchema,
  TasksResponseSchema,
  BuildRequestSchema,
  BuildDataSchema,
  BuildResponseSchema,
  VersionEntrySchema,
  VersionsDataSchema,
  VersionsResponseSchema,
  VersionDetailDataSchema,
  VersionDetailResponseSchema,
} from "./work.js";
export type {
  SnapshotData,
  SnapshotResponse,
  PlanSummary,
  PlanData,
  PlanResponse,
  TaskSummary,
  TasksData,
  TasksResponse,
  BuildRequest,
  BuildData,
  BuildResponse,
  VersionEntry,
  VersionsData,
  VersionsResponse,
  VersionDetailData,
  VersionDetailResponse,
} from "./work.js";

// ─── Knowledge ─────────────────────────────────────────────────────────────
export { KnowledgeDataSchema, KnowledgeResponseSchema } from "./knowledge.js";
export type { KnowledgeData, KnowledgeResponse } from "./knowledge.js";

// ─── Traceability ──────────────────────────────────────────────────────────
export {
  TraceabilityLinkTypeSchema,
  TraceabilityLinkSchema,
  TraceabilityEntrySchema,
  CategoryCoverageSchema,
  CoverageSummarySchema,
  TraceabilityMatrixDataSchema,
  TraceabilityMatrixResponseSchema,
  TraceabilityEntryResponseSchema,
  TraceabilityPutRequestSchema,
  TraceabilityPutDataSchema,
  TraceabilityPutResponseSchema,
} from "./traceability.js";
export type {
  TraceabilityLinkType,
  TraceabilityLink,
  TraceabilityEntry,
  CategoryCoverage,
  CoverageSummary,
  TraceabilityMatrixData,
  TraceabilityMatrixResponse,
  TraceabilityEntryResponse,
  TraceabilityPutRequest,
  TraceabilityPutData,
  TraceabilityPutResponse,
} from "./traceability.js";
