import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { AppNotFoundError, AppValidationError } from "../errors.ts";
import { createReportSnapshot } from "./commands.ts";
import { getReportSnapshot, listReportSnapshots } from "./queries.ts";
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
});
