import { describe, it, expect } from "vitest";
import { HealthResponseSchema } from "../health.js";

describe("HealthResponseSchema", () => {
  it("validates a healthy response", () => {
    const input = { ok: true, data: { status: "healthy" } };
    expect(HealthResponseSchema.parse(input)).toEqual(input);
  });

  it("validates error response", () => {
    const input = { ok: false, error: "server down" };
    expect(HealthResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing status field", () => {
    expect(() =>
      HealthResponseSchema.parse({ ok: true, data: {} })
    ).toThrow();
  });
});
