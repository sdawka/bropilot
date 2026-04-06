import { describe, it, expect } from "vitest";
import { KnowledgeResponseSchema } from "../knowledge.js";

describe("KnowledgeResponseSchema", () => {
  it("validates knowledge response with data", () => {
    const input = {
      ok: true,
      data: {
        glossary: [{ term: "vibe", definition: "project feel" }],
        decisions: [{ id: "d1", title: "Use Elixir" }],
        changelog: [{ entry: "Added auth module" }],
        xrefs: [{ from: "api/auth", to: "modules/auth" }],
      },
    };
    expect(KnowledgeResponseSchema.parse(input)).toEqual(input);
  });

  it("validates knowledge response with empty arrays", () => {
    const input = {
      ok: true,
      data: { glossary: [], decisions: [], changelog: [], xrefs: [] },
    };
    expect(KnowledgeResponseSchema.parse(input)).toEqual(input);
  });

  it("validates error response", () => {
    const input = {
      ok: false,
      error: "no .bropilot directory found — run `mix bro.init` first",
    };
    expect(KnowledgeResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing glossary field", () => {
    expect(() =>
      KnowledgeResponseSchema.parse({
        ok: true,
        data: { decisions: [], changelog: [], xrefs: [] },
      })
    ).toThrow();
  });
});
