import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { migrateIsolatedStore } from "@test-support/product-workspace-fixtures.ts";
import { createLocalOrg, createProject, createSprint } from "@test-support/product-workspace-fixtures.ts";
import type { TestStore } from "@test-support/product-workspace-fixtures.ts";
import { velocity, burndown } from "./reports.ts";
import { makeId } from "@test-support/product-workspace-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-reports-"));
let db: TestStore;
let orgId: string;
let projectId: string;

beforeAll(async () => {
  db = await openIsolatedStore(join(scratch, "reports-test"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "test", name: "Test" });
  orgId = org.id;
  const proj = await createProject(db, { orgId, slug: "rp", name: "Reports Project" });
  projectId = proj.id;
});

afterAll(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("velocity", () => {
  test("returns empty array when no completed sprints", async () => {
    const result = await velocity(db, projectId);
    expect(result).toEqual([]);
  });

  test("returns completed sprint metrics", async () => {
    const sprint = await createSprint(db, {
      orgId,
      projectId,
      name: "V-Sprint",
      status: "completed",
      capacityPoints: 20,
      startDate: "2026-04-01",
      endDate: "2026-04-14",
    });
    // Add metrics cache entry
    await db.query(
      `INSERT INTO metrics_cache (id, project_id, sprint_id, date, points_completed)
       VALUES ($1, $2, $3, '2026-04-14', 15)`,
      [makeId(), projectId, sprint.id],
    );

    const result = await velocity(db, projectId);
    expect(result.length).toBe(1);
    expect(result[0]!.sprint_name).toBe("V-Sprint");
    expect(Number(result[0]!.committed_points)).toBe(20);
    expect(Number(result[0]!.completed_points)).toBe(15);
  });
});

describe("burndown", () => {
  test("returns empty array for nonexistent sprint", async () => {
    const result = await burndown(db, projectId, "NONEXISTENT000000000000000");
    expect(result).toEqual([]);
  });

  test("returns on-demand burndown when no metrics cache", async () => {
    const sprint = await createSprint(db, {
      orgId,
      projectId,
      name: "B-Sprint",
      capacityPoints: 10,
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    });

    const result = await burndown(db, projectId, sprint.id);
    // 3 days: May 1, 2, 3
    expect(result.length).toBe(3);
    expect(result[0]!.date).toBe("2026-05-01");
    expect(result[0]!.points_remaining).toBe(10);
    expect(result[0]!.ideal).toBe(10);
    expect(result[2]!.ideal).toBe(0);
  });
});
