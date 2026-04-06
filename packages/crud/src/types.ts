import { z } from "zod";

// ─── Response types matching Elixir API contract ───────────────────────────

/** Successful response wrapping data */
export interface OkResponse<T> {
  ok: true;
  data: T;
}

/** Error response with string message */
export interface ErrorResponse {
  ok: false;
  error: string;
}

/** Validation error response with field-level details */
export interface ValidationErrorResponse {
  ok: false;
  errors: ValidationError[];
}

/** A single field-level validation error */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/** Union of all possible CRUD responses */
export type CrudResponse<T> = OkResponse<T> | ErrorResponse | ValidationErrorResponse;

// ─── Record types ──────────────────────────────────────────────────────────

/** A record is a plain object with a string id and arbitrary fields */
export type Record = { id: string; [key: string]: unknown };

/** Pagination metadata matching Elixir contract */
export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
}

/** Paginated list result */
export interface PaginatedResult<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── List options ──────────────────────────────────────────────────────────

export interface ListOptions {
  filter?: { [key: string]: unknown };
  page?: number;
  pageSize?: number;
}

// ─── D1 Database interface (Cloudflare Workers D1) ─────────────────────────

/**
 * Minimal D1-compatible database interface.
 * Uses prepared statements for safety.
 */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}

export interface D1Result<T> {
  results: T[];
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
  };
}

// ─── Schema definition ────────────────────────────────────────────────────

/**
 * A CRUD schema is a Zod object schema used for validation.
 * This type alias keeps the contract flexible.
 */
export type CrudSchema = z.ZodObject<z.ZodRawShape>;

// ─── Store interface ──────────────────────────────────────────────────────

/**
 * Abstract store interface for CRUD operations.
 * Can be backed by D1, in-memory Map, or any other storage.
 */
export interface CrudStore {
  create(collection: string, record: Record): Promise<void>;
  read(collection: string, id: string): Promise<Record | null>;
  update(collection: string, id: string, record: Record): Promise<boolean>;
  delete(collection: string, id: string): Promise<boolean>;
  list(collection: string): Promise<Record[]>;
}
