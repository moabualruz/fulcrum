import { describe, expect, test } from "bun:test";

import { findTraceLinkField, listTraceLinkFields } from "./trace-link-matrix.ts";

describe("trace/link identity matrix", () => {
  test("inventories every workflow spine id required by CLI and TUI", () => {
    expect(listTraceLinkFields().map((field) => field.name)).toEqual([
      "projectId",
      "taskId",
      "runId",
      "traceId",
      "runGroupId",
      "reviewId",
      "docId",
      "artifactId",
      "memoryId",
    ]);
  });

  test("maps every id to CLI flags, machine output fields, TUI placement, and API payload fields", () => {
    for (const field of listTraceLinkFields()) {
      expect(field.cliFlags.length, field.name).toBeGreaterThan(0);
      expect(field.cliOutputFields.length, field.name).toBeGreaterThan(0);
      expect(field.tuiPlacements.length, field.name).toBeGreaterThan(0);
      expect(field.apiPayloadFields.length, field.name).toBeGreaterThan(0);
      expect(field.workflows.length, field.name).toBeGreaterThan(0);
    }
  });

  test("keeps supplied trace IDs visible and machine-readable", () => {
    const trace = findTraceLinkField("traceId");

    expect(trace.cliFlags).toContain("--trace");
    expect(trace.cliOutputFields).toEqual(expect.arrayContaining(["traceId", "trace_id"]));
    expect(trace.tuiPlacements).toContain("status footer trace segment");
    expect(trace.workflows).toEqual(expect.arrayContaining(["create", "run", "review", "docs", "artifacts", "memory", "reports"]));
  });
});
