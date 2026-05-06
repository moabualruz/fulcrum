import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  groupTasksByStatus,
  listBoardTasks,
  listDocuments,
  listProjects,
  listRuns,
  listSprints,
  listBacklogTasks,
  listSprintTasks,
  getSprintVelocity,
  type BoardTask,
} from "./product-queries.ts";
import { openIsolatedStore } from "../../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../../test-support/product-fixtures.ts";
import { productDbDir } from "../../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  createSprint,
} from "../../../test-support/product-fixtures.ts";
import { makeId } from "../../../test-support/product-fixtures.ts";

let scratch = "";
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-web-queries-"));
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

async function seed() {
  await Bun.write(join(productDbDir(), ".keep"), "");
  const db = await openIsolatedStore(join(productDbDir(), "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Local" });
  const project = await createProject(db, { orgId: org.id, slug: "p1", name: "Alpha" });
  await createTask(db, { orgId: org.id, projectId: project.id, title: "Wire UI", status: "in_progress", priority: 5 });
  await createTask(db, { orgId: org.id, projectId: project.id, title: "Ship docs", status: "pending", priority: 1 });
  const docId = makeId();
  await db.query(
    `INSERT INTO documents (id, org_id, project_id, kind, title, body) VALUES ($1, $2, $3, $4, $5, $6)`,
    [docId, org.id, project.id, "decision", "ADR-0001 PGlite", "use PGlite locally"],
  );
  const runId = makeId();
  await db.query(
    `INSERT INTO agent_runs (id, org_id, project_id, agent, model, status) VALUES ($1, $2, $3, $4, $5, $6)`,
    [runId, org.id, project.id, "codex", "gpt-5", "succeeded"],
  );
  await db.close();
  return { project };
}

describe("web product-queries", () => {
  test("listProjects reads real rows from the product DB", async () => {
    const { project } = await seed();
    const rows = await listProjects();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("p1");
    expect(rows[0]?.id).toBe(project.id);
  });

  test("listDocuments returns ordered docs and filters by project", async () => {
    const { project } = await seed();
    const all = await listDocuments();
    const scoped = await listDocuments(project.id);
    expect(all).toHaveLength(1);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.kind).toBe("decision");
  });

  test("listBoardTasks orders by priority desc and groupTasksByStatus buckets correctly", async () => {
    await seed();
    const tasks = await listBoardTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.title).toBe("Wire UI");
    const groups = groupTasksByStatus(tasks);
    expect(groups["in_progress"]).toHaveLength(1);
    expect(groups["pending"]).toHaveLength(1);
    expect(groups["completed"]).toHaveLength(0);
  });

  test("listRuns returns agent run rows backed by agent_runs", async () => {
    const { project } = await seed();
    const runs = await listRuns(project.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.agent).toBe("codex");
    expect(runs[0]?.status).toBe("succeeded");
  });

  test("listSprints returns sprints with aggregated estimates", async () => {
    const { project } = await seed();
    // seed a sprint with tasks
    const db2 = await openIsolatedStore(join(productDbDir(), "main"));
    await migrateIsolatedStore(db2);
    const org = (await db2.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = 'default'`))[0]!;
    const sprint = await createSprint(db2, {
      orgId: org.id,
      projectId: project.id,
      name: "Sprint 1",
      capacity: 20,
    });
    const task = await createTask(db2, {
      orgId: org.id,
      projectId: project.id,
      title: "Sprint task",
    });
    await db2.query(`UPDATE tasks SET sprint_id = $1, estimate = 5 WHERE id = $2`, [sprint.id, task.id]);
    await db2.close();

    const sprints = await listSprints(project.id);
    expect(sprints).toHaveLength(1);
    expect(sprints[0]?.name).toBe("Sprint 1");
    expect(sprints[0]?.total_estimate).toBe(5);
    expect(sprints[0]?.task_count).toBe(1);
  });

  test("listBacklogTasks returns only unassigned tasks", async () => {
    const { project } = await seed();
    // seed has 2 tasks with no sprint_id — both should appear
    const backlog = await listBacklogTasks(project.id);
    expect(backlog.length).toBeGreaterThanOrEqual(2);
    for (const t of backlog) {
      expect(t.sprint_id).toBeNull();
    }
  });

  test("listSprintTasks returns only tasks assigned to sprint", async () => {
    const { project } = await seed();
    const db2 = await openIsolatedStore(join(productDbDir(), "main"));
    await migrateIsolatedStore(db2);
    const org = (await db2.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = 'default'`))[0]!;
    const sprint = await createSprint(db2, {
      orgId: org.id,
      projectId: project.id,
      name: "Sprint 2",
    });
    const task = await createTask(db2, {
      orgId: org.id,
      projectId: project.id,
      title: "In sprint",
    });
    await db2.query(`UPDATE tasks SET sprint_id = $1 WHERE id = $2`, [sprint.id, task.id]);
    await db2.close();

    const tasks = await listSprintTasks(sprint.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("In sprint");
  });

  test("getSprintVelocity returns completed sprint points", async () => {
    const { project } = await seed();
    const db2 = await openIsolatedStore(join(productDbDir(), "main"));
    await migrateIsolatedStore(db2);
    const org = (await db2.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = 'default'`))[0]!;
    const sprint = await createSprint(db2, {
      orgId: org.id,
      projectId: project.id,
      name: "Done Sprint",
    });
    await db2.query(`UPDATE sprints SET status = 'completed' WHERE id = $1`, [sprint.id]);
    const task = await createTask(db2, {
      orgId: org.id,
      projectId: project.id,
      title: "Done task",
      status: "completed",
    });
    await db2.query(`UPDATE tasks SET sprint_id = $1, estimate = 8 WHERE id = $2`, [sprint.id, task.id]);
    await db2.close();

    const velocity = await getSprintVelocity(project.id);
    expect(velocity).toHaveLength(1);
    expect(velocity[0]?.points).toBe(8);
  });

  test("groupTasksByStatus is pure and stable", () => {
    const fixture: BoardTask[] = [
      { id: "1", title: "a", status: "pending", priority: 0, project_id: null, updated_at: "" },
      { id: "2", title: "b", status: "pending", priority: 0, project_id: null, updated_at: "" },
      { id: "3", title: "c", status: "completed", priority: 0, project_id: null, updated_at: "" },
    ];
    const groups = groupTasksByStatus(fixture);
    expect(groups["pending"]).toHaveLength(2);
    expect(groups["completed"]).toHaveLength(1);
  });
});
