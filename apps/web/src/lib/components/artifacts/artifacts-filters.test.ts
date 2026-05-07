import { describe, expect, test } from "bun:test";
import {
  applyArtifactsFilters,
  extractMimeTypes,
  extractKinds,
} from "./artifacts-filters.ts";
import type { ArtifactRow } from "$lib/server/artifacts";

function makeRow(overrides: Partial<ArtifactRow> = {}): ArtifactRow {
  return {
    id: "a1",
    org_id: "org1",
    project_id: null,
    run_id: null,
    task_id: null,
    kind: "file",
    title: "test",
    body_path: null,
    sha256: null,
    size: 100,
    mime: "text/plain",
    created_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("applyArtifactsFilters", () => {
  test("no filter returns all rows", () => {
    const rows = [makeRow({ id: "a1" }), makeRow({ id: "a2" })];
    expect(applyArtifactsFilters(rows, {})).toHaveLength(2);
  });

  test("filters by mime", () => {
    const rows = [
      makeRow({ id: "a1", mime: "text/plain" }),
      makeRow({ id: "a2", mime: "application/json" }),
    ];
    const result = applyArtifactsFilters(rows, { mime: "text/plain" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("a1");
  });

  test("filters by kind", () => {
    const rows = [
      makeRow({ id: "a1", kind: "file" }),
      makeRow({ id: "a2", kind: "report" }),
    ];
    const result = applyArtifactsFilters(rows, { kind: "report" });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("a2");
  });

  test("filters by runId", () => {
    const rows = [
      makeRow({ id: "a1", run_id: "r1" }),
      makeRow({ id: "a2", run_id: "r2" }),
    ];
    const result = applyArtifactsFilters(rows, { runId: "r1" });
    expect(result).toHaveLength(1);
  });
});

describe("extractMimeTypes", () => {
  test("extracts unique sorted mimes", () => {
    const rows = [
      makeRow({ mime: "text/plain" }),
      makeRow({ mime: "application/json" }),
      makeRow({ mime: "text/plain" }),
      makeRow({ mime: null }),
    ];
    expect(extractMimeTypes(rows)).toEqual(["application/json", "text/plain"]);
  });
});

describe("extractKinds", () => {
  test("extracts unique sorted kinds", () => {
    const rows = [
      makeRow({ kind: "report" }),
      makeRow({ kind: "file" }),
      makeRow({ kind: "report" }),
    ];
    expect(extractKinds(rows)).toEqual(["file", "report"]);
  });
});
