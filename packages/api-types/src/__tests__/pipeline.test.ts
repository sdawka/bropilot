import { describe, it, expect } from "vitest";
import {
  PipelineStatusResponseSchema,
  AdvanceResponseSchema,
} from "../pipeline.js";

describe("PipelineStatusResponseSchema", () => {
  it("validates status with current step", () => {
    const input = {
      ok: true,
      data: {
        current_step: { id: "step1", name: "Basics", space: "problem" },
        step_statuses: { step1: "current", step2: "pending" },
      },
    };
    expect(PipelineStatusResponseSchema.parse(input)).toEqual(input);
  });

  it("validates status with null current step", () => {
    const input = {
      ok: true,
      data: {
        current_step: null,
        step_statuses: {},
      },
    };
    expect(PipelineStatusResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing step_statuses", () => {
    expect(() =>
      PipelineStatusResponseSchema.parse({
        ok: true,
        data: { current_step: null },
      })
    ).toThrow();
  });
});

describe("AdvanceResponseSchema", () => {
  it("validates advance with step data", () => {
    const input = {
      ok: true,
      data: { step: { id: "step2", name: "Details", space: "problem" } },
    };
    expect(AdvanceResponseSchema.parse(input)).toEqual(input);
  });

  it("validates pipeline_complete", () => {
    const input = {
      ok: true,
      data: { status: "pipeline_complete" },
    };
    expect(AdvanceResponseSchema.parse(input)).toEqual(input);
  });

  it("validates error (unfilled slots)", () => {
    const input = { ok: false, error: "unfilled slots: audience, context" };
    expect(AdvanceResponseSchema.parse(input)).toEqual(input);
  });
});
