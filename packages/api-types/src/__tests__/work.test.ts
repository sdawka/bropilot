import { describe, it, expect } from "vitest";
import {
  SnapshotResponseSchema,
  PlanResponseSchema,
  TasksResponseSchema,
  BuildRequestSchema,
  BuildResponseSchema,
  VersionsResponseSchema,
  VersionDetailResponseSchema,
} from "../work.js";

describe("SnapshotResponseSchema", () => {
  it("validates snapshot response", () => {
    const input = { ok: true, data: { version: 1, version_id: "v001" } };
    expect(SnapshotResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects non-numeric version", () => {
    expect(() =>
      SnapshotResponseSchema.parse({
        ok: true,
        data: { version: "1", version_id: "v001" },
      })
    ).toThrow();
  });
});

describe("PlanResponseSchema", () => {
  it("validates plan response", () => {
    const input = {
      ok: true,
      data: {
        version: 1,
        changes: 5,
        summary: {
          added: 3,
          modified: 2,
          removed: 0,
          by_space: { solution: 4, work: 1 },
        },
      },
    };
    expect(PlanResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing summary.added", () => {
    expect(() =>
      PlanResponseSchema.parse({
        ok: true,
        data: {
          version: 1,
          changes: 0,
          summary: { modified: 0, removed: 0, by_space: {} },
        },
      })
    ).toThrow();
  });
});

describe("TasksResponseSchema", () => {
  it("validates tasks response", () => {
    const input = {
      ok: true,
      data: {
        version: 1,
        tasks: [
          { id: "t1", title: "Build auth", priority: "high", status: "pending" },
          { id: "t2", title: "Add tests", priority: "medium", status: "pending" },
        ],
        count: 2,
      },
    };
    expect(TasksResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects task missing title", () => {
    expect(() =>
      TasksResponseSchema.parse({
        ok: true,
        data: {
          version: 1,
          tasks: [{ id: "t1", priority: "high", status: "pending" }],
          count: 1,
        },
      })
    ).toThrow();
  });
});

describe("BuildRequestSchema", () => {
  it("validates with mode", () => {
    expect(BuildRequestSchema.parse({ mode: "prompt_only" })).toEqual({
      mode: "prompt_only",
    });
  });

  it("validates without mode", () => {
    expect(BuildRequestSchema.parse({})).toEqual({});
  });
});

describe("BuildResponseSchema", () => {
  it("validates build response", () => {
    const input = {
      ok: true,
      data: {
        version: 1,
        tasks_count: 3,
        summary: { completed: 3 },
        files_written: ["lib/app/task.ex", "lib/app/user.ex"],
      },
    };
    expect(BuildResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing files_written", () => {
    expect(() =>
      BuildResponseSchema.parse({
        ok: true,
        data: { version: 1, tasks_count: 0, summary: null },
      })
    ).toThrow();
  });
});

describe("VersionsResponseSchema", () => {
  it("validates versions list", () => {
    const input = {
      ok: true,
      data: {
        versions: [
          { number: 1, id: "v001" },
          { number: 2, id: "v002" },
        ],
      },
    };
    expect(VersionsResponseSchema.parse(input)).toEqual(input);
  });

  it("validates empty versions list", () => {
    const input = { ok: true, data: { versions: [] } };
    expect(VersionsResponseSchema.parse(input)).toEqual(input);
  });
});

describe("VersionDetailResponseSchema", () => {
  it("validates version detail with all data", () => {
    const input = {
      ok: true,
      data: {
        version: 1,
        version_id: "v001",
        snapshot: { problem: {}, solution: {} },
        changes: { added: ["file1.ex"] },
        tasks: [
          {
            id: "t1",
            title: "Build auth",
            description: "Auth module",
            priority: "high",
            status: "done",
            related_specs: ["api/auth"],
          },
        ],
      },
    };
    expect(VersionDetailResponseSchema.parse(input)).toEqual(input);
  });

  it("validates version detail with null fields", () => {
    const input = {
      ok: true,
      data: {
        version: 1,
        version_id: "v001",
        snapshot: null,
        changes: null,
        tasks: null,
      },
    };
    expect(VersionDetailResponseSchema.parse(input)).toEqual(input);
  });
});
