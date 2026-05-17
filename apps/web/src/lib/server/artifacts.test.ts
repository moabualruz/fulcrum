import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject } from "@test-support/product-workspace-fixtures.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";
import { listArtifacts, getArtifactStats } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";

let scratch: string;
let db: TestStore;
let orgId: string;
let projectId: string;

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-artifacts-"));
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  orgId = org.id;
  const proj = await createProject(db, { orgId, slug: "alpha", name: "Alpha" });
  projectId = proj.id;
});

afterEach(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

async function seedArtifact(overrides: Partial<{
  id: string;
  projectId: string | null;
  runId: string | null;
  taskId: string | null;
  kind: string;
  title: string;
  mime: string | null;
  size: number | null;
}> = {}): Promise<string> {
  const id = overrides.id ?? makeId();
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, run_id, task_id, kind, title, mime, size)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      orgId,
      "projectId" in overrides ? overrides.projectId : projectId,
      overrides.runId ?? null,
      overrides.taskId ?? null,
      overrides.kind ?? "file",
      overrides.title ?? "test-artifact",
      overrides.mime ?? "text/plain",
      overrides.size ?? 1024,
    ],
  );
  return id;
}

describe("listArtifacts", () => {
  test("returns all artifacts for org unfiltered", async () => {
    const id1 = await seedArtifact({ title: "a1" });
    const id2 = await seedArtifact({ title: "a2" });
    const rows = await listArtifacts(db, orgId);
    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
  });

  test("filters by projectId", async () => {
    await seedArtifact({ projectId });
    await seedArtifact({ projectId: null });
    const rows = await listArtifacts(db, orgId, { projectId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.project_id).toBe(projectId);
  });

  test("filters by mime", async () => {
    await seedArtifact({ mime: "application/json" });
    await seedArtifact({ mime: "text/plain" });
    const rows = await listArtifacts(db, orgId, { mime: "application/json" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mime).toBe("application/json");
  });

  test("filters by runId", async () => {
    const runId = makeId();
    await db.query(
      `INSERT INTO agent_runs (id, org_id, project_id, agent, status, started_at)
       VALUES ($1, $2, $3, 'claude', 'succeeded', now())`,
      [runId, orgId, projectId],
    );
    await seedArtifact({ runId });
    await seedArtifact({ runId: null });
    const rows = await listArtifacts(db, orgId, { runId });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.run_id).toBe(runId);
  });

  test("returns empty array when no artifacts", async () => {
    const rows = await listArtifacts(db, orgId);
    expect(rows).toEqual([]);
  });
});

describe("getArtifactStats", () => {
  test("returns total bytes and count for project", async () => {
    await seedArtifact({ size: 100 });
    await seedArtifact({ size: 200 });
    await seedArtifact({ size: 300, projectId: null }); // different project
    const stats = await getArtifactStats(db, orgId, projectId);
    expect(stats.count).toBe(2);
    expect(stats.totalBytes).toBe(300);
  });

  test("returns zeros when no artifacts", async () => {
    const stats = await getArtifactStats(db, orgId, projectId);
    expect(stats.count).toBe(0);
    expect(stats.totalBytes).toBe(0);
  });
});
