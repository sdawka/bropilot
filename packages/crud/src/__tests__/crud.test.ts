import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { Crud } from "../crud.js";
import { MemoryStore } from "../store/memory.js";
import type { Record, OkResponse, ErrorResponse, ValidationErrorResponse, PaginatedResult } from "../types.js";

// ─── Schema matching Elixir test schema ────────────────────────────────────
// Elixir schema:
//   title: string, required
//   status: enum [todo, in_progress, done], optional
//   priority: enum [low, medium, high], optional
//   description: text, optional
const taskSchema = z.object({
  id: z.string().optional(),
  title: z.string({ required_error: "title is required" }),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  description: z.string().optional(),
});

describe("Crud", () => {
  let store: MemoryStore;
  let crud: Crud;

  beforeEach(() => {
    store = new MemoryStore();
    crud = new Crud(store);
  });

  // ─── create ────────────────────────────────────────────────────────────

  describe("create (without schema)", () => {
    it("inserts a record and returns it with auto-generated id", async () => {
      const result = await crud.create("tasks", { title: "Buy milk", status: "todo" });

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<Record>).data;
      expect(typeof data.id).toBe("string");
      expect(data.id.length).toBeGreaterThan(0);
      expect(data.title).toBe("Buy milk");
      expect(data.status).toBe("todo");
    });

    it("generates unique ids for multiple records", async () => {
      const r1 = await crud.create("tasks", { title: "Task 1" });
      const r2 = await crud.create("tasks", { title: "Task 2" });

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect((r1 as OkResponse<Record>).data.id).not.toBe(
        (r2 as OkResponse<Record>).data.id,
      );
    });

    it("preserves all supplied attributes", async () => {
      const attrs = {
        title: "Complex task",
        status: "todo",
        priority: "high",
        description: "A detailed task",
      };
      const result = await crud.create("tasks", attrs);

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<Record>).data;
      expect(data.title).toBe("Complex task");
      expect(data.status).toBe("todo");
      expect(data.priority).toBe("high");
      expect(data.description).toBe("A detailed task");
    });

    it("create with empty attributes generates id", async () => {
      const result = await crud.create("empty", {});

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<Record>).data;
      expect(typeof data.id).toBe("string");
      expect(data.id.length).toBeGreaterThan(0);
    });
  });

  // ─── create with schema validation ─────────────────────────────────────

  describe("create (with schema validation)", () => {
    let validatedCrud: Crud;

    beforeEach(() => {
      validatedCrud = new Crud(store, taskSchema);
    });

    it("accepts valid data", async () => {
      const result = await validatedCrud.create("tasks", {
        title: "Valid task",
        status: "todo",
      });

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<Record>).data;
      expect(data.title).toBe("Valid task");
    });

    it("rejects missing required field", async () => {
      const result = await validatedCrud.create("tasks", { status: "todo" });

      expect(result.ok).toBe(false);
      const errors = (result as ValidationErrorResponse).errors;
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.field === "title")).toBe(true);
    });

    it("rejects invalid enum value", async () => {
      const result = await validatedCrud.create("tasks", {
        title: "Task",
        priority: "extreme",
      });

      expect(result.ok).toBe(false);
      const errors = (result as ValidationErrorResponse).errors;
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.field === "priority")).toBe(true);
    });

    it("rejects both missing required and invalid enum", async () => {
      const result = await validatedCrud.create("tasks", {
        priority: "extreme",
      });

      expect(result.ok).toBe(false);
      const errors = (result as ValidationErrorResponse).errors;
      expect(errors.length).toBeGreaterThanOrEqual(2);
      expect(errors.some((e) => e.field === "title")).toBe(true);
      expect(errors.some((e) => e.field === "priority")).toBe(true);
    });

    it("returns descriptive error messages", async () => {
      const result = await validatedCrud.create("tasks", {});

      expect(result.ok).toBe(false);
      const errors = (result as ValidationErrorResponse).errors;
      expect(errors.length).toBeGreaterThanOrEqual(1);
      // Each error should have field, message, and code
      for (const err of errors) {
        expect(typeof err.field).toBe("string");
        expect(typeof err.message).toBe("string");
        expect(typeof err.code).toBe("string");
      }
    });
  });

  // ─── read ──────────────────────────────────────────────────────────────

  describe("read", () => {
    it("retrieves an existing record by ID", async () => {
      const created = await crud.create("tasks", { title: "Read me" });
      const id = (created as OkResponse<Record>).data.id;

      const result = await crud.read("tasks", id);

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<Record>).data;
      expect(data.title).toBe("Read me");
      expect(data.id).toBe(id);
    });

    it("returns not_found for missing ID", async () => {
      const result = await crud.read("tasks", "nonexistent-id");

      expect(result.ok).toBe(false);
      expect((result as ErrorResponse).error).toBe("not_found");
    });

    it("returns not_found for empty collection", async () => {
      const result = await crud.read("users", "any-id");

      expect(result.ok).toBe(false);
      expect((result as ErrorResponse).error).toBe("not_found");
    });
  });

  // ─── update ────────────────────────────────────────────────────────────

  describe("update (without schema)", () => {
    it("merges attributes and preserves unchanged fields", async () => {
      const created = await crud.create("tasks", {
        title: "Original",
        status: "todo",
      });
      const id = (created as OkResponse<Record>).data.id;

      const result = await crud.update("tasks", id, { status: "done" });

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<Record>).data;
      expect(data.title).toBe("Original");
      expect(data.status).toBe("done");
      expect(data.id).toBe(id);
    });

    it("returns not_found for missing ID", async () => {
      const result = await crud.update("tasks", "missing-id", {
        status: "done",
      });

      expect(result.ok).toBe(false);
      expect((result as ErrorResponse).error).toBe("not_found");
    });

    it("update does not change the id", async () => {
      const created = await crud.create("tasks", { title: "Task" });
      const id = (created as OkResponse<Record>).data.id;

      const result = await crud.update("tasks", id, { title: "Updated" });

      expect(result.ok).toBe(true);
      expect((result as OkResponse<Record>).data.id).toBe(id);
    });

    it("update with empty attributes preserves original", async () => {
      const created = await crud.create("tasks", { title: "Original" });
      const id = (created as OkResponse<Record>).data.id;

      const result = await crud.update("tasks", id, {});

      expect(result.ok).toBe(true);
      expect((result as OkResponse<Record>).data.title).toBe("Original");
    });
  });

  // ─── update with schema validation ─────────────────────────────────────

  describe("update (with schema validation)", () => {
    let validatedCrud: Crud;

    beforeEach(() => {
      validatedCrud = new Crud(store, taskSchema);
    });

    it("rejects invalid type on update", async () => {
      const created = await validatedCrud.create("tasks", {
        title: "Task",
        status: "todo",
      });
      const id = (created as OkResponse<Record>).data.id;

      const result = await validatedCrud.update("tasks", id, {
        title: 42 as unknown as string,
      });

      expect(result.ok).toBe(false);
      expect("errors" in result).toBe(true);
      const errors = (result as ValidationErrorResponse).errors;
      expect(errors.some((e) => e.field === "title")).toBe(true);
    });

    it("accepts valid update with schema", async () => {
      const created = await validatedCrud.create("tasks", {
        title: "Task",
        status: "todo",
      });
      const id = (created as OkResponse<Record>).data.id;

      const result = await validatedCrud.update("tasks", id, {
        status: "done",
      });

      expect(result.ok).toBe(true);
      expect((result as OkResponse<Record>).data.status).toBe("done");
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────

  describe("delete", () => {
    it("removes a record", async () => {
      const created = await crud.create("tasks", { title: "Delete me" });
      const id = (created as OkResponse<Record>).data.id;

      const result = await crud.delete("tasks", id);
      expect(result.ok).toBe(true);

      const readResult = await crud.read("tasks", id);
      expect(readResult.ok).toBe(false);
      expect((readResult as ErrorResponse).error).toBe("not_found");
    });

    it("returns not_found for missing ID", async () => {
      const result = await crud.delete("tasks", "nonexistent-id");

      expect(result.ok).toBe(false);
      expect((result as ErrorResponse).error).toBe("not_found");
    });

    it("subsequent list does not include deleted record", async () => {
      const r1 = await crud.create("tasks", { title: "Keep" });
      const r2 = await crud.create("tasks", { title: "Delete" });

      const id2 = (r2 as OkResponse<Record>).data.id;
      await crud.delete("tasks", id2);

      const listResult = await crud.list("tasks");
      expect(listResult.ok).toBe(true);
      const records = (listResult as OkResponse<Record[]>).data;
      expect(records.length).toBe(1);
      expect(records[0]!.id).toBe((r1 as OkResponse<Record>).data.id);
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns all records for a collection", async () => {
      await crud.create("tasks", { title: "Task 1" });
      await crud.create("tasks", { title: "Task 2" });
      await crud.create("tasks", { title: "Task 3" });

      const result = await crud.list("tasks");

      expect(result.ok).toBe(true);
      const records = (result as OkResponse<Record[]>).data;
      expect(records.length).toBe(3);
      expect(records.every((r) => typeof r.id === "string")).toBe(true);
    });

    it("returns empty list for empty collection", async () => {
      const result = await crud.list("tasks");

      expect(result.ok).toBe(true);
      expect((result as OkResponse<Record[]>).data).toEqual([]);
    });
  });

  // ─── list with filters ─────────────────────────────────────────────────

  describe("list with filters", () => {
    it("filters by field value", async () => {
      await crud.create("tasks", { title: "A", status: "todo" });
      await crud.create("tasks", { title: "B", status: "done" });
      await crud.create("tasks", { title: "C", status: "todo" });

      const result = await crud.list("tasks", {
        filter: { status: "todo" },
      });

      expect(result.ok).toBe(true);
      const records = (result as OkResponse<Record[]>).data;
      expect(records.length).toBe(2);
      expect(records.every((r) => r.status === "todo")).toBe(true);
    });

    it("filter with no matches returns empty list", async () => {
      await crud.create("tasks", { title: "A", status: "todo" });

      const result = await crud.list("tasks", {
        filter: { status: "archived" },
      });

      expect(result.ok).toBe(true);
      expect((result as OkResponse<Record[]>).data).toEqual([]);
    });

    it("filter by multiple fields", async () => {
      await crud.create("tasks", {
        title: "A",
        status: "todo",
        priority: "high",
      });
      await crud.create("tasks", {
        title: "B",
        status: "todo",
        priority: "low",
      });
      await crud.create("tasks", {
        title: "C",
        status: "done",
        priority: "high",
      });

      const result = await crud.list("tasks", {
        filter: { status: "todo", priority: "high" },
      });

      expect(result.ok).toBe(true);
      const records = (result as OkResponse<Record[]>).data;
      expect(records.length).toBe(1);
      expect(records[0]!.title).toBe("A");
    });
  });

  // ─── list with pagination ──────────────────────────────────────────────

  describe("list with pagination", () => {
    beforeEach(async () => {
      for (let i = 1; i <= 10; i++) {
        await crud.create("items", { title: `Item ${i}`, order: i });
      }
    });

    it("returns correct page size", async () => {
      const result = await crud.list("items", { page: 1, pageSize: 3 });

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<PaginatedResult<Record>>).data;
      expect(data.records.length).toBe(3);
      expect(data.total).toBe(10);
      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(3);
    });

    it("second page returns next records", async () => {
      const p1 = await crud.list("items", { page: 1, pageSize: 3 });
      const p2 = await crud.list("items", { page: 2, pageSize: 3 });

      const page1Ids = (p1 as OkResponse<PaginatedResult<Record>>).data.records.map(
        (r) => r.id,
      );
      const page2Ids = (p2 as OkResponse<PaginatedResult<Record>>).data.records.map(
        (r) => r.id,
      );

      // No overlap
      expect(page2Ids.every((id) => !page1Ids.includes(id))).toBe(true);
      expect(
        (p2 as OkResponse<PaginatedResult<Record>>).data.records.length,
      ).toBe(3);
    });

    it("last partial page returns remaining records", async () => {
      const result = await crud.list("items", { page: 4, pageSize: 3 });

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<PaginatedResult<Record>>).data;
      expect(data.records.length).toBe(1);
      expect(data.total).toBe(10);
    });

    it("page beyond data returns empty records", async () => {
      const result = await crud.list("items", { page: 5, pageSize: 3 });

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<PaginatedResult<Record>>).data;
      expect(data.records).toEqual([]);
      expect(data.total).toBe(10);
    });

    it("pagination metadata is correct", async () => {
      const result = await crud.list("items", { page: 2, pageSize: 4 });

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<PaginatedResult<Record>>).data;
      expect(data.total).toBe(10);
      expect(data.page).toBe(2);
      expect(data.pageSize).toBe(4);
      expect(data.records.length).toBe(4);
    });
  });

  // ─── list with filter + pagination ─────────────────────────────────────

  describe("list with filter + pagination", () => {
    it("filters first, then paginates", async () => {
      for (let i = 1; i <= 8; i++) {
        const parity = i % 2 === 0 ? "even" : "odd";
        await crud.create("nums", { title: `Num ${i}`, parity });
      }

      const result = await crud.list("nums", {
        filter: { parity: "even" },
        page: 1,
        pageSize: 2,
      });

      expect(result.ok).toBe(true);
      const data = (result as OkResponse<PaginatedResult<Record>>).data;
      expect(data.records.length).toBe(2);
      expect(data.total).toBe(4);
      expect(data.records.every((r) => r.parity === "even")).toBe(true);
    });
  });

  // ─── collection isolation ──────────────────────────────────────────────

  describe("collection isolation", () => {
    it("records in 'tasks' don't leak to 'users'", async () => {
      await crud.create("tasks", { title: "Task 1" });
      await crud.create("users", { name: "Alice" });

      const tasks = await crud.list("tasks");
      const users = await crud.list("users");

      expect((tasks as OkResponse<Record[]>).data.length).toBe(1);
      expect((users as OkResponse<Record[]>).data.length).toBe(1);
      expect((tasks as OkResponse<Record[]>).data[0]!.title).toBe("Task 1");
      expect((users as OkResponse<Record[]>).data[0]!.name).toBe("Alice");
    });

    it("deleting from one collection doesn't affect another", async () => {
      const task = await crud.create("tasks", { title: "Task" });
      await crud.create("users", { name: "Bob" });

      const taskId = (task as OkResponse<Record>).data.id;
      await crud.delete("tasks", taskId);

      const tasks = await crud.list("tasks");
      const users = await crud.list("users");

      expect((tasks as OkResponse<Record[]>).data.length).toBe(0);
      expect((users as OkResponse<Record[]>).data.length).toBe(1);
    });
  });

  // ─── API contract matching Elixir ──────────────────────────────────────

  describe("API contract matches Elixir CRUD contract", () => {
    it("create returns { ok: true, data: { id, ...attrs } }", async () => {
      const result = await crud.create("tasks", {
        title: "Test",
        status: "todo",
      });

      expect(result).toHaveProperty("ok", true);
      expect(result).toHaveProperty("data");
      const data = (result as OkResponse<Record>).data;
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("title", "Test");
      expect(data).toHaveProperty("status", "todo");
    });

    it("read found returns { ok: true, data: record }", async () => {
      const created = await crud.create("tasks", { title: "Test" });
      const id = (created as OkResponse<Record>).data.id;

      const result = await crud.read("tasks", id);

      expect(result).toHaveProperty("ok", true);
      expect(result).toHaveProperty("data");
      expect((result as OkResponse<Record>).data).toHaveProperty("id", id);
    });

    it("read not_found returns { ok: false, error: 'not_found' }", async () => {
      const result = await crud.read("tasks", "missing");

      expect(result).toEqual({ ok: false, error: "not_found" });
    });

    it("update found returns { ok: true, data: merged }", async () => {
      const created = await crud.create("tasks", {
        title: "Old",
        status: "todo",
      });
      const id = (created as OkResponse<Record>).data.id;

      const result = await crud.update("tasks", id, { status: "done" });

      expect(result).toHaveProperty("ok", true);
      const data = (result as OkResponse<Record>).data;
      expect(data.title).toBe("Old");
      expect(data.status).toBe("done");
    });

    it("update not_found returns { ok: false, error: 'not_found' }", async () => {
      const result = await crud.update("tasks", "missing", { status: "done" });

      expect(result).toEqual({ ok: false, error: "not_found" });
    });

    it("delete found returns { ok: true }", async () => {
      const created = await crud.create("tasks", { title: "Del" });
      const id = (created as OkResponse<Record>).data.id;

      const result = await crud.delete("tasks", id);

      expect(result).toEqual({ ok: true });
    });

    it("delete not_found returns { ok: false, error: 'not_found' }", async () => {
      const result = await crud.delete("tasks", "missing");

      expect(result).toEqual({ ok: false, error: "not_found" });
    });

    it("list returns { ok: true, data: records[] }", async () => {
      await crud.create("tasks", { title: "T1" });
      await crud.create("tasks", { title: "T2" });

      const result = await crud.list("tasks");

      expect(result).toHaveProperty("ok", true);
      expect(Array.isArray((result as OkResponse<Record[]>).data)).toBe(true);
      expect((result as OkResponse<Record[]>).data.length).toBe(2);
    });

    it("list with pagination returns { ok: true, data: { records, total, page, pageSize } }", async () => {
      await crud.create("tasks", { title: "T1" });
      await crud.create("tasks", { title: "T2" });
      await crud.create("tasks", { title: "T3" });

      const result = await crud.list("tasks", { page: 1, pageSize: 2 });

      expect(result).toHaveProperty("ok", true);
      const data = (result as OkResponse<PaginatedResult<Record>>).data;
      expect(data).toHaveProperty("records");
      expect(data).toHaveProperty("total", 3);
      expect(data).toHaveProperty("page", 1);
      expect(data).toHaveProperty("pageSize", 2);
      expect(data.records.length).toBe(2);
    });

    it("validation error returns { ok: false, errors: [...] }", async () => {
      const validatedCrud = new Crud(store, taskSchema);
      const result = await validatedCrud.create("tasks", {
        priority: "extreme",
      });

      expect(result).toHaveProperty("ok", false);
      expect(result).toHaveProperty("errors");
      const errors = (result as ValidationErrorResponse).errors;
      expect(Array.isArray(errors)).toBe(true);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toHaveProperty("field");
      expect(errors[0]).toHaveProperty("message");
      expect(errors[0]).toHaveProperty("code");
    });
  });
});
