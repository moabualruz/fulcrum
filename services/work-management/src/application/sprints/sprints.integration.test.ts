import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { createSprint } from "@work-management/application/sprints/commands.ts";
import { getSprint, listSprints } from "@work-management/application/sprints/queries.ts";
import type { AppContext } from "@work-management/application/sprints/types.ts";

const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";

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
  return { orgId, userId: "user-sprints", projectId: "22222222-2222-4222-8222-222222222222" };
}

describe("application sprints commands and queries", () => {
  test("createSprint, listSprints, and getSprint round-trip through persistence", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    const created = await createSprint(em, ctx(), {
      name: "Sprint 1",
      projectId: ctx().projectId!,
      startDate: new Date("2026-05-01T00:00:00Z"),
      endDate: new Date("2026-05-15T00:00:00Z"),
    });

    expect(created).toMatchObject({ orgId: DEFAULT_ORG_ID, name: "Sprint 1", status: "planned" });
    expect(await listSprints(em, ctx())).toHaveLength(1);
    await expect(getSprint(em, ctx(), created.id)).resolves.toMatchObject({ id: created.id });
  });

  test("createSprint validation failure throws AppValidationError", async () => {
    const testDb = await freshDb();
    await expect(createSprint(testDb.em, ctx(), {
      name: "",
      projectId: ctx().projectId!,
      startDate: new Date("2026-05-15T00:00:00Z"),
      endDate: new Date("2026-05-01T00:00:00Z"),
    })).rejects.toBeInstanceOf(AppValidationError);
  });

  test("getSprint not-found throws AppNotFoundError", async () => {
    const testDb = await freshDb();
    await expect(getSprint(testDb.em, ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("cross-org sprint access throws AppForbiddenError", async () => {
    const testDb = await freshDb();
    const em = testDb.em;
    await em.save(em.create(Org, { id: OTHER_ORG_ID, name: "Other", slug: "other", createdAt: new Date(), updatedAt: new Date() }));
    const other = await createSprint(em, ctx(OTHER_ORG_ID), {
      name: "Other sprint",
      projectId: ctx().projectId!,
      startDate: new Date("2026-05-01T00:00:00Z"),
      endDate: new Date("2026-05-15T00:00:00Z"),
    });
    await expect(getSprint(em, ctx(), other.id)).rejects.toBeInstanceOf(AppForbiddenError);
  });
});
