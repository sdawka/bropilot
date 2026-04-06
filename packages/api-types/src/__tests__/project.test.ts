import { describe, it, expect } from "vitest";
import {
  InitResponseSchema,
  ProjectResponseSchema,
  SpacesResponseSchema,
  SpaceDetailResponseSchema,
  MapSlotGetResponseSchema,
  MapSlotPutResponseSchema,
} from "../project.js";

describe("InitResponseSchema", () => {
  it("validates initialized response", () => {
    const input = {
      ok: true,
      data: { status: "initialized", path: "/tmp/.bropilot" },
    };
    expect(InitResponseSchema.parse(input)).toEqual(input);
  });

  it("validates already_initialized response", () => {
    const input = {
      ok: true,
      data: { status: "already_initialized", path: "/tmp/.bropilot" },
    };
    expect(InitResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects invalid status", () => {
    expect(() =>
      InitResponseSchema.parse({
        ok: true,
        data: { status: "unknown", path: "/tmp" },
      })
    ).toThrow();
  });
});

describe("ProjectResponseSchema", () => {
  it("validates project response with recipe", () => {
    const input = {
      ok: true,
      data: {
        project: { name: "test" },
        recipe: { name: "webapp", version: "1.0", description: "A web app" },
      },
    };
    expect(ProjectResponseSchema.parse(input)).toEqual(input);
  });

  it("validates project response with null recipe", () => {
    const input = {
      ok: true,
      data: { project: {}, recipe: null },
    };
    expect(ProjectResponseSchema.parse(input)).toEqual(input);
  });
});

describe("SpacesResponseSchema", () => {
  it("validates spaces response", () => {
    const input = {
      ok: true,
      data: {
        spaces: [
          {
            id: "problem",
            name: "Problem",
            description: "Problem space",
            governs: "Why we build",
            cross_cutting: false,
            required_slots: [
              { id: "audience", name: "Audience", type: "yaml", required: true },
            ],
          },
        ],
      },
    };
    expect(SpacesResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing required_slots", () => {
    expect(() =>
      SpacesResponseSchema.parse({
        ok: true,
        data: {
          spaces: [
            {
              id: "problem",
              name: "Problem",
              description: "x",
              governs: "y",
              cross_cutting: false,
            },
          ],
        },
      })
    ).toThrow();
  });
});

describe("SpaceDetailResponseSchema", () => {
  it("validates space detail with slots", () => {
    const input = {
      ok: true,
      data: {
        id: "problem",
        name: "Problem",
        description: "desc",
        governs: "why",
        cross_cutting: false,
        slots: [
          {
            id: "audience",
            name: "Audience",
            type: "yaml",
            filled: true,
            data: { target: "developers" },
          },
          {
            id: "context",
            name: "Context",
            type: "yaml",
            filled: false,
            data: null,
          },
        ],
      },
    };
    expect(SpaceDetailResponseSchema.parse(input)).toEqual(input);
  });
});

describe("MapSlotGetResponseSchema", () => {
  it("validates arbitrary slot data", () => {
    const input = {
      ok: true,
      data: { audience: "developers", market: "saas" },
    };
    expect(MapSlotGetResponseSchema.parse(input)).toBeTruthy();
  });
});

describe("MapSlotPutResponseSchema", () => {
  it("validates put response", () => {
    const input = {
      ok: true,
      data: { space: "problem", slot: "audience" },
    };
    expect(MapSlotPutResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing slot field", () => {
    expect(() =>
      MapSlotPutResponseSchema.parse({
        ok: true,
        data: { space: "problem" },
      })
    ).toThrow();
  });
});
