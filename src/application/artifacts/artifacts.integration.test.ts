import { afterEach, describe, expect, test } from "bun:test";

import { Org } from "../../db/entities/auth/Org.ts";
import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { AppForbiddenError, AppNotFoundError, AppValidationError } from "../errors.ts";
import { createArtifact } from "./commands.ts";
import { getArtifact, listArtifacts } from "./queries.ts";
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
  return { orgId, userId: "user-artifacts", projectId: null };
}

describe("application artifacts commands and queries", () => {
  test("createArtifact, listArtifacts, and getArtifact round-trip through MikroORM", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const created = await createArtifact(em, ctx(), {
      filename: "summary.md",
      path: "/tmp/summary.md",
      mime: "text/markdown",
    });

    expect(created).toMatchObject({ orgId: DEFAULT_ORG_ID, filename: "summary.md", path: "/tmp/summary.md" });
    expect(await listArtifacts(em, ctx())).toHaveLength(1);
    await expect(getArtifact(em, ctx(), created.id)).resolves.toMatchObject({ id: created.id });
  });

  test("createArtifact validation failure throws AppValidationError", async () => {
    const testDb = await freshDb();
    await expect(createArtifact(testDb.em.fork(), ctx(), { filename: "", path: "" })).rejects.toBeInstanceOf(AppValidationError);
  });

  test("getArtifact not-found throws AppNotFoundError", async () => {
    const testDb = await freshDb();
    await expect(getArtifact(testDb.em.fork(), ctx(), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("cross-org artifact access throws AppForbiddenError", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    em.persist(em.create(Org, { id: OTHER_ORG_ID, name: "Other", slug: "other", createdAt: new Date(), updatedAt: new Date() }));
    await em.flush();
    const other = await createArtifact(em, ctx(OTHER_ORG_ID), { filename: "other.txt", path: "/tmp/other.txt" });
    await expect(getArtifact(em, ctx(), other.id)).rejects.toBeInstanceOf(AppForbiddenError);
  });
});
