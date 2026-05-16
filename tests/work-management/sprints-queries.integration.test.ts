import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import {
  getSprint,
  loadProjectBacklog,
  loadProjectSprintDetail,
  loadProjectSprints,
} from "@work-management/application/sprints/queries.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("sprint application queries with migrated PGlite data", () => {
  test("loads backlog, sprint list, detail tasks, and not-found paths through real tables", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const conn = em.getConnection();
    const projectId = randomUUID();
    const sprintId = randomUUID();
    const backlogTaskId = randomUUID();
    const sprintTaskId = randomUUID();

    await conn.execute(
      `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, now(), now())`,
      [projectId, DEFAULT_ORG_ID, "sprint-query-project", "Sprint Query Project"],
    );
    await conn.execute(
      `INSERT INTO sprints
         (id, org_id, project_id, name, goal, start_date, end_date, status, capacity_points, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())`,
      [
        sprintId,
        DEFAULT_ORG_ID,
        projectId,
        "Sprint 09.6",
        "Real query coverage",
        "2026-05-11",
        "2026-05-18",
        "active",
        21,
      ],
    );
    await conn.execute(
      `INSERT INTO tasks
         (id, org_id, project_id, sprint_id, title, status, priority, points, created_at, updated_at)
       VALUES
         (?, ?, ?, null, ?, ?, ?, ?, now(), now()),
         (?, ?, ?, ?, ?, ?, ?, ?, now(), now())`,
      [
        backlogTaskId,
        DEFAULT_ORG_ID,
        projectId,
        "Backlog task",
        "pending",
        4,
        3,
        sprintTaskId,
        DEFAULT_ORG_ID,
        projectId,
        sprintId,
        "Sprint task",
        "in_progress",
        2,
        5,
      ],
    );

    const ctx = { orgId: DEFAULT_ORG_ID, userId: null, projectId };
    const backlog = await loadProjectBacklog(em, ctx);
    const sprints = await loadProjectSprints(em, ctx);
    const detail = await loadProjectSprintDetail(em, ctx, sprintId);
    const sprint = await getSprint(em, ctx, sprintId);

    expect(backlog.project).toEqual({ id: projectId, name: "Sprint Query Project" });
    expect(backlog.sprints).toContainEqual({
      id: sprintId,
      name: "Sprint 09.6",
      status: "active",
      capacity_points: 21,
    });
    expect(backlog.backlogTasks.map((task) => task.id)).toEqual([backlogTaskId]);
    expect(sprints.sprints.map((row) => row.id)).toEqual([sprintId]);
    expect(sprints.velocity).toEqual([]);
    expect(detail.sprint).toMatchObject({
      id: sprintId,
      name: "Sprint 09.6",
      goal: "Real query coverage",
      start_date: "2026-05-11",
      end_date: "2026-05-18",
      status: "active",
    });
    expect(detail.tasks.map((task) => task.id)).toEqual([sprintTaskId]);
    expect(sprint?.id).toBe(sprintId);
    await expect(loadProjectSprintDetail(em, ctx, randomUUID())).rejects.toThrow("Sprint not found");
    await expect(
      loadProjectBacklog(em, { orgId: DEFAULT_ORG_ID, userId: null, projectId: randomUUID() }),
    ).rejects.toThrow("Project not found");
  });
});
