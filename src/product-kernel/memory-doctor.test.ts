import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { runMigrations } from "./db/migrate.ts";
import { runMemoryDoctorChecks, type SubsystemCheck } from "./memory-doctor.ts";
import type { ProductDb } from "./db/types.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-mem-doctor-"));
let db: ProductDb;

beforeAll(async () => {
  db = await openPglite(join(scratch, "doc"));
  await runMigrations(db);
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

function findCheck(checks: SubsystemCheck[], name: string): SubsystemCheck {
  const c = checks.find((c) => c.name === name);
  if (!c) throw new Error(`check not found: ${name}`);
  return c;
}

describe("memory doctor checks with initialised DB", () => {
  test("returns all 8 checks", async () => {
    const report = await runMemoryDoctorChecks(db);
    expect(report.checks).toHaveLength(8);
  });

  test("memories_schema is ok", async () => {
    const report = await runMemoryDoctorChecks(db);
    const check = findCheck(report.checks, "memories_schema");
    expect(check.status).toBe("ok");
    expect(check.message).toContain("memories table");
  });

  test("heuristic_extractor is ok with ≥4 kinds", async () => {
    const report = await runMemoryDoctorChecks(db);
    const check = findCheck(report.checks, "heuristic_extractor");
    expect(check.status).toBe("ok");
    expect(check.message).toMatch(/\d+ kinds/);
  });

  test("retriever is ok when search_documents exists", async () => {
    const report = await runMemoryDoctorChecks(db);
    const check = findCheck(report.checks, "retriever");
    expect(check.status).toBe("ok");
  });

  test("context_assembly is ok", async () => {
    const report = await runMemoryDoctorChecks(db);
    const check = findCheck(report.checks, "context_assembly");
    expect(check.status).toBe("ok");
    expect(check.message).toContain("assembler tables present");
  });

  test("gated checks return disabled when flags off", async () => {
    // No FULCRUM_FEATURES set
    const saved = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    try {
      const report = await runMemoryDoctorChecks(db);
      expect(findCheck(report.checks, "embeddings_schema").status).toBe("disabled");
      expect(findCheck(report.checks, "embeddings").status).toBe("disabled");
      expect(findCheck(report.checks, "llm_extraction").status).toBe("disabled");
      expect(findCheck(report.checks, "report_narration").status).toBe("disabled");
    } finally {
      if (saved !== undefined) process.env["FULCRUM_FEATURES"] = saved;
    }
  });

  test("gated checks return ok when flags on", async () => {
    const saved = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "embeddings,llm-extraction,report-narration";
    try {
      const report = await runMemoryDoctorChecks(db);
      expect(findCheck(report.checks, "embeddings_schema").status).toBe("ok");
      expect(findCheck(report.checks, "embeddings").status).toBe("ok");
      expect(findCheck(report.checks, "llm_extraction").status).toBe("ok");
      expect(findCheck(report.checks, "report_narration").status).toBe("ok");
    } finally {
      if (saved !== undefined) process.env["FULCRUM_FEATURES"] = saved;
      else delete process.env["FULCRUM_FEATURES"];
    }
  });
});

describe("memory doctor checks without DB", () => {
  test("reports error/warning for schema checks when db null", async () => {
    const report = await runMemoryDoctorChecks(null);
    expect(findCheck(report.checks, "memories_schema").status).toBe("error");
    expect(findCheck(report.checks, "retriever").status).toBe("warning");
    expect(findCheck(report.checks, "context_assembly").status).toBe("warning");
  });
});
