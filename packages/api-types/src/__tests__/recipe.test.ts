import { describe, it, expect } from "vitest";
import { RecipeResponseSchema, SchemasResponseSchema } from "../recipe.js";

describe("RecipeResponseSchema", () => {
  it("validates a complete recipe response", () => {
    const input = {
      ok: true,
      data: {
        name: "webapp",
        version: "1.0.0",
        description: "A web app recipe",
        steps: [
          {
            id: "step1",
            name: "Basics",
            space: "problem",
            space_slots: ["audience"],
            knowledge_contributes: ["glossary"],
            measurement_contributes: [],
          },
        ],
        acts: { act1: { steps: ["step1", "step2"] } },
      },
    };
    expect(RecipeResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing steps", () => {
    expect(() =>
      RecipeResponseSchema.parse({
        ok: true,
        data: { name: "x", version: "1", description: "d", acts: {} },
      })
    ).toThrow();
  });
});

describe("SchemasResponseSchema", () => {
  it("validates schemas response", () => {
    const input = {
      ok: true,
      data: {
        schemas: [
          { path: "problem/audience.schema.yaml", schema: { type: "object" } },
          { path: "solution/specs/api.schema.yaml", schema: null },
        ],
      },
    };
    expect(SchemasResponseSchema.parse(input)).toEqual(input);
  });
});
