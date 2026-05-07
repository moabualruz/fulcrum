import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { MetricsCache } from "../../db/entities/tasks/MetricsCache.ts";
import { Sprint, SprintStatus } from "../../db/entities/tasks/Sprint.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { AppNotFoundError, AppValidationError } from "../errors.ts";
import { createReportSnapshot } from "./commands.ts";
import { getReportSnapshot, getSprintBurndown, listReportSnapshots } from "./queries.ts";
import type { AppContext } from "./types.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

function ctx(orgId = DEFAULT_ORG_ID): AppContext {
  return { orgId, userId: "user-reports", projectId: "22222222-2222-4222-8222-222222222222" };
}

describe("application reports commands and queries", () => {
  test("createReportSnapshot, listReportSnapshots, and getReportSnapshot round-trip through MikroORM", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const created = await createReportSnapshot(em, ctx(), {
      projectId: ctx().projectId!,
      scopeType: "project",
      scopeId: ctx().projectId!,
      date: new Date("2026-05-06T00:00:00Z"),
      completedCount: 2,
      pointsCompleted: 5,
    });

    expect(created).toMatchObject({ orgId: DEFAULT_ORG_ID, scopeType: "project", completedCount: 2 });
    expect(await listReportSnapshots(em, ctx(), { projectId: ctx().projectId! })).toHaveLength(1);
    await expect(getReportSnapshot(em, ctx(), created.id)).resolves.toMatchObject({ id: created.id });
  });

  test("createReportSnapshot validation failure throws AppValidationError", async () => {
    const testDb = await freshDb();
    await expect(createReportSnapshot(testDb.em.fork(), ctx(), {
      projectId: "",
      scopeType: "project",
      date: new Date(),
    })).rejects.toBeInstanceOf(AppValidationError);
  });

  test("getReportSnapshot not-found throws AppNotFoundError", async () => {
    const testDb = await freshDb();
    await expect(getReportSnapshot(testDb.em.fork(), ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("getSprintBurndown uses application-owned ORM queries for cached and fallback points", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const org = em.getReference(Org, DEFAULT_ORG_ID);
    const sprint = em.create(Sprint, {
      org,
      projectId: ctx().projectId!,
      name: "App burndown",
      startDate: new Date("2026-05-01T00:00:00Z"),
      endDate: new Date("2026-05-03T00:00:00Z"),
      status: SprintStatus.active,
      capacityPoints: 8,
    });
    em.persist(sprint);
    await em.flush();
    await em.getConnection().execute(
      "insert into tasks (org_id, title, status, sprint_id, points) values (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)",
      [DEFAULT_ORG_ID, "Done", "done", sprint.id, 3, DEFAULT_ORG_ID, "Open", "todo", sprint.id, 5],
    );

    const fallback = await getSprintBurndown(em, ctx(), { projectId: ctx().projectId!, sprintId: sprint.id });
    expect(fallback.at(0)).toMatchObject({ pointsRemaining: 8, ideal: 8 });
    expect(fallback.at(1)).toMatchObject({ pointsRemaining: 5 });

    em.persist(em.create(MetricsCache, {
      projectId: ctx().projectId!,
      sprint,
      date: new Date("2026-05-02T00:00:00Z"),
      pointsRemaining: 4,
    }));
    await em.flush();

    const cached = await getSprintBurndown(em, ctx(), { projectId: ctx().projectId!, sprintId: sprint.id });
    expect(cached.find((point) => point.date === "2026-05-02")).toMatchObject({ pointsRemaining: 4 });
  });
});
