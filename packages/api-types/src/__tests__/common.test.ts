import { describe, it, expect } from "vitest";
import {
  ErrorResponseSchema,
  SpaceIdSchema,
  SpecCategorySchema,
  apiResponse,
} from "../common.js";
import { z } from "zod";

describe("ErrorResponseSchema", () => {
  it("validates a well-formed error response", () => {
    const input = { ok: false, error: "something went wrong" };
    expect(ErrorResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects when ok is true", () => {
    expect(() =>
      ErrorResponseSchema.parse({ ok: true, error: "nope" })
    ).toThrow();
  });

  it("rejects when error field is missing", () => {
    expect(() => ErrorResponseSchema.parse({ ok: false })).toThrow();
  });

  it("rejects when error is not a string", () => {
    expect(() =>
      ErrorResponseSchema.parse({ ok: false, error: 42 })
    ).toThrow();
  });
});

describe("SpaceIdSchema", () => {
  it("accepts all 5 valid space IDs", () => {
    for (const id of ["problem", "solution", "work", "measurement", "knowledge"]) {
      expect(SpaceIdSchema.parse(id)).toBe(id);
    }
  });

  it("rejects invalid space ID", () => {
    expect(() => SpaceIdSchema.parse("bogus")).toThrow();
  });
});

describe("SpecCategorySchema", () => {
  const validCategories = [
    "api", "behaviours", "constraints", "entities", "modules",
    "events", "externals", "views", "components", "streams", "infra",
  ];

  it("accepts all 11 valid spec categories", () => {
    for (const cat of validCategories) {
      expect(SpecCategorySchema.parse(cat)).toBe(cat);
    }
  });

  it("rejects invalid category", () => {
    expect(() => SpecCategorySchema.parse("api_contracts")).toThrow();
    expect(() => SpecCategorySchema.parse("data_model")).toThrow();
  });
});

describe("apiResponse helper", () => {
  const schema = apiResponse(z.object({ count: z.number() }));

  it("validates success shape", () => {
    const result = schema.parse({ ok: true, data: { count: 5 } });
    expect(result).toEqual({ ok: true, data: { count: 5 } });
  });

  it("validates error shape", () => {
    const result = schema.parse({ ok: false, error: "fail" });
    expect(result).toEqual({ ok: false, error: "fail" });
  });

  it("rejects missing data on success", () => {
    expect(() => schema.parse({ ok: true })).toThrow();
  });

  it("rejects wrong data type on success", () => {
    expect(() =>
      schema.parse({ ok: true, data: { count: "five" } })
    ).toThrow();
  });
});
