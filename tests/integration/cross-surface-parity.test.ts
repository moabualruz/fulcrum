import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type SurfaceResponse } from "@fulcrum/shared";
import { expectSurfaceParity } from "./helpers/surface-parity.js";

function surface(data: unknown): SurfaceResponse {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: "ok",
    data,
    degraded: [],
    policyDecisionIds: [],
    redactionStatus: "not_applicable"
  };
}

describe("cross-surface parity", () => {
  it("keeps CLI, cockpit, JSON, MCP, and local health reports aligned on status envelope", () => {
    const health = { projects: 2, tasks: 5, runs: 1, health: "managed" };
    const cli = surface(health);
    const cockpit = surface(health);
    const json = surface(health);
    const mcp = surface(health);
    const localHealth = surface(health);

    for (const candidate of [cockpit, json, mcp, localHealth]) {
      expectSurfaceParity(cli, candidate);
      expect(candidate.data).toEqual(cli.data);
    }
  });
});
