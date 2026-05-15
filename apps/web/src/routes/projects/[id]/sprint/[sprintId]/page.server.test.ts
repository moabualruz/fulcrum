import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  addTaskToSprint,
  createLocalOrg,
  createProject,
  createSprint,
  createTask,
  migrateIsolatedStore,
  openIsolatedStore,
} from "@test-support/product-workspace-fixtures.ts";
import { closeDatabase } from "$lib/server/db";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-sprint-detail-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(async () => {
  await closeDatabase();
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedSprintDetail(): Promise<{ projectId: string; sprintId: string }> {
  const dbDir = join(scratch, "pglite.data");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(dbDir);
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const sprint = await createSprint(db, {
    orgId: org.id,
    projectId: project.id,
    name: "Sprint 1",
    goal: "Ship it",
    startDate: "2026-05-01",
    endDate: "2026-05-14",
  });
  const sprintTask = await createTask(db, {
    orgId: org.id,
    projectId: project.id,
    title: "In sprint",
    status: "pending",
    priority: 2,
  });
  await createTask(db, {
    orgId: org.id,
    projectId: project.id,
    title: "Not in sprint",
    status: "pending",
    priority: 1,
  });
  await addTaskToSprint(db, { sprintId: sprint.id, taskId: sprintTask.id });
  await db.close();
  return { projectId: project.id, sprintId: sprint.id };
}

describe("/projects/[id]/sprint/[sprintId] +page.server", () => {
  test("load returns only sprint-scoped tasks", async () => {
    const { projectId, sprintId } = await seedSprintDetail();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: projectId, sprintId },
      url: new URL(`http://localhost/projects/${projectId}/sprint/${sprintId}`),
    } as Parameters<typeof mod.load>[0]);

    expect(result.sprint.id).toBe(sprintId);
    expect(result.sprint.goal).toBe("Ship it");
    expect(result.tasks.every((task) => task.sprint_id === sprintId)).toBe(true);
    expect(result.tasks.find((task) => task.title === "Not in sprint")).toBeUndefined();
  });
});
