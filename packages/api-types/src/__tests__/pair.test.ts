import { describe, it, expect } from "vitest";
import { PairRequestSchema, PairResponseSchema } from "../pair.js";

describe("PairRequestSchema", () => {
  it("validates a valid pair request", () => {
    expect(PairRequestSchema.parse({ token: "abc-123" })).toEqual({
      token: "abc-123",
    });
  });

  it("rejects missing token", () => {
    expect(() => PairRequestSchema.parse({})).toThrow();
  });
});

describe("PairResponseSchema", () => {
  it("validates success response", () => {
    const input = {
      ok: true,
      data: {
        server_url: "http://localhost:4000",
        project_name: "bropilot",
        version: "0.1.0",
      },
    };
    expect(PairResponseSchema.parse(input)).toEqual(input);
  });

  it("validates error (invalid token)", () => {
    const input = { ok: false, error: "invalid_token" };
    expect(PairResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing project_name", () => {
    expect(() =>
      PairResponseSchema.parse({
        ok: true,
        data: { server_url: "http://localhost:4000", version: "0.1.0" },
      })
    ).toThrow();
  });
});
