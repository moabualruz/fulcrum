import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  createSprint,
} from "../../../../../../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-backlog-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedProject(): Promise<{ projectId: string; orgId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, {
    orgId: org.id,
    slug: "alpha",
    name: "Alpha",
  });
  // Create backlog tasks (no sprint_id)
  await createTask(db, { orgId: org.id, projectId: project.id, title: "Backlog 1", priority: 5 });
  await createTask(db, { orgId: org.id, projectId: project.id, title: "Backlog 2", priority: 3 });
  // Create a sprint and assign one task
  const sprint = await createSprint(db, {
    orgId: org.id,
    projectId: project.id,
    name: "Sprint 1",
    capacity: 20,
  });
  const assignedTask = await createTask(db, { orgId: org.id, projectId: project.id, title: "Assigned" });
  await db.query(`UPDATE tasks SET sprint_id = $1 WHERE id = $2`, [sprint.id, assignedTask.id]);
  await db.close();
  return { projectId: project.id, orgId: org.id };
}

describe("/projects/[id]/backlog +page.server.ts", () => {
  test("load returns backlog tasks (no sprint_id) and sprints list", async () => {
    const { projectId } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({ params: { id: projectId } } as Parameters<typeof mod.load>[0]);
    expect(result.projectId).toBe(projectId);
    // streamed.data is a promise
    const data = await result.streamed.data;
    // Only unassigned tasks appear in backlog
    expect(data.tasks.length).toBe(2);
    expect(data.tasks.every((t: { sprint_id: string | null }) => t.sprint_id === null)).toBe(true);
    // Sprint list includes the seeded sprint
    expect(data.sprints.length).toBe(1);
    expect(data.sprints[0].name).toBe("Sprint 1");
  });

  test("assign action moves task to sprint", async () => {
    const { projectId, orgId } = await seedProject();
    // Get task and sprint IDs
    const dbDir = join(scratch, "state", "product", "db");
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    const tasks = await db.query<{ id: string }>(`SELECT id FROM tasks WHERE sprint_id IS NULL AND project_id = $1 LIMIT 1`, [projectId]);
    const sprints = await db.query<{ id: string }>(`SELECT id FROM sprints WHERE project_id = $1 LIMIT 1`, [projectId]);
    const taskId = tasks[0]!.id;
    const sprintId = sprints[0]!.id;
    await db.close();

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("sprintId", sprintId);
    const request = new Request("http://localhost/projects/x/backlog", { method: "POST", body: fd });
    const result = await mod.actions.assign({ request, params: { id: projectId } } as Parameters<typeof mod.actions.assign>[0]);
    expect((result as { ok: boolean }).ok).toBe(true);

    // Verify DB
    const db2 = await openPglite(join(dbDir, "main"));
    await runMigrations(db2);
    const rows = await db2.query<{ sprint_id: string | null }>(`SELECT sprint_id FROM tasks WHERE id = $1`, [taskId]);
    expect(rows[0]?.sprint_id).toBe(sprintId);
    await db2.close();
  });

  test("create action adds task to backlog", async () => {
    const { projectId } = await seedProject();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("title", "New backlog task");
    const request = new Request("http://localhost/projects/x/backlog", { method: "POST", body: fd });
    const result = await mod.actions.create({ request, params: { id: projectId } } as Parameters<typeof mod.actions.create>[0]);
    expect((result as { ok: boolean }).ok).toBe(true);
  });
});
