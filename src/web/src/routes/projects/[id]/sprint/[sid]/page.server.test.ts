import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  createSprint,
} from "../../../../../../../product-kernel/store/repositories.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-sprint-board-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedSprint(): Promise<{ projectId: string; sprintId: string; taskId: string }> {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const sprint = await createSprint(db, {
    orgId: org.id,
    projectId: project.id,
    name: "Sprint 1",
    capacity: 20,
  });
  await db.query(`UPDATE sprints SET status = 'active', start_date = now(), end_date = now() + INTERVAL '14 days' WHERE id = $1`, [sprint.id]);
  const task = await createTask(db, { orgId: org.id, projectId: project.id, title: "Task A" });
  await db.query(`UPDATE tasks SET sprint_id = $1 WHERE id = $2`, [sprint.id, task.id]);
  await db.close();
  return { projectId: project.id, sprintId: sprint.id, taskId: task.id };
}

describe("/projects/[id]/sprint/[sid] +page.server.ts", () => {
  test("load returns sprint metadata and tasks scoped to sprint_id", async () => {
    const { projectId, sprintId, taskId } = await seedSprint();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({
      params: { id: projectId, sid: sprintId },
    } as Parameters<typeof mod.load>[0]);
    expect(result.sprint.name).toBe("Sprint 1");
    expect(result.sprint.status).toBe("active");
    expect(result.sprint.end_date).not.toBeNull();
    const data = await result.streamed.data;
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].id).toBe(taskId);
  });

  test("load throws 404 for nonexistent sprint", async () => {
    const { projectId } = await seedSprint();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    let caught: unknown;
    try {
      await mod.load({
        params: { id: projectId, sid: "01JBOGUS000000000000000000" },
      } as Parameters<typeof mod.load>[0]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as { status: number }).status).toBe(404);
  });

  test("create action adds task with sprint_id pre-set", async () => {
    const { projectId, sprintId } = await seedSprint();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const fd = new FormData();
    fd.set("title", "New sprint task");
    const request = new Request("http://localhost", { method: "POST", body: fd });
    const result = await mod.actions.create({
      request,
      params: { id: projectId, sid: sprintId },
    } as Parameters<typeof mod.actions.create>[0]);
    expect((result as { ok: boolean }).ok).toBe(true);

    // Verify task is in sprint
    const dbDir = join(scratch, "state", "product", "db");
    const db = await openPglite(join(dbDir, "main"));
    await runMigrations(db);
    const rows = await db.query<{ sprint_id: string | null; title: string }>(
      `SELECT sprint_id, title FROM tasks WHERE title = 'New sprint task'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sprint_id).toBe(sprintId);
    await db.close();
  });

  test("move action transitions task status", async () => {
    const { projectId, sprintId, taskId } = await seedSprint();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 3}`);
    const fd = new FormData();
    fd.set("id", taskId);
    fd.set("from", "pending");
    fd.set("to", "in_progress");
    const request = new Request("http://localhost", { method: "POST", body: fd });
    const result = await mod.actions.move({
      request,
      params: { id: projectId, sid: sprintId },
    } as Parameters<typeof mod.actions.move>[0]);
    expect((result as { ok: boolean }).ok).toBe(true);
  });
});
