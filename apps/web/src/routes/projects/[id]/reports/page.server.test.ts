import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
} from "@/test-support/product-fixtures.ts";
import { makeId } from "@/test-support/product-fixtures.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-reports-page-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProject(): Promise<{ id: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "proj",
    name: "Proj",
  });
  await db.close();
  return { id: project.id };
}

async function seedProjectWithSprint(): Promise<{ projectId: string; sprintId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "proj",
    name: "Proj",
  });
  const sprintId = makeId();
  await db.query(
    `INSERT INTO sprints (id, org_id, project_id, name, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [sprintId, org.id, project.id, "Sprint 1", "2025-01-01", "2025-01-14", "active"],
  );
  await db.query(
    `INSERT INTO tasks (id, org_id, project_id, title, status, priority, sprint_id, story_points)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7)`,
    [makeId(), org.id, project.id, "task1", "pending", sprintId, 5],
  );
  await db.close();
  return { projectId: project.id, sprintId };
}

describe("/projects/[id]/reports +page.server.ts", () => {
  test("load returns reports data with all six chart datasets", async () => {
    const { id } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const url = new URL("http://localhost/projects/x/reports");
    const result = await mod.load({
      params: { id },
      url,
    } as Parameters<typeof mod.load>[0]);

    expect(result.project.id).toBe(id);
    expect(result.reports).toBeDefined();
    expect(result.reports.sprints).toEqual([]);
    expect(result.reports.burndown).toEqual([]);
    expect(result.reports.velocity).toEqual([]);
    expect(result.reports.cycleTime).toEqual({ bins: [], p50: 0, p90: 0 });
    expect(result.reports.throughput).toEqual([]);
    expect(result.reports.wip).toEqual([]);
    expect(result.reports.cfd).toEqual([]);
  });

  test("load with sprint param returns burndown data", async () => {
    const { projectId, sprintId } = await seedProjectWithSprint();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const url = new URL(`http://localhost/projects/x/reports?sprint=${sprintId}`);
    const result = await mod.load({
      params: { id: projectId },
      url,
    } as Parameters<typeof mod.load>[0]);

    expect(result.reports.sprints).toHaveLength(1);
    expect(result.selectedSprintId).toBe(sprintId);
    // Burndown should have points (5 story points seeded)
    expect(result.reports.burndown.length).toBeGreaterThan(0);
  });

  test("load throws 404 for nonexistent project", async () => {
    await seedProject(); // ensure DB exists
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const url = new URL("http://localhost/projects/x/reports");
    let caught: unknown;
    try {
      await mod.load({
        params: { id: "01JBOGUS000000000000000000" },
        url,
      } as Parameters<typeof mod.load>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(
      typeof caught === "object" && caught !== null && "status" in caught &&
        (caught as { status: number }).status === 404,
    ).toBe(true);
  });
});
