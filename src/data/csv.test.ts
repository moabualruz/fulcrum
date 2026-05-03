// @ts-nocheck
// Vitest/Bun tests for gated CSV import/export pipeline.
// RED: written before implementation exists.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TaskRow } from "../product-kernel/store/repositories.ts";

// ---------------------------------------------------------------------------
// Feature flag helper
// ---------------------------------------------------------------------------

describe("isFeatureEnabled", () => {
  const origEnv = process.env["FULCRUM_FEATURES"];

  afterEach(() => {
    if (origEnv !== undefined) process.env["FULCRUM_FEATURES"] = origEnv;
    else delete process.env["FULCRUM_FEATURES"];
  });

  test("returns false when FULCRUM_FEATURES unset", async () => {
    delete process.env["FULCRUM_FEATURES"];
    const { isFeatureEnabled } = await import("./features.ts");
    expect(isFeatureEnabled("export-csv")).toBe(false);
  });

  test("returns true when feature listed in FULCRUM_FEATURES", async () => {
    process.env["FULCRUM_FEATURES"] = "export-csv,import-csv";
    const { isFeatureEnabled } = await import("./features.ts");
    expect(isFeatureEnabled("export-csv")).toBe(true);
    expect(isFeatureEnabled("import-csv")).toBe(true);
  });

  test("returns false for unlisted feature", async () => {
    process.env["FULCRUM_FEATURES"] = "export-csv";
    const { isFeatureEnabled } = await import("./features.ts");
    expect(isFeatureEnabled("import-csv")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

describe("exportTasksToCsv", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fulcrum-csv-export-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeTasks(n: number): TaskRow[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `task-${i + 1}`,
      org_id: "org-1",
      project_id: null,
      parent_id: null,
      title: `Task ${i + 1}`,
      description: `Desc ${i + 1}`,
      status: "pending",
      priority: i,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    }));
  }

  test("exports tasks as CSV with correct headers", async () => {
    const { exportTasksToCsv } = await import("./csv-export.ts");
    const tasks = makeTasks(3);
    const outPath = join(dir, "tasks.csv");
    const result = await exportTasksToCsv(tasks, outPath);

    expect(result.entity_count).toBe(3);
    expect(result.path).toBe(outPath);

    const text = await Bun.file(outPath).text();
    const lines = text.trim().split("\n");
    // Header line
    expect(lines[0]).toContain("id");
    expect(lines[0]).toContain("title");
    expect(lines[0]).toContain("status");
    expect(lines.length).toBe(4); // header + 3 rows
  });

  test("headers match TaskRow field names exactly", async () => {
    const { exportTasksToCsv } = await import("./csv-export.ts");
    const tasks = makeTasks(1);
    const outPath = join(dir, "tasks.csv");
    await exportTasksToCsv(tasks, outPath);

    const text = await Bun.file(outPath).text();
    const header = text.split("\n")[0] as string;
    const cols = header.split(",");

    const expectedCols = [
      "id", "org_id", "project_id", "parent_id", "title",
      "description", "status", "priority", "created_at", "updated_at",
    ];
    for (const col of expectedCols) {
      expect(cols).toContain(col);
    }
  });

  test("exports 100 tasks — round-trip via import produces same 100", async () => {
    const { exportTasksToCsv } = await import("./csv-export.ts");
    const { importCsv } = await import("./csv-import.ts");
    const tasks = makeTasks(100);
    const outPath = join(dir, "hundred.csv");
    const result = await exportTasksToCsv(tasks, outPath);
    expect(result.entity_count).toBe(100);

    const columnMap = {
      id: "id", title: "title", status: "status",
      description: "description", priority: "priority",
    };
    const imported = await importCsv(outPath, columnMap, { dryRun: true });
    expect(imported.total).toBe(100);
    expect(imported.skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

describe("importCsv", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fulcrum-csv-import-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeCsv(name: string, content: string): Promise<string> {
    const p = join(dir, name);
    await writeFile(p, content);
    return p;
  }

  test("imports tasks with column-map", async () => {
    const { importCsv } = await import("./csv-import.ts");
    const csvPath = await writeCsv("tasks.csv", [
      "Title,Status",
      "Buy milk,pending",
      "Walk dog,done",
    ].join("\n"));

    const result = await importCsv(
      csvPath,
      { Title: "title", Status: "status" },
      { dryRun: true },
    );
    expect(result.total).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.records[0]?.title).toBe("Buy milk");
    expect(result.records[1]?.status).toBe("done");
  });

  test("dry-run: returns count without writing", async () => {
    const { importCsv } = await import("./csv-import.ts");
    const csvPath = await writeCsv("dry.csv", "Title\nTask A\nTask B\n");
    const result = await importCsv(
      csvPath,
      { Title: "title" },
      { dryRun: true },
    );
    expect(result.total).toBe(2);
    expect(result.written).toBe(0);
  });

  test("invalid column in column-map → error", async () => {
    const { importCsv } = await import("./csv-import.ts");
    const csvPath = await writeCsv("bad.csv", "Name\nAlice\n");
    await expect(
      importCsv(csvPath, { NonExistent: "title" }, { dryRun: true }),
    ).rejects.toThrow("Column 'NonExistent' not found in CSV");
  });

  test("missing required field (title) → skipped_records entry", async () => {
    const { importCsv } = await import("./csv-import.ts");
    const csvPath = await writeCsv("missing.csv", [
      "Title,Status",
      "Has title,pending",
      ",missing-title",
    ].join("\n"));

    const result = await importCsv(
      csvPath,
      { Title: "title", Status: "status" },
      { dryRun: true },
    );
    expect(result.total).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.skipped_records[0]?.record).toBe(2);
    expect(result.skipped_records[0]?.reason).toMatch(/title/i);
  });
});
