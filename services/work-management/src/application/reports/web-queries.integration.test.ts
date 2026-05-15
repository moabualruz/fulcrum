import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import {
  loadBurndown,
  loadCfd,
  loadCycleTime,
  loadReports,
  loadThroughput,
  loadVelocity,
  loadWip,
} from "@work-management/application/reports/web-queries.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

describe("web reports read model with migrated PGlite data", () => {
  test("loads sprint burndown, velocity, cycle-time, throughput, WIP, and CFD from real tables", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const conn = em.getConnection();
    const projectId = randomUUID();
    const sprintId = randomUUID();
    const previousSprintId = randomUUID();
    const taskA = randomUUID();
    const taskB = randomUUID();
    const taskC = randomUUID();

    await conn.execute(
      `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, now(), now())`,
      [projectId, DEFAULT_ORG_ID, "reports-web", "Reports Web"],
    );
    await conn.execute(
      `INSERT INTO sprints (id, org_id, project_id, name, start_date, end_date, status, capacity_points, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, now(), now()),
              (?, ?, ?, ?, ?, ?, ?, ?, now(), now())`,
      [
        sprintId,
        DEFAULT_ORG_ID,
        projectId,
        "Sprint 2",
        "2026-05-04",
        "2026-05-08",
        "active",
        12,
        previousSprintId,
        DEFAULT_ORG_ID,
        projectId,
        "Sprint 1",
        "2026-04-27",
        "2026-05-01",
        "completed",
        8,
      ],
    );
    await conn.execute(
      `INSERT INTO tasks (id, org_id, project_id, sprint_id, title, status, points, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, now(), now()),
              (?, ?, ?, ?, ?, ?, ?, now(), now()),
              (?, ?, ?, ?, ?, ?, ?, now(), now())`,
      [
        taskA,
        DEFAULT_ORG_ID,
        projectId,
        sprintId,
        "Build reports UI",
        "completed",
        5,
        taskB,
        DEFAULT_ORG_ID,
        projectId,
        sprintId,
        "Wire metrics",
        "in_progress",
        3,
        taskC,
        DEFAULT_ORG_ID,
        projectId,
        previousSprintId,
        "Closed sprint task",
        "completed",
        8,
      ],
    );
    await conn.execute(
      `INSERT INTO metrics_cache (project_id, sprint_id, date, points_remaining, status_counts)
       VALUES (?, ?, ?, ?, ?::jsonb),
              (?, ?, ?, ?, ?::jsonb)`,
      [
        projectId,
        sprintId,
        "2026-05-04",
        8,
        JSON.stringify({ pending: 2, in_progress: 1, blocked: 0, completed: 1, cancelled: 0 }),
        projectId,
        sprintId,
        "2026-05-05",
        5,
        JSON.stringify({ pending: 1, in_progress: 2, blocked: 1, completed: 2, cancelled: 0 }),
      ],
    );
    await conn.execute(
      `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?),
              (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?),
              (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?),
              (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
      [
        randomUUID(),
        DEFAULT_ORG_ID,
        projectId,
        "user",
        "task",
        taskA,
        "status_changed",
        JSON.stringify({ task: taskA, to: "in_progress" }),
        "2026-05-04T09:00:00Z",
        randomUUID(),
        DEFAULT_ORG_ID,
        projectId,
        "user",
        "task",
        taskA,
        "status_changed",
        JSON.stringify({ task: taskA, to: "completed" }),
        "2026-05-06T09:00:00Z",
        randomUUID(),
        DEFAULT_ORG_ID,
        projectId,
        "user",
        "task",
        taskC,
        "status_changed",
        JSON.stringify({ task: taskC, to: "in_progress" }),
        "2026-04-28T09:00:00Z",
        randomUUID(),
        DEFAULT_ORG_ID,
        projectId,
        "user",
        "task",
        taskC,
        "status_changed",
        JSON.stringify({ task: taskC, to: "completed" }),
        "2026-05-01T10:00:00Z",
      ],
    );

    expect(await loadBurndown(em, projectId, sprintId)).toEqual([
      { date: "2026-05-04", ideal: 8, actual: 8 },
      { date: "2026-05-05", ideal: 6, actual: 5 },
      { date: "2026-05-06", ideal: 4, actual: -1 },
      { date: "2026-05-07", ideal: 2, actual: -1 },
      { date: "2026-05-08", ideal: 0, actual: -1 },
    ]);
    expect(await loadVelocity(em, projectId)).toEqual([
      { sprint_id: previousSprintId, sprint_name: "Sprint 1", points: 8 },
    ]);
    expect(await loadCycleTime(em, projectId)).toEqual({
      bins: [
        { days: 2, count: 1 },
        { days: 3, count: 1 },
      ],
      p50: 3,
      p90: 3,
    });
    expect(await loadThroughput(em, projectId)).toEqual([
      { week_start: "2026-04-27", count: 1 },
      { week_start: "2026-05-04", count: 1 },
    ]);
    expect(await loadWip(em, projectId)).toEqual([
      { date: "2026-05-04", pending: 2, in_progress: 1, blocked: 0 },
      { date: "2026-05-05", pending: 1, in_progress: 2, blocked: 1 },
    ]);
    expect(await loadCfd(em, projectId)).toEqual([
      { date: "2026-05-04", pending: 2, in_progress: 1, blocked: 0, completed: 1, cancelled: 0 },
      { date: "2026-05-05", pending: 1, in_progress: 2, blocked: 1, completed: 2, cancelled: 0 },
    ]);
    await expect(loadReports(em, projectId, sprintId)).resolves.toMatchObject({
      sprints: [
        { id: sprintId, name: "Sprint 2", status: "active" },
        { id: previousSprintId, name: "Sprint 1", status: "completed" },
      ],
      velocity: [{ sprint_id: previousSprintId, points: 8 }],
      throughput: [
        { week_start: "2026-04-27", count: 1 },
        { week_start: "2026-05-04", count: 1 },
      ],
    });
  });
});
