import { describe, it, expect } from "vitest";
import {
  DomainStartRequestSchema,
  DomainStartResponseSchema,
  DomainInputRequestSchema,
  DomainInputResponseSchema,
  DomainExtractResponseSchema,
} from "../domain.js";

describe("DomainStartRequestSchema", () => {
  it("validates with mock mode", () => {
    expect(DomainStartRequestSchema.parse({ mode: "mock" })).toEqual({
      mode: "mock",
    });
  });

  it("validates without mode", () => {
    expect(DomainStartRequestSchema.parse({})).toEqual({});
  });
});

describe("DomainStartResponseSchema", () => {
  it("validates start response", () => {
    const input = {
      ok: true,
      data: { prompt: "Describe your domain", step: "step3" },
    };
    expect(DomainStartResponseSchema.parse(input)).toEqual(input);
  });

  it("validates error response", () => {
    const input = {
      ok: false,
      error: "no .bropilot directory found — run `mix bro.init` first",
    };
    expect(DomainStartResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects wrong step value", () => {
    expect(() =>
      DomainStartResponseSchema.parse({
        ok: true,
        data: { prompt: "x", step: "step1" },
      })
    ).toThrow();
  });
});

describe("DomainInputRequestSchema", () => {
  it("validates non-empty text", () => {
    expect(DomainInputRequestSchema.parse({ text: "My domain is..." })).toEqual(
      { text: "My domain is..." }
    );
  });

  it("rejects empty text", () => {
    expect(() => DomainInputRequestSchema.parse({ text: "" })).toThrow();
  });

  it("rejects missing text", () => {
    expect(() => DomainInputRequestSchema.parse({})).toThrow();
  });
});

describe("DomainInputResponseSchema", () => {
  it("validates input_received", () => {
    const input = { ok: true, data: { status: "input_received" } };
    expect(DomainInputResponseSchema.parse(input)).toEqual(input);
  });
});

describe("DomainExtractResponseSchema", () => {
  it("validates step3_done with step4_prompt", () => {
    const input = {
      ok: true,
      data: {
        extracted: { vocabulary: [], entities: [] },
        status: "step3_done",
        next: "step4",
        step4_prompt: "Expanding specs...",
      },
    };
    expect(DomainExtractResponseSchema.parse(input)).toEqual(input);
  });

  it("validates complete extraction", () => {
    const input = {
      ok: true,
      data: {
        extracted: { api: [], behaviours: [] },
        status: "complete",
      },
    };
    expect(DomainExtractResponseSchema.parse(input)).toEqual(input);
  });

  it("validates error response", () => {
    const input = { ok: false, error: "domain worker not started" };
    expect(DomainExtractResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing status in success data", () => {
    expect(() =>
      DomainExtractResponseSchema.parse({
        ok: true,
        data: { extracted: {} },
      })
    ).toThrow();
  });
});
