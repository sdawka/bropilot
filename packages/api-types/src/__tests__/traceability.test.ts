import { describe, it, expect } from "vitest";
import {
  TraceabilityLinkSchema,
  TraceabilityEntrySchema,
  TraceabilityMatrixResponseSchema,
  TraceabilityEntryResponseSchema,
  TraceabilityPutRequestSchema,
  TraceabilityPutResponseSchema,
} from "../traceability.js";

describe("TraceabilityLinkSchema", () => {
  it("validates a minimal link", () => {
    const input = { type: "implementation", file_path: "lib/app/auth.ex" };
    expect(TraceabilityLinkSchema.parse(input)).toEqual(input);
  });

  it("validates a link with all optional fields", () => {
    const input = {
      type: "test",
      file_path: "test/auth_test.exs",
      function_name: "test_login",
      line_range: [10, 25],
    };
    expect(TraceabilityLinkSchema.parse(input)).toEqual(input);
  });

  it("rejects invalid link type", () => {
    expect(() =>
      TraceabilityLinkSchema.parse({
        type: "deployment",
        file_path: "deploy.sh",
      })
    ).toThrow();
  });

  it("rejects missing file_path", () => {
    expect(() =>
      TraceabilityLinkSchema.parse({ type: "implementation" })
    ).toThrow();
  });

  it("accepts all 4 valid link types", () => {
    for (const type of ["implementation", "test", "type", "migration"]) {
      expect(
        TraceabilityLinkSchema.parse({ type, file_path: "some/file" })
      ).toBeTruthy();
    }
  });
});

describe("TraceabilityEntrySchema", () => {
  it("validates a complete entry", () => {
    const input = {
      spec_category: "api",
      spec_id: "InitProject",
      links: [
        { type: "implementation", file_path: "lib/api/init.ex" },
        { type: "test", file_path: "test/api/init_test.exs" },
      ],
    };
    expect(TraceabilityEntrySchema.parse(input)).toEqual(input);
  });

  it("validates entry with empty links", () => {
    const input = {
      spec_category: "entities",
      spec_id: "User",
      links: [],
    };
    expect(TraceabilityEntrySchema.parse(input)).toEqual(input);
  });

  it("rejects missing links array", () => {
    expect(() =>
      TraceabilityEntrySchema.parse({
        spec_category: "api",
        spec_id: "test",
      })
    ).toThrow();
  });
});

describe("TraceabilityMatrixResponseSchema", () => {
  it("validates full matrix response", () => {
    const input = {
      ok: true,
      data: {
        entries: [
          {
            spec_category: "api",
            spec_id: "Init",
            links: [
              { type: "implementation", file_path: "lib/init.ex" },
            ],
          },
        ],
        coverage: {
          total_specs: 20,
          total_linked: 5,
          total_unlinked: 15,
          by_category: {
            api: { total: 5, linked: 2, unlinked: 3 },
            entities: { total: 3, linked: 1, unlinked: 2 },
          },
        },
      },
    };
    expect(TraceabilityMatrixResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing coverage", () => {
    expect(() =>
      TraceabilityMatrixResponseSchema.parse({
        ok: true,
        data: {
          entries: [],
        },
      })
    ).toThrow();
  });
});

describe("TraceabilityEntryResponseSchema", () => {
  it("validates single entry response", () => {
    const input = {
      ok: true,
      data: {
        spec_category: "entities",
        spec_id: "User",
        links: [
          {
            type: "type",
            file_path: "lib/types/user.ts",
            function_name: "UserType",
          },
        ],
      },
    };
    expect(TraceabilityEntryResponseSchema.parse(input)).toEqual(input);
  });

  it("validates error (not found)", () => {
    const input = {
      ok: false,
      error: "spec not found: entities/Unknown",
    };
    expect(TraceabilityEntryResponseSchema.parse(input)).toEqual(input);
  });
});

describe("TraceabilityPutRequestSchema", () => {
  it("validates put request", () => {
    const input = {
      links: [
        { type: "implementation", file_path: "lib/app/user.ex" },
        { type: "migration", file_path: "migrations/001_users.sql" },
      ],
    };
    expect(TraceabilityPutRequestSchema.parse(input)).toEqual(input);
  });

  it("rejects missing links", () => {
    expect(() => TraceabilityPutRequestSchema.parse({})).toThrow();
  });

  it("rejects invalid link in array", () => {
    expect(() =>
      TraceabilityPutRequestSchema.parse({
        links: [{ type: "invalid", file_path: "x" }],
      })
    ).toThrow();
  });
});

describe("TraceabilityPutResponseSchema", () => {
  it("validates put response", () => {
    const input = {
      ok: true,
      data: { spec_category: "api", spec_id: "Init" },
    };
    expect(TraceabilityPutResponseSchema.parse(input)).toEqual(input);
  });
});
