import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "../../db/entities/auth/Org.ts";
import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "../errors.ts";
import { dispatchRun } from "./commands.ts";
import { getRun, listRuns } from "./queries.ts";
import type { AppContext } from "./types.ts";

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
  return { orgId, userId: "user-runs", projectId: null };
}

describe("application runs commands and queries", () => {
  test("dispatchRun, listRuns, and getRun round-trip through MikroORM", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const created = await dispatchRun(em, ctx(), {
      agentName: "codex",
      prompt: "Run tests",
    });

    expect(created).toMatchObject({ orgId: DEFAULT_ORG_ID, agentName: "codex", status: "queued" });
    expect(await listRuns(em, ctx())).toHaveLength(1);
    await expect(getRun(em, ctx(), created.id)).resolves.toMatchObject({ id: created.id });
  });

  test("dispatchRun validation failure throws AppValidationError", async () => {
    const testDb = await freshDb();
    await expect(dispatchRun(testDb.em.fork(), ctx(), { agentName: "" })).rejects.toBeInstanceOf(AppValidationError);
  });

  test("getRun not-found throws AppNotFoundError", async () => {
    const testDb = await freshDb();
    await expect(getRun(testDb.em.fork(), ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("cross-org run access throws AppForbiddenError", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    em.persist(em.create(Org, { id: OTHER_ORG_ID, name: "Other", slug: "other", createdAt: new Date(), updatedAt: new Date() }));
    await em.flush();
    const other = await dispatchRun(em, ctx(OTHER_ORG_ID), { agentName: "codex" });
    await expect(getRun(em, ctx(), other.id)).rejects.toBeInstanceOf(AppForbiddenError);
  });
});
