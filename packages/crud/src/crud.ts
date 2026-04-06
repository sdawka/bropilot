import { z } from "zod";
import type {
  CrudStore,
  CrudSchema,
  Record,
  OkResponse,
  ErrorResponse,
  ValidationErrorResponse,
  ValidationError,
  ListOptions,
  PaginatedResult,
} from "./types.js";

/**
 * Generate a random ID (URL-safe base64, 11 chars).
 * Matches Elixir's `:crypto.strong_rand_bytes(8) |> Base.url_encode64(padding: false)`.
 */
function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  // Convert to base64url without padding
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Convert Zod errors to our ValidationError format.
 */
function zodToValidationErrors(error: z.ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "_root",
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * CRUD operations for a single collection with Zod schema validation.
 *
 * API contract matches the Elixir Bropilot.Crud module:
 * - create → { ok: true, data: { id, ...attrs } }
 * - read   → { ok: true, data: record } | { ok: false, error: "not_found" }
 * - update → { ok: true, data: merged } | { ok: false, error: "not_found" }
 * - delete → { ok: true } | { ok: false, error: "not_found" }
 * - list   → { ok: true, data: records } | { ok: true, data: { records, total, page, pageSize } }
 */
export class Crud {
  constructor(
    private store: CrudStore,
    private schema?: CrudSchema,
  ) {}

  /**
   * Create a new record. Auto-generates an ID if not provided.
   * Validates against schema if one was configured.
   */
  async create(
    collection: string,
    attrs: { [key: string]: unknown },
  ): Promise<OkResponse<Record> | ValidationErrorResponse> {
    // Validate against schema if present
    if (this.schema) {
      const result = this.schema.safeParse(attrs);
      if (!result.success) {
        return { ok: false, errors: zodToValidationErrors(result.error) };
      }
    }

    const id = typeof attrs.id === "string" ? attrs.id : generateId();
    const record: Record = { ...attrs, id };

    await this.store.create(collection, record);
    return { ok: true, data: record };
  }

  /**
   * Read a record by ID. Returns not_found for missing records.
   */
  async read(
    collection: string,
    id: string,
  ): Promise<OkResponse<Record> | ErrorResponse> {
    const record = await this.store.read(collection, id);
    if (!record) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, data: record };
  }

  /**
   * Update a record by merging new attributes.
   * Validates the merged result against schema if one was configured.
   */
  async update(
    collection: string,
    id: string,
    attrs: { [key: string]: unknown },
  ): Promise<OkResponse<Record> | ErrorResponse | ValidationErrorResponse> {
    const existing = await this.store.read(collection, id);
    if (!existing) {
      return { ok: false, error: "not_found" };
    }

    const merged: Record = { ...existing, ...attrs, id };

    // Validate merged record against schema
    if (this.schema) {
      const result = this.schema.safeParse(merged);
      if (!result.success) {
        return { ok: false, errors: zodToValidationErrors(result.error) };
      }
    }

    const updated = await this.store.update(collection, id, merged);
    if (!updated) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true, data: merged };
  }

  /**
   * Delete a record by ID. Returns not_found for missing records.
   */
  async delete(
    collection: string,
    id: string,
  ): Promise<{ ok: true } | ErrorResponse> {
    const deleted = await this.store.delete(collection, id);
    if (!deleted) {
      return { ok: false, error: "not_found" };
    }
    return { ok: true };
  }

  /**
   * List records with optional filtering and pagination.
   *
   * Without pagination: returns { ok: true, data: records[] }
   * With pagination: returns { ok: true, data: { records, total, page, pageSize } }
   */
  async list(
    collection: string,
    options?: ListOptions,
  ): Promise<OkResponse<Record[]> | OkResponse<PaginatedResult<Record>>> {
    let records = await this.store.list(collection);

    // Apply filters
    if (options?.filter) {
      const filter = options.filter;
      records = records.filter((record) =>
        Object.entries(filter).every(
          ([key, value]) => record[key] === value,
        ),
      );
    }

    // Sort by id for deterministic ordering (matches Elixir)
    records.sort((a, b) => a.id.localeCompare(b.id));

    // Apply pagination if requested
    if (options?.page !== undefined && options?.pageSize !== undefined) {
      const { page, pageSize } = options;
      const total = records.length;
      const offset = (page - 1) * pageSize;
      const pageRecords = records.slice(offset, offset + pageSize);

      return {
        ok: true,
        data: {
          records: pageRecords,
          total,
          page,
          pageSize,
        },
      };
    }

    return { ok: true, data: records };
  }
}
