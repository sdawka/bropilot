import { describe, it, expect } from "vitest";
import {
  VibeStartRequestSchema,
  VibeStartResponseSchema,
  VibeInputRequestSchema,
  VibeInputResponseSchema,
  VibeExtractResponseSchema,
} from "../vibe.js";

describe("VibeStartRequestSchema", () => {
  it("validates with mode", () => {
    expect(VibeStartRequestSchema.parse({ mode: "mock" })).toEqual({
      mode: "mock",
    });
  });

  it("validates without mode (optional)", () => {
    expect(VibeStartRequestSchema.parse({})).toEqual({});
  });

  it("rejects invalid mode", () => {
    expect(() =>
      VibeStartRequestSchema.parse({ mode: "invalid" })
    ).toThrow();
  });
});

describe("VibeStartResponseSchema", () => {
  it("validates start response", () => {
    const input = {
      ok: true,
      data: { prompt: "Tell me about your project", step: "step1" },
    };
    expect(VibeStartResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects wrong step value", () => {
    expect(() =>
      VibeStartResponseSchema.parse({
        ok: true,
        data: { prompt: "x", step: "step2" },
      })
    ).toThrow();
  });
});

describe("VibeInputResponseSchema", () => {
  it("validates input_received", () => {
    const input = {
      ok: true,
      data: { status: "input_received" },
    };
    expect(VibeInputResponseSchema.parse(input)).toEqual(input);
  });

  it("validates no_more_questions", () => {
    const input = {
      ok: true,
      data: { status: "no_more_questions" },
    };
    expect(VibeInputResponseSchema.parse(input)).toEqual(input);
  });

  it("validates next_question", () => {
    const input = {
      ok: true,
      data: { next_question: "What's the target audience?" },
    };
    expect(VibeInputResponseSchema.parse(input)).toEqual(input);
  });
});

describe("VibeExtractResponseSchema", () => {
  it("validates step1_done with next", () => {
    const input = {
      ok: true,
      data: {
        extracted: { vibes: ["fun", "fast"] },
        status: "step1_done",
        next: "step2",
        first_question: "What features?",
      },
    };
    expect(VibeExtractResponseSchema.parse(input)).toEqual(input);
  });

  it("validates complete extraction", () => {
    const input = {
      ok: true,
      data: {
        extracted: { full_data: true },
        status: "complete",
      },
    };
    expect(VibeExtractResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing status field", () => {
    expect(() =>
      VibeExtractResponseSchema.parse({
        ok: true,
        data: { extracted: {} },
      })
    ).toThrow();
  });
});
